import React, { useState, useEffect, useRef, useCallback } from 'react';
import { questions, timeByDifficulty, difficultyOrder } from '../data/questions';
import './Exam.css';

const Exam = ({ userInfo, startDifficultyIndex, onFinishLevel, onFinishExam }) => {
  const [currentDifficultyIndex, setCurrentDifficultyIndex] = useState(startDifficultyIndex);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);

  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);
  const hasSubmittedRef = useRef(false);
  const currentDifficulty = difficultyOrder[currentDifficultyIndex];
  const currentQuestions = questions[currentDifficulty];
  const currentQuestion = currentQuestions[currentQuestionIndex];
  const maxTime = timeByDifficulty[currentDifficulty];
  const timePercentage = maxTime ? (timeLeft / maxTime) * 100 : 0;

  useEffect(() => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setIsPaused(false);
    hasSubmittedRef.current = false;
  }, [currentDifficultyIndex]);

  const handleAnswerSubmit = useCallback(
        (answer = selectedAnswer) => {
          if (hasSubmittedRef.current) return;
          hasSubmittedRef.current = true;

          const isCorrect = answer !== null && answer === currentQuestion.correctAnswer;

          const answerData = {
            questionId: currentQuestion.id,
            difficulty: currentDifficulty,
            selectedAnswer: answer,
            correctAnswer: currentQuestion.correctAnswer,
            isCorrect,
            points: isCorrect ? currentQuestion.points : 0,
            timeUsed: maxTime - timeLeft,
            question: currentQuestion.question
          };

          setAnswers(prev => [...prev, answerData]);

          //  Aynı seviyede devam
          if (currentQuestionIndex < currentQuestions.length - 1) {
            setCurrentQuestionIndex(i => i + 1);
            setSelectedAnswer(null);
            hasSubmittedRef.current = false;
            return;
          }
          const levelAnswers = [...answers, answerData].filter(
            a => a.difficulty === currentDifficulty
          );

          onFinishLevel(currentDifficulty, levelAnswers);

          // Son seviye değilse devam
          if (currentDifficultyIndex < difficultyOrder.length - 1) {
            setCurrentDifficultyIndex(i => i + 1);
            setCurrentQuestionIndex(0);
            setSelectedAnswer(null);
            hasSubmittedRef.current = false;
            return;
          }
        },
        [
          selectedAnswer,
          currentQuestion,
          currentDifficulty,
          currentQuestionIndex,
          currentQuestions.length,
          currentDifficultyIndex,
          maxTime,
          timeLeft,
          answers,
          onFinishLevel,
          onFinishExam
        ]
      ); // Properly closed useCallback hook

  useEffect(() => {
  setTimeLeft(maxTime);
  setIsPaused(false);
  hasSubmittedRef.current = false;
}, [currentDifficultyIndex, currentQuestionIndex, maxTime]);


  useEffect(() => {
    if (isPaused) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isPaused]);

  useEffect(() => {
    if (timeLeft === 0 && !isPaused && selectedAnswer === null) {
      setIsPaused(true);
      handleAnswerSubmit(null);
    }
  }, [timeLeft, isPaused, selectedAnswer, handleAnswerSubmit]);
  const handleAnswerSelect = index => {
    if (!isPaused) setSelectedAnswer(index);
  };
  const formatTime = sec =>
    `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;

  const getDifficultyLabel = diff =>
    ({ kolay: 'Kolay', orta: 'Orta', zor: 'Zor' }[diff]);

  const getDifficultyColor = diff =>
    ({ kolay: '#27ae60', orta: '#f39c12', zor: '#e74c3c' }[diff]);
  const progressPercentage = ((currentQuestionIndex + 1) / currentQuestions.length) * 100;
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

        {/* DIFFICULTY */}
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
                } ${isPaused ? 'disabled' : ''}`}
                onClick={() => handleAnswerSelect(index)}
                disabled={isPaused}
              >
                <span className="option-letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="option-text">{option}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ACTION */}
        <div className="exam-actions">
          <button
            className="submit-answer-button"
            onClick={() => handleAnswerSubmit()}
            disabled={selectedAnswer === null || isPaused}
          >
            {currentQuestionIndex === currentQuestions.length - 1
              ? 'Seviyeyi Bitir'
              : 'Sonraki Soru'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default Exam;
