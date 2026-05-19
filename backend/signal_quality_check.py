"""
signal_quality_check.py — Kullanıcı Çalışması Öncesi Sinyal Kalitesi Testi
============================================================================
Bu script, EEG cihazından 30 saniye veri alır ve sinyal kalitesini
14 kanal için sistematik olarak değerlendirir.

Her katılımcıyla deney öncesinde 1 kez çalıştırılır. Eğer rapor 
"YEŞİL" değilse, elektrot yerleşimi düzeltilmeli.

KULLANIM:
    cd backend
    python signal_quality_check.py [katilimci_id]
    
ÖRNEK:
    python signal_quality_check.py P01
    python signal_quality_check.py P02
    
ÇIKTI:
    quality_reports/quality_P01_2026-05-18_14-30.json    (detaylı rapor)
    quality_reports/quality_P01_2026-05-18_14-30.png     (görsel rapor)
"""

import asyncio
import json
import sys
import time
from pathlib import Path
from datetime import datetime
import numpy as np
import scipy.signal as signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from cortex_client import CortexClient, EPOC_CHANNELS, SAMPLE_RATE

# ============================================================================
# SABITLER (Lim et al. 2018 + literatür standartları)
# ============================================================================
TEST_DURATION_SEC = 30           # Test süresi (saniye)

# Kalite eşikleri
AMPLITUDE_NORMAL_MAX = 100        # μV - tipik EEG genliği
AMPLITUDE_WARNING_MAX = 200       # μV - üzeri "elektrot oynak"
AMPLITUDE_CRITICAL = 500          # μV - üzeri "kötü bağlantı"

VARIANCE_MIN = 0.5                # μV² - altı "düz çizgi / bağlantı kopuk"

NOISE_50HZ_GOOD = 0.1             # 50Hz / total power oranı
NOISE_50HZ_WARNING = 0.3          # üzeri "gürültülü ortam"

ALPHA_MIN_POWER = 0.5             # μV² - alfa pikinin minimum gücü

# Filtreler
FS = SAMPLE_RATE                   # 128 Hz


def design_filters():
    """Filtre katsayılarını oluştur."""
    nyq = FS / 2.0
    sos_bp = signal.butter(4, [1.0/nyq, 45.0/nyq], btype='bandpass', output='sos')
    b_notch, a_notch = signal.iirnotch(50.0, 30.0, FS)
    sos_notch = signal.tf2sos(b_notch, a_notch)
    return sos_bp, sos_notch


