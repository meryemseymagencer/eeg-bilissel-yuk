"""
EEG Bilişsel Yük Boru Hattı
============================
Cihaz      : Emotiv EPOC X – 14 kanal, 128 Hz
Sınıflar   : low | medium | high  (3 sınıf, AGENTS.md zorunluluğu)

Pipeline sırası (AGENTS.md):
  1. Bandpass filtresi  (0.5–45 Hz)
  2. ICA               (en fazla 14 komponent; göz kırpması IC0/IC1 AF3/AF4)
  3. CAR yeniden referanslama
  4. Baseline düzeltme

Özellikler:
  - Theta/Alpha güç oranı  [birincil özellik]
  - PSD (Welch) her bant × kanal
  - Hjorth parametreleri (Aktivite, Hareketlilik, Karmaşıklık)
  - Diferansiyel Entropi (DE) her bant × kanal

Sınıflandırıcı:
  SVM (RBF çekirdeği) ← birincil
  LDA                 ← alternatif
  Hedef: STEW üzerinde >75% doğruluk + F1 (makro)

Kullanım:
  pipeline = CognitivePipeline()
  pipeline.train_from_stew("path/to/stew/")
  pipeline.save()

  pipeline = CognitivePipeline()
  pipeline.load()
  label = pipeline.predict(epoch_128x14)  # "low" | "medium" | "high"
"""

from __future__ import annotations

import logging
import json
import os
import re
import warnings
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from scipy.signal import butter, sosfilt, welch
from sklearn.decomposition import FastICA
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis as LDA
from sklearn.feature_selection import SelectKBest, f_classif, mutual_info_classif
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import GroupKFold, cross_validate, GridSearchCV
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.svm import SVC

log = logging.getLogger(__name__)
warnings.filterwarnings("ignore", category=RuntimeWarning)

# ---------------------------------------------------------------------------
# Sabitler
# ---------------------------------------------------------------------------

FS = 128          # Örnekleme hızı (Hz)
FS = 128
EPOCH_LEN = 4000  # Makaleye göre 31.25 saniyelik beyin aktivitesi
# NOT: Makalede kaydırma adımı (EPOCH_STEP) 15 olarak verilmiş ancak bu, RAM'i 
# (Acer Nitro V 15'in belleğini) inanılmaz zorlayacak yüz binlerce matris üretir. 
# Önce bilgisayarını yormamak için 128 veya 500 gibi bir adım kullanabilirsin.
EPOCH_STEP = 500
N_CHANNELS = 14

EPOC_CHANNELS = [
    "AF3", "F7", "F3", "FC5", "T7", "P7", "O1",
    "O2", "P8", "T8", "FC6", "F4", "F8", "AF4",
]

# Theta/Alpha oranı için kullanılan elektrot grupları
FRONTAL_CH = ["AF3", "AF4", "F3", "F4", "F7", "F8"]
PARIETAL_CH = ["P7", "P8"]

# Nguyen et al. — 14 kanal → 6×6 matris pozisyonları (10-20 sistemi)
# Satır 0: [_,  _,  AF3, AF4, _,  _  ]
# Satır 1: [_,  F7,  F3,  F4,  F8, _ ]
# Satır 2: [_,  _,  FC5, FC6, _,  _  ]
# Satır 3: [_,  T7,  _,   _,  T8, _ ]
# Satır 4: [_,  _,  P7,  P8,  _,  _  ]
# Satır 5: [_,  _,  O1,  O2,  _,  _  ]
CHANNEL_2D_MAP = {
    "AF3": (0, 2), "AF4": (0, 3),
    "F7":  (1, 1), "F3":  (1, 2), "F4":  (1, 3), "F8": (1, 4),
    "FC5": (2, 2), "FC6": (2, 3),
    "T7":  (3, 1), "T8":  (3, 4),
    "P7":  (4, 2), "P8":  (4, 3),
    "O1":  (5, 2), "O2":  (5, 3),
}

# Frekans bantları  (ad, alt, üst)
BANDS = [
    ("delta",  0.5,  4.0),
    ("theta",  4.0,  7.0),
    ("alpha",  8.0, 13.0),
    ("beta",  13.0, 30.0),
    ("gamma", 30.0, 45.0),
]

LABEL_MAP = {0: "low", 1: "medium", 2: "high"}
MODEL_DIR = Path(__file__).parent / "models"

# ---------------------------------------------------------------------------
# 1) Sinyal İşleme
# ---------------------------------------------------------------------------

