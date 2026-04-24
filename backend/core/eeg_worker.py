import asyncio
import numpy as np
import scipy.signal as signal
import tensorflow as tf
from PyQt6.QtCore import QThread, pyqtSignal
from cortex_client import CortexClient
from eeg_pipeline import EPOC_CHANNELS
from gemini import FeatureAttention, FuzzyLayer

# Modelin eğitimde gördüğü frekans bantları
BANDS = [("delta", 1, 4), ("theta", 4, 8), ("alpha", 8, 14), ("beta", 14, 30), ("gamma", 30, 64)]

class EEGWorker(QThread):
    prediction_received = pyqtSignal(str) 

    def __init__(self):
        super().__init__()
        self.running = True
        
        custom_objects = {'FeatureAttention': FeatureAttention, 'FuzzyLayer': FuzzyLayer}
        self.model = tf.keras.models.load_model('models/arfn_model.h5', custom_objects=custom_objects)
        
        self.client = CortexClient()
        self.feature_buffer = [] # Son 8 pencerenin özelliklerini biriktirmek için liste; model 8 zaman adımlık bir girdi bekliyor.

    def extract_psd(self, chunk):
        """4 saniyelik ham veriden (512x14) Welch PSD yöntemiyle 70 özellik çıkarır"""

        freqs, pxx = signal.welch(chunk, fs=128, nperseg=len(chunk), axis=0) #
        features = []
        for ch in range(14):
            for _, lo, hi in BANDS:
                mask = (freqs >= lo) & (freqs <= hi)
                power = np.sum(pxx[mask, ch])
                features.append(power)
                
        # gemini.py'daki Log10 dönüşümü --ölçeklemeyi sağlar ve modelin eğitimde gördüğü dağılıma benzer hale getirir
        features = np.log10(np.array(features) + 1e-10)
        return features

    async def start_eeg_stream(self):
        async for sample in self.client.stream(app_session_id="lab_test"):
            if not self.running: break
            
            if "epoch_data" not in sample:
                continue
                
            # 1. Ham veriyi al (512 örneklem, 14 kanal)
            chunk = np.array(sample["epoch_data"])
            
            # 2. 70 PSD özelliğini çıkar
            features = self.extract_psd(chunk)
            self.feature_buffer.append(features)
            
            # 3. Model 8 pencerelik (8x70) bir geçmiş bekliyor
            if len(self.feature_buffer) >= 8:
                input_data = np.array([self.feature_buffer[-8:]]) # Boyut: (1, 8, 70)
                
                # Gerçek Derin Öğrenme Tahmini!
                prediction_probs = self.model.predict(input_data, verbose=0)[0]
                class_idx = np.argmax(prediction_probs)
                
                labels = ["LOW", "MEDIUM", "HIGH"]
                self.prediction_received.emit(labels[class_idx])
                
                # Kuyruğun en eskisini at (Kayan Pencere)
                self.feature_buffer.pop(0)

    def run(self):
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            async def main_task():
                async with self.client as client:
                    await self.start_eeg_stream()
                    
            loop.run_until_complete(main_task())
        except Exception as e:
            print(f"EEG Worker Hatası: {e}")

    def stop(self):
        self.running = False
        self.quit()