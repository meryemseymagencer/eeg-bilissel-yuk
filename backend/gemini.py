"""
EEG Bilişsel Yük — Derin Öğrenme Pipeline (Faz 5: ARFN Felsefesi)
====================================================================
Mimari: Özellik Mühendisliği (Zaman-PSD) + Bulanık Mantık (Fuzzy) + Çift Yönlü LSTM
Referans: Wang Z. vd. (2024) - Attention-Based Recurrent Fuzzy Network felsefesi.
"""
from __future__ import annotations
import argparse
import json
import logging
import os
import sys
import warnings
from pathlib import Path
from typing import Optional
import numpy as np
import scipy.signal as signal
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, regularizers

# Mevcut pipeline'dan veri yükleme ve sinyal işleme
from eeg_pipeline import (
    load_stew_data,
    SignalProcessor,
    FS, EPOCH_LEN, EPOCH_STEP, N_CHANNELS,
    EPOC_CHANNELS, CHANNEL_2D_MAP, LABEL_MAP,
)
log = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

# ===========================================================================
# Sabitler (Wang 2024 ARFN Uyumlu)
# ===========================================================================
N_CLASSES = 3  # Düşük, Orta, Yüksek
BANDS = [
    ("delta", 1, 4), 
    ("theta", 4, 8), 
    ("alpha", 8, 14), 
    ("beta", 14, 30), 
    ("gamma", 30, 64)
] # Toplam 5 Bant x 14 Kanal = 70 Özellik

# ===========================================================================
# 1) İleri Düzey Özellik Mühendisliği: Zaman-Serisi PSD
# ===========================================================================
def prepare_psd_sequence(epochs: list[np.ndarray], processor: SignalProcessor | None = None) -> np.ndarray:
    """
    31.25 sn'lik (4000 örneklem) epoch'u ardışık 8 pencereye (T=8) böler.
    Her pencere 500 örneklem (~3.9 saniye) içerir.
    """
    window = 500   # 4000 / 8 = 500
    step = 500     # Örtüşmesiz ardışık pencereler
    X_seq = []
    
    for ep in epochs:
        if processor is not None:
            ep = processor.bandpass(ep)
        
        seq = []
        # 4 saniyelik veriyi 4 zaman adımına böl
        for start in range(0, EPOCH_LEN, step):
            chunk = ep[start:start+window]
            if len(chunk) < window:
                break
                
            # Her bir zaman adımı için Welch PSD hesapla
            freqs, pxx = signal.welch(chunk, fs=FS, nperseg=window, axis=0)
            chunk_features = []
            
            for ch in range(N_CHANNELS):
                for _, lo, hi in BANDS:
                    mask = (freqs >= lo) & (freqs <= hi)
                    power = np.sum(pxx[mask, ch])
                    chunk_features.append(power)
            seq.append(chunk_features)
        X_seq.append(seq)
        
    return np.array(X_seq, dtype=np.float32)

def normalize_inputs(X_train, X_test, train_groups, test_groups):
    """
    PSD değerleri logaritmik olarak düzeltilir ve Kişi Bazlı normalize edilir.
    """
    EPS = 1e-10
    # 1. Adım: PSD genlikleri üstel büyüdüğü için Logaritma dönüşümü (Çok Kritik!)
    X_train = np.log10(X_train + EPS)
    X_test = np.log10(X_test + EPS)
    
    # 2. Adım: Kişi bazlı Z-Skoru normalizasyonu
    def per_subject_norm(X_tr, X_te, tr_grps, te_grps):
        X_tr_norm, X_te_norm = X_tr.copy(), X_te.copy()
        for subj in np.unique(tr_grps):
            mask = tr_grps == subj
            mu = X_tr[mask].mean(axis=(0, 1), keepdims=True)
            std = X_tr[mask].std(axis=(0, 1), keepdims=True) + EPS
            X_tr_norm[mask] = (X_tr[mask] - mu) / std
        for subj in np.unique(te_grps):
            mask = te_grps == subj
            mu = X_te[mask].mean(axis=(0, 1), keepdims=True)
            std = X_te[mask].std(axis=(0, 1), keepdims=True) + EPS
            X_te_norm[mask] = (X_te[mask] - mu) / std
        return X_tr_norm, X_te_norm
        
    X_train_norm, X_test_norm = per_subject_norm(X_train, X_test, train_groups, test_groups)
    return X_train_norm, X_test_norm, {"note": "Log10 + Subject-specific temporal norm"}
from sklearn.cluster import KMeans

