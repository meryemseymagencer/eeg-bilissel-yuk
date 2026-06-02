import React, { useState, useEffect, useRef } from 'react';
import './NasaTLX.css';

// ============================================================================
// NASA-TLX (Raw TLX / RTLX) — Otomatik Geçişli, EEG-Friendly Sürüm
// ----------------------------------------------------------------------------
// Referans: Hart, S. G. (2006). NASA-Task Load Index (NASA-TLX);
//           20 Years Later.
//
// EEG için özel tasarım:
//   - 30 saniye otomatik süre (Hart 2006 ortalama doldurma süresi)
//   - "Tamamla" tuşu YOK
//   - Süre bitince OTOMATİK submit
//   - "nasa_eeg_pause_start" / "nasa_eeg_pause_end" marker'ları
// ============================================================================

const scales = [
  {
    key: 'mental', label: 'Zihinsel Talep',
    description: 'Bu görevi tamamlarken ne kadar zihinsel çaba (düşünme, karar verme, hatırlama vb.) harcadınız?',
    lowAnchor: 'Çok Düşük', highAnchor: 'Çok Yüksek', reversed: false
  },
  {
    key: 'physical', label: 'Fiziksel Talep',
    description: 'Bu görev ne düzeyde fiziksel aktivite (tuşlara basma, fare kullanma vb.) gerektirdi?',
    lowAnchor: 'Çok Düşük', highAnchor: 'Çok Yüksek', reversed: false
  },
  {
    key: 'temporal', label: 'Zamansal Talep',
    description: 'Görevi tamamlarken ne kadar zaman baskısı hissettiniz? Görevin temposu nasıldı?',
    lowAnchor: 'Çok Düşük', highAnchor: 'Çok Yüksek', reversed: false
  },
  {
    key: 'performance', label: 'Performans',
    description: 'Kendinizi bu görevi tamamlarken ne kadar başarılı hissediyorsunuz?',
    lowAnchor: 'Mükemmel', highAnchor: 'Başarısız', reversed: true
  },
  {
    key: 'effort', label: 'Efor',
    description: 'Gerekli performans seviyesine ulaşmak için zihinsel ve fiziksel olarak ne kadar çaba harcadınız?',
    lowAnchor: 'Çok Düşük', highAnchor: 'Çok Yüksek', reversed: false
  },
  {
    key: 'frustration', label: 'Stres ve Rahatsızlık',
    description: 'Görev sırasında ne kadar stres, baskı, rahatsızlık veya hayal kırıklığı hissettiniz?',
    lowAnchor: 'Çok Düşük', highAnchor: 'Çok Yüksek', reversed: false
  }
];

const difficultyLabel = { kolay: 'Kolay', orta: 'Orta', zor: 'Zor' };

// Hart (2006) standardı — ortalama NASA-TLX doldurma süresi
const COUNTDOWN_SECONDS = 30;