class SignalProcessor:
    """
    Bandpass → ICA → CAR → Baseline boru hattı.

    ICA iyileştirmeler:
    - AF3 ve AF4 kanallarından ayrı ayrı korelasyon hesaplaması
    - Dinamik artifact threshold (mean + 2*std) yerine fixed 0.7
    - Frontal kanal korelasyonuna dayalı göz kırpması tespiti

    ICA çevrimdışı eğitim verisine fit edilir ve unmixing matrisi
    kaydedilir; gerçek zamanlı çıkarımda aynı matris uygulanır.
    """

    def __init__(self, n_components: int = N_CHANNELS):
        self.n_components = n_components
        self._ica: Optional[FastICA] = None
        self._artifact_comps: list[int] = []  # atılacak ICA bileşenleri
        self._baseline: Optional[np.ndarray] = None
        self._last_bandpass: Optional[np.ndarray] = None  # ICA enerji özellikleri için

    # ------------------------------------------------------------------
    # Filtreleme
    # ------------------------------------------------------------------

    @staticmethod
    def highpass(epoch: np.ndarray, lo: float = 1.0) -> np.ndarray:
        """
        High-pass filtresi (Lim et al. 2018 — §III-E, adım 1).
        Düşük frekans drift'ini keser; varsayılan 1 Hz.
        epoch: (n_samples, n_channels)
        """
        nyq = FS / 2
        lo_norm = max(lo / nyq, 1e-4)
        sos = butter(4, lo_norm, btype="highpass", output="sos")
        return sosfilt(sos, epoch, axis=0)

    @staticmethod
    def lowpass(epoch: np.ndarray, hi: float = 45.0) -> np.ndarray:
        """
        Low-pass filtresi. Kas artefaktları ve yüksek frekans gürültüsünü keser.
        epoch: (n_samples, n_channels)
        """
        nyq = FS / 2
        hi_norm = min(hi / nyq, 1.0 - 1e-4)
        sos = butter(4, hi_norm, btype="lowpass", output="sos")
        return sosfilt(sos, epoch, axis=0)

    @staticmethod
    def bandpass(epoch: np.ndarray, lo: float = 1.0, hi: float = 45.0) -> np.ndarray:
        """
        4. dereceden Butterworth bandpass filtresi.
        Lim et al. uyumlu: varsayılan 1–45 Hz (önceki 0.5 Hz → 1 Hz).
        epoch: (n_samples, n_channels)
        """
        nyq = FS / 2
        # Normalize frequencies and clamp to (0, 1) exclusive
        lo_norm = max(lo / nyq, 1e-4)
        hi_norm = min(hi / nyq, 1.0 - 1e-4)
        sos = butter(4, [lo_norm, hi_norm], btype="bandpass", output="sos")
        return sosfilt(sos, epoch, axis=0)

    @staticmethod
    def band_filter(epoch: np.ndarray, lo: float, hi: float) -> np.ndarray:
        """Belirli bir bant için bandpass."""
        nyq = FS / 2
        lo_n = max(lo / nyq, 1e-4)
        hi_n = min(hi / nyq, 0.9999)
        sos = butter(4, [lo_n, hi_n], btype="bandpass", output="sos")
        return sosfilt(sos, epoch, axis=0)

    # ------------------------------------------------------------------
    # ICA
    # ------------------------------------------------------------------

    def fit_ica(self, epochs: list[np.ndarray]) -> None:
        """
        Eğitim epochlarını birleştirerek ICA fit eder.
        Göz kırpma bileşenlerini frontal kanalların varyansına göre tespit eder.

        epochs: list of (n_samples, n_channels)
        """
        data = np.concatenate(epochs, axis=0)  # (N*128, 14)
        self._ica = FastICA(
            n_components=self.n_components,
            random_state=42,
            max_iter=500,
            tol=1e-4,
        )
        sources = self._ica.fit_transform(data)  # (N*128, n_components)

        # Göz kırpma bileşeni tespiti:
        # AF3/AF4 ile yüksek korelasyon gösteren ilk 4 bileşeni kontrol et
        frontal_idx = [EPOC_CHANNELS.index("AF3"), EPOC_CHANNELS.index("AF4")]
        correlations = []
        for ic in range(self.n_components):
            corr_af3 = np.abs(np.corrcoef(sources[:, ic], data[:, frontal_idx[0]])[0, 1])
            corr_af4 = np.abs(np.corrcoef(sources[:, ic], data[:, frontal_idx[1]])[0, 1])
            max_corr = max(corr_af3, corr_af4)
            correlations.append(max_corr)

        threshold = np.mean(correlations) + 2 * np.std(correlations)
        artifact_comps = [ic for ic, corr in enumerate(correlations) if corr > threshold]

        if not artifact_comps:
            artifact_comps = [0, 1]  # Default to IC0 and IC1 if no artifacts detected
            log.info("No artifacts detected dynamically → Defaulting to IC0, IC1.")

        self._artifact_comps = artifact_comps
        log.info("ICA artifact detection improved. Components removed: %s", artifact_comps)

    def apply_ica(self, epoch: np.ndarray) -> np.ndarray:
        """
        Kaydedilmiş unmixing matrisini uygular ve artefakt bileşenlerini sıfırlar.
        epoch: (n_samples, n_channels)  →  (n_samples, n_channels)
        """
        if self._ica is None:
            return epoch

        sources = self._ica.transform(epoch)          # (128, n_components)
        sources[:, self._artifact_comps] = 0.0         # artefakt bileşenlerini sıfırla
        return self._ica.inverse_transform(sources)    # (128, 14)

    # ------------------------------------------------------------------
    # CAR & Baseline
    # ------------------------------------------------------------------

    @staticmethod
    def car(epoch: np.ndarray) -> np.ndarray:
        """Common Average Reference: her örnekten kanal ortalamasını çıkar."""
        return epoch - epoch.mean(axis=1, keepdims=True)

    def fit_baseline(self, epochs: list[np.ndarray]) -> None:
        """Her kanal için ortalama baseline hesaplar."""
        all_data = np.concatenate(epochs, axis=0)
        self._baseline = all_data.mean(axis=0, keepdims=True)  # (1, 14)

    def subtract_baseline(self, epoch: np.ndarray) -> np.ndarray:
        if self._baseline is not None:
            return epoch - self._baseline
        return epoch

    # ------------------------------------------------------------------
    # Tam boru hattı
    # ------------------------------------------------------------------

    def fit(self, epochs: list[np.ndarray]) -> None:
        """Tüm eğitim epochlarına fit et (ICA + baseline)."""
        filtered = [self.bandpass(e) for e in epochs]
        self.fit_ica(filtered)
        car_epochs = [self.car(self.apply_ica(e)) for e in filtered]
        self.fit_baseline(car_epochs)
        log.info("SignalProcessor fit tamamlandı (%d epoch).", len(epochs))

    def transform(self, epoch: np.ndarray) -> np.ndarray:
        """Tek bir epoch'u işler. fit() çağrılmış olmalı."""
        x = self.bandpass(epoch)
        self._last_bandpass = x.copy()  # ICA enerji özellikleri için sakla
        x = self.apply_ica(x)
        x = self.car(x)
        x = self.subtract_baseline(x)
        return x


# ---------------------------------------------------------------------------
# 2) Özellik Çıkarımı
# ---------------------------------------------------------------------------

