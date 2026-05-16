import React, { useState, useEffect } from 'react';
import UserForm from './components/UserForm';
import Exam from './components/Exam';
import Result from './components/Result';
import NasaTLX from './components/NasaTLX';
import CalibrationScreen from './components/CalibrationScreen';
import useSession from './hooks/useSession';
import useEEGStream from './hooks/useEEGStream';
import './App.css';

function App() {
  const [step, setStep] = useState('form');
  const [userInfo, setUserInfo] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [difficultyIndex, setDifficultyIndex] = useState(0);
  const [currentDifficulty, setCurrentDifficulty] = useState(null);

  // NASA-TLX yeni veri yapısı:
  // { kolay: {rtlxScore, rawValues, adjustedValues}, orta: {...}, zor: {...} }
  const [nasaByDifficulty, setNasaByDifficulty] = useState({
    kolay: null,
    orta: null,
    zor: null
  });

  // ⚡ Yeni: syncMarker ve syncNasaDetailed eklendi
  const {
    sessionId,
    backendOnline,
    createSession,
    syncAnswers,
    syncNasa,           // Eski format (geriye dönük uyumluluk)
    syncNasaDetailed,   // ⚡ Yeni
    syncMarker,         // ⚡ Yeni — Exam.js'e geçilecek
    reset: resetSession
  } = useSession();

  const eegActive = step === 'calibration' || step === 'exam' || step === 'nasa';

  const { cognitiveLoad, timeline, connected: eegConnected, appState } = useEEGStream(sessionId, eegActive);

  // Backend "testing" sinyali gelince sınava geç
  useEffect(() => {
    if (step === 'calibration' && appState === 'testing') {
      syncMarker('calibration_end', performance.now(), {});
      setStep('exam');
    }
  }, [step, appState, syncMarker]);

  // Kalibrasyon başlangıç marker'ı
  useEffect(() => {
    if (step === 'calibration' && sessionId) {
      syncMarker('calibration_start', performance.now(), {});
    }
  }, [step, sessionId, syncMarker]);

  // NASA-TLX onset marker (her seviye sonrası)
  useEffect(() => {
    if (step === 'nasa' && currentDifficulty) {
      syncMarker('nasa_onset', performance.now(), {
        difficulty: currentDifficulty
      });
    }
  }, [step, currentDifficulty, syncMarker]);

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
            setStep('calibration');
            createSession(info);
          }}
        />
      )}

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
          syncMarker={syncMarker}              // ⚡ Yeni: marker gönderme
          onFinishLevel={(level, levelAnswers) => {
            setAnswers(prev => [...prev, ...levelAnswers]);
            setCurrentDifficulty(level);
            setDifficultyIndex(prev => prev + 1);
            setStep('nasa');
            syncAnswers(levelAnswers);
          }}
          onFinishExam={(allAnswers) => {
            console.log('[App] Sınav tamamlandı, toplam cevap:', allAnswers.length);
          }}
        />
      )}

      {step === 'nasa' && currentDifficulty && (
        <NasaTLX
          difficulty={currentDifficulty}
          onSubmit={(nasaResult) => {
            // ⚡ Yeni NASA-TLX veri yapısı
            // nasaResult = { rawValues, adjustedValues, rtlxScore, difficulty }

            // NASA-TLX submit marker'ı
            syncMarker('nasa_submit', performance.now(), {
              difficulty: currentDifficulty,
              rtlx_score: nasaResult.rtlxScore
            });

            // State'e kaydet
            setNasaByDifficulty(prev => ({
              ...prev,
              [currentDifficulty]: {
                rtlxScore: nasaResult.rtlxScore,
                rawValues: nasaResult.rawValues,
                adjustedValues: nasaResult.adjustedValues
              }
            }));

            // Backend'e gönder — hem eski hem yeni endpoint
            syncNasa(currentDifficulty, nasaResult.rtlxScore.toFixed(1));
            syncNasaDetailed({
              difficulty: currentDifficulty,
              rtlxScore: nasaResult.rtlxScore,
              rawValues: nasaResult.rawValues,
              adjustedValues: nasaResult.adjustedValues
            });

            // Sonraki adım: zor seviye bittiyse result, değilse sınava devam
            if (difficultyIndex >= 3) {
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