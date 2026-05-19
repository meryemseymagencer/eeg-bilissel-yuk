import React, { useMemo, useCallback } from 'react';
import './Result.css';

// ===========================================================================
// Sabitler
// ===========================================================================

const LOAD_LABELS = ['low', 'medium', 'high'];
const LOAD_TR = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
const LOAD_COLOR = { low: '#27ae60', medium: '#f39c12', high: '#e74c3c' };

// NASA-TLX boyut tanımları (radar chart için)
const TLX_DIMENSIONS = [
  { key: 'mental',      label: 'Zihinsel',  shortLabel: 'Zihinsel' },
  { key: 'physical',    label: 'Fiziksel',  shortLabel: 'Fiziksel' },
  { key: 'temporal',    label: 'Zamansal',  shortLabel: 'Zamansal' },
  { key: 'performance', label: 'Performans', shortLabel: 'Performans' },
  { key: 'effort',      label: 'Efor',      shortLabel: 'Efor' },
  { key: 'frustration', label: 'Stres',     shortLabel: 'Stres' }
];

const DIFFICULTY_COLORS = {
  kolay: { stroke: '#27ae60', fill: 'rgba(39, 174, 96, 0.15)' },
  orta:  { stroke: '#f39c12', fill: 'rgba(243, 156, 18, 0.15)' },
  zor:   { stroke: '#e74c3c', fill: 'rgba(231, 76, 60, 0.15)' }
};

// ===========================================================================
// CSV yardımcısı
// ===========================================================================