class FeatureExtractor:
    """
    İşlenmiş epoch'tan özellik vektörü çıkarır (Optimized).

    Optimizasyonlar:
    - Welch PSD kanal başına bir kez hesaplanır (70+ çağrı yerine 14 çağrı)
    - Filter coefficients cached (DE özellikler için)

    Özellik grubu              Boyut
    ─────────────────────────  ─────────────────────────────────────────
    Theta/Alpha oranı          1
    PSD per band×channel       5 bant × 14 kanal  = 70
    Relatif güç                5 bant × 14 kanal  = 70
    Frontal asimetri           5 bant × 3 çift    = 15
    Theta/Beta & Alpha/Beta    2 oran × 14 kanal  = 28
    Katz Fraktal Boyutu        14 kanal            = 14   ← Aydin 2021 (KFD %78.74)
    Higuchi Fraktal Boyutu     14 kanal            = 14   ← Aydin 2021 (HFD %95.39)
    Hjorth parametreleri       3 param × 14 kanal = 42
    Diferansiyel Entropi       5 bant × 14 kanal  = 70
    ICA-IC Enerji (abs+rel)    4 bant × 14 IC × 2 = 112  ← Qu et al. 2020 (+23.9%)
    ─────────────────────────  ─────────────────────────────────────────
    Toplam                     ~436 özellik
    """

    def __init__(self, signal_processor=None):
        self.feature_names: list[str] = []
        self._built_names = False
        self._filter_sos_cache = {}
        self._signal_processor = signal_processor 

    def extract(self, epoch: np.ndarray) -> np.ndarray:
        """
        Tek bir epoch'tan özellik vektörü çıkar.
        
        Lim et al. baseline özellikleri (PSD tabanlı):
          - PSD per band×channel:     5 bant × 14 kanal = 70
          - Relatif güç:              5 bant × 14 kanal = 70
          - Theta/Alpha oranı:        1
          - Frontal asimetri:         5 bant × 3 çift   = 15
          - Theta/Beta & Alpha/Beta:  2 oran × 14 kanal = 28
        
        Ek özellikler:
          - Hjorth parametreleri:     3 × 14 kanal = 42
          - Katz Fraktal Boyutu:      14 kanal     = 14
          - Higuchi Fraktal Boyutu:   14 kanal     = 14
          - Diferansiyel Entropi:     5 × 14 kanal = 70
          - ICA-IC enerji:            4 × 14 × 2   = 112
        
        Toplam: ~436 özellik
        """
        feats = []
        
        # ── PSD özellikleri (Lim et al. baseline) ──
        # Welch PSD'yi kanal bazında bir kez hesapla, bantlara böl
        psd_matrix = {}   # {bant_adı: (14,) güç değerleri}
        total_power = np.zeros(N_CHANNELS)
        
        for ch_i in range(N_CHANNELS):
            freqs, pxx = welch(epoch[:, ch_i], fs=FS, nperseg=min(256, EPOCH_LEN),
                               noverlap=128, nfft=512)
            for band_name, lo, hi in BANDS:
                mask = (freqs >= lo) & (freqs <= hi)
                bp = float(pxx[mask].mean()) if mask.any() else 0.0
                if band_name not in psd_matrix:
                    psd_matrix[band_name] = []
                psd_matrix[band_name].append(bp)
            total_power[ch_i] = float(pxx.sum()) + 1e-10
        
        # PSD per band × channel (70)
        for band_name, _, _ in BANDS:
            feats.extend(psd_matrix[band_name])
        
        # Relatif güç per band × channel (70)
        for band_name, _, _ in BANDS:
            for ch_i in range(N_CHANNELS):
                feats.append(psd_matrix[band_name][ch_i] / total_power[ch_i])
        
        # Theta/Alpha oranı — birincil özellik (1)
        frontal_idx = [EPOC_CHANNELS.index(ch) for ch in FRONTAL_CH if ch in EPOC_CHANNELS]
        parietal_idx = [EPOC_CHANNELS.index(ch) for ch in PARIETAL_CH if ch in EPOC_CHANNELS]
        theta_vals = np.array(psd_matrix["theta"])
        alpha_vals = np.array(psd_matrix["alpha"])
        frontal_theta = float(theta_vals[frontal_idx].mean()) if frontal_idx else 0.0
        parietal_alpha = float(alpha_vals[parietal_idx].mean()) + 1e-10 if parietal_idx else 1e-10
        feats.append(frontal_theta / parietal_alpha)
        
        # Frontal asimetri (5 bant × 3 çift = 15)
        # Çiftler: (F3,F4), (F7,F8), (AF3,AF4) — sağ-sol log güç farkı
        asym_pairs = [("F3", "F4"), ("F7", "F8"), ("AF3", "AF4")]
        for band_name, _, _ in BANDS:
            vals = np.array(psd_matrix[band_name])
            for left_ch, right_ch in asym_pairs:
                if left_ch in EPOC_CHANNELS and right_ch in EPOC_CHANNELS:
                    li = EPOC_CHANNELS.index(left_ch)
                    ri = EPOC_CHANNELS.index(right_ch)
                    feats.append(np.log(vals[ri] + 1e-10) - np.log(vals[li] + 1e-10))
                else:
                    feats.append(0.0)
        
        # Theta/Beta ve Alpha/Beta oranları (2 × 14 = 28)
        beta_vals = np.array(psd_matrix["beta"])
        for ch_i in range(N_CHANNELS):
            feats.append(theta_vals[ch_i] / (beta_vals[ch_i] + 1e-10))
        for ch_i in range(N_CHANNELS):
            feats.append(alpha_vals[ch_i] / (beta_vals[ch_i] + 1e-10))
        
        # ── Fraktal boyut özellikleri ──
        feats.extend(self._kfd_features(epoch))               # 14
        feats.extend(self._hfd_features(epoch))                # 14
        
        # ── Diferansiyel Entropi (5 bant × 14 kanal = 70) ──
        for band_name, lo, hi in BANDS:
            filtered = SignalProcessor.band_filter(epoch, lo, hi)
            for ch_i in range(N_CHANNELS):
                var = float(np.var(filtered[:, ch_i])) + 1e-10
                feats.append(0.5 * np.log(2 * np.pi * np.e * var))
        
        # ── Hjorth parametreleri (42) ──
        feats.extend(self._hjorth_features(epoch))
        
        # ── ICA enerji (112) ──
        feats.extend(self._ica_energy_features(epoch))
        
        return np.array(feats, dtype=np.float32)
    
    # ------------------------------------------------------------------
    # Katz Fraktal Boyutu  (Aydin 2021 — Politeknik Dergisi 24:681-689)
    # ------------------------------------------------------------------

    @staticmethod
    def _kfd(signal_1d: np.ndarray) -> float:
        """
        Katz Fraktal Boyutu (KFD).

        Denklemler Aydin (2021) ve Katz (1988)'den:
          L = Σ |x[i] - x[i-1]|          (toplam yol uzunluğu)
          d = max(|x[i] - x[0]|)          (çap — en uzak nokta)
          a = L / (N-1)                    (ortalama adım mesafesi)
          KFD = log10(N) / (log10(N) + log10(d/L))

        Avantajı: O(N) hesaplama, çok hızlı.
        """
        x = signal_1d.astype(np.float64)
        N = len(x)
        if N < 2:
            return 0.0

        diffs = np.abs(np.diff(x))
        L = float(diffs.sum()) + 1e-10           # toplam yol uzunluğu
        d = float(np.max(np.abs(x - x[0]))) + 1e-10  # çap
        n = float(N)

        kfd = np.log10(n) / (np.log10(n) + np.log10(d / L))
        return float(np.clip(kfd, 0.0, 3.0))

    def _kfd_features(self, epoch: np.ndarray) -> list[float]:
        """Her kanal için KFD. 14 özellik."""
        return [self._kfd(epoch[:, ch_i]) for ch_i in range(N_CHANNELS)]

    # ------------------------------------------------------------------
    # Higuchi Fraktal Boyutu  (Aydin 2021 — %95.39 doğruluk)
    # ------------------------------------------------------------------

    @staticmethod
    def _hfd(signal_1d: np.ndarray, k_max: int = 6) -> float:
        """
        Higuchi Fraktal Boyutu (HFD).

        Algoritma (Higuchi 1988):
          1. k=1..k_max için k-adımlı alt diziler oluştur
          2. Her k için ortalama uzunluk L(k) hesapla
          3. log(L) ~ HFD * log(1/k) doğrusunun eğimi = HFD

        k_max=6: 128 Hz / 512-sample epoch için optimal.
        Aydin (2021): STEW veri setinde HFD+SVM → %95.39 doğruluk.
        """
        N = len(signal_1d)
        x = signal_1d.astype(np.float64)
        L = []
        for k in range(1, k_max + 1):
            Lk = []
            for m in range(1, k + 1):
                idxs = np.arange(m - 1, N, k)
                if len(idxs) < 2:
                    continue
                Lmk = np.sum(np.abs(np.diff(x[idxs])))
                Lmk *= (N - 1) / (((len(idxs) - 1) * k) + 1e-10)
                Lk.append(Lmk)
            if Lk:
                L.append(np.mean(Lk))
        if len(L) < 2:
            return 0.0
        log_k = np.log(1.0 / np.arange(1, len(L) + 1))
        log_L = np.log(np.array(L) + 1e-10)
        slope, _ = np.polyfit(log_k, log_L, 1)
        return float(np.clip(slope, 0.0, 3.0))

    def _hfd_features(self, epoch: np.ndarray, k_max: int = 6) -> list[float]:
        """Her kanal için HFD. 14 özellik."""
        return [self._hfd(epoch[:, ch_i], k_max) for ch_i in range(N_CHANNELS)]
    

    # ------------------------------------------------------------------
    # Sample Entropy  (nonlineer karmaşıklık ölçüsü)
    # ------------------------------------------------------------------

    @staticmethod
    def _sample_entropy(signal_1d: np.ndarray, m: int = 2, r_coef: float = 0.2) -> float:
        """
        Sample Entropy (SampEn) — Richman & Moorman (2000).
        r = r_coef * std(sinyal)  → gürültüye adaptif eşik.
        Düşük SampEn = düzenli sinyal (yüksek bilişsel yük),
        Yüksek SampEn = düzensiz sinyal (düşük yük).
        """
        x = signal_1d.astype(np.float64)
        N = len(x)
        r = r_coef * np.std(x) + 1e-10

        def count_matches(length):
            count = 0
            for i in range(N - length):
                template = x[i:i + length]
                for j in range(i + 1, N - length + 1):
                    if np.max(np.abs(x[j:j + length] - template)) < r:
                        count += 1
            return count

        B = count_matches(m)
        A = count_matches(m + 1)
        if B == 0:
            return 0.0
        return float(np.clip(-np.log(A / (B + 1e-10)), 0.0, 5.0))

    def _sample_entropy_features(self, epoch: np.ndarray) -> list[float]:
        """Her kanal için SampEn. 14 özellik."""
        return [self._sample_entropy(epoch[:, ch]) for ch in range(N_CHANNELS)]

    # ------------------------------------------------------------------
    # Permutation Entropy  (hızlı düzensizlik ölçüsü)
    # ------------------------------------------------------------------

    @staticmethod
    def _perm_entropy(signal_1d: np.ndarray, order: int = 3, delay: int = 1) -> float:
        """
        Permutation Entropy — Bandt & Pompe (2002).
        Sinyaldeki sembolik düzensizliği ölçer.
        EEG'de bilişsel yük arttıkça PE değişir.
        order=3 → 128 Hz, 512 sample epoch için optimal.
        """
        x = signal_1d.astype(np.float64)
        N = len(x)
        permutations = {}
        factorial_order = 1
        for i in range(1, order + 1):
            factorial_order *= i

        for i in range(N - (order - 1) * delay):
            window = x[i:i + order * delay:delay]
            key = tuple(np.argsort(window))
            permutations[key] = permutations.get(key, 0) + 1

        total = sum(permutations.values())
        probs = np.array([v / total for v in permutations.values()])
        pe = -np.sum(probs * np.log(probs + 1e-10))
        max_pe = np.log(factorial_order + 1e-10)
        return float(np.clip(pe / max_pe, 0.0, 1.0))  # normalize [0,1]

    def _perm_entropy_features(self, epoch: np.ndarray) -> list[float]:
        """Her kanal için PE. 14 özellik."""
        return [self._perm_entropy(epoch[:, ch]) for ch in range(N_CHANNELS)]

    # ------------------------------------------------------------------
    # ICA Bileşen Enerji Özellikleri  (Qu et al. 2020 — Appl.Sci. 10:3036)
    # ------------------------------------------------------------------

    IC_BANDS = [
        ("delta", 0.5,  4.0),
        ("theta", 4.0,  8.0),
        ("alpha", 8.0, 14.0),
        ("beta", 14.0, 30.0),
    ]

    def _ica_energy_features(self, epoch: np.ndarray) -> list[float]:
        """
        ICA bileşen enerji özellikleri — Qu et al. (2020).

        Ham kanal sinyalleri yerine ICA ile ayrıştırılmış bağımsız
        bileşenlerin (IC) bant enerjisi kullanılır. Karışık sinyaldeki
        belirsizliği ortadan kaldırır → +23.9% doğruluk.

        Boyut: 4 bant × 14 IC × 2 (abs + rel) = 112 özellik.
        """
        try:
            if self._signal_processor and self._signal_processor._ica:
                # Bandpass-filtered (ICA öncesi) sinyali kullan — double-apply önleme
                bp_epoch = getattr(self._signal_processor, '_last_bandpass', epoch)
                sources = self._signal_processor._ica.transform(bp_epoch)
            else:
                return [0.0] * (len(self.IC_BANDS) * N_CHANNELS * 2)
        except Exception:
            return [0.0] * (len(self.IC_BANDS) * N_CHANNELS * 2)
 

        n_samples = sources.shape[0]
        feats_abs, feats_rel = [], []

        for ic_i in range(N_CHANNELS):
            Fs_n = np.fft.rfft(sources[:, ic_i])
            ps = (np.abs(Fs_n) ** 2) / n_samples
            freqs_ic = np.fft.rfftfreq(n_samples, d=1.0 / FS)

            total_mask = (freqs_ic >= 1.0) & (freqs_ic <= 30.0)
            e_total = float(ps[total_mask].sum()) + 1e-10

            for _, lo, hi in self.IC_BANDS:
                mask = (freqs_ic >= lo) & (freqs_ic <= hi)
                e_band = float(ps[mask].sum()) if mask.any() else 0.0
                feats_abs.append(e_band)
                feats_rel.append(e_band / e_total)

        return feats_abs + feats_rel

    # ------------------------------------------------------------------
    # Hjorth parametreleri
    # ------------------------------------------------------------------

    @staticmethod
    def _hjorth(signal_1d: np.ndarray) -> tuple[float, float, float]:
        """
        Aktivite   = var(x)
        Hareketlilik = sqrt(var(x') / var(x))
        Karmaşıklık  = Mob(x'') / Mob(x')
        """
        d1 = np.diff(signal_1d)
        d2 = np.diff(d1)

        var_x  = np.var(signal_1d) + 1e-10
        var_d1 = np.var(d1) + 1e-10
        var_d2 = np.var(d2) + 1e-10

        activity   = float(var_x)
        mobility   = float(np.sqrt(var_d1 / var_x))
        complexity = float(np.sqrt(var_d2 / var_d1) / (np.sqrt(var_d1 / var_x) + 1e-10))
        return activity, mobility, complexity

    def _hjorth_features(self, epoch: np.ndarray) -> list[float]:
        """Her kanal için Hjorth (Aktivite, Hareketlilik, Karmaşıklık). 42 özellik."""
        feats = []
        for ch_i in range(N_CHANNELS):
            a, m, c = self._hjorth(epoch[:, ch_i])
            feats.extend([a, m, c])
        return feats


