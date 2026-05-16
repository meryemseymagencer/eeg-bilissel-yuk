import React, { useState } from 'react';
import './NasaTLX.css';

// ============================================================================
// NASA-TLX (Raw TLX / RTLX) — Standart Implementasyon
// ----------------------------------------------------------------------------
// Referans: Hart, S. G. (2006). NASA-Task Load Index (NASA-TLX);
//           20 Years Later. Proceedings of the Human Factors and
//           Ergonomics Society Annual Meeting, 50(9), 904-908.
//
// - Skala: 0-100 (standart)
// - Performans boyutu: TERS SKORLANIR (0=Mükemmel, 100=Başarısız)
// - Ağırlıklandırma yapılmaz (Raw TLX yaklaşımı)
// ============================================================================

const scales = [
  {
    key: 'mental',
    label: 'Zihinsel Talep',
    description: 'Görev ne kadar zihinsel çaba gerektirdi? (düşünme, karar verme, hesaplama, hatırlama)',
    lowAnchor: 'Çok Düşük',
    highAnchor: 'Çok Yüksek',
    reversed: false
  },
  {
    key: 'physical',
    label: 'Fiziksel Talep',
    description: 'Görev ne kadar fiziksel aktivite gerektirdi? (tuşa basma, hareket)',
    lowAnchor: 'Çok Düşük',
    highAnchor: 'Çok Yüksek',
    reversed: false
  },
  {
    key: 'temporal',
    label: 'Zamansal Talep',
    description: 'Görevin temposu ne kadar baskı yarattı? Zaman baskısı hissettiniz mi?',
    lowAnchor: 'Çok Düşük',
    highAnchor: 'Çok Yüksek',
    reversed: false
  },
  {
    key: 'performance',
    label: 'Performans',
    description: 'Görevi ne kadar başarılı tamamladığınızı düşünüyorsunuz?',
    lowAnchor: 'Mükemmel',      // 0 = en iyi
    highAnchor: 'Başarısız',     // 100 = en kötü
    reversed: true               // ⚠️ TERS SKORLANIR
  },
  {
    key: 'effort',
    label: 'Efor',
    description: 'Performans seviyenize ulaşmak için ne kadar çok çalışmanız gerekti?',
    lowAnchor: 'Çok Düşük',
    highAnchor: 'Çok Yüksek',
    reversed: false
  },
  {
    key: 'frustration',
    label: 'Hayal Kırıklığı / Stres',
    description: 'Görev sırasında ne kadar tedirgin, stresli, sinirli veya rahatsız hissettiniz?',
    lowAnchor: 'Çok Düşük',
    highAnchor: 'Çok Yüksek',
    reversed: false
  }
];

const difficultyLabel = { kolay: 'Kolay', orta: 'Orta', zor: 'Zor' };

const NasaTLX = ({ difficulty, onSubmit }) => {
  // Tüm değerleri 50 ile başlat (orta nokta — bias'ı azaltır)
  const [values, setValues] = useState(
    scales.reduce((acc, s) => ({ ...acc, [s.key]: 50 }), {})
  );
  const [touched, setTouched] = useState({});

  const handleChange = (key, value) => {
    setValues(prev => ({ ...prev, [key]: Number(value) }));
    setTouched(prev => ({ ...prev, [key]: true }));
  };

  const handleSubmit = () => {
    // Tüm boyutlara dokunulmuş mu?
    const allTouched = scales.every(s => touched[s.key]);
    if (!allTouched) {
      alert('Lütfen her boyutu değerlendirin (her kaydırıcıya en az bir kez dokunun).');
      return;
    }

    // ⚠️ Performans boyutunu ters çevir (raw değerleri saklamadan önce)
    // İstatistiksel analizde "yüksek yük = yüksek skor" tutarlılığı için
    const adjustedValues = {};
    scales.forEach(scale => {
      if (scale.reversed) {
        adjustedValues[scale.key] = 100 - values[scale.key];
      } else {
        adjustedValues[scale.key] = values[scale.key];
      }
    });

    // RTLX skoru: 6 boyutun aritmetik ortalaması
    const rtlxScore = (
      Object.values(adjustedValues).reduce((a, b) => a + b, 0) / 6
    ).toFixed(2);

    // Hem ham değerler hem de düzeltilmiş + ortalama gönder
    onSubmit({
      rawValues: values,              // Kullanıcının verdiği orijinal skorlar
      adjustedValues,                 // Performans tersine çevrilmiş skorlar
      rtlxScore: Number(rtlxScore),  // Tek skor (analiz için ana metrik)
      difficulty
    });
  };

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
          <p className="nasa-instructions">
            Tamamladığınız görevle ilgili her boyut için, deneyiminize en uygun
            noktayı kaydırıcı ile işaretleyin.
          </p>
        </div>

        <div className="nasa-items">
          {scales.map(scale => (
            <div key={scale.key} className="nasa-item">
              <div className="nasa-item-header">
                <span className="nasa-item-label">{scale.label}</span>
                <span className="nasa-item-value">{values[scale.key]}</span>
              </div>

              <p className="nasa-item-description">{scale.description}</p>

              <div className="nasa-slider-wrapper">
                <span className="nasa-anchor nasa-anchor-low">
                  {scale.lowAnchor}
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={values[scale.key]}
                  onChange={e => handleChange(scale.key, e.target.value)}
                  className={`nasa-slider ${touched[scale.key] ? 'touched' : ''}`}
                />
                <span className="nasa-anchor nasa-anchor-high">
                  {scale.highAnchor}
                </span>
              </div>

              {/* Görsel skala ölçeği */}
              <div className="nasa-scale-marks">
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
            </div>
          ))}
        </div>

        <div className="nasa-actions">
          <button onClick={handleSubmit} className="nasa-submit-btn">
            Değerlendirmeyi Tamamla
          </button>
        </div>

      </div>
    </div>
  );
};

export default NasaTLX;