function downloadCSV(rows, filename) {
  const csv = rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')
  ).join('\r\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===========================================================================
// SVG Radar Chart Komponenti
// ---------------------------------------------------------------------------
// 6 boyutlu NASA-TLX değerlerini radar (örümcek) grafiğinde gösterir.
// 3 zorluk seviyesini üst üste bindirir (kolay/orta/zor karşılaştırılabilir).
// ===========================================================================

const NasaRadarChart = ({ nasaByDifficulty }) => {
  const SIZE = 360;
  const CENTER = SIZE / 2;
  const RADIUS = 130;
  const N = TLX_DIMENSIONS.length;

  // Her boyut için açı (saatin 12'sinden başla, saat yönünde git)
  const angleFor = (i) => (Math.PI * 2 * i) / N - Math.PI / 2;

  // Skor (0-100) → SVG koordinatı
  const pointFor = (i, value) => {
    const angle = angleFor(i);
    const r = (value / 100) * RADIUS;
    return {
      x: CENTER + r * Math.cos(angle),
      y: CENTER + r * Math.sin(angle)
    };
  };

  const axisEnd = (i) => {
    const angle = angleFor(i);
    return {
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle)
    };
  };

  const labelPos = (i) => {
    const angle = angleFor(i);
    const r = RADIUS + 22;
    return {
      x: CENTER + r * Math.cos(angle),
      y: CENTER + r * Math.sin(angle)
    };
  };

  const polygonPoints = (values) => {
    return TLX_DIMENSIONS
      .map((dim, i) => {
        const v = values?.[dim.key] ?? 0;
        const p = pointFor(i, v);
        return `${p.x},${p.y}`;
      })
      .join(' ');
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className="radar-chart-wrapper">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>

        {/* Konsantrik çokgenler (grid) */}
        {gridLevels.map((level, idx) => {
          const points = TLX_DIMENSIONS
            .map((_, i) => {
              const p = pointFor(i, level * 100);
              return `${p.x},${p.y}`;
            })
            .join(' ');
          return (
            <polygon
              key={idx}
              points={points}
              fill="none"
              stroke="#e0e6ed"
              strokeWidth="1"
            />
          );
        })}

        {/* Eksen çizgileri */}
        {TLX_DIMENSIONS.map((_, i) => {
          const end = axisEnd(i);
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={end.x}
              y2={end.y}
              stroke="#e0e6ed"
              strokeWidth="1"
            />
          );
        })}

        {/* Her zorluk seviyesi için polygon */}
        {['kolay', 'orta', 'zor'].map(diff => {
          const data = nasaByDifficulty?.[diff];
          if (!data || !data.adjustedValues) return null;

          const colors = DIFFICULTY_COLORS[diff];
          return (
            <g key={diff}>
              <polygon
                points={polygonPoints(data.adjustedValues)}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {TLX_DIMENSIONS.map((dim, i) => {
                const v = data.adjustedValues?.[dim.key] ?? 0;
                const p = pointFor(i, v);
                return (
                  <circle
                    key={`${diff}-${dim.key}`}
                    cx={p.x}
                    cy={p.y}
                    r="3"
                    fill={colors.stroke}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Eksen etiketleri */}
        {TLX_DIMENSIONS.map((dim, i) => {
          const pos = labelPos(i);
          return (
            <text
              key={dim.key}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12"
              fontWeight="600"
              fill="#2c3e50"
            >
              {dim.shortLabel}
            </text>
          );
        })}

        <circle cx={CENTER} cy={CENTER} r="2" fill="#bdc3c7" />
      </svg>

      {/* Legend */}
      <div className="radar-legend">
        {['kolay', 'orta', 'zor'].map(diff => {
          const data = nasaByDifficulty?.[diff];
          const colors = DIFFICULTY_COLORS[diff];
          return (
            <div key={diff} className="radar-legend-item">
              <span
                className="radar-legend-swatch"
                style={{ backgroundColor: colors.stroke }}
              />
              <span className="radar-legend-label">
                {diff.charAt(0).toUpperCase() + diff.slice(1)}
              </span>
              <span className="radar-legend-score">
                {data?.rtlxScore !== undefined
                  ? `RTLX: ${data.rtlxScore.toFixed(1)}`
                  : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ===========================================================================
// Ana Bileşen
// ===========================================================================

const Result = ({
  userInfo,
  answers,
  nasaByDifficulty,
  ueqsData = null,        // ⚡ YENİ
  eegTimeline = [],
  sessionId = null,
  onRestart,
  onOpenUEQS              // ⚡ YENİ
}) => {

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // ---- Sınav istatistikleri ----------------------------------------------
  const stats = useMemo(() => {
    const difficultyStats = diff => {
      const list = answers.filter(a => a.difficulty === diff);
      const correct = list.filter(a => a.isCorrect).length;

      // ⚡ Yeni yapı: nasaByDifficulty[diff] artık obje
      const nasaData = nasaByDifficulty?.[diff];
      const rtlxScore = nasaData?.rtlxScore !== undefined
        ? nasaData.rtlxScore.toFixed(1)
        : '-';

      return {
        correct,
        wrong: list.length - correct,
        rtlxScore,
        rtlxRaw: nasaData?.rtlxScore ?? null
      };
    };

    const totalPoints = answers.reduce((s, a) => s + a.points, 0);
    const maxPoints = answers.reduce((s, a) =>
      s + (a.difficulty === 'kolay' ? 10 : a.difficulty === 'orta' ? 20 : 30), 0);

    return {
      totalPoints,
      maxPoints,
      kolay: difficultyStats('kolay'),
      orta:  difficultyStats('orta'),
      zor:   difficultyStats('zor'),
    };
  }, [answers, nasaByDifficulty]);

  // ---- EEG özet istatistikleri --------------------------------------------
  // ⚠️ eegTimeline batch_data'dan geliyor (128 Hz örnek)
  const eegStats = useMemo(() => {
    if (!eegTimeline.length) return null;

    const counts = { low: 0, medium: 0, high: 0 };
    eegTimeline.forEach(e => {
      if (e.cognitive_load in counts) counts[e.cognitive_load]++;
    });

    const total = eegTimeline.length;
    const pct = label => total > 0 ? Math.round((counts[label] / total) * 100) : 0;

    const dominant = LOAD_LABELS.reduce((a, b) => counts[a] >= counts[b] ? a : b);
    const approxSeconds = Math.round(total / 128);

    return { counts, pct, total, dominant, approxSeconds };
  }, [eegTimeline]);

  // ---- CSV: Soru cevapları ------------------------------------------------
  const exportAnswersCSV = useCallback(() => {
    const header = [
      'session_id', 'participant_id', 'age', 'gender', 'department', 'education_level',
      'has_neurological_condition', 'has_eeg_experience', 'has_simulation_experience',
      'questionId', 'difficulty', 'category', 'question',
      'isCorrect', 'points', 'timeUsed_sn',
      'rtlx_score', 'tlx_mental', 'tlx_physical', 'tlx_temporal',
      'tlx_performance', 'tlx_effort', 'tlx_frustration',
      // ⚡ UEQ-S sütunları (sadece ilk satırda doluysa anlamlı, her satıra eklenir)
      'ueqs_pragmatic', 'ueqs_hedonic', 'ueqs_overall'
    ];

    const rows = answers.map(a => {
      const nasa = nasaByDifficulty?.[a.difficulty];
      const adj = nasa?.adjustedValues || {};

      return [
        sessionId ?? '',
        userInfo?.participantId ?? '',
        userInfo?.age ?? '',
        userInfo?.gender ?? '',
        userInfo?.department ?? '',
        userInfo?.educationLevel ?? '',
        userInfo?.hasNeurologicalCondition ? 'evet' : 'hayir',
        userInfo?.hasEEGExperience ? 'evet' : 'hayir',
        userInfo?.hasSimulationExperience ? 'evet' : 'hayir',
        a.questionId,
        a.difficulty,
        a.category ?? '',
        (a.question || '').replace(/\n/g, ' '),
        a.isCorrect ? 1 : 0,
        a.points,
        a.timeUsed,
        nasa?.rtlxScore?.toFixed(2) ?? '',
        adj.mental ?? '',
        adj.physical ?? '',
        adj.temporal ?? '',
        adj.performance ?? '',
        adj.effort ?? '',
        adj.frustration ?? '',
        // ⚡ UEQ-S verisi (her satırda aynı değer)
        ueqsData?.pragmaticScore?.toFixed(2) ?? '',
        ueqsData?.hedonicScore?.toFixed(2) ?? '',
        ueqsData?.overallScore?.toFixed(2) ?? ''
      ];
    });

    const slug = sessionId ? sessionId.slice(0, 8) : Date.now();
    downloadCSV([header, ...rows], `sinav_sonuclari_${slug}.csv`);
  }, [answers, userInfo, nasaByDifficulty, ueqsData, sessionId]);

  // ---- Backend export'ları -----------------------------------------------
  const exportEEGStew = useCallback(() => {
    if (!sessionId) { alert("Oturum bulunamadı."); return; }
    window.open(`${API_BASE}/api/session/${sessionId}/export/stew`, '_blank');
  }, [sessionId, API_BASE]);

  const exportFullData = useCallback(() => {
    if (!sessionId) { alert("Oturum bulunamadı."); return; }
    window.open(`${API_BASE}/api/session/${sessionId}/export/full`, '_blank');
  }, [sessionId, API_BASE]);

  const exportMarkers = useCallback(() => {
    if (!sessionId) { alert("Oturum bulunamadı."); return; }
    window.open(`${API_BASE}/api/session/${sessionId}/export/markers`, '_blank');
  }, [sessionId, API_BASE]);

  const hasNasaData = ['kolay', 'orta', 'zor'].some(
    d => nasaByDifficulty?.[d]?.rtlxScore !== undefined
  );

  // ---- Render -------------------------------------------------------------
  return (
    <div className="result-container">
      <div className="result-card">

        {/* BAŞLIK */}
        <div className="result-header">
          <h1 className="result-title">Sınav Tamamlandı</h1>
          <p className="result-subtitle">
            Katılımcı: <strong>{userInfo?.participantId || 'Bilinmiyor'}</strong>
            {userInfo?.department && ` • ${userInfo.department}`}
          </p>
          {sessionId && (
            <p className="result-session-id">Oturum: {sessionId.slice(0, 8)}…</p>
          )}
        </div>

        {/* GENEL SKOR */}
        <div className="score-summary">
          <div className="score-item main-score">
            <div className="score-label">Toplam Skor</div>
            <div className="score-value">
              {stats.totalPoints} / {stats.maxPoints}
            </div>
          </div>
        </div>

        {/* SEVİYE BAZLI SONUÇLAR */}
        <div className="difficulty-breakdown">
          <h3 className="breakdown-title">Seviye Bazlı Sonuçlar</h3>
          {['kolay', 'orta', 'zor'].map(diff => (
            <div key={diff} className="level-row">
              <div className="level-name">{diff.toUpperCase()}</div>
              <div className="level-stats">
                <span className="stat correct">✔ {stats[diff].correct}</span>
                <span className="divider">|</span>
                <span className="stat wrong">✖ {stats[diff].wrong}</span>
              </div>
              <div className="level-nasa">
                RTLX
                <span className="nasa-value">{stats[diff].rtlxScore}</span>
              </div>
            </div>
          ))}
        </div>

        {/* NASA-TLX RADAR CHART */}
        {hasNasaData ? (
          <div className="nasa-radar-section">
            <h3 className="breakdown-title">NASA-TLX Boyut Karşılaştırması</h3>
            <p className="section-subtitle">
              Her zorluk seviyesinde 6 boyutun değerleri (0-100). Performans boyutu
              "yüksek yük" yönünde ters çevrilmiştir.
            </p>
            <NasaRadarChart nasaByDifficulty={nasaByDifficulty} />
          </div>
        ) : null}

        {/* EEG BİLİŞSEL YÜK ÖZETİ */}
        {eegStats ? (
          <div className="eeg-summary">
            <h3 className="breakdown-title">EEG Bilişsel Yük Özeti</h3>

            <div className="eeg-dominant">
              <span className="eeg-dominant-label">Baskın Yük</span>
              <span
                className="eeg-dominant-badge"
                style={{ background: LOAD_COLOR[eegStats.dominant] }}
              >
                {LOAD_TR[eegStats.dominant]}
              </span>
              <span className="eeg-epoch-count">
                ≈{eegStats.approxSeconds} sn kayıt
              </span>
            </div>

            <div className="eeg-bars">
              {LOAD_LABELS.map(label => (
                <div key={label} className="eeg-bar-row">
                  <span className="eeg-bar-label">{LOAD_TR[label]}</span>
                  <div className="eeg-bar-track">
                    <div
                      className="eeg-bar-fill"
                      style={{
                        width: `${eegStats.pct(label)}%`,
                        background: LOAD_COLOR[label],
                      }}
                    />
                  </div>
                  <span className="eeg-bar-pct">{eegStats.pct(label)}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="eeg-summary eeg-no-data">
            <h3 className="breakdown-title">EEG Bilişsel Yük Özeti</h3>
            <p className="eeg-offline-msg">
              EEG verisi alınamadı. Backend çalışıyor mu?
            </p>
          </div>
        )}
{/* EYLEMLER */}
        <div className="result-actions">
          
          {/* ⚡ UEQ-S Geri Bildirim Bölümü */}
          {!ueqsData && (
            // Henüz doldurulmamış → Buton göster (Doldurulunca hiçbir şey göstermez)
            <div className="ueqs-cta-section">
              <button 
                className="ueqs-cta-button" 
                onClick={onOpenUEQS}
              >
                Sistem Hakkında Geri Bildirim Ver
              </button>
              <p className="ueqs-cta-note">
                Kullanıcı deneyimi anketi (UEQ-S) - <strong>İsteğe bağlı</strong>, ~2 dakika
              </p>
            </div>
          )}

          {/* YENİ BUTON DÜZENİ */}
          <div className="result-actions-container">
            {/* Üstte Koyu Mor Yeniden Başla Butonu */}
            <button className="restart-button" onClick={onRestart}>
              Yeniden Başla
            </button>

            {/* Altta 2x2 İndirme Seçenekleri */}
            <div className="export-buttons-grid">
              <button
                className="export-button export-eeg"
                onClick={exportEEGStew}
                disabled={!sessionId}
              >
                EEG Ham Veri (txt)
              </button>
              <button
                className="export-button"
                onClick={exportFullData}
                disabled={!sessionId}
              >
                Tam Veri (JSON)
              </button>
              <button
                className="export-button"
                onClick={exportMarkers}
                disabled={!sessionId}
              >
                Markerlar (CSV)
              </button>
              <button 
                className="export-button" 
                onClick={exportAnswersCSV}
              >
                Sınav Sonuçları (CSV)
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Result;