# ---------------------------------------------------------------------------
# 3) STEW Dataset Yükleyici
# ---------------------------------------------------------------------------

def load_stew_data(
    stew_dir: str | Path,
) -> tuple[list[np.ndarray], list[int], list[int]]:
    """
    STEW (Simultaneous Task EEG Workload) veri setini yükler.

    Yalnızca multitask segmentleri kullanılır (resting state atılır).
    Etiket normalize: 0=low, 1=medium, 2=high

    Desteklenen formatlar:
      - sub##_hi/lo.txt : STEW orijinal format (ratings.txt ile etiket)
      - .npy  : (n_samples, 14) veya (n_samples, 15) [son sütun etiket]
      - .csv  : son sütun etiket olarak
      - .mat  : scipy.io.loadmat ile (eeg_data ve labels anahtarları)

    Döner:
      epochs : list of (128, 14) numpy arrays
      labels : list of int (0/1/2)
      groups : list of int  ← katılımcı ID (GroupKFold için)
    """
    stew_dir = Path(stew_dir)
    if not stew_dir.exists():
        raise FileNotFoundError(f"STEW dizini bulunamadı: {stew_dir}")

    epochs: list[np.ndarray] = []
    labels: list[int] = []
    groups: list[int] = []   # katılımcı ID per epoch (veri sızıntısı önleme)

    # ── STEW orijinal formatı: sub##_hi.txt / sub##_lo.txt + ratings.txt ──
    _sub_pat = re.compile(r"sub(\d+)_(hi|lo)\.txt")
    stew_txt_files = sorted(f for f in stew_dir.glob("sub*.txt")
                            if _sub_pat.match(f.name))
    if stew_txt_files:
        ratings = _load_stew_ratings(stew_dir)
        log.info("STEW .txt formatı: %d dosya, %d katılımcı rating'i.",
                 len(stew_txt_files), len(ratings))
        for path in stew_txt_files:
            m = _sub_pat.match(path.name)
            sub_id = int(m.group(1))
            condition = m.group(2)          # 'hi' veya 'lo'
            if sub_id not in ratings:
                log.warning("  %-20s → ATLANDΙ (rating yok, Lim et al. §IV-E)", path.name)
                continue
            lo_r, hi_r = ratings[sub_id]
            r = hi_r if condition == "hi" else lo_r
            label = _rating_to_label(r)
            _load_stew_txt(path, label, sub_id, epochs, labels, groups)

    # ── .npy / .csv / .mat dosyaları (dosya başına ayrı grup ID) ──
    _group_counter = (max(groups) + 1) if groups else 1000

    npy_files = sorted(stew_dir.glob("**/*.npy"))
    if npy_files:
        log.info("%d .npy dosyası bulundu.", len(npy_files))
        for path in npy_files:
            _before = len(epochs)
            _load_npy(path, epochs, labels)
            groups.extend([_group_counter] * (len(epochs) - _before))
            _group_counter += 1

    csv_files = sorted(stew_dir.glob("**/*.csv"))
    if csv_files:
        log.info("%d .csv dosyası bulundu.", len(csv_files))
        for path in csv_files:
            _before = len(epochs)
            _load_csv(path, epochs, labels)
            groups.extend([_group_counter] * (len(epochs) - _before))
            _group_counter += 1

    mat_files = sorted(stew_dir.glob("**/*.mat"))
    if mat_files:
        log.info("%d .mat dosyası bulundu.", len(mat_files))
        for path in mat_files:
            _before = len(epochs)
            _load_mat(path, epochs, labels)
            groups.extend([_group_counter] * (len(epochs) - _before))
            _group_counter += 1

    if not epochs:
        raise ValueError(
            f"STEW dizininde desteklenen veri bulunamadı: {stew_dir}\n"
            "Desteklenen formatlar: sub##_hi/lo.txt, .npy, .csv, .mat"
        )

    n_subjects = len(set(groups))
    log.info("STEW yüklendi: %d epoch, %d katılımcı grubu, dağılım=%s",
             len(epochs), n_subjects, {l: labels.count(l) for l in set(labels)})
    return epochs, labels, groups