const NasaTLX = ({ difficulty, onSubmit, syncMarker }) => {
  const [values, setValues] = useState(
    scales.reduce((acc, s) => ({ ...acc, [s.key]: 50 }), {})
  );
  const [touched, setTouched] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  const hasSubmittedRef = useRef(false);
  const intervalRef = useRef(null);
  const valuesRef = useRef(values);
  const touchedRef = useRef(touched);

  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => { touchedRef.current = touched; }, [touched]);

  // ============================================================================
  // Submit (otomatik tetiklenir)
  // ============================================================================
  const performSubmit = (autoTriggered = false) => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    clearInterval(intervalRef.current);

    const currentValues = valuesRef.current;
    const currentTouched = touchedRef.current;

    // Performans boyutunu ters çevir
    const adjustedValues = {};
    scales.forEach(scale => {
      if (scale.reversed) {
        adjustedValues[scale.key] = 100 - currentValues[scale.key];
      } else {
        adjustedValues[scale.key] = currentValues[scale.key];
      }
    });

    const rtlxScore = Number((
      Object.values(adjustedValues).reduce((a, b) => a + b, 0) / 6
    ).toFixed(2));

    // EEG pause bitiş marker'ı
    if (typeof syncMarker === 'function') {
      syncMarker('nasa_eeg_pause_end', performance.now(), {
        difficulty,
        auto_submitted: autoTriggered,
        touched_count: Object.keys(currentTouched).length,
        rtlx_score: rtlxScore
      });
    }

    onSubmit({
      rawValues: currentValues,
      adjustedValues,
      rtlxScore,
      difficulty,
      autoSubmitted: autoTriggered,
      touchedCount: Object.keys(currentTouched).length
    });
  };

  // ============================================================================
  // Başlangıçta EEG pause + Timer başlat
  // ============================================================================
  useEffect(() => {
    if (typeof syncMarker === 'function') {
      syncMarker('nasa_eeg_pause_start', performance.now(), {
        difficulty,
        countdown_duration_sec: COUNTDOWN_SECONDS
      });
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setTimeout(() => performSubmit(true), 100);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointClick = (key, value) => {
    if (secondsLeft <= 0 || hasSubmittedRef.current) return;
    setValues(prev => ({ ...prev, [key]: value }));
    setTouched(prev => ({ ...prev, [key]: true }));
  };

  const getCountdownColor = () => {
    if (secondsLeft > 15) return '#27ae60';
    if (secondsLeft > 5) return '#f39c12';
    return '#e74c3c';
  };

  const progressPercent = ((COUNTDOWN_SECONDS - secondsLeft) / COUNTDOWN_SECONDS) * 100;
  const completedCount = Object.keys(touched).length;

  return (
    <div className="nasa-container">
      <div className="nasa-card">

        <div className="nasa-header">
          <h2>NASA-TLX Zihinsel İş Yükü Anketi</h2>
          {difficulty && (
            <p className="nasa-difficulty-label">
              {difficultyLabel[difficulty]} Seviye Sonrası
            </p>
          )}
        </div>

        {/* ⚡ Otomatik Geçiş Banner */}
        <div className="nasa-auto-banner">
          <div className="nasa-countdown-section">
            <div className="nasa-countdown-label">Kalan Süre</div>
            <div
              className="nasa-countdown-number"
              style={{ color: getCountdownColor() }}
            >
              {secondsLeft}
              <span className="nasa-countdown-unit">sn</span>
            </div>
          </div>

          <div className="nasa-progress-section">
            <div className="nasa-progress-bar-track">
              <div
                className="nasa-progress-bar-fill"
                style={{
                  width: `${progressPercent}%`,
                  background: getCountdownColor()
                }}
              />
            </div>
            <p className="nasa-warning-text">
              <strong>Lütfen ekran dışında bir yere tıklamayın.</strong> Süre
              dolduğunda otomatik olarak bir sonraki adıma geçilecek.
            </p>
            <p className="nasa-progress-info">
              {completedCount} / 6 boyut tıklandı
            </p>
          </div>
        </div>

        <div className="nasa-instructions-box">
          <p>
            Tamamladığınız görev için her boyutu değerlendirin.
            <strong> Her satırda 0-100 arasında bir noktaya tıklayın.</strong>
          </p>
        </div>

        <div className="nasa-items">
          {scales.map(scale => (
            <div
              key={scale.key}
              className={`nasa-item ${touched[scale.key] ? 'completed' : ''}`}
            >
              <div className="nasa-item-header">
                <span className="nasa-item-label">{scale.label}</span>
                {touched[scale.key] && (
                  <span className="nasa-item-check">✓</span>
                )}
              </div>

              <p className="nasa-item-description">{scale.description}</p>

              <div className="nasa-slider-wrapper">
                <span className="nasa-anchor nasa-anchor-low">
                  {scale.lowAnchor}
                </span>

                <div className="nasa-points-wrapper">
                  <div className="nasa-points-container">
                    <div className="nasa-points-line"></div>
                    {[0, 25, 50, 75, 100].map(val => (
                      <div
                        key={val}
                        className={`nasa-point ${values[scale.key] === val && touched[scale.key] ? 'active' : ''}`}
                        onClick={() => handlePointClick(scale.key, val)}
                      ></div>
                    ))}
                  </div>
                  <div className="nasa-points-labels">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                    <span>75</span>
                    <span>100</span>
                  </div>
                </div>

                <span className="nasa-anchor nasa-anchor-high">
                  {scale.highAnchor}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Buton YOK - sadece bilgi metni */}
        <div className="nasa-footer-info">
          <p className="nasa-auto-info">
            🤖 Otomatik geçiş aktif — herhangi bir butona basmanıza gerek yok
          </p>
        </div>

      </div>
    </div>
  );
};

export default NasaTLX;