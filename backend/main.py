import asyncio
import uuid
import numpy as np
import scipy.signal as signal
import tensorflow as tf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any

from cortex_client import CortexClient
from eeg_pipeline import EPOC_CHANNELS
from gemini import FeatureAttention, FuzzyLayer

# --- 1. UYGULAMA VE YAPILANDIRMA ---
app = FastAPI(title="Bilişsel Yük API")

# React Frontend'in (localhost:3000) backend'e erişebilmesi için CORS izni
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Hafızadaki aktif oturumları tutacağımız sözlük
sessions = {}

# Derin Öğrenme Modelini Başlangıçta Yükle
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

def extract_psd(chunk):
    """4 saniyelik ham veriden 70 özellik çıkarır"""
    freqs, pxx = signal.welch(chunk, fs=128, nperseg=len(chunk), axis=0)
    features = []
    for ch in range(14):
        for _, lo, hi in BANDS:
            mask = (freqs >= lo) & (freqs <= hi)
            power = np.sum(pxx[mask, ch])
            features.append(power)
    return np.log10(np.array(features) + 1e-10)

# --- 2. VERİ MODELLERİ (useSession.js'den gelenler) ---
class UserInfo(BaseModel):
    userInfo: Dict[str, Any]

class AnswersData(BaseModel):
    answers: List[Dict[str, Any]]

class NasaData(BaseModel):
    difficulty: str
    average: str

# --- 3. REST API ENDPOINTLERİ ---
@app.post("/api/session")
async def create_session(data: UserInfo):
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "user": data.userInfo,
        "answers": [],
        "nasa": {},
        "eeg_records": [],
        # --- YENİ EKLENEN KALİBRASYON DEĞİŞKENLERİ ---
        "state": "calibrating", # İlk durum: Kalibrasyon yapılıyor
        "baseline_buffer": [],  # 1 dakikalık veriyi burada biriktireceğiz
        "baseline_mean": None,  # 14 kanalın ortalaması
        "baseline_std": None,    # 14 kanalın standart sapması
        "raw_stew_data": []  # YENİ: STEW formatındaki 14 kanallı ham verileri biriktirecek liste
    }
    return {"session_id": session_id}


@app.post("/api/session/{session_id}/answers")
async def sync_answers(session_id: str, data: AnswersData):
    if session_id in sessions:
        sessions[session_id]["answers"].extend(data.answers)
        print(f"[{session_id}] Cevaplar kaydedildi.")
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Session not found")

@app.post("/api/session/{session_id}/nasa")
async def sync_nasa(session_id: str, data: NasaData):
    if session_id in sessions:
        sessions[session_id]["nasa"][data.difficulty] = data.average
        print(f"[{session_id}] NASA-TLX ({data.difficulty}): {data.average}")
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Session not found")
# Saniye cinsinden kalibrasyon süresi (Örn: 60 saniye = 15 adet 4 saniyelik paket)
CALIBRATION_CHUNKS = 15 