def _epoch_and_label(data: np.ndarray, label_col: int | None,
                     epochs: list, labels: list) -> None:
    """
    Veriyi EPOCH_LEN örnekli parçalara böler.
    label_col varsa son sütundaki değerleri etiket olarak kullanır.
    Aksi hâlde dosya adından etiket alınır.
    """
    if label_col is not None:
        eeg = data[:, :N_CHANNELS]
        lbl_col = data[:, label_col].astype(int)
    else:
        eeg = data
        lbl_col = None

    n = len(eeg) // EPOCH_LEN
    for i in range(n):
        seg = eeg[i * EPOCH_LEN:(i + 1) * EPOCH_LEN]
        if seg.shape != (EPOCH_LEN, N_CHANNELS):
            continue

        if lbl_col is not None:
            # Epoch içindeki en sık etiketi al (majority vote)
            seg_labels = lbl_col[i * EPOCH_LEN:(i + 1) * EPOCH_LEN]
            majority = int(np.bincount(seg_labels).argmax())
            # 0 etiket genellikle resting state → atla
            if majority == 0:
                continue
            # STEW: 1=düşük, 2=orta, 3=yüksek → normalize et 0/1/2
            label = max(0, min(2, majority - 1))
        else:
            label = 1  # bilinmeyen → orta

        epochs.append(seg)
        labels.append(label)


