import React, { useMemo, useCallback } from 'react';
import './Result.css';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

const LOAD_LABELS = ['low', 'medium', 'high'];
const LOAD_TR = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
const LOAD_COLOR = { low: '#27ae60', medium: '#f39c12', high: '#e74c3c' };

// ---------------------------------------------------------------------------
// CSV yardımcı
// ---------------------------------------------------------------------------

function downloadCSV(rows, filename) {
  const csv = rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')
  ).join('\r\n');

  // BOM → Excel'in Türkçe karakterleri doğru okuması için
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Bileşen
// ---------------------------------------------------------------------------

const Result = ({
  userInfo,
  answers,
  nasaByDifficulty,
  eegTimeline = [],
  sessionId = null,
  onRestart,
}) => {

  // ---- Sınav istatistikleri ------------------------------------------------

  const stats = useMemo(() => {
    const difficultyStats = diff => {
      const list = answers.filter(a => a.difficulty === diff);
      const correct = list.filter(a => a.isCorrect).length;
      return {
        correct,
        wrong: list.length - correct,
        mentalLoad: nasaByDifficulty?.[diff] ?? '-',
      };
    };

    const totalPoints = answers.reduce((s, a) => s + a.points, 0);
    const maxPoints   = answers.reduce((s, a) =>
      s + (a.difficulty === 'kolay' ? 10 : a.difficulty === 'orta' ? 20 : 30), 0);

    return {
      totalPoints,
      maxPoints,
      kolay: difficultyStats('kolay'),
      orta:  difficultyStats('orta'),
      zor:   difficultyStats('zor'),
    };
  }, [answers, nasaByDifficulty]);

  // ---- EEG özet istatistikleri ---------------------------------------------

  const eegStats = useMemo(() => {
    if (!eegTimeline.length) return null;

    const counts = { low: 0, medium: 0, high: 0 };
    eegTimeline.forEach(e => {
      if (e.cognitive_load in counts) counts[e.cognitive_load]++;
    });

    const total = eegTimeline.length;
    const pct   = label => Math.round((counts[label] / total) * 100);

    // En baskın etiket
    const dominant = LOAD_LABELS.reduce((a, b) => counts[a] >= counts[b] ? a : b);

    return { counts, pct, total, dominant };
  }, [eegTimeline]);

  // ---- CSV dışa aktarma ----------------------------------------------------

  const exportAnswersCSV = useCallback(() => {
    const header = [
      'session_id', 'firstName', 'lastName', 'age', 'gender',
      'questionId', 'difficulty', 'question',
      'isCorrect', 'points', 'timeUsed_sn', 'nasa_tlx_avg',
    ];

    const rows = answers.map(a => [
      sessionId ?? '',
      userInfo.firstName,
      userInfo.lastName,
      userInfo.age,
      userInfo.gender,
      a.questionId,
      a.difficulty,
      a.question.replace(/\n/g, ' '),
      a.isCorrect ? 1 : 0,
      a.points,
      a.timeUsed,
      String(nasaByDifficulty?.[a.difficulty] ?? '').replace('.', ','),
    ]);

    const slug = sessionId ? sessionId.slice(0, 8) : Date.now();
    downloadCSV([header, ...rows], `sinav_sonuclari_${slug}.csv`);
  }, [answers, userInfo, nasaByDifficulty, sessionId]);

  const exportEEGCSV = useCallback(() => {
    if (!sessionId) {
      alert("Oturum bulunamadı, indirme yapılamaz.");
      return;
    }
    
    // Backend'e yazdığımız STEW formatlı TXT indirme endpoint'ini tetikliyoruz
    const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    window.open(`${API_BASE}/api/session/${sessionId}/export/stew`, '_blank');
    
  }, [sessionId]);
  // ---- Render --------------------------------------------------------------

  return (
    <div className="result-container">
      <div className="result-card">

        {/* BAŞLIK */}
        <div className="result-header">
          <h1 className="result-title">Sınav Tamamlandı</h1>
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
                NASA-TLX
                <span className="nasa-value">{stats[diff].mentalLoad}</span>
              </div>
            </div>
          ))}
        </div>

        {/* EEG BİLİŞSEL YÜK ÖZETİ */}
        {eegStats ? (
          <div className="eeg-summary">
            <h3 className="breakdown-title">EEG Bilişsel Yük Özeti</h3>

            {/* Dominant yük rozeti */}
            <div className="eeg-dominant">
              <span className="eeg-dominant-label">Baskın Yük</span>
              <span
                className="eeg-dominant-badge"
                style={{ background: LOAD_COLOR[eegStats.dominant] }}
              >
                {LOAD_TR[eegStats.dominant]}
              </span>
              <span className="eeg-epoch-count">
                {eegStats.total} ölçüm · ≈{eegStats.total} sn
              </span>
            </div>

            {/* Dağılım çubukları */}
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
          <button className="restart-button" onClick={onRestart}>
            Yeniden Başla
          </button>
          <button className="export-button" onClick={exportAnswersCSV}>
            Sonuçları İndir
          </button>
          <button
            className="export-button export-eeg"
            onClick={exportEEGCSV}
            disabled={!eegTimeline.length}
            title={!eegTimeline.length ? 'EEG verisi yok' : ''}
          >
            EEG Verisini İndir
          </button>
        </div>

      </div>
    </div>
  );
};

export default Result;