def compute_kmeans_centers(X_train, num_rules=64):
    """
    Eğitim verisinden K-Means algoritması ile Fuzzy kuralları için
    başlangıç merkezlerini (centers) hesaplar.
    """
    log.info(f"K-Means ile {num_rules} adet küme merkezi (Fuzzy Centers) hesaplanıyor...")
    # X_train boyutu: (Samples, TimeSteps, Features) -> (Samples * TimeSteps, Features)
    X_flat = X_train.reshape(-1, X_train.shape[-1])
    
    # Veri çok büyükse hesaplamayı hızlandırmak için alt örneklem (subsample) alınabilir
    if len(X_flat) > 50000:
        np.random.seed(42)
        indices = np.random.choice(len(X_flat), 50000, replace=False)
        X_flat = X_flat[indices]
        
    kmeans = KMeans(n_clusters=num_rules, random_state=42, n_init=10)
    kmeans.fit(X_flat)
    return kmeans.cluster_centers_
# ===========================================================================
# 2) Özel Keras Katmanları: ARFN (Feature Attention + Fuzzy Logic)
# ===========================================================================
class FeatureAttention(tf.keras.layers.Layer):
    """
    ARFN Denklem 1, 2, 3, 4: Frekans özelliklerini bulanıklaştırmadan önce filtreler.
    """
    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def build(self, input_shape):
        self.features = input_shape[-1]
        # Denklem 1 ve 2 için öğrenilebilir ağırlıklar
        self.W_p = self.add_weight(name="W_p", shape=(self.features, self.features), initializer="glorot_uniform", trainable=True)
        self.b_p = self.add_weight(name="b_p", shape=(self.features,), initializer="zeros", trainable=True)
        
        self.W_n = self.add_weight(name="W_n", shape=(self.features, self.features), initializer="glorot_uniform", trainable=True)
        self.b_n = self.add_weight(name="b_n", shape=(self.features,), initializer="zeros", trainable=True)
        super().build(input_shape)

    def call(self, inputs):
        # inputs shape: (Batch, Time=4, Features=70)
        p = tf.matmul(inputs, self.W_p) + self.b_p
        n = tf.matmul(inputs, self.W_n) + self.b_n
        
        # Denklem 3: Softmax tabanlı olasılık w^f
        w_f = tf.exp(p) / (tf.exp(p) + tf.exp(n) + 1e-8)
        
        # Denklem 4: Özelliklerin ağırlıklandırılması
        u_1 = inputs * w_f 
        return u_1
class FuzzyLayer(tf.keras.layers.Layer):
    """
    ARFN Denklem 5, 6, 7, 8 ve 14: Harmonik-Logaritmik Kurallar, Kural Dikkati ve Kural Cezası.
    """
    def __init__(self, num_rules=64, alpha_reg=5e-4, initial_centers=None, **kwargs):
        super().__init__(**kwargs)
        self.num_rules = num_rules
        self.alpha_reg = alpha_reg # ARFN Denklem 14'teki alfa cezası
        self.initial_centers = initial_centers # K-Means merkezlerini tutacak değişken

    def build(self, input_shape):
        self.features = input_shape[-1]
        
        # K-Means merkezleri geldiyse onları kullan, gelmediyse rastgele başlat
        if self.initial_centers is not None:
            center_initializer = tf.constant_initializer(self.initial_centers)
        else:
            center_initializer = tf.keras.initializers.RandomNormal(mean=0.0, stddev=1.0)

        self.centers = self.add_weight(
            name="centers", shape=(self.num_rules, self.features),
            initializer=center_initializer, 
            trainable=True
        )
        self.sigmas = self.add_weight(
            name="sigmas", shape=(self.num_rules, self.features),
            initializer=tf.keras.initializers.Constant(1.0), trainable=True
        )
        self.W_r = self.add_weight(
            name="W_r", shape=(self.num_rules,),
            initializer="glorot_uniform", trainable=True
        )
        self.b_r = self.add_weight(
            name="b_r", shape=(self.num_rules,),
            initializer="zeros", trainable=True
        )
        super().build(input_shape)

    # call ve get_config metodları aynı kalabilir...
    def call(self, inputs):
        x = tf.expand_dims(inputs, axis=-2) # (Batch, 4, 1, 70)
        log_u = -tf.square(x - self.centers) / (2 * tf.square(self.sigmas) + 1e-8)
        mean_log_u = tf.reduce_mean(log_u, axis=-1) 
        F = -1.0 / (mean_log_u - 1e-8) 
        w_r = tf.nn.sigmoid(self.W_r * F + self.b_r)
        self.add_loss(self.alpha_reg * tf.reduce_mean(w_r))
        u3 = F * w_r 
        return u3 
        
    def get_config(self):
        config = super().get_config()
        config.update({"num_rules": self.num_rules, "alpha_reg": self.alpha_reg})
        return config
