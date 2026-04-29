import React, { useEffect, useState } from 'react';
import './CalibrationScreen.css';

const CalibrationScreen = ({ onCalibrationComplete, appState }) => {
  // Görsel bir geri sayım ekleyelim (Backend 60 sn sayarken kullanıcı da görsün)
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    // Saniye sayacı
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

  return (
    <div className="calibration-fullscreen-overlay">
      <div className="calibration-content">
        {/* Odaklanılacak Artı İşareti (Fixation Cross) */}
        <div className="fixation-cross">+</div>
        
        <div className="calibration-info">
          <h2>Sinyal Kalibrasyonu</h2>
          <p>Lütfen artı işaretine odaklanın, göz kırpmamaya çalışın ve zihninizi boşaltın.</p>
          <div className="calib-progress-bar">
            <div 
              className="calib-progress-fill" 
              style={{ width: `${((60 - timeLeft) / 60) * 100}%` }}
            ></div>
          </div>
          <p className="calib-timer">{timeLeft} sn</p>
        </div>
      </div>
    </div>
  );
};

export default CalibrationScreen;