def _load_npy(path: Path, epochs: list, labels: list) -> None:
    try:
        data = np.load(path)
        if data.ndim == 2 and data.shape[1] >= N_CHANNELS:
            label_col = data.shape[1] - 1 if data.shape[1] > N_CHANNELS else None
            _before = len(epochs)
            _epoch_and_label(data, label_col, epochs, labels)
            _after = len(epochs)
            log.info("  %-20s → %d epoch veri çıkarıldı", path.name, _after - _before)
        else:
            log.warning("NPY şekli uygun değil %s: %s (en az %d sütun gerekli)", 
                       path.name, data.shape, N_CHANNELS)
    except Exception as exc:
        log.error("NPY yükleme hatası %s: %s (İçerik: %s)", path.name, type(exc).__name__, exc)


def _load_csv(path: Path, epochs: list, labels: list) -> None:
    try:
        data = np.loadtxt(path, delimiter=",", skiprows=1)
        if data.ndim == 2 and data.shape[1] >= N_CHANNELS:
            label_col = data.shape[1] - 1 if data.shape[1] > N_CHANNELS else None
            _before = len(epochs)
            _epoch_and_label(data, label_col, epochs, labels)
            _after = len(epochs)
            log.info("  %-20s → %d epoch veri çıkarıldı", path.name, _after - _before)
        else:
            log.warning("CSV şekli uygun değil %s: %s (en az %d sütun gerekli)", 
                       path.name, data.shape, N_CHANNELS)
    except Exception as exc:
        log.error("CSV yükleme hatası %s: %s (İçerik: %s)", path.name, type(exc).__name__, exc)


def _load_mat(path: Path, epochs: list, labels: list) -> None:
    try:
        from scipy.io import loadmat
        mat = loadmat(str(path))
        eeg_key = next((k for k in mat if not k.startswith("_") and "eeg" in k.lower()), None)
        lbl_key = next((k for k in mat if not k.startswith("_") and "label" in k.lower()), None)

        if eeg_key is None:
            log.warning("MAT dosyasında 'eeg' anahtarı bulunamadı: %s (Anahtarlar: %s)", 
                       path.name, [k for k in mat if not k.startswith("_")])
            return

        eeg_data = mat[eeg_key]
        _before = len(epochs)
        
        if eeg_data.ndim == 3:  # (n_epochs, n_samples, n_channels)
            for ep_i in range(eeg_data.shape[0]):
                seg = eeg_data[ep_i]
                if seg.shape == (EPOCH_LEN, N_CHANNELS):
                    lbl = int(mat[lbl_key].flat[ep_i]) if lbl_key else 1
                    lbl = max(0, min(2, lbl - 1))
                    epochs.append(seg)
                    labels.append(lbl)
        elif eeg_data.ndim == 2:
            label_col = None
            if lbl_key:
                label_arr = mat[lbl_key].flatten().astype(int)
                combined = np.hstack([eeg_data, label_arr.reshape(-1, 1)])
                _epoch_and_label(combined, N_CHANNELS, epochs, labels)
            else:
                _epoch_and_label(eeg_data, None, epochs, labels)
        else:
            log.warning("MAT dosyasının şekli uygun değil %s: %s (2D veya 3D bekleniyor)", 
                       path.name, eeg_data.shape)
        
        _after = len(epochs)
        log.info("  %-20s → %d epoch veri çıkarıldı", path.name, _after - _before)
    except Exception as exc:
        log.error("MAT yükleme hatası %s: %s (İçerik: %s)", path.name, type(exc).__name__, exc)


def _load_stew_ratings(stew_dir: Path) -> dict[int, tuple[int, int]]:
    """
    ratings.txt → {sub_id: (lo_rating, hi_rating)}
    Her satır: sub_id, lo_rating, hi_rating  (virgülle ayrılmış, 1-9 skala)
    """
    result: dict[int, tuple[int, int]] = {}
    path = stew_dir / "ratings.txt"
    if not path.exists():
        return result
    with open(path) as f:
        for line in f:
            parts = [p.strip() for p in line.strip().split(",")]
            if len(parts) >= 3:
                try:
                    result[int(parts[0])] = (int(parts[1]), int(parts[2]))
                except ValueError:
                    continue
    return result


def _rating_to_label(r: int) -> int:
    """NASA-TLX benzeri rating (1-9) → 3-sınıf etiketi (0=low,1=medium,2=high)"""
    if r <= 3:
        return 0
    if r <= 6:
        return 1
    return 2


def _load_stew_txt(path: Path, label: int, sub_id: int,
                   epochs: list, labels: list, groups: list) -> None:
    """
    STEW orijinal .txt dosyasını yükler ve epoch'lara böler.
    Format: N_satır × 14_sütun, boşlukla ayrılmış float.
    
    Nguyen et al. §4.1: "The first and last 15 seconds have been removed
    to eliminate the effects between tasks."
    15 saniye × 128 Hz = 1920 sample → her iki uçtan kesilir.
    
    Pencere: 512 sample, shift 128 (Lim et al. baseline, Nguyen et al. uyumu).
    """
    TRIM_SAMPLES = 15 * FS   # 1920 sample = 15 saniye

    try:
        data = np.loadtxt(path)          # beklenen şekil: (19200, 14)
        if data.ndim != 2 or data.shape[1] != N_CHANNELS:
            log.warning("Beklenmeyen şekil %s: %s (14 kanal bekleniyor)", path.name, data.shape)
            return
        
        # İlk ve son 15 saniyeyi kes
        if len(data) > 2 * TRIM_SAMPLES:
            data = data[TRIM_SAMPLES:-TRIM_SAMPLES]
        else:
            log.warning("  %-20s → ATLANDΙ (veri çok kısa, trim sonrası yetersiz)", path.name)
            return
        
        n_steps = (len(data) - EPOCH_LEN) // EPOCH_STEP + 1
        if n_steps <= 0:
            log.warning("Yetersiz veri: %s (%d örnekler, en az %d gerekli)", 
                       path.name, len(data), EPOCH_LEN)
            return
        
        for i in range(n_steps):
            start = i * EPOCH_STEP
            seg = data[start:start + EPOCH_LEN].astype(np.float64)
            if seg.shape == (EPOCH_LEN, N_CHANNELS):
                epochs.append(seg)
                labels.append(label)
                groups.append(sub_id)
        log.info("  %-20s → %3d epoch (trim=±15s), etiket=%d", path.name, n_steps, label)
    except Exception as exc:
        log.warning("TXT yükleme hatası %s: %s", path.name, exc)


