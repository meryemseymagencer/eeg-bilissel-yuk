import numpy as np
import joblib
from pathlib import Path
from tensorflow.keras.models import load_model

# SENİN KENDİ YAZDIĞIN KÜTÜPHANELERİ İÇE AKTARIYORUZ
from eeg_pipeline import SignalProcessor
from gemini import TIME_STEPS  # gemini.py'de belirlediğin zaman adımı (örn: 3)

class CognitiveEngine:
    """
    ARFN Makalesine ve güncel gemini.py mimarisine uygun Canlı Analiz Motoru.
    """
    def __init__(self, model_path='models/arfn_model.h5', scaler_path='models/arfn_scaler.joblib'):
        self.model_path = Path(model_path)
        self.scaler_path = Path(scaler_path)
        self.model = None
        self.scaler = None
        
        # Senin eeg_pipeline'daki sinyal işleyicin
        self.processor = SignalProcessor() 
        
        # Canlı veriyi zaman adımlarına bölmek için tampon (buffer)
        # Eğer TIME_STEPS = 3 ise, modeli çalıştırmak için arka arkaya 3 saniyelik veriye ihtiyaç var.
        self.epoch_buffer = [] 

        if self.model_path.exists() and self.scaler_path.exists():
            self.load_engine()
        else:
            print("UYARI: Model veya Scaler dosyası bulunamadı!")

    def load_engine(self):
        """Keras modelini ve özellik ölçekleyiciyi yükler."""
        self.model = load_model(self.model_path)
        self.scaler = joblib.load(self.scaler_path)
        print("ARFN Bilişsel Motoru ve Scaler başarıyla yüklendi.")

    def predict_load(self, live_raw_epoch):
        """
        Canlı veriden (128x14) anlık bilişsel yük tahmini yapar.
        ARFN (LSTM) mimarisi zaman serisi beklediği için veriyi biriktirir.
        """
        if self.model is None:
            return "Model Yüklü Değil"
            
        # 1. Senin kendi fonksiyonunla filtreleme (Bandpass + CAR)
        clean_data = self.processor.preprocess(live_raw_epoch)
        
        # 2. Senin kendi fonksiyonunla özellik çıkarımı (Hjorth, PSD, DE, Theta/Alpha)
        # Bu fonksiyon tek bir epoch için düz bir liste (1D array) döner
        feats = self.processor.extract_features(clean_data)
        
        # 3. Eğitimdeki gibi veriyi normalize et (Ölçeklendir)
        # reshape(1, -1) çünkü scaler 2D array bekler
        scaled_feats = self.scaler.transform(feats.reshape(1, -1))[0]
        
        # 4. LSTM İçin Zaman Tamponu (Buffer) Yönetimi
        self.epoch_buffer.append(scaled_feats)
        
        # Eğer henüz yeterli zaman adımı (örn: 3 saniye) birikmediyse bekle
        if len(self.epoch_buffer) < TIME_STEPS:
            return "Veri Biriktiriliyor..." # Arayüzde bunu "Hesaplanıyor" olarak gösterebilirsin
            
        # Eğer tampon dolduysa (örn: 3 tane özellik vektörü varsa)
        if len(self.epoch_buffer) > TIME_STEPS:
            self.epoch_buffer.pop(0) # En eski veriyi at, kayan pencere (sliding window) yap
            
        # 5. LSTM'in beklediği 3 Boyutlu formatı oluştur: (Batch=1, Time_Steps=3, Features)
        lstm_ready_input = np.array([self.epoch_buffer])
        
        # 6. Tahmin (Predict)
        prediction = self.model.predict(lstm_ready_input, verbose=0)
        label_idx = np.argmax(prediction)
        labels = ["low", "medium", "high"] # gemini.py N_CLASSES = 3 mantığı
        
        return labels[label_idx]