import React, { useEffect, useState } from 'react';
import './CalibrationScreen.css';

// ============================================================================
// CalibrationScreen — EEG Resting-State Baseline Recording
// ----------------------------------------------------------------------------
// Süre: 180 saniye (3 dakika) — EEG literatüründe standart minimum
//
// Bu süre boyunca katılımcı:
//   - Sabit bir noktaya bakar (fixation cross)
//   - Zihnini rahatlatır
//   - Normal şekilde göz kırpar
//   - Hareket etmemeye çalışır
//
// Kalibrasyon NORMALDE backend "testing" sinyali gönderince biter.
//
// ⚡ DEV_MODE = true iken:
//    - "Kalibrasyonu Atla" düğmesi görünür (geliştirme/test için)
//    - GERÇEK DENEYDE: DEV_MODE = false yap → düğme gizlenir
//
// ⚡ GÜVENLİK AĞI: Frontend sayacı sıfıra inerse (backend "testing"
//    sinyali hiç gelmezse), ekran sonsuza kadar takılmaz; otomatik geçer.
// ============================================================================

const BASELINE_DURATION_SEC = 180; // 3 dakika (gerçek deney)

// ⚡ GELİŞTİRME BAYRAĞI — gerçek deneyde false yap!
const DEV_MODE = true;

const CalibrationScreen = ({ onCalibrationComplete, appState }) => {
  const [timeLeft, setTimeLeft] = useState(BASELINE_DURATION_SEC);
  const [done, setDone] = useState(false);

  // Tek noktadan bitirme (çift tetiklenmeyi önler)
  const finish = (reason) => {
    if (done) return;
    setDone(true);
    console.log(`[Calibration] Tamamlandı (sebep: ${reason})`);
    onCalibrationComplete();
  };

  // Saniye sayacı
  useEffect(() => {
    if (timeLeft > 0) {
      const timerId = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timerId);
    }
  }, [timeLeft]);

  // ⚡ Backend "testing" sinyali gelince bitir (normal yol)
  useEffect(() => {
    if (appState === "testing") {
      finish('backend_testing_signal');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]);

  // ⚡ GÜVENLİK AĞI: Sayaç sıfıra indiyse ve backend hâlâ cevap vermediyse,
  //    sonsuz takılmayı önlemek için otomatik geç.
  useEffect(() => {
    if (timeLeft <= 0) {
      finish('timer_expired_fallback');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="calibration-fullscreen-overlay">
      <div className="calibration-content">

        {/* Odaklanılacak Artı İşareti (Fixation Cross) */}
        <div className="fixation-cross">+</div>

        <div className="calibration-info">
          <p className="calibration-instruction-main">
            Lütfen ekrandaki <strong>+</strong> işaretine odaklanın.
          </p>

          <div className="calib-timer-row">
            <span className="calib-timer">{formatTime(timeLeft)}</span>
          </div>

          {/* ⚡ Sadece geliştirme modunda görünür — gerçek deneyde DEV_MODE=false */}
          {DEV_MODE && (
            <button
              className="calib-skip-btn"
              onClick={() => finish('dev_skip_button')}
              type="button"
            >
             Kalibrasyonu Atla (Geliştirme)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalibrationScreen;