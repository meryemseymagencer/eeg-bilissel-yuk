import React, { useState, useEffect, useRef, useCallback } from 'react';
import { questions, blockDuration, difficultyOrder, protocolConfig } from '../data/questions';
import './Exam.css';

// ============================================================================
// Exam Component (v3.0 — Uzamsal + Bellek)
// ----------------------------------------------------------------------------
// State machine:
//   'stimulus' → (stimDur ms) → 'question' → (cevap/timeout) → 'stimulus' | sonu
//
// Yeni özellikler:
//   - Bellek soruları için stimulus gösterim fazı (stimType: simple/sequence/sternberg/nback)
//   - Görsel içerik render (gorsel.icerik HTML)
//   - Tüm cevaplar buton tıklaması — klavye etkileşimi YOK (EEG sinyal kalitesi)
// ============================================================================

const Exam = ({ userInfo, startDifficultyIndex, onFinishLevel, onFinishExam, syncMarker }) => {

  // ── State Machine ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('question');
  const [currentDifficultyIndex] = useState(startDifficultyIndex);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answers, setAnswers] = useState([]);
  const answersRef = useRef([]);   // ⚡ Blok timer bayat closure'dan kaçınmak için
  // ⚡ timeLeft kaldırıldı (soru-başına timer yok)

  // Blok zamanlayıcısı (sabit süre blok tasarımı)
  const [blockTimeLeft, setBlockTimeLeft] = useState(null);
  const blockTimerRef = useRef(null);
  const blockFinishedRef = useRef(false);  // çift tetiklemeyi önler

  // Stimulus fazı için görsel durum
  const [stimDisplay, setStimDisplay] = useState({ type: null, itemIndex: 0 });

  // ── Refs ───────────────────────────────────────────────────────────────────
  const timerRef          = useRef(null);
  const stimTimerRef      = useRef(null);
  const stimItemRef       = useRef(null);
  const questionStartRef  = useRef(null);
  const hasSubmittedRef   = useRef(false);
  const blockStartSentRef = useRef(false);

  // ── Türetilmiş değerler ────────────────────────────────────────────────────
  const currentDifficulty  = difficultyOrder[currentDifficultyIndex];
  const currentQuestions   = questions[currentDifficulty];
  const currentQuestion    = currentQuestions[currentQuestionIndex];
  // ⚡ maxTime / timePercentage kaldırıldı (soru-başına timer yok)
  const progressPercentage = ((currentQuestionIndex + 1) / currentQuestions.length) * 100;

  // ── Marker yardımcısı ──────────────────────────────────────────────────────
  const sendMarker = useCallback((eventType, metadata = {}) => {
    if (typeof syncMarker === 'function') {
      syncMarker(eventType, performance.now(), metadata);
    }
  }, [syncMarker]);

  // ── Yardımcı: sonraki soru için doğru fazı belirle ────────────────────────
  const phaseForQuestion = useCallback((q) => {
    return q?.stimType ? 'stimulus' : 'question';
  }, []);

  // =========================================================================
  // BAŞLANGIÇ — Blok başlangıcı
  // =========================================================================
  useEffect(() => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    hasSubmittedRef.current   = false;
    blockStartSentRef.current = false;
    const firstQ = questions[currentDifficulty]?.[0];
    setPhase(phaseForQuestion(firstQ));

    if (!blockStartSentRef.current) {
      sendMarker('block_start', {
        difficulty:        currentDifficulty,
        difficulty_index:  currentDifficultyIndex,
        total_questions:   currentQuestions.length
      });
      blockStartSentRef.current = true;
    }
  }, [currentDifficultyIndex, currentDifficulty, currentQuestions.length, sendMarker, phaseForQuestion]);

  // =========================================================================
  // BLOK ZAMANLAYICISI — Sabit süre dolunca seviyeyi bitir
  // =========================================================================
  useEffect(() => {
    blockFinishedRef.current = false;
    const totalSec = blockDuration[currentDifficulty] ?? 120;
    setBlockTimeLeft(totalSec);

    blockTimerRef.current = setInterval(() => {
      setBlockTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(blockTimerRef.current);
          if (!blockFinishedRef.current) {
            blockFinishedRef.current = true;
            // ⚡ 0/0 BUG FIX: answersRef'ten bu seviyenin cevaplarını al
            const levelAnswers = answersRef.current.filter(
              a => a.difficulty === currentDifficulty
            );
            sendMarker('block_end', {
              difficulty: currentDifficulty,
              difficulty_index: currentDifficultyIndex,
              reason: 'block_time_expired',
              answers_count: levelAnswers.length,
            });
            onFinishLevel(currentDifficulty, levelAnswers);
            if (currentDifficultyIndex >= difficultyOrder.length - 1) {
              if (typeof onFinishExam === 'function') onFinishExam(answersRef.current);
            }
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(blockTimerRef.current);
  }, [currentDifficultyIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // =========================================================================
  // FAZ: STIMULUS — Bellek uyaranını göster, stimDur ms sonra soru fazına geç
  // =========================================================================
  useEffect(() => {
    if (phase !== 'stimulus') return;

    const q = currentQuestion;
    const dur = q.stimDur ?? 2000;

    sendMarker('stimulus_onset', {
      question_id: q.id,
      stim_type:   q.stimType,
      stim_dur:    dur
    });
    // Sequence/nback için öğe-öğe animasyon
        if (q.stimType === 'sequence' || q.stimType === 'nback') {
          setStimDisplay({ type: q.stimType, itemIndex: 0 });
          const itemDur = Math.floor(dur / (q.items?.length || 1)); // Güvenlik önlemi: items yoksa 1'e böl
          let idx = 0;
          const advance = () => {
            idx++;
            if (q.items && idx < q.items.length) {
              setStimDisplay({ type: q.stimType, itemIndex: idx });
              stimItemRef.current = setTimeout(advance, itemDur);
            }
          };
          stimItemRef.current = setTimeout(advance, itemDur);
        } else if (q.stimType === 'sternberg') {
          setStimDisplay({ type: 'sternberg', itemIndex: 0 });
          const letterDur = Math.floor((q.encDur ?? 2500) / (q.encItems?.length || 1));
          let idx = 0;
          const advance = () => {
            idx++;
            if (q.encItems && idx < q.encItems.length) {
              setStimDisplay({ type: 'sternberg', itemIndex: idx });
              stimItemRef.current = setTimeout(advance, letterDur);
            }
          };
          stimItemRef.current = setTimeout(advance, letterDur);
        } 
        // ── YENİ EKLEDİĞİMİZ KISIM (Tek kelimelik veya düz uyaranlar için) ──
        else if (q.stimType === 'simple-word' || q.stimType === 'simple') {
          // Doğrudan soruda tanımladığın stimDur süresini (örn: 4000ms) kullanır
          setStimDisplay({ type: q.stimType, itemIndex: 0 });
          
          // Eğer ana zamanlayıcı (dur) bu süreyi ezmiyorsa, buradaki akış 
          // sorunun kendi tanımlı süresi boyunca statik kalacaktır.
        } 
        // ── ───────────────────────────────────────────────────────────── ──
        else {
          setStimDisplay({ type: q.stimType, itemIndex: 0 });
        }
    // Toplam süre dolunca soru fazına geç
    stimTimerRef.current = setTimeout(() => {
      sendMarker('stimulus_offset', { question_id: q.id });
      clearTimeout(stimItemRef.current);
      setStimDisplay({ type: null, itemIndex: 0 });
      setPhase('question');
    }, dur);

    return () => {
      clearTimeout(stimTimerRef.current);
      clearTimeout(stimItemRef.current);
    };
  }, [phase, currentQuestionIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // =========================================================================
  // FAZ: QUESTION — Soruyu göster
  // ⚡ Soru başına timer KALDIRILDI. Süre yönetimi yalnızca blok timer'ında.
  //    Kullanıcı kendi temposunda cevaplar; soru otomatik atlamaz.
  // =========================================================================
  useEffect(() => {
    if (phase !== 'question') return;

    questionStartRef.current = performance.now();

    sendMarker('question_onset', {
      question_id:    currentQuestion.id,
      difficulty:     currentDifficulty,
      category:       currentQuestion.category,
      question_index: currentQuestionIndex
    });

    setSelectedAnswer(null);
    hasSubmittedRef.current = false;
  }, [phase, currentQuestionIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // =========================================================================
  // CEVAP / TIMEOUT İŞLEME
  // =========================================================================
  const submitAnswer = useCallback((selectedIndex, isTimeout = false) => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    const rtMs = questionStartRef.current
      ? Math.round(performance.now() - questionStartRef.current)
      : null;

    const isCorrect = selectedIndex !== null && selectedIndex === currentQuestion.correctAnswer;

    const answerData = {
      questionId:     currentQuestion.id,
      difficulty:     currentDifficulty,
      category:       currentQuestion.category,
      selectedAnswer: selectedIndex,
      correctAnswer:  currentQuestion.correctAnswer,
      isCorrect,
      points:         isCorrect ? currentQuestion.points : 0,
      timeUsed:       rtMs !== null ? Math.round(rtMs / 1000) : null, // ⚡ RT'den saniye
      rt_ms:          rtMs,
      question:       currentQuestion.question,
      timedOut:       isTimeout
    };

    sendMarker(isTimeout ? 'question_timeout' : 'question_response', {
      question_id:     currentQuestion.id,
      difficulty:      currentDifficulty,
      category:        currentQuestion.category,
      selected_answer: selectedIndex,
      correct_answer:  currentQuestion.correctAnswer,
      is_correct:      isCorrect,
      rt_ms:           rtMs
    });

    // Buton basımı sonrası motor artefakt kırpma
    if (!isTimeout) {
      sendMarker('response_crop', performance.now(), {
        question_id: currentQuestion.id,
        crop_ms:     protocolConfig.cropAfterResponseMs,
      });
    }

    const newAnswers = [...answers, answerData];
    setAnswers(newAnswers);
    answersRef.current = newAnswers;   // ⚡ Ref'i de güncel tut (blok timer için)

    if (currentQuestionIndex >= currentQuestions.length - 1) {
      // Son soru cevaplandı — sorular tükendi, seviyeyi bitir
      clearInterval(blockTimerRef.current);
      if (!blockFinishedRef.current) {
        blockFinishedRef.current = true;
        sendMarker('block_end', {
          difficulty:       currentDifficulty,
          difficulty_index: currentDifficultyIndex,
          reason:           'questions_exhausted',
        });
        const levelAnswers = newAnswers.filter(a => a.difficulty === currentDifficulty);
        onFinishLevel(currentDifficulty, levelAnswers);
        if (currentDifficultyIndex >= difficultyOrder.length - 1) {
          if (typeof onFinishExam === 'function') onFinishExam(newAnswers);
        }
      }
    } else {
      const nextIdx = currentQuestionIndex + 1;
      const nextQ   = currentQuestions[nextIdx];
      setCurrentQuestionIndex(nextIdx);
      setPhase(phaseForQuestion(nextQ));
    }
  }, [
    currentQuestion, currentDifficulty, currentDifficultyIndex,
    currentQuestionIndex, currentQuestions,
    answers, onFinishLevel, onFinishExam, sendMarker, phaseForQuestion
  ]);

  // ⚡ Soru başına timeout KALDIRILDI.
  //    Soru, yalnızca kullanıcı cevaplayınca ilerler. Süre kontrolü blok timer'ında.

  // Cleanup
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(blockTimerRef.current);
      clearTimeout(stimTimerRef.current);
      clearTimeout(stimItemRef.current);
    };
  }, []);

  // ── Buton tıklaması ────────────────────────────────────────────────────────
  const handleAnswerClick = (index) => {
    if (phase !== 'question' || hasSubmittedRef.current) return;
    setSelectedAnswer(index);
    submitAnswer(index, false);
  };

  // ── Görsel seçenek tıklaması (gorselSecenekler olan sorular için) ──────────
  const handleVisualOptionClick = useCallback((harf) => {
    if (phase !== 'question' || hasSubmittedRef.current) return;
    const idx = ['A', 'B', 'C', 'D'].indexOf(harf);
    if (idx >= 0) handleAnswerClick(idx);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Yardımcılar ────────────────────────────────────────────────────────────
  const formatTime = sec => {
    if (sec === null) return '--:--';
    return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
  };

  const getDifficultyLabel = d => ({ kolay: 'Kolay', orta: 'Orta', zor: 'Zor' }[d] ?? d);
  const getDifficultyColor = d => ({ kolay: '#27ae60', orta: '#f39c12', zor: '#e74c3c' }[d] ?? '#888');

  // =========================================================================
  // RENDER: STIMULUS FAZI
  // =========================================================================
  if (phase === 'stimulus') {
    const q = currentQuestion;
    const { itemIndex } = stimDisplay;

    return (
      <div className="exam-container">
        <div className="exam-card stimulus-card">
          {/* YENİ HALİ */}
          {q.taskReminder && (
            <div 
              style={{
                fontSize: '1.4rem',       // Yazıyı büyütür (varsayılana göre daha baskın yapar)
                fontWeight: 'bold',       // Kalın (bold) yapar
                color: '#2d3748',         // Silik gri yerine belirgin, koyu bir renk (koyu gri/siyah)
                textAlign: 'center',      // Ortalar
                marginBottom: '20px',     // Alttaki harf ile arasına boşluk bırakır
                border: 'none',           // Çerçeveyi tamamen kaldırır
                background: 'none',       // Arka plan rengi varsa temizler
                padding: '0'              // İç boşlukları sıfırlar
              }}
            >
              {q.taskReminder}
            </div>
          )}

          {/* ── Basit stimulus ── */}
          {q.stimType === 'simple' && (
            <div className="stimulus-main">{q.stimMain}</div>
          )}

          {/* ── Sequence / N-back ── */}
          {(q.stimType === 'sequence' || q.stimType === 'nback') && (
            <div className="stimulus-sequence">
              <div className="stim-item-counter">
                {itemIndex + 1} / {q.items.length}
              </div>
              <div
                className="stimulus-main"
                style={q.colors?.[itemIndex]
                  ? { color: q.colors[itemIndex] }
                  : undefined}
              >
                {q.items[itemIndex]}
              </div>
              <div className="stim-seq-track">
                {q.items.map((it, i) => (
                  <span
                    key={i}
                    className={`stim-seq-dot ${
                      i < itemIndex ? 'past' :
                      i === itemIndex ? 'current' : 'future'
                    }`}
                    style={q.colors?.[i] && i === itemIndex
                      ? { borderColor: q.colors[i], color: q.colors[i] }
                      : undefined}
                  >
                    {i === itemIndex ? it : '·'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Sternberg ── */}
          {q.stimType === 'sternberg' && (
            <div className="stimulus-sternberg">
              <div className="stim-enc-label">Harfleri ezberleyin</div>
              <div className="stim-enc-grid">
                {q.encItems.map((letter, i) => (
                  <div
                    key={i}
                    className={`stim-enc-cell ${i <= itemIndex ? 'revealed' : 'hidden'}`}
                  >
                    {i <= itemIndex ? letter : '?'}
                  </div>
                ))}
              </div>
              <div className="stim-enc-count">{q.encItems.length} harfin tamamını aklınızda tutun</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Diğer pasif fazlar
  if (phase === 'fixation' || phase === 'idle' || phase === 'transition') {
    return null;
  }

  // =========================================================================
  // RENDER: QUESTION FAZI
  // =========================================================================
  const q = currentQuestion;
  const diffColor = getDifficultyColor(currentDifficulty);

  return (
    <div className="exam-container">
      <div className="exam-card">

        {/* HEADER */}
        <div className="exam-header">
          <div className="exam-info">
            <h2 className="exam-title">Bilişsel Yük Çalışması</h2>
            <p className="exam-participant">
              {userInfo.participantId || ''}
            </p>
          </div>
          {/* ⚡ Sağ üst köşedeki soru-başına timer KALDIRILDI.
              Süre yalnızca aşağıdaki blok geri sayımında gösterilir. */}
        </div>

        {/* PROGRESS — Blok geri sayım */}
        <div className="progress-container">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${blockTimeLeft !== null
                  ? (blockTimeLeft / (blockDuration[currentDifficulty] ?? 120)) * 100
                  : progressPercentage}%`
              }}
            />
          </div>
          <div className="progress-text">
            {blockTimeLeft !== null
              ? `Blok: ${formatTime(blockTimeLeft)} kaldı · Soru ${currentQuestionIndex + 1}/${currentQuestions.length}`
              : `Soru ${currentQuestionIndex + 1} / ${currentQuestions.length}`}
          </div>
        </div>

        {/* SORU METNİ */}
        <div className="question-container">
          <h3
            className="question-text"
            dangerouslySetInnerHTML={{ __html: q.question }}
          />
          {/* Üst Etiketler (ORTA YÜK / Çok Adım) */}
          {q.tags && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 'bold', letterSpacing: '0.5px', color: '#1a202c' }}>{q.tags[0]}</span>
              <span style={{
                backgroundColor: '#fef3c7', 
                color: '#92400e', 
                padding: '4px 12px', 
                borderRadius: '9998px', 
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                {q.tags[1]}
              </span>
            </div>
          )}

          {/* Mevcut GORSEL İÇERİK Alanı (Eski sorulardan biri gelirse hala çalışması için ellemiyoruz) */}
          {q.gorsel?.icerik && (
            <div
              className="question-visual"
              dangerouslySetInnerHTML={{ __html: q.gorsel.icerik }}
              onClick={(e) => {
                if (!q.gorselSecenekler) return;
                const clickedOption = e.target.closest('.visual-option');
                if (clickedOption) {
                  handleVisualOptionClick(clickedOption.getAttribute('data-harf'));
                }
              }}
            />
          )}

          {/* Sternberg — sorgu harfi */}
          {q.stimType === 'sternberg' && q.probeItem && (
            <div className="probe-display">
              <span className="probe-letter">{q.probeItem}</span>
              <span className="probe-label">Bu harf listede var mıydı?</span>
            </div>
          )}

          {/* SEÇENEK BUTONLARI — yalnızca gorselSecenekler değilse */}
          {!q.gorselSecenekler && (
            <div className="options-container">
              {q.options.map((option, index) => (
                <button
                  key={index}
                  className={`option-button ${selectedAnswer === index ? 'selected' : ''}`}
                  onClick={() => handleAnswerClick(index)}
                  disabled={hasSubmittedRef.current}
                >
                  <span className="option-letter">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span
                    className="option-text"
                    dangerouslySetInnerHTML={{ __html: option }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Exam;