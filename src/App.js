import React, { useState, useEffect } from 'react';
import ConsentForm from './components/ConsentForm';
import UserForm from './components/UserForm';
import Exam from './components/Exam';
import Result from './components/Result';
import NasaTLX from './components/NasaTLX';
import UEQS from './components/UEQS';                       // ⚡ YENİ
import CalibrationScreen from './components/CalibrationScreen';
import useSession from './hooks/useSession';
import useEEGStream from './hooks/useEEGStream';
import './App.css';

function App() {
  // ⚡ Akış: consent → form → calibration → exam → nasa → ueqs → result
  const [step, setStep] = useState('consent');
  
  const [consentInfo, setConsentInfo] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [difficultyIndex, setDifficultyIndex] = useState(0);
  const [currentDifficulty, setCurrentDifficulty] = useState(null);

  const [nasaByDifficulty, setNasaByDifficulty] = useState({
    kolay: null,
    orta: null,
    zor: null
  });

  const [ueqsData, setUeqsData] = useState(null);  // ⚡ YENİ

  const {
    sessionId,
    backendOnline,
    createSession,
    syncAnswers,
    syncNasa,
    syncNasaDetailed,
    syncMarker,
    reset: resetSession
  } = useSession();

  const eegActive = step === 'calibration' || step === 'exam' || step === 'nasa';

  const { cognitiveLoad, timeline, connected: eegConnected, appState } = useEEGStream(sessionId, eegActive);

  useEffect(() => {
    if (step === 'calibration' && appState === 'testing') {
      syncMarker('calibration_end', performance.now(), {});
      setStep('exam');
    }
  }, [step, appState, syncMarker]);

  useEffect(() => {
    if (step === 'calibration' && sessionId) {
      syncMarker('calibration_start', performance.now(), {});
    }
  }, [step, sessionId, syncMarker]);

  useEffect(() => {
    if (step === 'nasa' && currentDifficulty) {
      syncMarker('nasa_onset', performance.now(), {
        difficulty: currentDifficulty
      });
    }
  }, [step, currentDifficulty, syncMarker]);

  // ⚡ YENİ: UEQ-S onset marker
  useEffect(() => {
    if (step === 'ueqs' && sessionId) {
      syncMarker('ueqs_onset', performance.now(), {});
    }
  }, [step, sessionId, syncMarker]);

  const resetApp = () => {
    setStep('consent');
    setConsentInfo(null);
    setUserInfo(null);
    setAnswers([]);
    setDifficultyIndex(0);
    setCurrentDifficulty(null);
    setNasaByDifficulty({ kolay: null, orta: null, zor: null });
    setUeqsData(null);
    resetSession();
  };

  return (
    <div className="App">

      {/* 1. ADIM — Onam Formu */}
      {step === 'consent' && (
        <ConsentForm
          onAccept={(info) => {
            setConsentInfo(info);
            setStep('form');
          }}
          onDecline={() => {
            alert('Çalışmaya katılım için onam vermek gerekmektedir. Vazgeçtiğiniz için teşekkür ederiz.');
          }}
        />
      )}

      {/* 2. ADIM — Demografik Bilgiler */}
      {step === 'form' && (
        <UserForm
          onStart={(info) => {
            const fullUserInfo = {
              ...info,
              consentInfo: consentInfo
            };
            setUserInfo(fullUserInfo);
            setDifficultyIndex(0);
            setCurrentDifficulty(null);
            setStep('calibration');
            createSession(fullUserInfo);
          }}
        />
      )}

      {/* 3. ADIM — Kalibrasyon */}
      {step === 'calibration' && (
        <CalibrationScreen
          appState={appState}
          onCalibrationComplete={() => setStep('exam')}
        />
      )}

      {/* 4. ADIM — Sınav */}
      {step === 'exam' && userInfo && (
        <Exam
          userInfo={userInfo}
          startDifficultyIndex={difficultyIndex}
          syncMarker={syncMarker}
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

      {/* 5. ADIM — NASA-TLX (her seviye sonrası) */}
      {step === 'nasa' && currentDifficulty && (
        <NasaTLX
          difficulty={currentDifficulty}
          onSubmit={(nasaResult) => {
            syncMarker('nasa_submit', performance.now(), {
              difficulty: currentDifficulty,
              rtlx_score: nasaResult.rtlxScore
            });

            setNasaByDifficulty(prev => ({
              ...prev,
              [currentDifficulty]: {
                rtlxScore: nasaResult.rtlxScore,
                rawValues: nasaResult.rawValues,
                adjustedValues: nasaResult.adjustedValues
              }
            }));

            syncNasa(currentDifficulty, nasaResult.rtlxScore.toFixed(1));
            syncNasaDetailed({
              difficulty: currentDifficulty,
              rtlxScore: nasaResult.rtlxScore,
              rawValues: nasaResult.rawValues,
              adjustedValues: nasaResult.adjustedValues
            });

            // ⚡ Son seviye (zor) bittiyse → UEQ-S
            if (difficultyIndex >= 3) {
              setStep('ueqs');
            } else {
              setStep('exam');
            }
          }}
        />
      )}

      {/* 6. ADIM — UEQ-S Kullanıcı Deneyimi Anketi (⚡ YENİ) */}
      {step === 'ueqs' && (
        <UEQS
          onSubmit={(ueqsResult) => {
            setUeqsData(ueqsResult);
            
            syncMarker('ueqs_submit', performance.now(), {
              pragmatic: ueqsResult.pragmaticScore,
              hedonic: ueqsResult.hedonicScore,
              overall: ueqsResult.overallScore
            });

            // İsteğe bağlı: backend'e ayrı endpoint ile gönder
            // (Şu an useSession.js'de ueqs endpoint'i yoksa eklenmesi gerek)
            // syncUeqs(ueqsResult);
            
            console.log('[App] UEQ-S tamamlandı:', ueqsResult);
            setStep('result');
          }}
        />
      )}

      {/* 7. ADIM — Sonuç */}
      {step === 'result' && (
        <Result
          userInfo={userInfo}
          answers={answers}
          nasaByDifficulty={nasaByDifficulty}
          ueqsData={ueqsData}                   // ⚡ YENİ
          eegTimeline={timeline}
          sessionId={sessionId}
          onRestart={resetApp}
        />
      )}

    </div>
  );
}

export default App;
