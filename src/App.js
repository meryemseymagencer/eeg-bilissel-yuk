import React, { useState, useEffect } from 'react';
import ConsentForm from './components/ConsentForm';
import UserForm from './components/UserForm';
import Exam from './components/Exam';
import Result from './components/Result';
import NasaTLX from './components/NasaTLX';
import UEQS from './components/UEQS';
import useSession from './hooks/useSession';
import useEEGStream from './hooks/useEEGStream';
import './App.css';

function App() {
  // Akış: consent → form → exam → nasa → result
  //                                 ↓ (opsiyonel)
  //                                ueqs → result (UEQ-S doldurulmuş)
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

  const [ueqsData, setUeqsData] = useState(null);

  const {
    sessionId,
    backendOnline,
    finalizeStatus,        
    createSession,
    finalizeSession,     
    syncAnswers,
    syncNasa,
    syncNasaDetailed,
    syncMarker,
    syncUeqs,              
    reset: resetSession
  } = useSession();

  // YENİ HALİ: Sınav boyunca (exam, nasa) bağlantıyı aktif tut,
  // Result ekranına geçildiğinde bağlantı kapansın ama veriler App.js'de kalsın.
  const eegActive = !!sessionId && (step === 'exam' || step === 'nasa');
  const { cognitiveLoad, timeline, connected: eegConnected, appState } = useEEGStream(sessionId, eegActive);

  useEffect(() => {
    if (step === 'nasa' && currentDifficulty) {
      syncMarker('nasa_onset', performance.now(), {
        difficulty: currentDifficulty
      });
    }
  }, [step, currentDifficulty, syncMarker]);

  // UEQ-S açıldığında marker
  useEffect(() => {
    if (step === 'ueqs' && sessionId) {
      syncMarker('ueqs_onset', performance.now(), {});
    }
  }, [step, sessionId, syncMarker]);

  // ⚡ YENİ: Result ekranı açıldığında session'ı otomatik finalize et
  // (Tüm verileri diske kaydeder: metadata, eeg, answers, nasa, markers, ueqs)
  useEffect(() => {
    if (step === 'result' && sessionId && finalizeStatus === null) {
      console.log('[App] Result ekranı açıldı → finalize tetikleniyor...');
      finalizeSession();
    }
  }, [step, sessionId, finalizeStatus, finalizeSession]);

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
            setStep('exam');
            createSession(fullUserInfo);
          }}
        />
      )}

      {/* 4. ADIM — Sınav */}
      {step === 'exam' && userInfo && (
        <Exam
          userInfo={userInfo}
          startDifficultyIndex={difficultyIndex}
          syncMarker={syncMarker}
          
          // ⚡ YENİ EKLENEN PROPLAR: CalibrationScreen için gerekli veriler
          appState={appState}
          eegConnected={eegConnected}
          // (Eğer useEEGStream'den latestSample çekiyorsan onu da ekle: latestSample={latestSample})

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
          syncMarker={syncMarker}              // ⚡ YENİ: EEG pause marker'ları için
          onSubmit={(nasaResult) => {
            syncMarker('nasa_submit', performance.now(), {
              difficulty: currentDifficulty,
              rtlx_score: nasaResult.rtlxScore,
              auto_submitted: nasaResult.autoSubmitted,
              touched_count: nasaResult.touchedCount
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

            // ⚡ Son seviye bittiyse → direkt Result'a (UEQ-S opsiyonel)
            if (difficultyIndex >= 3) {
              setStep('result');
            } else {
              setStep('exam');
            }
          }}
        />
      )}

      {/* 6. ADIM — Result Ekranı (UEQ-S butonu burada) */}
      {step === 'result' && (
        <Result
          userInfo={userInfo}
          answers={answers}
          nasaByDifficulty={nasaByDifficulty}
          ueqsData={ueqsData}
          eegTimeline={timeline}
          sessionId={sessionId}
          finalizeStatus={finalizeStatus}        // ⚡ YENİ: 'saving'|'saved'|'error'|null
          onRestart={resetApp}
          onOpenUEQS={() => setStep('ueqs')}
        />
      )}

      {/* 7. ADIM — UEQ-S (Opsiyonel, Result'tan açılır) */}
      {step === 'ueqs' && (
        <UEQS
          onSubmit={(ueqsResult) => {
            setUeqsData(ueqsResult);
            
            syncMarker('ueqs_submit', performance.now(), {
              pragmatic: ueqsResult.pragmaticScore,
              hedonic: ueqsResult.hedonicScore,
              overall: ueqsResult.overallScore
            });

            // ⚡ Backend'e UEQ-S verisini gönder (dosyaya kaydedilecek)
            syncUeqs(ueqsResult);

            console.log('[App] UEQ-S tamamlandı:', ueqsResult);
            
            // Geri Result'a dön
            setStep('result');
          }}
          onCancel={() => {
            // Vazgeçerse Result'a geri dön
            setStep('result');
          }}
        />
      )}

    </div>
  );
}

export default App;