# --- 4. WEBSOCKET ENDPOINTİ (EEG VERİ AKIŞI) ---
@app.websocket("/ws/eeg/{session_id}")
async def eeg_stream(websocket: WebSocket, session_id: str):
    if session_id not in sessions:
        await websocket.close(code=4404)
        return
        
    await websocket.accept()
    client = CortexClient()
    feature_buffer = []
    
    try:
        async with client as ctx:
            async for sample in ctx.stream(app_session_id=session_id):
                if "epoch_data" not in sample:
                    continue
                
                ses = sessions[session_id]
                
                # Suyu İkiye Ayırıyoruz: 
                # raw_chunk -> Excel'e (STEW formunda) gidecek ham veri
                # model_chunk -> Z-Score ile normalleştirilip Modele girecek veri
                raw_chunk = np.array(sample["epoch_data"]) 
                model_chunk = raw_chunk.copy() 
                cog_load = "low" # Varsayılan değer
                
                # =======================================================
                # AŞAMA 1: KALİBRASYON (BASELINE) DURUMU
                # =======================================================
                if ses.get("state") == "calibrating":
                    if "baseline_buffer" not in ses:
                        ses["baseline_buffer"] = []
                        
                    ses["baseline_buffer"].append(raw_chunk)
                    
                    # Havuz doldu mu? (15 paket x 4 saniye = 60 saniye tamamlandı mı?)
                    if len(ses["baseline_buffer"]) >= CALIBRATION_CHUNKS:
                        # Toplanan ham verilerin kanal bazlı ortalamasını ve sapmasını alıyoruz
                        baseline_data = np.vstack(ses["baseline_buffer"])
                        ses["baseline_mean"] = np.mean(baseline_data, axis=0)
                        ses["baseline_std"] = np.std(baseline_data, axis=0)
                        
                        # Darayı aldık, sınav moduna geçiş yap!
                        ses["state"] = "testing"
                        print(f"[{session_id}] 60 Saniyelik Kalibrasyon Tamamlandı!")

                # =======================================================
                # AŞAMA 2: SINAV (TEST) DURUMU
                # =======================================================
                elif ses.get("state") == "testing":
                    # Z-Score Normalizasyonu (Ham veri eksi Ortalama, bölü Standart Sapma)
                    # 1e-7 eklemek "sıfıra bölünme" hatasını engeller
                    if ses.get("baseline_mean") is not None:
                        model_chunk = (model_chunk - ses["baseline_mean"]) / (ses["baseline_std"] + 1e-7)
                    
                    # Model tahminini YAP (SADECE NORMALİZE EDİLMİŞ VERİ İLE)
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

                # =======================================================
                # 3. VERİYİ KAYDET VE FRONTEND'E GÖNDER
                # (Hem kalibrasyonda hem testte Excel'e veri akmaya devam etmeli)
                # =======================================================
                if "eeg_records" not in sessions[session_id]:
                    sessions[session_id]["eeg_records"] = []

                record = {
                    "timestamp": sample["timestamp"],
                    "cognitive_load": cog_load,
                    "cognitive_load_tr": "Düşük" if cog_load == "low" else "Orta" if cog_load == "medium" else "Yüksek"
                }

                for ch_name in EPOC_CHANNELS:
                    record[ch_name] = sample["channels"].get(ch_name, 0.0)

                sessions[session_id]["eeg_records"].append(record)

               # YÜKSEK FREKANSLI (128Hz) VERİYİ EXCEL İÇİN PAKETLEYELİM (Raw Data)
                batch_records = []
                base_time = sample["timestamp"] - 4.0 
                
                for idx, raw_row in enumerate(sample["epoch_data"]):
                    # YENİ: Saniyede 128 kez akan ham 14 kanallı veriyi STEW listemize kaydediyoruz
                    ses["raw_stew_data"].append(raw_row[:14]) 
                    
                    ch_dict = {}
                    for i, ch_name in enumerate(EPOC_CHANNELS):
                        ch_dict[ch_name] = raw_row[i]
                        
                    batch_records.append({
                        "timestamp": round(base_time + (idx / 128.0), 4),
                        "cognitive_load": cog_load,
                        "channels": ch_dict
                    })

                # FRONTEND'E GÖNDERELİM
                await websocket.send_json({
                    "timestamp": sample["timestamp"],
                    "channels": sample["channels"],
                    "cognitive_load": cog_load,
                    "batch_data": batch_records,
                    "app_state": ses.get("state") # React'in haberi olsun diye durumu da gönderiyoruz
                })
                
    except WebSocketDisconnect:
        print(f"Bağlantı koptu: {session_id}")
    except Exception as e:
        print(f"WebSocket Hatası: {e}")
# Uygulamayı başlatmak için uvicorn gerekir

from fastapi.responses import PlainTextResponse

@app.get("/api/session/{session_id}/export/stew")
async def download_stew_format(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")
    
    raw_data = sessions[session_id].get("raw_stew_data", [])
    
    # STEW veri setindeki gibi: sütunlar arası boşluk, e+03 bilimsel gösterim (7 basamak)
    lines = []
    for row in raw_data:
        # Python f-string ile bilimsel formata çeviriyoruz (Örn: 4186.67 -> 4.1866700e+03)
        formatted_row = "  ".join([f"{val:.7e}" for val in row])
        lines.append(formatted_row)
        
    file_content = "\n".join(lines)
    
    # Dosyanın browser üzerinden txt olarak indirilmesini sağlayan başlıklar
    headers = {
        "Content-Disposition": f"attachment; filename=sub_{session_id[:4]}_stew.txt"
    }
    return PlainTextResponse(content=file_content, headers=headers)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)