def evaluate_channel(channel_data, channel_name, sos_bp, sos_notch):
    """
    Tek bir kanal için sinyal kalitesini değerlendirir.
    
    Returns:
        dict: Kontrol sonuçları + genel "status" (GOOD/WARNING/CRITICAL)
    """
    # 1) Filtrele
    filtered = signal.sosfilt(sos_bp, channel_data)
    filtered = signal.sosfilt(sos_notch, filtered)
    
    # 2) Genlik kontrolü
    amplitude_max = float(np.max(np.abs(filtered)))
    amplitude_rms = float(np.sqrt(np.mean(filtered**2)))
    
    # 3) Varyans kontrolü (düz çizgi tespiti)
    variance = float(np.var(filtered))
    
    # 4) 50 Hz şebeke gürültüsü kontrolü (filtrelemeden önce!)
    freqs, psd = signal.welch(channel_data, fs=FS, nperseg=256)
    
    # 50 Hz'in 2 Hz çevresindeki güç
    mask_50 = (freqs >= 48) & (freqs <= 52)
    power_50 = float(np.mean(psd[mask_50]))
    total_power = float(np.mean(psd))
    noise_ratio = power_50 / (total_power + 1e-12)
    
    # 5) Alfa pik kontrolü (8-13 Hz)
    mask_alpha = (freqs >= 8) & (freqs <= 13)
    alpha_power = float(np.mean(psd[mask_alpha]))
    
    # 6) Frekans bantları gücü (referans için)
    bands = {
        "delta (1-4 Hz)":  np.mean(psd[(freqs >= 1) & (freqs < 4)]),
        "theta (4-8 Hz)":  np.mean(psd[(freqs >= 4) & (freqs < 8)]),
        "alpha (8-13 Hz)": alpha_power,
        "beta (13-30 Hz)": np.mean(psd[(freqs >= 13) & (freqs < 30)]),
        "gamma (30-45 Hz)": np.mean(psd[(freqs >= 30) & (freqs < 45)]),
    }
    
    # ----------------- KARAR -----------------
    issues = []
    status = "GOOD"  # default
    
    # Amplitude check
    if amplitude_max > AMPLITUDE_CRITICAL:
        issues.append(f"Aşırı genlik: {amplitude_max:.1f} μV (>500)")
        status = "CRITICAL"
    elif amplitude_max > AMPLITUDE_WARNING_MAX:
        issues.append(f"Yüksek genlik: {amplitude_max:.1f} μV (elektrot oynak olabilir)")
        if status == "GOOD":
            status = "WARNING"
    
    # Variance check (düz çizgi)
    if variance < VARIANCE_MIN:
        issues.append(f"Çok düşük varyans: {variance:.2f} (bağlantı kopuk olabilir)")
        status = "CRITICAL"
    
    # 50 Hz noise check
    if noise_ratio > NOISE_50HZ_WARNING:
        issues.append(f"Yüksek 50Hz gürültü: %{noise_ratio*100:.1f}")
        if status == "GOOD":
            status = "WARNING"
    
    # Alfa pik check
    if alpha_power < ALPHA_MIN_POWER:
        issues.append(f"Düşük alfa gücü: {alpha_power:.2f} (göz kapalı tutmuyor olabilir)")
        if status == "GOOD":
            status = "WARNING"
    
    return {
        "channel": channel_name,
        "status": status,
        "issues": issues,
        "metrics": {
            "amplitude_max_uv": round(amplitude_max, 2),
            "amplitude_rms_uv": round(amplitude_rms, 2),
            "variance": round(variance, 4),
            "noise_50hz_ratio": round(noise_ratio, 4),
            "alpha_power": round(alpha_power, 4),
        },
        "bands": {k: round(float(v), 4) for k, v in bands.items()}
    }


def print_report(channel_results, participant_id):
    """Konsola özet rapor yazdır."""
    print("\n" + "=" * 65)
    print(f"📊 SİNYAL KALİTESİ RAPORU — Katılımcı: {participant_id}")
    print("=" * 65)
    print(f"{'Kanal':<8} {'Durum':<14} {'Genlik':<14} {'Varyans':<12} {'50Hz':<10}")
    print("-" * 65)
    
    good_count = 0
    warning_count = 0
    critical_count = 0
    
    for r in channel_results:
        status = r["status"]
        if status == "GOOD":
            symbol = "[✓] İYİ"
            good_count += 1
        elif status == "WARNING":
            symbol = "[!] UYARI"
            warning_count += 1
        else:
            symbol = "[X] KRİTİK"
            critical_count += 1
        
        m = r["metrics"]
        print(f"{r['channel']:<8} {symbol:<14} "
              f"{m['amplitude_max_uv']:<10.1f}μV  "
              f"{m['variance']:<12.2f} "
              f"%{m['noise_50hz_ratio']*100:<8.1f}")
    
    print("-" * 65)
    print(f"📈 ÖZET:  [✓] {good_count} iyi  |  [!] {warning_count} uyarı  |  [X] {critical_count} kritik")
    
    # Detaylı uyarılar
    has_issues = False
    for r in channel_results:
        if r["issues"]:
            if not has_issues:
                print("\n🔍 DETAYLI UYARILAR:")
                has_issues = True
            print(f"\n  {r['channel']}:")
            for issue in r["issues"]:
                print(f"    - {issue}")
    
    # Sonuç ve öneri
    print("\n" + "=" * 65)
    if critical_count > 0:
        print("⛔ GENEL DURUM: KRİTİK — DENEY YAPMA!")
        print("📋 ÖNERİ: Elektrotları kontrol et, yeniden ıslat, yerleştirme düzelt.")
        return "CRITICAL"
    elif warning_count >= 3:
        print("⚠️ GENEL DURUM: KISMİ SORUN — TERCİHEN İYİLEŞTİR")
        print("📋 ÖNERİ: Sorunlu kanalları iyileştirmeyi dene; gerekirse deneye geç.")
        return "WARNING"
    elif warning_count > 0:
        print("✅ GENEL DURUM: KABUL EDİLEBİLİR — DENEYE BAŞLAYABİLİRSİN")
        print("📋 ÖNERİ: Uyarıları not al, ama deneye devam edebilirsin.")
        return "ACCEPTABLE"
    else:
        print("🎉 GENEL DURUM: MÜKEMMEL — DENEYE BAŞLAYABİLİRSİN")
        return "GOOD"


