"""
main.py — FastAPI Backend (v3 - Sinyal İşleme Entegre)
============================================================
Bu versiyondaki değişiklikler:
  1. ⚡ Bandpass filtre eklendi (1-45 Hz, Butterworth 4. derece)
     Sebep: Lim et al. (2018) STEW ve Wang et al. (2024) ARFN ile uyumlu
  2. ⚡ Notch filtre eklendi (50 Hz, Türkiye şebeke gürültüsü)
     Sebep: Türkiye'de elektrik 50 Hz; bu olmadan EEG'de büyük bir 50 Hz pik var
  3. ⚡ Stateful filtering (sosfilt_zi) — gerçek zamanlı akış için
     Sebep: Her chunk başında "filter transient" oluşmasını önler
  4. Per-session filter state — her oturum için bağımsız filter durumu

Önceki versiyondaki özellikler korundu:
  - 180 saniye baseline (calibration)
  - Z-score normalization (per-subject)
  - Marker endpoint
  - NASA-TLX detailed endpoint
  - Full data + Markers export
"""

import asyncio
import uuid
import time
import os
import json
import numpy as np
import scipy.signal as signal
import tensorflow as tf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from cortex_client import CortexClient
from eeg_pipeline import EPOC_CHANNELS
from gemini import FeatureAttention, FuzzyLayer

