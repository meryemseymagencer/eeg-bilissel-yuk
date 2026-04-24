import React, { useState } from 'react';
import UserForm from './components/UserForm';
import Exam from './components/Exam';
import Result from './components/Result';
import NasaTLX from './components/NasaTLX';
import useSession from './hooks/useSession';
import useEEGStream from './hooks/useEEGStream';
import './App.css';

function App() {
  const [step, setStep] = useState('form');
  const [userInfo, setUserInfo] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [difficultyIndex, setDifficultyIndex] = useState(0);
  const [currentDifficulty, setCurrentDifficulty] = useState(null);
  const [nasaByDifficulty, setNasaByDifficulty] = useState({
    kolay: null,
    orta: null,
    zor: null
  });

  // Backend entegrasyonu
  const { sessionId, backendOnline, createSession, syncAnswers, syncNasa, reset: resetSession } = useSession();
  const eegActive = step === 'exam' || step === 'nasa';
  const { cognitiveLoad, timeline, connected: eegConnected } = useEEGStream(sessionId, eegActive);

  const resetApp = () => {
    setStep('form');
    setUserInfo(null);
    setAnswers([]);
    setDifficultyIndex(0);
    setCurrentDifficulty(null);
    setNasaByDifficulty({ kolay: null, orta: null, zor: null });
    resetSession();
  };

  return (
    <div className="App">

      {step === 'form' && (
        <UserForm
          onStart={(info) => {
            setUserInfo(info);
            setDifficultyIndex(0);
            setCurrentDifficulty(null);
            setStep('exam');
            createSession(info); // fire-and-forget; başarısız olursa uygulama devam eder
          }}
        />
      )}
      {step === 'exam' && userInfo && (
        <Exam
          userInfo={userInfo}
          startDifficultyIndex={difficultyIndex}
          onFinishLevel={(level, levelAnswers) => {
            setAnswers(prev => [...prev, ...levelAnswers]);
            setCurrentDifficulty(level);
            setDifficultyIndex(prev => prev + 1);
            setStep('nasa');
            syncAnswers(levelAnswers); // fire-and-forget
          }}
          onFinishExam={(allAnswers) => {
            setStep('result');
          }}
        />
      )}
      {step === 'nasa' && currentDifficulty && (
        <NasaTLX
          difficulty={currentDifficulty}
          onSubmit={(values) => {
          const avg =
            Object.values(values).reduce((a, b) => a + b, 0) / 6;

          setNasaByDifficulty(prev => ({
            ...prev,
            [currentDifficulty]: avg.toFixed(1)
          }));
          syncNasa(currentDifficulty, avg.toFixed(1)); // fire-and-forget

          // EĞER ZOR SEVİYEYSE → RESULT
          if (difficultyIndex >= 3)  {
            setStep('result');
          } else {
            setStep('exam');
          }
        }}
        />
      )}
      {step === 'result' && (
        <Result
          userInfo={userInfo}
          answers={answers}
          nasaByDifficulty={nasaByDifficulty}
          eegTimeline={timeline}
          sessionId={sessionId}
          onRestart={resetApp}
        />
      )}
    </div>
  );
}
export default App;
