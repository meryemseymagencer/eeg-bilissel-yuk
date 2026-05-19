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
    description: 'Bu görevi tamamlarken ne kadar zihinsel çaba (düşünme, karar verme, hatırlama vb.) harcadınız?',
    lowAnchor: 'Çok Düşük',
    highAnchor: 'Çok Yüksek',
    reversed: false
  },
  {
    key: 'physical',
    label: 'Fiziksel Talep',
    description: 'Bu görev ne düzeyde fiziksel aktivite (tuşlara basma, fare kullanma vb.) gerektirdi?',
    lowAnchor: 'Çok Düşük',
    highAnchor: 'Çok Yüksek',
    reversed: false
  },
  {
    key: 'temporal',
    label: 'Zamansal Talep',
    description: 'Görevi tamamlarken ne kadar zaman baskısı hissettiniz? Görevin temposu nasıldı?',
    lowAnchor: 'Çok Düşük',
    highAnchor: 'Çok Yüksek',
    reversed: false
  },
  {
    key: 'performance',
    label: 'Performans',
    description: 'Kendinizi bu görevi tamamlarken ne kadar başarılı hissediyorsunuz?',
    lowAnchor: 'Mükemmel',      
    highAnchor: 'Başarısız',     
    reversed: true               
  },
  {
    key: 'effort',
    label: 'Efor',
    description: 'Gerekli performans seviyesine ulaşmak için zihinsel ve fiziksel olarak ne kadar çaba harcadınız?',
    lowAnchor: 'Çok Düşük',
    highAnchor: 'Çok Yüksek',
    reversed: false
  },
  {
    key: 'frustration',
    label: 'Stres ve Rahatsızlık',
    description: 'Görev sırasında ne kadar stres, baskı, rahatsızlık veya hayal kırıklığı hissettiniz?',
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
            noktayı işaretleyin.
          </p>
        </div>
<div className="nasa-items">
          {scales.map(scale => (
            <div key={scale.key} className="nasa-item">
              <div className="nasa-item-header">
                <span className="nasa-item-label">{scale.label}</span>
                {/* Köşedeki siyah kutucuk (item-value) BURADAN KALDIRILDI */}
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
                        onClick={() => handleChange(scale.key, val)}
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
              
              {/* Eski <div className="nasa-scale-marks"> (0255075100 hatasına sebep olan kısım) BURADAN SİLİNDİ */}
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