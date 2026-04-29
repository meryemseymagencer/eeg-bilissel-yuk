/**
 * useEEGStream
 * ------------
 * WebSocket /ws/eeg/{sessionId} bağlantısını yönetir.
 *
 * Her epoch (≈1 sn) backend şu JSON'u gönderir:
 *   { timestamp: float, channels: {AF3:..., ...}, cognitive_load: "low"|"medium"|"high" }
 *
 * Dönen değerler:
 *   cognitiveLoad  – en son sınıf etiketi ("low"|"medium"|"high"|null)
 *   latestSample   – ham son örnek nesnesi
 *   timeline       – [{ timestamp, cognitive_load }, ...] tüm oturum için
 *   connected      – WebSocket bağlantı durumu (boolean)
 *   eegError       – hata mesajı string veya null
 *
 * active=false geçildiğinde (örn. 'form' veya 'result' adımında)
 * bağlantı kapatılır ve yeniden bağlanma denemesi yapılmaz.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const WS_BASE = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
const RECONNECT_DELAY_MS = 3000;

const useEEGStream = (sessionId, active = true) => {
  const [cognitiveLoad, setCognitiveLoad] = useState(null);
  const [latestSample, setLatestSample] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [connected, setConnected] = useState(false);
  const [eegError, setEegError] = useState(null);
  
  // 1. YENİ EKLENDİ: Backend'in hangi aşamada olduğunu (calibrating/testing) tutacak
  const [appState, setAppState] = useState(null);

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const activeRef = useRef(active);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectRef.current);
    reconnectRef.current = null;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!sessionIdRef.current || !activeRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `${WS_BASE}/ws/eeg/${sessionIdRef.current}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      setEegError('WebSocket başlatılamadı.');
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setEegError(null);
    };

    ws.onmessage = (event) => {
      let sample;
      try {
        sample = JSON.parse(event.data);
      } catch {
        return; 
      }

      setLatestSample(sample);
      setCognitiveLoad(sample.cognitive_load ?? null);
      
      // 2. YENİ EKLENDİ: Backend'den gelen kalibrasyon/test durumunu güncelle
      setAppState(sample.app_state ?? null); 

      // 3. YENİ EKLENDİ: STEW formatı için 128 Hz (batch_data) paketini listeye ekle
      setTimeline(prev => {
        // Eğer backend 512 satırlık paket yolladıysa, hepsini tek seferde ekle
        if (sample.batch_data) {
          return [...prev, ...sample.batch_data];
        }
        
        // Eğer paket yoksa (eski usül), tek satır ekle
        return [
          ...prev,
          { 
            timestamp: sample.timestamp, 
            cognitive_load: sample.cognitive_load,
            channels: sample.channels 
          },
        ];
      });
    };

    ws.onerror = () => {
      setEegError('EEG akışı bağlantı hatası.');
      setConnected(false);
    };

    ws.onclose = (event) => {
      setConnected(false);
      if (event.code === 4404) {
        setEegError('EEG: Geçersiz session. Sayfa yenilenirse düzelir.');
        return;
      }
      if (activeRef.current && sessionIdRef.current) {
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }, []); 

  useEffect(() => {
    if (active && sessionId) {
      connect();
    } else {
      disconnect();
    }
    return disconnect; 
  }, [active, sessionId, connect, disconnect]);

  const getTimeline = useCallback(() => timeline, [timeline]);

  return {
    cognitiveLoad,
    latestSample,
    timeline,
    connected,
    eegError,
    getTimeline,
    appState, // 4. YENİ EKLENDİ: App.js bu state'i kullanarak ekranı değiştirecek
  };
};

export default useEEGStream;