# ---------------------------------------------------------------------------
# 4) Ana Pipeline Sınıfı
# ---------------------------------------------------------------------------

class CognitivePipeline:
    """
    Uçtan uca bilişsel yük sınıflandırma boru hattı.

    Eğitim:
        pipeline = CognitivePipeline()
        pipeline.train_from_stew("path/to/stew/")
        pipeline.save()

    Çıkarım:
        pipeline = CognitivePipeline()
        pipeline.load()
        label = pipeline.predict(epoch)   # (128, 14) numpy array
    """

    MODEL_PATH = MODEL_DIR / "cognitive_pipeline.joblib"

    def __init__(self, classifier: str = "svm"):
        """
        classifier: "svm" (varsayılan) veya "lda"
        """
        self.processor = SignalProcessor()
        self.extractor = FeatureExtractor(signal_processor=self.processor)
        self._clf_type = classifier
        self._clf: Optional[Pipeline] = None
        self._label_enc = LabelEncoder()
        self._label_enc.fit([0, 1, 2])
        self.last_metrics: dict | None = None  # Eğitim metriklerini sakla

    # ------------------------------------------------------------------
    # Eğitim
    # ------------------------------------------------------------------

    def train_from_stew(self, stew_dir: str | Path, classifier: str | None = None, tune_hyperparams: bool = True) -> dict:
        """
        STEW veri setinden model eğitir (GridSearchCV ile opsiyonel hiperparametre optimizasyonu).

        Parametreler:
        - stew_dir: STEW veri seti dizini
        - classifier: "svm" (varsayılan) veya "lda"
        - tune_hyperparams: True → GridSearchCV ile hiperparametre tuning yap

        Hiperparametre Tuning:
        - SVM: C, gamma, k (feature selection) optimize edilir
        - LDA: k (feature selection) optimize edilir
        - CV: 5-fold GroupKFold (subject-wise splitting)

        Döner: {"accuracy": float, "f1_macro": float}
        """
        if classifier:
            self._clf_type = classifier

        log.info("STEW verisi yükleniyor: %s", stew_dir)
        epochs, labels, groups = load_stew_data(stew_dir)

        log.info("Sinyal işleme fit ediliyor...")
        self.processor.fit(epochs)

        if not epochs:
            raise ValueError("No epochs loaded. Cannot proceed with training.")

        log.info("Özellik çıkarımı yapılıyor (%d epoch)...", len(epochs))
        X = np.array([
            self.extractor.extract(self.processor.transform(ep))
            for ep in epochs
        ])

        if X.size == 0:
            raise ValueError("Feature matrix X is empty. Check the feature extraction pipeline.")

        y = np.array(labels)
        groups_array = np.array(groups)

        # Per-subject z-score normalizasyonu
        X_raw = X.copy()
        for subj_id in np.unique(groups_array):
            mask = groups_array == subj_id
            mu  = X_raw[mask].mean(axis=0)
            std = X_raw[mask].std(axis=0) + 1e-8
            X_raw[mask] = (X_raw[mask] - mu) / std
        log.info("Per-subject z-score normalizasyonu uygulandı.")

        log.info("Özellik matrisi: %s | Sınıf dağılımı: %s | Katılımcı grubu: %d",
                 X.shape, {LABEL_MAP[l]: int((y == l).sum()) for l in [0, 1, 2]},
                 len(set(groups)))

        # Çapraz doğrulama (5-fold, katılımcı bazlı – veri sızıntısı önleme)
        # GroupKFold: aynı katılımcının epoch'ları asla train+test'e birlikte girmez
        gkf = GroupKFold(n_splits=5)
        
        # Hiperparametre tuning (GridSearchCV)
        if tune_hyperparams:
            log.info("Hiperparametre tuning başlatılıyor (GridSearchCV)...")
            base_pipeline = self._build_classifier()
            
            if self._clf_type == "svm":
                param_grid = {
                    "clf__C": [0.01, 0.1, 1.0, 10.0, 100.0, 1000.0],
                    "clf__gamma": ["scale", "auto", 0.001, 0.01],
                    "selector__k": [50, 70, 100, 150, 200, "all"], 
                }
            else:  # lda
                param_grid = {
                    "selector__k": [70, 100, 150, 200],
                }
            
            grid_search = GridSearchCV(
                base_pipeline,
                param_grid,
                cv=gkf,
                scoring="f1_macro",
                n_jobs=-1,
                verbose=1,
            )
            grid_search.fit(X_raw, y, groups=groups_array)
            
            best_params = grid_search.best_params_
            log.info("En iyi hiperparametreler: %s (F1: %.3f)", best_params, grid_search.best_score_)
            
            # En iyi parametreler ile cross-validate
            best_pipe = self._build_classifier(hyperparams=best_params)
            cv_results = cross_validate(
                best_pipe,
                X_raw, y,
                cv=gkf,
                groups=groups_array,
                scoring=["accuracy", "f1_macro"],
                n_jobs=-1,
            )
        else:
            # Tuning olmadan direct cross-validation
            cv_results = cross_validate(
                self._build_classifier(),
                X_raw, y,
                cv=gkf,
                groups=groups_array,
                scoring=["accuracy", "f1_macro"],
                n_jobs=-1,
            )

        acc = float(cv_results["test_accuracy"].mean())
        f1  = float(cv_results["test_f1_macro"].mean())
        log.info("CV sonuçları → Doğruluk: %.3f | F1 (makro): %.3f", acc, f1)

        # Metrikleri sakla
        self.last_metrics = {"accuracy": acc, "f1_macro": f1}

        if acc < 0.75:
            log.warning(
                "Doğruluk %.3f < 0.75 hedefinin altında. "
                "AGENTS.md'ye göre derin öğrenme yöntemine geçmeyi değerlendirin.",
                acc,
            )

        # Final model tüm veri üzerinde fit edilir (best hyperparams kullanılır)
        try:
            if tune_hyperparams and 'best_params' in locals():
                log.info("Final model en iyi hiperparametreler ile eğitiliyor...")
                self._clf = self._build_classifier(hyperparams=best_params)
            else:
                self._clf = self._build_classifier()
        except NameError:
            # best_params tanımlanmadıysa (tuning olmadıysa)
            self._clf = self._build_classifier()
        
        self._clf.fit(X_raw, y)
        log.info("Final model fit tamamlandı (per-subject normalized X üzerinde).")

        return {"accuracy": acc, "f1_macro": f1}

    def _build_classifier(self, hyperparams: dict | None = None) -> Pipeline:
        """
        Sınıflandırıcı pipeline'ını oluşturucu (hyperparametreler ile).
        
        hyperparams: GridSearchCV'den en iyiler kullanıyorsak, örnek:
                    {"clf__C": 10.0, "clf__gamma": "scale", "selector__k": 50}
        """
        from sklearn.feature_selection import SelectKBest, mutual_info_classif
        from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier

        if hyperparams is None:
            hyperparams = {}
        
        # Hiperparametre çıkarımı
        c_value = hyperparams.get("clf__C", 10.0)
        gamma_value = hyperparams.get("clf__gamma", "scale")
        n_features = hyperparams.get("selector__k", 35)

        if self._clf_type == "ensemble":
            svm = SVC(kernel="rbf", probability=True, class_weight="balanced",
                      C=c_value, gamma=gamma_value, random_state=42)
            rf  = RandomForestClassifier(n_estimators=200, class_weight="balanced",
                                         random_state=42)
            estimator = VotingClassifier(
                estimators=[("svm", svm), ("rf", rf)],
                voting="soft"
            )
        elif self._clf_type == "lda":
            estimator = LDA(solver="svd")
        else:
            estimator = SVC(
                kernel="rbf",
                C=c_value,
                gamma=gamma_value,
                probability=True,
                random_state=42,
                class_weight="balanced",
            )
        return Pipeline([
            ("scaler", StandardScaler()),
            ("selector", SelectKBest(mutual_info_classif, k=n_features)),
            ("clf", estimator),
        ])


    # ------------------------------------------------------------------
    # Çıkarım
    # ------------------------------------------------------------------

    def predict(self, epoch: list | np.ndarray) -> str:
        """
        Tek bir epoch'tan bilişsel yük sınıfı tahmin eder.

        epoch : (128, 14) – ham ya da kısmen işlenmiş
        döner : "low" | "medium" | "high"
        """
        if self._clf is None:
            raise RuntimeError("Model yüklü değil. Önce load() veya train_from_stew() çağırın.")

        ep = np.asarray(epoch, dtype=np.float32)
        if ep.shape != (EPOCH_LEN, N_CHANNELS):
            raise ValueError(
                f"Epoch boyutu yanlış: beklenen ({EPOCH_LEN}, {N_CHANNELS}), alınan {ep.shape}"
            )

        processed = self.processor.transform(ep)
        features = self.extractor.extract(processed).reshape(1, -1)
        pred_int = int(self._clf.predict(features)[0])
        return LABEL_MAP.get(pred_int, "low")

    def predict_proba(self, epoch: list | np.ndarray) -> dict[str, float]:
        """
        Sınıf olasılıklarını döner. Yalnızca SVM (probability=True) ile çalışır.

        döner: {"low": 0.2, "medium": 0.5, "high": 0.3}
        """
        if self._clf is None:
            raise RuntimeError("Model yüklü değil.")

        ep = np.asarray(epoch, dtype=np.float32)
        processed = self.processor.transform(ep)
        features = self.extractor.extract(processed).reshape(1, -1)

        try:
            proba = self._clf.predict_proba(features)[0]
            return {LABEL_MAP[i]: round(float(p), 4) for i, p in enumerate(proba)}
        except AttributeError:
            label = self.predict(epoch)
            return {k: (1.0 if k == label else 0.0) for k in LABEL_MAP.values()}

    # ------------------------------------------------------------------
    # Model kayıt / yükleme
    # ------------------------------------------------------------------

    def save(self, path: str | Path | None = None) -> Path:
        """Modeli disk'e kaydeder. Döner: kaydedilen dosya yolu."""
        if self._clf is None:
            raise RuntimeError("Kaydedilecek model yok. Önce train_from_stew() çağırın.")

        save_path = Path(path) if path else self.MODEL_PATH
        save_path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "clf": self._clf,
            "clf_type": self._clf_type,
            "processor": self.processor,
            "label_map": LABEL_MAP,
            "last_metrics": self.last_metrics,
        }
        joblib.dump(payload, save_path)
        log.info("Model kaydedildi: %s", save_path)
        return save_path

    def load(self, path: str | Path | None = None) -> None:
        """Disk'ten model yükler."""
        load_path = Path(path) if path else self.MODEL_PATH
        if not load_path.exists():
            raise FileNotFoundError(
                f"Model dosyası bulunamadı: {load_path}\n"
                "Önce train_from_stew() ile model eğitin."
            )

        payload = joblib.load(load_path)
        self._clf = payload["clf"]
        self._clf_type = payload.get("clf_type", "svm")
        self.processor = payload["processor"]
        self.last_metrics = payload.get("last_metrics", None)
        log.info("Model yüklendi: %s (%s)", load_path, self._clf_type.upper())


