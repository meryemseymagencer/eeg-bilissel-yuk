import React, { useState, useEffect } from 'react';
import UserForm from './components/UserForm';
import Exam from './components/Exam';
import Result from './components/Result';
import NasaTLX from './components/NasaTLX';
import CalibrationScreen from './components/CalibrationScreen'; // 1. EKLENDİ: Kalibrasyon bileşeni
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
  
  // 2. GÜNCELLENDİ: Kalibrasyon sırasında da veri akması için 'calibration' eklendi
  const eegActive = step === 'calibration' || step === 'exam' || step === 'nasa';
  
  // 3. GÜNCELLENDİ: appState verisini useEEGStream'den çekiyoruz
  const { cognitiveLoad, timeline, connected: eegConnected, appState } = useEEGStream(sessionId, eegActive);

  // 4. EKLENDİ: Backend "testing" moduna geçince otomatik olarak sınavı başlatır
  useEffect(() => {
    if (step === 'calibration' && appState === 'testing') {
      setStep('exam');
    }
  }, [step, appState]);

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
            
            // 5. GÜNCELLENDİ: Form bitince doğrudan sınava değil, kalibrasyona geçiyoruz
            setStep('calibration'); 
            
            createSession(info); // fire-and-forget; başarısız olursa uygulama devam eder
          }}
        />
      )}

      {/* 6. EKLENDİ: KALİBRASYON AŞAMASI */}
      {step === 'calibration' && (
        <CalibrationScreen 
          appState={appState}
          onCalibrationComplete={() => setStep('exam')} 
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
            const avg = Object.values(values).reduce((a, b) => a + b, 0) / 6;

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