# ============================================================================
# 1. UYGULAMA VE YAPILANDIRMA
# ============================================================================
app = FastAPI(title="Bilişsel Yük API v3 (Filtered)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Aktif oturumlar
sessions = {}

# ============================================================================
# ⚡ ARFN MODELİ YÜKLEME (v3 - Hibrit: Mimari koddan + Ağırlıklar dosyadan)
# ----------------------------------------------------------------------------
# Bu yöntem TensorFlow versiyon uyumsuzluğunu çözer:
#   1. Model mimarisini gemini.py'daki build_model() ile oluştur
#   2. Sadece ağırlıkları (arfn_v2_weights.weights.h5) yükle
#   3. Sonuç: TF versiyonundan bağımsız, %78.2 doğruluk
# 
# Fallback sırası:
#   1. arfn_v2_weights.weights.h5 + build_model() (YENİ, %78.2)
#   2. arfn_v2_model.h5 (tam yükleme, TF uyumlu ise %78.2)
#   3. arfn_model.h5 (ESKİ, %70.1) - güvenli geri dönüş
# ----------------------------------------------------------------------------
custom_objects = {'FeatureAttention': FeatureAttention, 'FuzzyLayer': FuzzyLayer}
model = None
model_version = "Bilinmiyor"

try:
    import os
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    
    weights_path = os.path.join(models_dir, 'arfn_v2_weights.weights.h5')
    v2_model_path = os.path.join(models_dir, 'arfn_v2_model.h5')
    v1_model_path = os.path.join(models_dir, 'arfn_model.h5')
    
    # YÖNTEM 1: Mimariyi koddan oluştur + sadece ağırlıkları yükle
    if os.path.exists(weights_path):
        try:
            from gemini import build_model
            print("📦 build_model() ile mimari oluşturuluyor...")
            model = build_model(initial_centers=None)
            
            # Modeli compile et (load_weights için gerekli olabilir)
            model.compile(
                optimizer='adam',
                loss='categorical_crossentropy',
                metrics=['accuracy']
            )
            
            print(f"📥 Ağırlıklar yükleniyor: {weights_path}")
            model.load_weights(weights_path)
            model_version = "ARFN v2 (mimari+ağırlık, Test Acc: %78.2)"
            print(f"✓ ARFN v2 modeli başarıyla yüklendi! (hibrit yöntem)")
            print(f"  Model versiyonu: {model_version}")
        except Exception as e_weights:
            print(f"⚠️ Hibrit yükleme başarısız: {type(e_weights).__name__}")
            print(f"   Detay: {str(e_weights)[:200]}")
            model = None
    
    # YÖNTEM 2: Tam model yüklemeyi dene (eğer TF uyumluysa)
    if model is None and os.path.exists(v2_model_path):
        try:
            print(f"📥 Tam v2 modeli yükleniyor: {v2_model_path}")
            model = tf.keras.models.load_model(v2_model_path, custom_objects=custom_objects)
            model_version = "ARFN v2 (tam model, Test Acc: %78.2)"
            print(f"✓ ARFN v2 modeli başarıyla yüklendi! (tam yöntem)")
            print(f"  Model versiyonu: {model_version}")
        except Exception as e_v2:
            print(f"⚠️ Tam v2 yükleme başarısız: {type(e_v2).__name__}")
            model = None
    
    # YÖNTEM 3: Eski v1 modeline geri dön (güvenli yedek)
    if model is None and os.path.exists(v1_model_path):
        print(f"📥 Eski v1 modeline geri dönülüyor: {v1_model_path}")
        model = tf.keras.models.load_model(v1_model_path, custom_objects=custom_objects)
        model_version = "ARFN v1 (eski, Test Acc: %70.1)"
        print(f"✓ ARFN v1 modeli yüklendi! (yedek)")
        print(f"  Model versiyonu: {model_version}")
except Exception as e:
    print(f"✗ Model yükleme hatası: {e}")
    model = None

# ============================================================================
# SİNYAL İŞLEME SABİTLERİ (ARFN makalesi + Türkiye uyumlu)
# ============================================================================
FS = 128                # Örnekleme frekansı (Hz) - Emotiv EPOC X
BANDPASS_LOW = 1.0      # Hz - DC drift'i kes (ARFN makalesi: 1 Hz high-pass)
BANDPASS_HIGH = 45.0    # Hz - Kas artefaktı kes
NOTCH_FREQ = 50.0       # Hz - Türkiye şebeke gürültüsü
NOTCH_Q = 30.0          # Notch filtre Q faktörü (yüksek = dar bant)

# PSD bandları (ARFN makalesi Tablo I, Sektion II-A)
BANDS = [
    ("delta", 1, 4),
    ("theta", 4, 8),
    ("alpha", 8, 14),
    ("beta", 14, 30),
    ("gamma", 30, 64)
]

def _create_filters(fs=FS):
    """
    Bandpass + Notch filtre katsayılarını oluşturur.
    sosfilt formatı kullanılır (numerical stability için).
    """
    nyq = fs / 2.0

    # Bandpass: 1-45 Hz Butterworth 4. derece
    sos_bp = signal.butter(
        4,
        [BANDPASS_LOW / nyq, BANDPASS_HIGH / nyq],
        btype='bandpass',
        output='sos'
    )

    # Notch: 50 Hz (Türkiye şebeke)
    b_notch, a_notch = signal.iirnotch(NOTCH_FREQ, NOTCH_Q, fs)
    sos_notch = signal.tf2sos(b_notch, a_notch)

    return sos_bp, sos_notch

# Global olarak hesapla (tüm oturumlar paylaşır)
SOS_BANDPASS, SOS_NOTCH = _create_filters()
print(f"✓ Filtreler hazırlandı: Bandpass {BANDPASS_LOW}-{BANDPASS_HIGH} Hz, Notch {NOTCH_FREQ} Hz")


def _init_filter_state(n_channels=14):
    """
    Her kanal için filtre state'ini başlatır.
    Stateful filtering, real-time akışta transient oluşmasını engeller.
    """
    zi_bp = signal.sosfilt_zi(SOS_BANDPASS)
    zi_bp = np.tile(zi_bp[:, :, np.newaxis], (1, 1, n_channels))

    zi_notch = signal.sosfilt_zi(SOS_NOTCH)
    zi_notch = np.tile(zi_notch[:, :, np.newaxis], (1, 1, n_channels))

    return zi_bp, zi_notch


def apply_filters(chunk, zi_bp, zi_notch):
    """
    Bandpass + Notch filtrelerini sırayla uygular.

    Args:
        chunk: (n_samples, n_channels) ham EEG verisi
        zi_bp: bandpass filter state (önceki çağrıdan)
        zi_notch: notch filter state (önceki çağrıdan)

    Returns:
        filtered_chunk: (n_samples, n_channels) filtrelenmiş veri
        new_zi_bp: güncellenmiş bandpass state
        new_zi_notch: güncellenmiş notch state
    """
    # 1) Bandpass uygula (her kanal için stateful)
    filtered_bp, new_zi_bp = signal.sosfilt(SOS_BANDPASS, chunk, axis=0, zi=zi_bp)

    # 2) Notch uygula (50 Hz şebeke gürültüsü)
    filtered, new_zi_notch = signal.sosfilt(SOS_NOTCH, filtered_bp, axis=0, zi=zi_notch)

    return filtered, new_zi_bp, new_zi_notch


def extract_psd_arfn_style(chunk):
    """
    ARFN makalesi (Wang et al., 2024 §II-A) ile uyumlu PSD çıkarımı.
    """
    nperseg = min(256, len(chunk))
    noverlap = nperseg // 2

    freqs, pxx = signal.welch(
        chunk,
        fs=FS,
        nperseg=nperseg,
        noverlap=noverlap,
        nfft=512,
        axis=0
    )

    features = []
    for ch in range(14):
        for _, lo, hi in BANDS:
            mask = (freqs >= lo) & (freqs <= hi)
            power = float(np.mean(pxx[mask, ch])) if mask.any() else 0.0
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

class MarkerData(BaseModel):
    event_type: str
    timestamp_ms: float
    metadata: Optional[Dict[str, Any]] = None


CALIBRATION_CHUNKS = 45  # 45 × 4 sn = 180 sn baseline


# ============================================================================
# 3. REST API ENDPOINTLERİ
# ============================================================================
@app.post("/api/session")
async def create_session(data: UserInfo):
    session_id = str(uuid.uuid4())
    session_start_time = time.time()

    # ⚡ YENİ: Her oturum için filtre state başlat
    zi_bp, zi_notch = _init_filter_state(n_channels=14)

    sessions[session_id] = {
        "user": data.userInfo,
        "user_info": data.userInfo,           # ⚡ Alias (finalize için)
        "session_start_time": session_start_time,
        "answers": [],
        "nasa": {},
        "nasa_detailed": {},
        "ueqs": None,                         # ⚡ YENİ: UEQ-S verisi
        "eeg_records": [],
        "eeg_buffer": [],                     # ⚡ YENİ: finalize için (filtered_eeg_data alias)
        "markers": [],
        "state": "calibrating",
        "baseline_buffer": [],
        "baseline_mean": None,
        "baseline_std": None,
        "raw_stew_data": [],
        "calibration_chunks": 0,              # ⚡ YENİ: kaç chunk toplandı
        "level_save_cursor": 0,               # ⚡ YENİ: seviye-kayıt imleci
        "level_saves": [],                    # ⚡ YENİ: seviye-kayıt geçmişi
        # ⚡ YENİ
        "zi_bandpass": zi_bp,
        "zi_notch": zi_notch,
        "filtered_eeg_data": []
    }
    print(f"[{session_id[:8]}] Yeni oturum. Baseline: {CALIBRATION_CHUNKS * 4}s, Filtreler aktif.")
    return {
        "session_id": session_id,
        "calibration_duration_sec": CALIBRATION_CHUNKS * 4,
        "filters_active": True,
        "filter_config": {
            "bandpass": f"{BANDPASS_LOW}-{BANDPASS_HIGH} Hz",
            "notch": f"{NOTCH_FREQ} Hz"
        }
    }


@app.post("/api/session/{session_id}/answers")
async def sync_answers(session_id: str, data: AnswersData):
    if session_id in sessions:
        sessions[session_id]["answers"].extend(data.answers)
        print(f"[{session_id[:8]}] {len(data.answers)} cevap kaydedildi.")
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Session not found")


@app.post("/api/session/{session_id}/nasa")
async def sync_nasa(session_id: str, data: NasaData):
    if session_id in sessions:
        sessions[session_id]["nasa"][data.difficulty] = data.average
        print(f"[{session_id[:8]}] NASA-TLX ({data.difficulty}): {data.average}")
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Session not found")


@app.post("/api/session/{session_id}/nasa-detailed")
async def sync_nasa_detailed(session_id: str, data: Dict[str, Any]):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    difficulty = data.get("difficulty")
    sessions[session_id]["nasa_detailed"][difficulty] = {
        "rtlxScore": data.get("rtlxScore"),
        "rawValues": data.get("rawValues"),
        "adjustedValues": data.get("adjustedValues"),
        "submitted_at": time.time()
    }
    print(f"[{session_id[:8]}] NASA-TLX detaylı ({difficulty}): RTLX={data.get('rtlxScore')}")
    return {"status": "success"}


@app.post("/api/session/{session_id}/marker")
async def add_marker(session_id: str, data: MarkerData):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session_time = time.time()
    marker = {
        "event_type": data.event_type,
        "client_timestamp_ms": data.timestamp_ms,
        "server_timestamp": session_time,
        "session_elapsed_sec": session_time - sessions[session_id]["session_start_time"],
        "metadata": data.metadata or {}
    }
    sessions[session_id]["markers"].append(marker)

    if data.event_type in ["question_onset", "question_response", "block_start", "block_end"]:
        print(f"[{session_id[:8]}] MARKER: {data.event_type} | meta: {data.metadata}")

    return {"status": "success", "marker_id": len(sessions[session_id]["markers"]) - 1}


# ============================================================================
# ⚡ YENİ: UEQ-S ENDPOINT (Etik kurul EK-6)
# ============================================================================
@app.post("/api/session/{session_id}/ueqs")
async def sync_ueqs(session_id: str, data: Dict[str, Any]):
    """
    UEQ-S kullanıcı deneyimi anket sonuçlarını kaydet.
    
    Beklenen veri:
      - rawValues: {1: 5, 2: 6, ...}        (1-7 arası ham değerler)
      - normalizedValues: {1: 1, 2: 2, ...} (-3 ile +3 arası normalize)
      - pragmaticScore: float                (madde 1-4 ortalaması)
      - hedonicScore: float                  (madde 5-8 ortalaması)
      - overallScore: float                  (Pragmatic + Hedonic / 2)
      - submittedAt: ISO timestamp string
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    sessions[session_id]["ueqs"] = {
        "rawValues": data.get("rawValues"),
        "normalizedValues": data.get("normalizedValues"),
        "pragmaticScore": data.get("pragmaticScore"),
        "hedonicScore": data.get("hedonicScore"),
        "overallScore": data.get("overallScore"),
        "submittedAt": data.get("submittedAt"),
        "received_at": time.time()
    }
    
    print(f"[{session_id[:8]}] UEQ-S: Pragmatic={data.get('pragmaticScore')}, "
          f"Hedonic={data.get('hedonicScore')}, Overall={data.get('overallScore')}")
    
    return {"status": "success"}


# ============================================================================
# ⚡ YENİ: SESSION FINALIZE — Otomatik Veri Kaydetme
# ============================================================================
@app.post("/api/session/{session_id}/finalize")
async def finalize_session(session_id: str):
    """
    Sınav bittiğinde tüm session verilerini diske otomatik kaydet.
    
    Klasör yapısı:
      session_data/
      └── P01_session_abc12345/
          ├── metadata.json         (demografik + onam)
          ├── eeg_full.txt          (tüm EEG, STEW formatı: 14 kanal × N sample)
          ├── answers.json          (cevaplar)
          ├── nasa_tlx.json         (3 NASA-TLX)
          ├── ueqs.json             (varsa)
          └── markers.csv           (tüm event marker'lar)
    
    Bu endpoint Result ekranı açıldığında frontend tarafından otomatik çağrılır.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    s = sessions[session_id]
    user_info = s.get("user_info", {})
    
    # Katılımcı ID al (anonim) — yoksa session_id'nin ilk 8 karakteri
    participant_id = user_info.get("participantId") or f"P_{session_id[:8]}"
    safe_pid = "".join(c for c in participant_id if c.isalnum() or c == "_")
    
    # Klasör oluştur
    base_dir = os.path.join(os.path.dirname(__file__), "session_data")
    os.makedirs(base_dir, exist_ok=True)
    
    folder_name = f"{safe_pid}_session_{session_id[:8]}"
    folder_path = os.path.join(base_dir, folder_name)
    os.makedirs(folder_path, exist_ok=True)
    
    files_created = []
    
    try:
        # 1. METADATA — Demografik + onam
        metadata = {
            "session_id": session_id,
            "participant_id": participant_id,
            "session_start_time": s.get("session_start_time"),
            "session_finalize_time": time.time(),
            "session_duration_sec": time.time() - s.get("session_start_time", time.time()),
            "user_info": user_info,
            "calibration_chunks_collected": s.get("calibration_chunks", 0),
            "total_eeg_samples": len(s.get("filtered_eeg_data", [])),
            "level_saves": s.get("level_saves", []),   # ⚡ Hangi seviye, hangi index aralığı
            "filter_settings": {
                "bandpass": "1-45 Hz Butterworth (order=4)",
                "notch": "50 Hz Notch (Q=30)",
                "channels": "AF3,F7,F3,FC5,T7,P7,O1,O2,P8,T8,FC6,F4,F8,AF4 (STEW order)"
            }
        }
        with open(os.path.join(folder_path, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False, default=str)
        files_created.append("metadata.json")
        
        # 2. EEG FULL — STEW formatı (filtered)
        # filtered_eeg_data, websocket loop'unda toplanan filtered chunk'lardır
        eeg_data = s.get("filtered_eeg_data") or s.get("eeg_buffer") or []
        if eeg_data:
            eeg_path = os.path.join(folder_path, "eeg_full.txt")
            with open(eeg_path, "w") as f:
                for sample in eeg_data:
                    # STEW formatı: 14 kanal, virgülle ayrılmış
                    if isinstance(sample, dict):
                        # Channels dict'inden 14 kanalı çıkar (STEW sırasında)
                        row = [str(sample.get(ch, 0.0)) for ch in EPOC_CHANNELS]
                    elif isinstance(sample, (list, tuple)):
                        row = [str(v) for v in sample[:14]]
                    else:
                        # numpy array
                        try:
                            row = [str(v) for v in list(sample)[:14]]
                        except:
                            continue
                    f.write(",".join(row) + "\n")
            files_created.append(f"eeg_full.txt ({len(eeg_data)} samples)")
        
        # 3. ANSWERS
        answers = s.get("answers", [])
        if answers:
            with open(os.path.join(folder_path, "answers.json"), "w", encoding="utf-8") as f:
                json.dump(answers, f, indent=2, ensure_ascii=False)
            files_created.append(f"answers.json ({len(answers)} answers)")
        
        # 4. NASA-TLX
        nasa_detailed = s.get("nasa_detailed", {})
        nasa_simple = s.get("nasa", {})
        nasa_data = {
            "detailed": nasa_detailed,
            "legacy_format": nasa_simple
        }
        with open(os.path.join(folder_path, "nasa_tlx.json"), "w", encoding="utf-8") as f:
            json.dump(nasa_data, f, indent=2, ensure_ascii=False, default=str)
        files_created.append("nasa_tlx.json")
        
        # 5. UEQ-S (eğer doldurulduysa)
        if "ueqs" in s and s["ueqs"]:
            with open(os.path.join(folder_path, "ueqs.json"), "w", encoding="utf-8") as f:
                json.dump(s["ueqs"], f, indent=2, ensure_ascii=False, default=str)
            files_created.append("ueqs.json")
        
        # 6. MARKERS CSV
        markers = s.get("markers", [])
        if markers:
            csv_path = os.path.join(folder_path, "markers.csv")
            with open(csv_path, "w", encoding="utf-8") as f:
                f.write("event_type,client_timestamp_ms,server_timestamp,session_elapsed_sec,metadata_json\n")
                for m in markers:
                    meta_str = json.dumps(m.get("metadata", {}), ensure_ascii=False).replace('"', '""')
                    f.write(f"{m['event_type']},{m['client_timestamp_ms']},{m['server_timestamp']},"
                            f"{m['session_elapsed_sec']:.3f},\"{meta_str}\"\n")
            files_created.append(f"markers.csv ({len(markers)} markers)")
        
        print(f"[{session_id[:8]}] ✓ Session finalized → {folder_path}")
        print(f"[{session_id[:8]}]   Files: {', '.join(files_created)}")
        
        return {
            "status": "success",
            "session_id": session_id,
            "participant_id": participant_id,
            "folder_path": folder_path,
            "folder_name": folder_name,
            "files_created": files_created,
            "stats": {
                "total_eeg_samples": len(eeg_data),
                "total_answers": len(answers),
                "total_markers": len(markers),
                "has_ueqs": "ueqs" in s and s["ueqs"] is not None
            }
        }
    
    except Exception as e:
        print(f"[{session_id[:8]}] ✗ Finalize error: {e}")
        raise HTTPException(status_code=500, detail=f"Finalize failed: {str(e)}")


# ============================================================================
# ⚡ YENİ: SEVİYE SİNYALİ KAYDET — Her seviye bitince o seviyenin EEG'sini diske yaz
# ============================================================================
@app.post("/api/session/{session_id}/save-level")
async def save_level_eeg(session_id: str, level: str = "unknown"):
    """
    Bir seviye (kolay/orta/zor) bittiğinde, o seviyeye ait EEG sinyalini
    ayrı bir dosyaya kaydeder.

    Yöntem: "Son kayıttan bu yana biriken sinyal" mantığı.
      - ses["level_save_cursor"] : filtered_eeg_data listesinde en son
        nereye kadar kaydettiğimizi tutar.
      - Bu çağrıda cursor'dan listenin sonuna kadar olan kısım = bu seviyenin sinyali.

    Çıktı:
      session_data/PXX_session_xxx/eeg_{level}.txt   (filtrelenmiş, STEW formatı)
      session_data/PXX_session_xxx/eeg_{level}_raw.txt (ham)

    Frontend her seviye bitince (block_end) bunu çağırır.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    s = sessions[session_id]
    user_info = s.get("user_info", {})

    participant_id = user_info.get("participantId") or f"P_{session_id[:8]}"
    safe_pid = "".join(c for c in participant_id if c.isalnum() or c == "_")
    safe_level = "".join(c for c in str(level) if c.isalnum() or c == "_") or "unknown"

    # Klasör
    base_dir = os.path.join(os.path.dirname(__file__), "session_data")
    folder_name = f"{safe_pid}_session_{session_id[:8]}"
    folder_path = os.path.join(base_dir, folder_name)
    os.makedirs(folder_path, exist_ok=True)

    # Cursor: en son nereye kadar kaydettik?
    cursor = s.get("level_save_cursor", 0)

    filtered = s.get("filtered_eeg_data", [])
    raw = s.get("raw_stew_data", [])

    # Bu seviyenin dilimi = cursor'dan listenin sonuna kadar
    filtered_slice = filtered[cursor:]
    raw_slice = raw[cursor:]
    end_index = len(filtered)

    files_created = []

    try:
        # Filtrelenmiş sinyal (analiz için ana dosya)
        if filtered_slice:
            fpath = os.path.join(folder_path, f"eeg_{safe_level}.txt")
            with open(fpath, "w") as f:
                for row in filtered_slice:
                    f.write(",".join(str(v) for v in row[:14]) + "\n")
            files_created.append(f"eeg_{safe_level}.txt ({len(filtered_slice)} samples)")

        # Ham sinyal (yedek)
        if raw_slice:
            rpath = os.path.join(folder_path, f"eeg_{safe_level}_raw.txt")
            with open(rpath, "w") as f:
                for row in raw_slice:
                    f.write(",".join(str(v) for v in row[:14]) + "\n")
            files_created.append(f"eeg_{safe_level}_raw.txt ({len(raw_slice)} samples)")

        # Cursor'u ilerlet → sonraki seviye buradan başlayacak
        s["level_save_cursor"] = end_index

        # Seviye kayıt geçmişini tut (metadata için)
        s.setdefault("level_saves", []).append({
            "level": safe_level,
            "start_index": cursor,
            "end_index": end_index,
            "sample_count": len(filtered_slice),
            "saved_at": time.time()
        })

        print(f"[{session_id[:8]}] ✓ Seviye sinyali kaydedildi: {safe_level} "
              f"({len(filtered_slice)} sample, index {cursor}→{end_index})")

        return {
            "status": "success",
            "level": safe_level,
            "sample_count": len(filtered_slice),
            "start_index": cursor,
            "end_index": end_index,
            "files_created": files_created,
            "folder_path": folder_path
        }

    except Exception as e:
        print(f"[{session_id[:8]}] ✗ save-level error ({safe_level}): {e}")
        raise HTTPException(status_code=500, detail=f"save-level failed: {str(e)}")


# ============================================================================
# 4. WEBSOCKET ENDPOINTİ (EEG VERİ AKIŞI + FİLTRELEME)
# ============================================================================
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

                # ============================================================
                # ⚡ SİNYAL İŞLEME — FİLTRELEME (Her chunk'ta uygulanır)
                # ============================================================
                raw_chunk = np.array(sample["epoch_data"], dtype=np.float64)

                # Bandpass + Notch filtreleri stateful olarak uygula
                filtered_chunk, ses["zi_bandpass"], ses["zi_notch"] = apply_filters(
                    raw_chunk,
                    ses["zi_bandpass"],
                    ses["zi_notch"]
                )

                # Model için filtrelenmiş veriyi kullan
                model_chunk = filtered_chunk.copy()
                cog_load = "low"

                # ============================================================
                # AŞAMA 1: KALİBRASYON (180 saniye baseline)
                # ============================================================
                if ses.get("state") == "calibrating":
                    # ⚡ Baseline filtrelenmiş veriden hesaplanır
                    ses.setdefault("baseline_buffer", []).append(filtered_chunk)

                    if len(ses["baseline_buffer"]) >= CALIBRATION_CHUNKS:
                        baseline_data = np.vstack(ses["baseline_buffer"])
                        ses["baseline_mean"] = np.mean(baseline_data, axis=0)
                        ses["baseline_std"] = np.std(baseline_data, axis=0)
                        ses["state"] = "testing"
                        print(f"[{session_id[:8]}] ✓ 180s Baseline tamamlandı (filtrelenmiş veri).")

                # ============================================================
                # AŞAMA 2: SINAV (TEST) — Filtreli + Normalize + Model
                # ============================================================
                elif ses.get("state") == "testing":
                    if ses.get("baseline_mean") is not None:
                        model_chunk = (model_chunk - ses["baseline_mean"]) / (ses["baseline_std"] + 1e-7)

                    # ⚡ ARFN makalesi uyumlu PSD çıkarımı
                    features = extract_psd_arfn_style(model_chunk)
                    feature_buffer.append(features)

                    if len(feature_buffer) >= 8:
                        input_data = np.array([feature_buffer[-8:]])
                        if model:
                            try:
                                pred_probs = model.predict(input_data, verbose=0)[0]
                                class_idx = np.argmax(pred_probs)
                                labels = ["low", "medium", "high"]
                                cog_load = labels[class_idx]
                            except Exception as exc:
                                print(f"[{session_id[:8]}] Model tahmin hatası: {exc}")
                        feature_buffer.pop(0)

                # ============================================================
                # 3. VERİYİ KAYDET VE GÖNDER
                # ============================================================
                record = {
                    "timestamp": sample["timestamp"],
                    "cognitive_load": cog_load,
                    "cognitive_load_tr": "Düşük" if cog_load == "low" else "Orta" if cog_load == "medium" else "Yüksek",
                    "session_state": ses.get("state")
                }
                for i, ch_name in enumerate(EPOC_CHANNELS):
                    record[ch_name] = float(filtered_chunk[-1, i])
                ses["eeg_records"].append(record)

                # 128 Hz batch verisi (frontend için)
                batch_records = []
                base_time = sample["timestamp"] - 4.0

                for idx in range(len(raw_chunk)):
                    # Ham veri (STEW formatı için)
                    ses["raw_stew_data"].append(raw_chunk[idx, :14].tolist())
                    # Filtrelenmiş veri (analiz için)
                    ses["filtered_eeg_data"].append(filtered_chunk[idx, :14].tolist())

                    ch_dict = {}
                    for i, ch_name in enumerate(EPOC_CHANNELS):
                        ch_dict[ch_name] = float(filtered_chunk[idx, i])

                    batch_records.append({
                        "timestamp": round(base_time + (idx / 128.0), 4),
                        "cognitive_load": cog_load,
                        "channels": ch_dict
                    })

                await websocket.send_json({
                    "timestamp": sample["timestamp"],
                    "channels": {ch: float(filtered_chunk[-1, i]) for i, ch in enumerate(EPOC_CHANNELS)},
                    "cognitive_load": cog_load,
                    "batch_data": batch_records,
                    "app_state": ses.get("state")
                })

    except WebSocketDisconnect:
        print(f"[{session_id[:8]}] Bağlantı koptu.")
    except Exception as e:
        print(f"[{session_id[:8]}] WebSocket Hatası: {e}")


# ============================================================================
# 5. EXPORT ENDPOINTLERİ
# ============================================================================

@app.get("/api/session/{session_id}/export/stew")
async def download_stew_format(session_id: str):
    """Ham 14 kanallı EEG verisini STEW formatında indirir (FILTRELENMEMIS)."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    raw_data = sessions[session_id].get("raw_stew_data", [])
    lines = []
    for row in raw_data:
        formatted_row = "  ".join([f"{val:.7e}" for val in row])
        lines.append(formatted_row)

    file_content = "\n".join(lines)
    headers = {"Content-Disposition": f"attachment; filename=sub_{session_id[:4]}_stew.txt"}
    return PlainTextResponse(content=file_content, headers=headers)


# ⚡ YENİ ENDPOINT: Filtrelenmiş EEG verisi
@app.get("/api/session/{session_id}/export/filtered")
async def download_filtered_eeg(session_id: str):
    """Filtrelenmiş 14 kanallı EEG verisini indirir (analiz için optimal)."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    filtered_data = sessions[session_id].get("filtered_eeg_data", [])
    lines = []
    for row in filtered_data:
        formatted_row = "  ".join([f"{val:.7e}" for val in row])
        lines.append(formatted_row)

    file_content = "\n".join(lines)
    headers = {"Content-Disposition": f"attachment; filename=sub_{session_id[:4]}_filtered.txt"}
    return PlainTextResponse(content=file_content, headers=headers)


@app.get("/api/session/{session_id}/export/full")
async def download_full_data(session_id: str):
    """Tam analiz verisi: marker'lar + cevaplar + NASA-TLX + EEG epoch'ları"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    ses = sessions[session_id]

    export_data = {
        "session_id": session_id,
        "user": ses.get("user"),
        "session_start_time": ses.get("session_start_time"),
        "calibration_duration_sec": CALIBRATION_CHUNKS * 4,
        "filter_config": {
            "bandpass_hz": [BANDPASS_LOW, BANDPASS_HIGH],
            "notch_hz": NOTCH_FREQ,
            "sampling_rate_hz": FS
        },
        "answers": ses.get("answers", []),
        "nasa_simple": ses.get("nasa", {}),
        "nasa_detailed": ses.get("nasa_detailed", {}),
        "markers": ses.get("markers", []),
        "eeg_epochs": ses.get("eeg_records", []),
        "baseline_mean": ses["baseline_mean"].tolist() if ses.get("baseline_mean") is not None else None,
        "baseline_std": ses["baseline_std"].tolist() if ses.get("baseline_std") is not None else None,
    }

    headers = {"Content-Disposition": f"attachment; filename=sub_{session_id[:4]}_full_data.json"}
    return JSONResponse(content=export_data, headers=headers)


@app.get("/api/session/{session_id}/export/markers")
async def download_markers_csv(session_id: str):
    """Marker'ları CSV formatında indirir."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    markers = sessions[session_id].get("markers", [])

    lines = ["event_type,client_timestamp_ms,server_timestamp,session_elapsed_sec,metadata_json"]
    for m in markers:
        meta_json = json.dumps(m["metadata"]).replace(",", ";")
        lines.append(
            f'{m["event_type"]},{m["client_timestamp_ms"]},{m["server_timestamp"]},'
            f'{m["session_elapsed_sec"]:.4f},"{meta_json}"'
        )

    file_content = "\n".join(lines)
    headers = {"Content-Disposition": f"attachment; filename=sub_{session_id[:4]}_markers.csv"}
    return PlainTextResponse(content=file_content, headers=headers, media_type="text/csv")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)