def create_visual_report(channel_results, participant_id, output_path):
    """PNG görsel rapor oluştur."""
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    
    channels = [r["channel"] for r in channel_results]
    statuses = [r["status"] for r in channel_results]
    colors = ['#27ae60' if s == 'GOOD' else '#f39c12' if s == 'WARNING' else '#c0392b' 
              for s in statuses]
    
    # 1. Status overview (sol üst)
    ax = axes[0, 0]
    y_pos = np.arange(len(channels))
    status_vals = [1 if s == 'GOOD' else 0.5 if s == 'WARNING' else 0 for s in statuses]
    ax.barh(y_pos, status_vals, color=colors)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(channels)
    ax.set_xlim(0, 1.2)
    ax.set_xlabel('Kalite Skoru')
    ax.set_title('Kanal Bazlı Kalite Durumu', fontweight='bold')
    ax.axvline(0.5, color='gray', linestyle='--', alpha=0.5)
    ax.invert_yaxis()
    
    # 2. Amplitude bar chart (sağ üst)
    ax = axes[0, 1]
    amplitudes = [r["metrics"]["amplitude_max_uv"] for r in channel_results]
    ax.barh(y_pos, amplitudes, color=colors)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(channels)
    ax.set_xlabel('Maximum Genlik (μV)')
    ax.set_title('Kanal Genlikleri', fontweight='bold')
    ax.axvline(AMPLITUDE_WARNING_MAX, color='orange', linestyle='--', 
               alpha=0.5, label=f'Uyarı eşiği ({AMPLITUDE_WARNING_MAX}μV)')
    ax.axvline(AMPLITUDE_CRITICAL, color='red', linestyle='--', 
               alpha=0.5, label=f'Kritik eşik ({AMPLITUDE_CRITICAL}μV)')
    ax.legend(loc='lower right', fontsize=8)
    ax.invert_yaxis()
    
    # 3. 50Hz noise (sol alt)
    ax = axes[1, 0]
    noise_50 = [r["metrics"]["noise_50hz_ratio"] * 100 for r in channel_results]
    ax.barh(y_pos, noise_50, color=colors)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(channels)
    ax.set_xlabel('50 Hz Gürültü Oranı (%)')
    ax.set_title('50 Hz Şebeke Gürültüsü', fontweight='bold')
    ax.axvline(NOISE_50HZ_WARNING * 100, color='orange', linestyle='--', 
               alpha=0.5, label=f'Uyarı eşiği (%{NOISE_50HZ_WARNING*100:.0f})')
    ax.legend(loc='lower right', fontsize=8)
    ax.invert_yaxis()
    
    # 4. Alpha power (sağ alt)
    ax = axes[1, 1]
    alphas = [r["metrics"]["alpha_power"] for r in channel_results]
    ax.barh(y_pos, alphas, color=colors)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(channels)
    ax.set_xlabel('Alfa (8-13 Hz) Güç')
    ax.set_title('Alfa Pik Gücü\n(Göz kapalıyken yüksek olmalı)', fontweight='bold')
    ax.invert_yaxis()
    
    plt.suptitle(f'EEG Sinyal Kalitesi Raporu - Katılımcı {participant_id}\n'
                 f'{datetime.now().strftime("%Y-%m-%d %H:%M")}',
                 fontsize=14, fontweight='bold', y=1.00)
    plt.tight_layout()
    plt.savefig(output_path, dpi=120, bbox_inches='tight')
    plt.close()


