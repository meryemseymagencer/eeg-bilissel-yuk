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
//   - Normal şekilde göz kırpar (göz kırpmamak EEG'de ciddi artefakt yaratır)
//   - Hareket etmemeye çalışır
//
// ⚠️ NOT: Backend'de calibration süresi de 180 sn olarak ayarlanmalı.
//        Frontend timer yalnızca görsel — backend "testing" sinyalini
//        gönderdiğinde sınav başlar.
// ============================================================================

const BASELINE_DURATION_SEC = 180; // 3 dakika

const CalibrationScreen = ({ onCalibrationComplete, appState }) => {
  const [timeLeft, setTimeLeft] = useState(BASELINE_DURATION_SEC);

  useEffect(() => {
    if (timeLeft > 0) {
      const timerId = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timerId);
    }
  }, [timeLeft]);

  useEffect(() => {
    // Backend'den "testing" sinyali geldiğinde ekranı kapat
    if (appState === "testing") {
      onCalibrationComplete();
    }
  }, [appState, onCalibrationComplete]);

  // Süre formatla: M:SS
  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = ((BASELINE_DURATION_SEC - timeLeft) / BASELINE_DURATION_SEC) * 100;

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
        </div>
      </div>
    </div>
  );
};

export default CalibrationScreen;