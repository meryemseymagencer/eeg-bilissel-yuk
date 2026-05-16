import asyncio
import uuid
import time
import numpy as np
import scipy.signal as signal
import tensorflow as tf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json

from cortex_client import CortexClient
from eeg_pipeline import EPOC_CHANNELS
from gemini import FeatureAttention, FuzzyLayer

# ============================================================================
# 1. UYGULAMA VE YAPILANDIRMA
# ============================================================================
app = FastAPI(title="Bilişsel Yük API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Hafızadaki aktif oturumlar
sessions = {}

# Derin Öğrenme Modelini Yükle
custom_objects = {'FeatureAttention': FeatureAttention, 'FuzzyLayer': FuzzyLayer}
try:
    import os
    model_path = os.path.join(os.path.dirname(__file__), 'models', 'arfn_model.h5')
    model = tf.keras.models.load_model(model_path, custom_objects=custom_objects)
    print(f"ARFN Modeli başarıyla yüklendi! ({model_path})")
except Exception as e:
    print(f"Model yükleme hatası: {e}")
    model = None

BANDS = [("delta", 1, 4), ("theta", 4, 8), ("alpha", 8, 14), ("beta", 14, 30), ("gamma", 30, 64)]

# 45 paket × 4 saniye = 180 saniye = 3 dakika
CALIBRATION_CHUNKS = 45

def extract_psd(chunk):
    """4 saniyelik ham veriden 70 özellik çıkarır (14 kanal × 5 band)"""
    freqs, pxx = signal.welch(chunk, fs=128, nperseg=len(chunk), axis=0)
    features = []
    for ch in range(14):
        for _, lo, hi in BANDS:
            mask = (freqs >= lo) & (freqs <= hi)
            power = np.sum(pxx[mask, ch])
            features.append(power)
    return np.log10(np.array(features) + 1e-10)


# ============================================================================
# 2. VERİ MODELLERİ
# ============================================================================
class UserInfo(BaseModel):
    userInfo: Dict[str, Any]

class AnswersData(BaseModel):
    answers: List[Dict[str, Any]]

class NasaData(BaseModel):
    difficulty: str
    average: str

# Marker (event) veri modeli
class MarkerData(BaseModel):
    event_type: str           # "question_onset", "question_response", "fixation_onset", "block_start", "block_end"
    timestamp_ms: float       # Frontend'den gelen performance.now() değeri
    metadata: Optional[Dict[str, Any]] = None  # Soru ID, zorluk, kategori vb.


# ============================================================================
# 3. REST API ENDPOINTLERİ
# ============================================================================
@app.post("/api/session")
async def create_session(data: UserInfo):
    session_id = str(uuid.uuid4())
    session_start_time = time.time()  # Unix timestamp (saniye)

    sessions[session_id] = {
        "user": data.userInfo,
        "session_start_time": session_start_time,  # ⚡ YENİ: Mutlak zaman referansı
        "answers": [],
        "nasa": {},          # Eski format (geriye dönük uyumluluk)
        "nasa_detailed": {}, # ⚡ YENİ: rawValues + adjustedValues + rtlxScore
        "eeg_records": [],
        "markers": [],       # ⚡ YENİ: Tüm event marker'ları (soru başlangıç/bitiş, vb.)
        # --- Kalibrasyon değişkenleri ---
        "state": "calibrating",
        "baseline_buffer": [],
        "baseline_mean": None,
        "baseline_std": None,
        "raw_stew_data": []
    }
    print(f"[{session_id}] Yeni oturum başladı. Baseline: {CALIBRATION_CHUNKS * 4} saniye")
    return {"session_id": session_id, "calibration_duration_sec": CALIBRATION_CHUNKS * 4}


@app.post("/api/session/{session_id}/answers")
async def sync_answers(session_id: str, data: AnswersData):
    if session_id in sessions:
        sessions[session_id]["answers"].extend(data.answers)
        print(f"[{session_id}] {len(data.answers)} cevap kaydedildi.")
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Session not found")


@app.post("/api/session/{session_id}/nasa")
async def sync_nasa(session_id: str, data: NasaData):
    """Eski endpoint — geriye dönük uyumluluk için."""
    if session_id in sessions:
        sessions[session_id]["nasa"][data.difficulty] = data.average
        print(f"[{session_id}] NASA-TLX ({data.difficulty}): {data.average}")
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Session not found")


# ⚡ YENİ ENDPOINT: Detaylı NASA-TLX kaydı
@app.post("/api/session/{session_id}/nasa-detailed")
async def sync_nasa_detailed(session_id: str, data: Dict[str, Any]):
    """
    Yeni NASA-TLX formatı:
    {
        "difficulty": "kolay",
        "rtlxScore": 45.5,
        "rawValues": {mental: 60, physical: 20, ...},
        "adjustedValues": {mental: 60, physical: 20, performance: 30 (ters çevrilmiş), ...}
    }
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    difficulty = data.get("difficulty")
    sessions[session_id]["nasa_detailed"][difficulty] = {
        "rtlxScore": data.get("rtlxScore"),
        "rawValues": data.get("rawValues"),
        "adjustedValues": data.get("adjustedValues"),
        "submitted_at": time.time()
    }
    print(f"[{session_id}] NASA-TLX detaylı ({difficulty}): RTLX={data.get('rtlxScore')}")
    return {"status": "success"}


# ⚡ YENİ ENDPOINT: Event marker kaydı (EN ÖNEMLİSİ!)
@app.post("/api/session/{session_id}/marker")
async def add_marker(session_id: str, data: MarkerData):
    """
    Frontend'den gelen olay marker'larını kaydeder.
    EEG epoch'larını sınav olaylarıyla eşleştirmek için kritik.

    event_type örnekleri:
      - "block_start"         : Bir zorluk seviyesinin başlangıcı
      - "block_end"           : Bir zorluk seviyesinin bitişi
      - "fixation_onset"      : Fixation cross gösterimi başladı
      - "question_onset"      : Soru gösterildi (EN KRİTİK!)
      - "question_response"   : Katılımcı cevap verdi
      - "question_timeout"    : Süre doldu, cevap verilmedi
      - "nasa_onset"          : NASA-TLX ekranı açıldı
      - "nasa_submit"         : NASA-TLX tamamlandı

    metadata örnekleri:
      - {question_id: 15, difficulty: "orta", category: "C"}
      - {selected_answer: 2, is_correct: true, rt_ms: 3450}
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session_time = time.time()
    marker = {
        "event_type": data.event_type,
        "client_timestamp_ms": data.timestamp_ms,    # Frontend performance.now()
        "server_timestamp": session_time,            # Unix time (saniye)
        "session_elapsed_sec": session_time - sessions[session_id]["session_start_time"],
        "metadata": data.metadata or {}
    }
    sessions[session_id]["markers"].append(marker)

    # Debug için sadece önemli olayları logla
    if data.event_type in ["question_onset", "question_response", "block_start", "block_end"]:
        print(f"[{session_id}] MARKER: {data.event_type} | meta: {data.metadata}")

    return {"status": "success", "marker_id": len(sessions[session_id]["markers"]) - 1}

TEST_MODE = False  # Cihaz bağlıyken False yapacağız

async def simulate_eeg_stream(websocket: WebSocket, session_id: str):
    """TEST MODU: EEG cihazı olmadan simüle edilmiş veri gönderir"""
    import random
    
    ses = sessions[session_id]
    chunk_count = 0
    
    while True:
        try:
            # 4 saniyede bir paket gönder
            await asyncio.sleep(4.0)
            chunk_count += 1
            
            # Rastgele EEG verisi oluştur (14 kanal × 512 örnek)
            fake_epoch = np.random.randn(512, 14) * 10
            
            # ============================================================
            # KALİBRASYON AŞAMASI
            # ============================================================
            if ses.get("state") == "calibrating":
                ses.setdefault("baseline_buffer", []).append(fake_epoch)
                
                progress = len(ses["baseline_buffer"])
                print(f"[{session_id}] Kalibrasyon: {progress}/{CALIBRATION_CHUNKS} paket")
                
                if len(ses["baseline_buffer"]) >= CALIBRATION_CHUNKS:
                    baseline_data = np.vstack(ses["baseline_buffer"])
                    ses["baseline_mean"] = np.mean(baseline_data, axis=0)
                    ses["baseline_std"] = np.std(baseline_data, axis=0)
                    ses["state"] = "testing"
                    print(f"[{session_id}] ✅ Kalibrasyon tamamlandı - SINAV BAŞLIYOR")
            
            # Simüle edilmiş kanal verileri
            fake_channels = {ch: random.uniform(-50, 50) for ch in EPOC_CHANNELS}
            
            # Rastgele bilişsel yük
            cog_load = random.choice(["low", "medium", "high"])
            
            # Frontend'e gönder
            await websocket.send_json({
                "timestamp": time.time(),
                "channels": fake_channels,
                "cognitive_load": cog_load,
                "batch_data": [],
                "app_state": ses.get("state")  # ← BU ÇOK ÖNEMLİ!
            })
            
        except Exception as e:
            print(f"[{session_id}] Simülasyon hatası: {e}")
            break
# ============================================================================
# 4. WEBSOCKET ENDPOINTİ (EEG VERİ AKIŞI)
# ============================================================================
@app.websocket("/ws/eeg/{session_id}")
async def eeg_stream(websocket: WebSocket, session_id: str):
    if session_id not in sessions:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    
    # TEST MODU: EEG cihazı olmadan simülasyon
    if TEST_MODE:
        print(f"[{session_id}] TEST MODU AKTIF - Simüle edilmiş veri gönderiliyor")
        await simulate_eeg_stream(websocket, session_id)
        return
    
    # Normal mod: Gerçek EEG cihazından veri al
    client = CortexClient()
    feature_buffer = []
    try:
        async with client as ctx:
            async for sample in ctx.stream(app_session_id=session_id):
                if "epoch_data" not in sample:
                    continue

                ses = sessions[session_id]

                raw_chunk = np.array(sample["epoch_data"])
                model_chunk = raw_chunk.copy()
                cog_load = "low"

                # ============================================================
                # AŞAMA 1: KALİBRASYON (180 saniye)
                # ============================================================
                if ses.get("state") == "calibrating":
                    ses.setdefault("baseline_buffer", []).append(raw_chunk)

                    # 45 paket × 4 sn = 180 sn dolduğunda baseline tamamlanır
                    if len(ses["baseline_buffer"]) >= CALIBRATION_CHUNKS:
                        baseline_data = np.vstack(ses["baseline_buffer"])
                        ses["baseline_mean"] = np.mean(baseline_data, axis=0)
                        ses["baseline_std"] = np.std(baseline_data, axis=0)
                        ses["state"] = "testing"
                        print(f"[{session_id}] ✅ 180 Saniyelik Baseline Tamamlandı, sınava geçiliyor.")

                # ============================================================
                # AŞAMA 2: SINAV (TEST)
                # ============================================================
                elif ses.get("state") == "testing":
                    if ses.get("baseline_mean") is not None:
                        model_chunk = (model_chunk - ses["baseline_mean"]) / (ses["baseline_std"] + 1e-7)

                    features = extract_psd(model_chunk)
                    feature_buffer.append(features)

                    if len(feature_buffer) >= 8:
                        input_data = np.array([feature_buffer[-8:]])
                        if model:
                            pred_probs = model.predict(input_data, verbose=0)[0]
                            class_idx = np.argmax(pred_probs)
                            labels = ["low", "medium", "high"]
                            cog_load = labels[class_idx]
                        feature_buffer.pop(0)

                # ============================================================
                # 3. VERİYİ KAYDET VE GÖNDER
                # ============================================================
                record = {
                    "timestamp": sample["timestamp"],
                    "cognitive_load": cog_load,
                    "cognitive_load_tr": "Düşük" if cog_load == "low" else "Orta" if cog_load == "medium" else "Yüksek"
                }
                for ch_name in EPOC_CHANNELS:
                    record[ch_name] = sample["channels"].get(ch_name, 0.0)
                ses["eeg_records"].append(record)

                # 128 Hz batch verisi
                batch_records = []
                base_time = sample["timestamp"] - 4.0

                for idx, raw_row in enumerate(sample["epoch_data"]):
                    ses["raw_stew_data"].append(raw_row[:14])

                    ch_dict = {}
                    for i, ch_name in enumerate(EPOC_CHANNELS):
                        ch_dict[ch_name] = raw_row[i]

                    batch_records.append({
                        "timestamp": round(base_time + (idx / 128.0), 4),
                        "cognitive_load": cog_load,
                        "channels": ch_dict
                    })

                await websocket.send_json({
                    "timestamp": sample["timestamp"],
                    "channels": sample["channels"],
                    "cognitive_load": cog_load,
                    "batch_data": batch_records,
                    "app_state": ses.get("state")
                })

    except WebSocketDisconnect:
        print(f"Bağlantı koptu: {session_id}")
    except Exception as e:
        print(f"WebSocket Hatası: {e}")


# ============================================================================
# 5. EXPORT ENDPOINTLERİ
# ============================================================================

@app.get("/api/session/{session_id}/export/stew")
async def download_stew_format(session_id: str):
    """Ham 14 kanallı EEG verisini STEW formatında indirir."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    raw_data = sessions[session_id].get("raw_stew_data", [])

    lines = []
    for row in raw_data:
        formatted_row = "  ".join([f"{val:.7e}" for val in row])
        lines.append(formatted_row)

    file_content = "\n".join(lines)
    headers = {
        "Content-Disposition": f"attachment; filename=sub_{session_id[:4]}_stew.txt"
    }
    return PlainTextResponse(content=file_content, headers=headers)


# ⚡ YENİ ENDPOINT: Tam analiz verisi (EEG analizi için en önemli export)
@app.get("/api/session/{session_id}/export/full")
async def download_full_data(session_id: str):
    """
    Tam analiz verisi: marker'lar + cevaplar + NASA-TLX + EEG epoch'ları
    JSON formatında, offline analiz için.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    ses = sessions[session_id]

    export_data = {
        "session_id": session_id,
        "user": ses.get("user"),
        "session_start_time": ses.get("session_start_time"),
        "calibration_duration_sec": CALIBRATION_CHUNKS * 4,
        "answers": ses.get("answers", []),
        "nasa_simple": ses.get("nasa", {}),
        "nasa_detailed": ses.get("nasa_detailed", {}),
        "markers": ses.get("markers", []),
        "eeg_epochs": ses.get("eeg_records", []),  # 1 sn'lik özet (sınıflandırma sonuçları)
        "baseline_mean": ses["baseline_mean"].tolist() if ses.get("baseline_mean") is not None else None,
        "baseline_std": ses["baseline_std"].tolist() if ses.get("baseline_std") is not None else None,
    }

    headers = {
        "Content-Disposition": f"attachment; filename=sub_{session_id[:4]}_full_data.json"
    }
    return JSONResponse(content=export_data, headers=headers)


# ⚡ YENİ ENDPOINT: Marker'ları CSV olarak indir (analiz için pratik)
@app.get("/api/session/{session_id}/export/markers")
async def download_markers_csv(session_id: str):
    """Marker'ları CSV formatında indirir."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    markers = sessions[session_id].get("markers", [])

    # CSV header
    lines = ["event_type,client_timestamp_ms,server_timestamp,session_elapsed_sec,metadata_json"]
    for m in markers:
        meta_json = json.dumps(m["metadata"]).replace(",", ";")  # CSV ile çakışmasın
        lines.append(
            f'{m["event_type"]},{m["client_timestamp_ms"]},{m["server_timestamp"]},'
            f'{m["session_elapsed_sec"]:.4f},"{meta_json}"'
        )

    file_content = "\n".join(lines)
    headers = {
        "Content-Disposition": f"attachment; filename=sub_{session_id[:4]}_markers.csv"
    }
    return PlainTextResponse(content=file_content, headers=headers, media_type="text/csv")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)