# ---------------------------------------------------------------------------
# CLI – eğitim / değerlendirme
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="EEG Bilişsel Yük Pipeline")
    parser.add_argument("stew_dir", help="STEW veri seti dizini")
    parser.add_argument("--clf", choices=["svm", "lda"], default="svm",
                        help="Sınıflandırıcı türü (varsayılan: svm)")
    parser.add_argument("--save", default=None, help="Model kayıt yolu (opsiyonel)")
    # Colab/Jupyter'da argparse -f ile çakışır — temizle
    import sys as _sys
    _argv = [a for a in _sys.argv if not a.startswith('-f') and not a.endswith('.json')]
    args = parser.parse_args(_argv[1:] if len(_argv) > 1 else ['stew_data'])

    pipeline = CognitivePipeline(classifier=args.clf)
    metrics = pipeline.train_from_stew(args.stew_dir)

    print(f"\n{'='*40}")
    print(f"  Doğruluk (5-fold CV) : {metrics['accuracy']:.3f}")
    print(f"  F1 Makro (5-fold CV) : {metrics['f1_macro']:.3f}")
    print(f"{'='*40}")

    if metrics["accuracy"] >= 0.75:
        saved = pipeline.save(args.save)
        print(f"  Model kaydedildi   : {saved}")
        
        # Metrikleri JSON dosyasına da kaydetti
        metrics_file = Path(__file__).parent / "models" / "training_metrics.json"
        with open(metrics_file, "w") as f:
            json.dump(metrics, f, indent=2)
        print(f"  Metrikler kaydedildi: {metrics_file}")
    else:
        print("  UYARI: Dogruluk <0.75 -> model kaydedilmedi.")
        print("  AGENTS.md: Klasik yontem yetersiz -> derin ogrenmeyi degerlendirin.")