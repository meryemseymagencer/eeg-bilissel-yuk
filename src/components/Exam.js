import React, { useState, useEffect, useRef, useCallback } from 'react';
import { questions, timeByDifficulty, difficultyOrder } from '../data/questions';
import './Exam.css';

// ============================================================================
// Exam Component (v2.0)
// ----------------------------------------------------------------------------
// EEG çalışması için yeniden yapılandırıldı:
//
// State machine:
//   'idle' → 'fixation' → 'question' → 'transition' → 'fixation' → ...
//
// Özellikler:
// - 1.5 sn fixation cross (her sorudan önce)
// - Milisaniye hassasiyetinde RT (performance.now())
// - EEG marker gönderme (block_start, question_onset, question_response, vb.)
// - Otomatik geçiş (seçim = cevap, feedback yok)
// - Self-paced + maksimum süre
// ============================================================================


const Exam = ({ userInfo, startDifficultyIndex, onFinishLevel, onFinishExam, syncMarker }) => {
  // ---- State Machine ----
  const [phase, setPhase] = useState('question');
  const [currentDifficultyIndex] = useState(startDifficultyIndex);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);

  // ---- Refs ----
  const timerRef = useRef(null);
  const questionStartTimeRef = useRef(null);  // performance.now() değeri
  const hasSubmittedRef = useRef(false);
  const blockStartSentRef = useRef(false);    // Blok başlangıç marker'ı bir kez gönderilsin

  // ---- Türetilmiş değerler ----
  const currentDifficulty = difficultyOrder[currentDifficultyIndex];
  const currentQuestions = questions[currentDifficulty];
  const currentQuestion = currentQuestions[currentQuestionIndex];
  const maxTime = timeByDifficulty[currentDifficulty];
  const timePercentage = (maxTime && timeLeft !== null) ? (timeLeft / maxTime) * 100 : 0;
  const progressPercentage = ((currentQuestionIndex + 1) / currentQuestions.length) * 100;

  // ---- Marker yardımcısı ----
  const sendMarker = useCallback((eventType, metadata = {}) => {
    if (typeof syncMarker === 'function') {
      syncMarker(eventType, performance.now(), metadata);
    }
  }, [syncMarker]);

  // =========================================================================
  // FAZ 1: BAŞLANGIÇ — Blok başlangıcı
  // =========================================================================
  useEffect(() => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    hasSubmittedRef.current = false;
    blockStartSentRef.current = false;
    setPhase('question');  

    if (!blockStartSentRef.current) {
      sendMarker('block_start', {
        difficulty: currentDifficulty,
        difficulty_index: currentDifficultyIndex,
        total_questions: currentQuestions.length
      });
      blockStartSentRef.current = true;
    }
  }, [currentDifficultyIndex, currentDifficulty, currentQuestions.length, sendMarker]); 

  // =========================================================================
  // FAZ 3: QUESTION — Soruyu göster, timer başlat
  // =========================================================================
  useEffect(() => {
    if (phase !== 'question') return;

    // Soru başlangıç zamanı (RT için)
    questionStartTimeRef.current = performance.now();

    // Question onset marker (RT analizinin başlangıç noktası)
    sendMarker('question_onset', {
      question_id: currentQuestion.id,
      difficulty: currentDifficulty,
      category: currentQuestion.category,
      question_index: currentQuestionIndex
    });

    // Timer'ı sıfırla ve başlat
    setTimeLeft(maxTime);
    setSelectedAnswer(null);
    hasSubmittedRef.current = false;

    // Saniye sayacı
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [phase, currentQuestionIndex, currentQuestion, currentDifficulty, maxTime, sendMarker]);

  // =========================================================================
  // CEVAP/TIMEOUT İŞLEME
  // =========================================================================
  const submitAnswer = useCallback((selectedIndex, isTimeout = false) => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    // Timer'ları durdur
    clearInterval(timerRef.current);

    // RT hesapla (milisaniye)
    const rtMs = questionStartTimeRef.current
      ? Math.round(performance.now() - questionStartTimeRef.current)
      : null;

    const isCorrect = selectedIndex !== null && selectedIndex === currentQuestion.correctAnswer;

    const answerData = {
      questionId: currentQuestion.id,
      difficulty: currentDifficulty,
      category: currentQuestion.category,
      selectedAnswer: selectedIndex,
      correctAnswer: currentQuestion.correctAnswer,
      isCorrect,
      points: isCorrect ? currentQuestion.points : 0,
      timeUsed: maxTime - timeLeft,
      rt_ms: rtMs,
      question: currentQuestion.question,
      timedOut: isTimeout
    };

    // Cevap marker'ı
    sendMarker(isTimeout ? 'question_timeout' : 'question_response', {
      question_id: currentQuestion.id,
      difficulty: currentDifficulty,
      category: currentQuestion.category,
      selected_answer: selectedIndex,
      correct_answer: currentQuestion.correctAnswer,
      is_correct: isCorrect,
      rt_ms: rtMs
    });

    // State güncelle
    setAnswers(prev => [...prev, answerData]);

    // Sonraki soruya veya bloğun sonuna geç
    if (currentQuestionIndex >= currentQuestions.length - 1) {
      sendMarker('block_end', {
        difficulty: currentDifficulty,
        difficulty_index: currentDifficultyIndex
      });

      const levelAnswers = [...answers, answerData].filter(
        a => a.difficulty === currentDifficulty
      );

      onFinishLevel(currentDifficulty, levelAnswers);

      if (currentDifficultyIndex >= difficultyOrder.length - 1) {
        if (typeof onFinishExam === 'function') {
          onFinishExam([...answers, answerData]);
        }
      }
    } else {
      setCurrentQuestionIndex(i => i + 1);
      setPhase('question');  
    }
  }, [
    currentQuestion,
    currentDifficulty,
    currentDifficultyIndex,
    currentQuestionIndex,
    currentQuestions.length,
    maxTime,
    timeLeft,
    answers,
    onFinishLevel,
    onFinishExam,
    sendMarker
  ]);

  // =========================================================================
  // TIMEOUT KONTROLÜ
  // =========================================================================
  useEffect(() => {
    if (phase === 'question' && timeLeft === 0 && !hasSubmittedRef.current) {
      submitAnswer(null, true);
    }
  }, [timeLeft, phase, submitAnswer]);

  // =========================================================================
  // CLEAN-UP
  // =========================================================================
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      };
  }, []);

  // =========================================================================
  // KULLANICI ETKİLEŞİMİ
  // =========================================================================
  const handleAnswerClick = (index) => {
    if (phase !== 'question' || hasSubmittedRef.current) return;
    setSelectedAnswer(index);
    submitAnswer(index, false);
  };

  // ---- Yardımcı fonksiyonlar ----
  const formatTime = sec => {
    if (sec === null) return '--:--';
    return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
  };

  const getDifficultyLabel = diff =>
    ({ kolay: 'Kolay', orta: 'Orta', zor: 'Zor' }[diff]);

  const getDifficultyColor = diff =>
    ({ kolay: '#27ae60', orta: '#f39c12', zor: '#e74c3c' }[diff]);

  // =========================================================================
  // RENDER
  // =========================================================================

  // FIXATION FAZİ (artık görünmeyecek)
  if (phase === 'fixation' || phase === 'idle') {
    return null;
  }

  // TRANSITION FAZİ (artık görünmeyecek)
  if (phase === 'transition') {
    return null;
  }

  // QUESTION FAZİ — Normal soru ekranı
  return (
    <div className="exam-container">
      <div className="exam-card">

        {/* HEADER */}
        <div className="exam-header">
          <div className="exam-info">
            <h2 className="exam-title">Sınav Simülasyonu</h2>
            <p className="exam-participant">
              {userInfo.firstName} {userInfo.lastName}
            </p>
          </div>

          <div className="exam-timer-wrapper">
            <div className="exam-timer">
              <span className="timer-icon">⏱️</span>
              <span className="timer-time">{formatTime(timeLeft)}</span>
            </div>

            <div className="timer-progress-bar">
              <div
                className="timer-progress-fill"
                style={{ width: `${timePercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* PROGRESS */}
        <div className="progress-container">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="progress-text">
            Soru {currentQuestionIndex + 1} / {currentQuestions.length}
          </div>
        </div>

        {/* DIFFICULTY BADGE */}
        <div
          className="difficulty-badge"
          style={{
            backgroundColor: getDifficultyColor(currentDifficulty) + '20',
            borderColor: getDifficultyColor(currentDifficulty),
            color: getDifficultyColor(currentDifficulty)
          }}
        >
          {getDifficultyLabel(currentDifficulty)} Seviye – {currentQuestion.points} Puan
        </div>

        {/* QUESTION */}
        <div className="question-container">
          <h3 className="question-text">{currentQuestion.question}</h3>

          <div className="options-container">
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                className={`option-button ${
                  selectedAnswer === index ? 'selected' : ''
                }`}
                onClick={() => handleAnswerClick(index)}
                disabled={hasSubmittedRef.current}
              >
                <span className="option-letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="option-text">{option}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Otomatik geçiş bilgisi */}
        <div className="exam-info-footer">
          <p className="auto-advance-info">
            Bir seçeneğe tıkladığınızda otomatik olarak sonraki soruya geçilecektir.
          </p>
        </div>

      </div>
    </div>
  );
};

export default Exam;