def build_model(initial_centers=None) -> tf.keras.Model:
    inp = keras.Input(shape=(8, len(BANDS) * N_CHANNELS), name="psd_sequence_input")
    attended_features = FeatureAttention(name="arfn_feature_attention")(inp)

    # Dışarıdan gelen K-Means merkezlerini FuzzyLayer'a aktarıyoruz
    fuzzy_out = FuzzyLayer(
        num_rules=64, 
        alpha_reg=5e-4, 
        initial_centers=initial_centers, 
        name="arfn_fuzzy_membership"
    )(attended_features)

    x = layers.Bidirectional(layers.LSTM(32, return_sequences=True, kernel_regularizer=regularizers.l2(1e-4)))(fuzzy_out)
    x = layers.Bidirectional(layers.LSTM(16, return_sequences=True, kernel_regularizer=regularizers.l2(1e-4)))(x)
    x = layers.GlobalAveragePooling1D(name="LSTM_AVG")(x)

    x = layers.Dense(32, activation="relu", kernel_regularizer=regularizers.l2(1e-4))(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.4)(x)
    
    out = layers.Dense(N_CLASSES, activation="softmax", name="output")(x)
    model = keras.Model(inputs=inp, outputs=out, name="Full_ARFN_Network")
    
    # Öğrenme oranını (learning rate) 1e-3 olarak tutabiliriz
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",  # mse yerine geri döndürdük
        metrics=["accuracy"]
    )
    return model
# ===========================================================================
# 4) Eğitim & CV Döngüleri
# ===========================================================================
def cross_validate_deep(stew_dir: str | Path, n_splits: int = 5, epochs: int = 150, batch_size: int = 64, patience: int = 15) -> dict:
    from sklearn.model_selection import GroupKFold
    from sklearn.metrics import accuracy_score, f1_score, cohen_kappa_score
    
    log.info("STEW verisi yükleniyor (CV)...")
    raw_epochs, labels, groups = load_stew_data(stew_dir)
    processor = SignalProcessor()
    
    y_all, groups_all = np.array(labels), np.array(groups)
    
    log.info("İleri Düzey Özellikler (Zaman-PSD) hesaplanıyor...")
    X_all_psd = prepare_psd_sequence(raw_epochs, processor)
    log.info("Çıkarılan Özellik Matrisi Şekli: %s", X_all_psd.shape)
    
    gkf = GroupKFold(n_splits=n_splits)
    fold_metrics = []

    for fold_i, (train_idx, test_idx) in enumerate(gkf.split(X_all_psd, y_all, groups_all)):
        log.info("═" * 50)
        log.info("Fold %d / %d", fold_i + 1, n_splits)
        
        y_train, y_test = y_all[train_idx], y_all[test_idx]
        y_train_cat = keras.utils.to_categorical(y_train, N_CLASSES)

        train_groups, test_groups = groups_all[train_idx], groups_all[test_idx]
        
        # Log10 + Normalizasyon
        (X_tr, X_te, _) = normalize_inputs(X_all_psd[train_idx], X_all_psd[test_idx], train_groups, test_groups)

        from sklearn.utils.class_weight import compute_class_weight
        cw = compute_class_weight("balanced", classes=np.arange(N_CLASSES), y=y_train)
        class_weights = {i: w for i, w in enumerate(cw)}

        tf.keras.backend.clear_session()
        initial_centers = compute_kmeans_centers(X_tr, num_rules=64)
        model = build_model(initial_centers=initial_centers)

        callbacks = [
            keras.callbacks.EarlyStopping(monitor="val_loss", patience=patience, restore_best_weights=True, verbose=0),
            keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=7, min_lr=1e-6, verbose=0),
        ]

        model.fit(
            X_tr, y_train_cat, 
            validation_data=(X_te, keras.utils.to_categorical(y_test, N_CLASSES)), 
            epochs=epochs, batch_size=batch_size, class_weight=class_weights, callbacks=callbacks, verbose=0
        )
        
        y_pred = np.argmax(model.predict(X_te, verbose=0), axis=1)
        acc, f1, kappa = accuracy_score(y_test, y_pred), f1_score(y_test, y_pred, average="macro"), cohen_kappa_score(y_test, y_pred)
        log.info("Fold %d → Doğruluk: %.3f | F1: %.3f | κ: %.3f", fold_i + 1, acc, f1, kappa)
        fold_metrics.append({"accuracy": acc, "f1_macro": f1, "kappa": kappa})
        
    summary = {
        "accuracy_mean": round(np.mean([m["accuracy"] for m in fold_metrics]), 4),
        "accuracy_std": round(np.std([m["accuracy"] for m in fold_metrics]), 4),
    }
    return summary