async def collect_eeg_data(duration_sec=TEST_DURATION_SEC):
    """Belirtilen süre boyunca gerçek EEG verisi topla."""
    print(f"\n🎬 {duration_sec} saniyelik EEG verisi toplanıyor...")
    print("📋 Talimat: Sakince otur, gözlerini kapat ve nefes al.\n")
    
    client = CortexClient()
    all_samples = []
    
    async with client as ctx:
        start_time = time.time()
        async for sample in ctx.stream(app_session_id="quality_check"):
            if "epoch_data" not in sample:
                continue
            
            elapsed = time.time() - start_time
            all_samples.append(sample["epoch_data"])
            
            # Progress göster
            remaining = duration_sec - elapsed
            bar_len = 30
            filled = int(bar_len * elapsed / duration_sec)
            bar = "█" * filled + "░" * (bar_len - filled)
            print(f"\r  [{bar}] {elapsed:.1f}s / {duration_sec}s | "
                  f"Epoch: {len(all_samples)}", end="", flush=True)
            
            if elapsed >= duration_sec:
                break
    
    print()  # newline
    return all_samples


def main():
    # Katılımcı ID
    if len(sys.argv) > 1:
        participant_id = sys.argv[1]
    else:
        participant_id = "TEST"
        print("⚠️  Uyarı: Katılımcı ID verilmedi, 'TEST' kullanılacak.")
        print("   Kullanım: python signal_quality_check.py P01")
    
    print("=" * 65)
    print(f"🧠 EEG SİNYAL KALİTESİ KONTROLÜ")
    print(f"   Katılımcı: {participant_id}")
    print(f"   Tarih:     {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"   Süre:      {TEST_DURATION_SEC} saniye")
    print("=" * 65)
    
    # ---------------------- VERI TOPLA ----------------------
    try:
        samples = asyncio.run(collect_eeg_data(TEST_DURATION_SEC))
    except Exception as e:
        print(f"\n❌ Hata: EEG verisi toplanamadı: {e}")
        print("📋 Kontrol et:")
        print("   - EMOTIV Launcher açık mı?")
        print("   - Cihaz Bluetooth/USB ile bağlı mı?")
        print("   - .env dosyasında CLIENT_ID ve CLIENT_SECRET doğru mu?")
        return
    
    if len(samples) < 3:
        print(f"\n❌ Hata: Yeterli veri toplanamadı ({len(samples)} epoch).")
        return
    
    # ---------------------- ANALIZ ET ----------------------
    print(f"\n📊 {len(samples)} epoch analiz ediliyor...")
    
    # Tüm sample'ları birleştir: (N_total, 14)
    all_data = np.vstack([np.array(s) for s in samples])
    print(f"   Toplam veri: {all_data.shape[0]} sample × {all_data.shape[1]} kanal")
    
    sos_bp, sos_notch = design_filters()
    
    # Her kanal için değerlendirme
    channel_results = []
    for i, ch_name in enumerate(EPOC_CHANNELS):
        result = evaluate_channel(
            all_data[:, i], 
            ch_name, 
            sos_bp, 
            sos_notch
        )
        channel_results.append(result)
    
    # ---------------------- RAPOR ----------------------
    overall_status = print_report(channel_results, participant_id)
    
    # ---------------------- KAYDET ----------------------
    output_dir = Path("quality_reports")
    output_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    json_path = output_dir / f"quality_{participant_id}_{timestamp}.json"
    png_path = output_dir / f"quality_{participant_id}_{timestamp}.png"
    
    # JSON
    report_data = {
        "participant_id": participant_id,
        "timestamp": datetime.now().isoformat(),
        "duration_sec": TEST_DURATION_SEC,
        "n_epochs": len(samples),
        "overall_status": overall_status,
        "channels": channel_results,
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2, ensure_ascii=False)
    print(f"\n💾 JSON rapor: {json_path}")
    
    # PNG
    create_visual_report(channel_results, participant_id, png_path)
    print(f"💾 Görsel rapor: {png_path}")
    
    print("\n" + "=" * 65)


if __name__ == "__main__":
    main()
