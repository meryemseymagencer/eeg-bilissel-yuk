import React, { useState } from 'react';
import './UEQS.css';

/**
 * UEQ-S — User Experience Questionnaire Short Version (EK-6)
 * ============================================================
 * Referans: Schrepp, M., Hinderks, A., & Thomaschewski, J. (2017).
 *           Design and Evaluation of a Short Version of the
 *           User Experience Questionnaire (UEQ-S).
 *           International Journal of Interactive Multimedia and
 *           Artificial Intelligence, 4(6), 103.
 *
 * - 8 zıt sıfat çifti
 * - 7'li Likert (-3 ile +3 arası, veya 1-7 olarak da kodlanabilir)
 * - Pragmatic Quality (1-4): Kullanılabilirlik
 * - Hedonic Quality (5-8): Zevk/çekicilik
 *
 * Standart UEQ-S puanlaması:
 *   Skor = (madde değeri - 4) → -3 ile +3 arası
 *   Pragmatic = ortalama(madde 1, 2, 3, 4)
 *   Hedonic   = ortalama(madde 5, 6, 7, 8)
 *   Overall   = (Pragmatic + Hedonic) / 2
 */

const ueqItems = [
  // PRAGMATIC QUALITY (Kullanılabilirlik)
  {
    id: 1,
    leftLabel: 'engelleyici',
    rightLabel: 'destekleyici',
    category: 'pragmatic'
  },
  {
    id: 2,
    leftLabel: 'karmaşık',
    rightLabel: 'sade',
    category: 'pragmatic'
  },
  {
    id: 3,
    leftLabel: 'verimsiz',
    rightLabel: 'verimli',
    category: 'pragmatic'
  },
  {
    id: 4,
    leftLabel: 'kafa karıştırıcı',
    rightLabel: 'açık',
    category: 'pragmatic'
  },
  // HEDONIC QUALITY (Zevk/çekicilik)
  {
    id: 5,
    leftLabel: 'sıkıcı',
    rightLabel: 'heyecan verici',
    category: 'hedonic'
  },
  {
    id: 6,
    leftLabel: 'ilginç olmayan',
    rightLabel: 'ilginç',
    category: 'hedonic'
  },
  {
    id: 7,
    leftLabel: 'geleneksel',
    rightLabel: 'özgün',
    category: 'hedonic'
  },
  {
    id: 8,
    leftLabel: 'alışıldık',
    rightLabel: 'eşi görülmedik',
    category: 'hedonic'
  }
];

const UEQS = ({ onSubmit }) => {
  // Tüm değerleri null ile başlat (zorunlu seçim)
  const [values, setValues] = useState(
    ueqItems.reduce((acc, item) => ({ ...acc, [item.id]: null }), {})
  );

  const handleChange = (itemId, value) => {
    setValues(prev => ({ ...prev, [itemId]: value }));
  };

  const handleSubmit = () => {
    // Tüm maddeler doldurulmuş mu?
    const incomplete = ueqItems.filter(item => values[item.id] === null);
    if (incomplete.length > 0) {
      alert(`Lütfen tüm soruları yanıtlayınız. ${incomplete.length} soru eksik.`);
      // İlk eksik soruya scroll
      const firstIncomplete = document.getElementById(`ueq-item-${incomplete[0].id}`);
      if (firstIncomplete) {
        firstIncomplete.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Standart UEQ-S puanlama (1-7 → -3 ile +3 arası)
    const normalized = {};
    ueqItems.forEach(item => {
      normalized[item.id] = values[item.id] - 4;  // 4 ortanca
    });

    // Pragmatic Quality (1-4)
    const pragmaticValues = [normalized[1], normalized[2], normalized[3], normalized[4]];
    const pragmaticScore = pragmaticValues.reduce((a, b) => a + b, 0) / 4;

    // Hedonic Quality (5-8)
    const hedonicValues = [normalized[5], normalized[6], normalized[7], normalized[8]];
    const hedonicScore = hedonicValues.reduce((a, b) => a + b, 0) / 4;

    // Overall
    const overallScore = (pragmaticScore + hedonicScore) / 2;

    // Sonuçları gönder
    onSubmit({
      rawValues: values,           // 1-7 arası ham değerler
      normalizedValues: normalized,// -3 ile +3 arası standart UEQ değerleri
      pragmaticScore: Number(pragmaticScore.toFixed(2)),
      hedonicScore: Number(hedonicScore.toFixed(2)),
      overallScore: Number(overallScore.toFixed(2)),
      submittedAt: new Date().toISOString()
    });
  };

  // Tamamlanma yüzdesi (kullanıcıya gösterim için)
  const completed = ueqItems.filter(item => values[item.id] !== null).length;
  const totalItems = ueqItems.length;
  const progress = (completed / totalItems) * 100;

  return (
    <div className="ueqs-container">
      <div className="ueqs-card">

        <div className="ueqs-header">
          <h2>Kullanıcı Deneyimi Değerlendirmesi</h2>
          <p className="ueqs-subtitle">
            Sınav simülasyonu deneyiminizi değerlendirmek için 
            aşağıdaki 8 sıfat çifti üzerinde size en uygun 
            seçeneği işaretleyin.
          </p>
          {/* İlerleme barı tamamen silindi */}
        </div>

        <div className="ueqs-items">
          {ueqItems.map((item, idx) => (
            <div 
              key={item.id} 
              // 'answered' sınıfını kaldırdık, renk değiştirmeyecek
              className="ueqs-item"
              id={`ueq-item-${item.id}`}
            >
              <div className="ueqs-item-number">{idx + 1}</div>
              
              <div className="ueqs-row">
                <span className="ueqs-label ueqs-label-left">
                  {item.leftLabel}
                </span>
                
                <div className="ueqs-radio-group">
                  {[1, 2, 3, 4, 5, 6, 7].map(value => (
                    <label 
                      key={value} 
                      className={`ueqs-radio-circle ${values[item.id] === value ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name={`item-${item.id}`}
                        value={value}
                        checked={values[item.id] === value}
                        onChange={() => handleChange(item.id, value)}
                      />
                      <span className="ueqs-radio-circle-inner"></span>
                    </label>
                  ))}
                </div>
                
                <span className="ueqs-label ueqs-label-right">
                  {item.rightLabel}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="ueqs-actions">
          <button 
            onClick={handleSubmit} 
            className={`ueqs-submit-btn ${completed === totalItems ? 'ready' : ''}`}
          >
            {/* Kaç soru kaldı yazısı silindi, hep aynı yazı görünecek */}
            Değerlendirmeyi Tamamla
          </button>
        </div>

      </div>
    </div>
  );
};

export default UEQS;