def train_deep_model(stew_dir: str | Path, epochs: int = 150, batch_size: int = 64, test_ratio: float = 0.20, patience: int = 15, save_path: str | Path | None = None) -> dict:
    from sklearn.metrics import accuracy_score, f1_score, cohen_kappa_score, classification_report
    
    log.info("STEW verisi yükleniyor (Ana Eğitim)...")
    raw_epochs, labels, groups = load_stew_data(stew_dir)
    processor = SignalProcessor()
    
    unique_subs = sorted(set(groups))
    n_test = max(1, int(len(unique_subs) * test_ratio))
    n_train = len(unique_subs) - n_test
    rng = np.random.RandomState(42)
    rng.shuffle(unique_subs)
    
    train_subs, test_subs = set(unique_subs[:n_train]), set(unique_subs[n_train:])
    train_idx = [i for i, g in enumerate(groups) if g in train_subs]
    test_idx = [i for i, g in enumerate(groups) if g in test_subs]
    
    y_train = np.array([labels[i] for i in train_idx])
    y_test = np.array([labels[i] for i in test_idx])
    y_train_cat = keras.utils.to_categorical(y_train, N_CLASSES)
    y_test_cat = keras.utils.to_categorical(y_test, N_CLASSES)

    log.info("Zaman-PSD hesaplanıyor...")
    X_train_psd = prepare_psd_sequence([raw_epochs[i] for i in train_idx], processor)
    X_test_psd = prepare_psd_sequence([raw_epochs[i] for i in test_idx], processor)

    train_groups = np.array([groups[i] for i in train_idx])
    test_groups = np.array([groups[i] for i in test_idx])
    (X_train, X_test, _) = normalize_inputs(X_train_psd, X_test_psd, train_groups, test_groups)

    from sklearn.utils.class_weight import compute_class_weight
    cw = compute_class_weight("balanced", classes=np.arange(N_CLASSES), y=y_train)
    class_weights = {i: w for i, w in enumerate(cw)}

    initial_centers = compute_kmeans_centers(X_train, num_rules=64)
    model = build_model(initial_centers=initial_centers)
    model.summary(print_fn=log.info)

    callbacks = [
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=patience, restore_best_weights=True, verbose=1),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=7, min_lr=1e-6, verbose=1),
    ]

    log.info("Eğitim başlıyor...")
    history = model.fit(
        X_train, y_train_cat, validation_data=(X_test, y_test_cat),
        epochs=epochs, batch_size=batch_size, class_weight=class_weights, callbacks=callbacks, verbose=1
    )

    y_pred = np.argmax(model.predict(X_test), axis=1)
    acc = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average="macro")
   
    log.info("\n" + classification_report(y_test, y_pred, target_names=["low", "medium", "high"], digits=3))
    
    if save_path:
        os.makedirs(Path(save_path).parent, exist_ok=True) # Klasör yoksa bile emin olmak için oluşturur
        model.save(save_path)
        log.info(f"Model başarıyla diske yazıldı: {save_path}")
    # ------------------------------

    return {"accuracy": round(acc, 4), "f1_macro": round(f1, 4), "best_epoch": int(np.argmin(history.history["val_loss"]) + 1)}
   
# ===========================================================================
# 5) CLI
# ===========================================================================
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("stew_dir", help="STEW veri seti dizini")
    parser.add_argument("--epochs", type=int, default=150)
    parser.add_argument("--batch_size", type=int, default=64)
    parser.add_argument("--patience", type=int, default=15)
    parser.add_argument("--cv", action="store_true")
    parser.add_argument("--save", default=None)
    
    argv = [a for a in sys.argv if not a.startswith("-f") and not a.endswith(".json")]
    args = parser.parse_args(argv[1:] if len(argv) > 1 else ["stew_data"])
    
    metrics = train_deep_model(args.stew_dir, epochs=args.epochs, batch_size=args.batch_size, patience=args.patience, save_path=args.save)
    print(f"\nModel: Fuzzy-LSTM (ARFN Benzeri) | Doğruluk: {metrics['accuracy']:.3f} | F1: {metrics['f1_macro']:.3f}")
    
    if args.cv:
        cv_metrics = cross_validate_deep(args.stew_dir, epochs=min(args.epochs, 100), batch_size=args.batch_size, patience=15)
        print(f"\nCV Doğruluk: {cv_metrics['accuracy_mean']:.3f} ± {cv_metrics['accuracy_std']:.3f}")