import time
import joblib
import numpy as np
from sklearn.svm import SVC
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
import os

# --- 1. VERİ SETİNİ BÖLME VE EĞİTİM AŞAMASI ---
def train_and_save_model():
    print(">>> 1. AŞAMA: STEW Veri Seti Okunuyor ve Model Eğitiliyor...")
    
    # Not: Burada kendi deneme.py'ndaki özellik çıkarım (feature extraction) 
    # fonksiyonlarını kullanacaksın. Biz şimdilik sistemi test etmek için 
    # STEW formatında (14 kanal, 128 örneklem) sentetik veri üretiyoruz.
    
    # 38 Katılımcı için Eğitim Verisi (Train)
    # Her katılımcıdan 100 saniyelik (100 epoch) veri aldığımızı varsayalım
    # Gerçek projede bunu: X_train, y_train = load_stew_data(subjects=1_to_38) ile yapacaksın
    n_train_epochs = 3800 
    X_train = np.random.rand(n_train_epochs, 14) # 14 Kanaldan çıkarılmış özellikler (Bandpower vs)
    y_train = np.random.choice(["low", "medium", "high"], n_train_epochs)
    
    # Boru Hattı (Pipeline) Oluşturuluyor: Ölçeklendirme + Sınıflandırıcı (SVM)
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('classifier', SVC(kernel='rbf', probability=True, class_weight='balanced'))
    ])
    
    # Modeli Eğit (Beyin öğreniyor)
    print("Model eğitiliyor (Bu işlem birkaç dakika sürebilir)...")
    pipeline.fit(X_train, y_train)
    
    # Modeli Kaydet (.joblib dosyası üretiliyor)
    os.makedirs('models', exist_ok=True)
    joblib.dump(pipeline, 'models/cognitive_pipeline.joblib')
    print(">>> BAŞARILI: Model 'models/cognitive_pipeline.joblib' olarak kaydedildi!\n")


# --- 2. CANLI SINAV SİMÜLASYONU (CİHAZ TAKILIYMIŞ GİBİ) ---
def simulate_live_test():
    print(">>> 2. AŞAMA: Laboratuvar Simülasyonu Başlıyor...")
    print("Dondurulmuş model (joblib) hafızaya yükleniyor...")
    
    # Eğittiğimiz modeli yüklüyoruz
    try:
        model = joblib.load('models/cognitive_pipeline.joblib')
    except FileNotFoundError:
        print("HATA: Model dosyası bulunamadı!")
        return

    print("Model Yüklendi! Kalan 10 test katılımcısı simüle ediliyor...\n")
    
    # Kalan 10 katılımcıdan canlı akan verileri simüle ediyoruz
    # Gerçek projede bu döngü cortex_client.py'dan (Emotiv'den) gelecek
    for saniye in range(1, 16):
        print(f"[Zaman: {saniye}. saniye] Emotiv cihazından 1 saniyelik (128 veri noktası) epoch alındı...")
        
        # O anki 1 saniyelik EEG verisinden çıkarılan özellikler (14 kanal)
        canli_epoch_ozellikleri = np.random.rand(1, 14) 
        
        # Tahmin Et (Predict)
        tahmin = model.predict(canli_epoch_ozellikleri)[0]
        olasiliklar = model.predict_proba(canli_epoch_ozellikleri)[0]
        
        print(f" -> Tahmin Edilen Bilişsel Yük: ** {tahmin.upper()} ** (Olasılıklar: {np.round(olasiliklar, 2)})")
        
        # Cihazdan saniyede 1 veri gelmesini simüle etmek için 1 saniye bekle
        time.sleep(1)
        
    print("\n>>> SİMÜLASYON TAMAMLANDI! Sistem canlı teste hazır.")

if __name__ == "__main__":
    # Önce eğitimi yapıp modeli kaydediyoruz
    train_and_save_model()
    
    # Ardından cihaz takılıymış gibi modeli test ediyoruz
    simulate_live_test()