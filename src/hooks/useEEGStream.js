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

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  // Ref kopyası: WebSocket handler'larında stale closure olmaz
  const activeRef = useRef(active);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectRef.current);
    reconnectRef.current = null;
    if (wsRef.current) {
      // onclose'u temizle: kapatma döngüsü başlamasın
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
    // Zaten açık bağlantı varsa yeniden bağlanma
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
        return; // geçersiz JSON → sessizce geç
      }

      setLatestSample(sample);
      setCognitiveLoad(sample.cognitive_load ?? null);
      setTimeline(prev => [
        ...prev,
        { 
          timestamp: sample.timestamp, 
          cognitive_load: sample.cognitive_load,
          channels: sample.channels // <-- YENİ EKLENEN SATIR: 14 kanalın verisini kaydet
        },
      ]);
    };

    ws.onerror = () => {
      setEegError('EEG akışı bağlantı hatası.');
      setConnected(false);
    };

    ws.onclose = (event) => {
      setConnected(false);
      // Kod 4404: backend session bulunamadı → yeniden deneme
      if (event.code === 4404) {
        setEegError('EEG: Geçersiz session. Sayfa yenilenirse düzelir.');
        return;
      }
      // Aktif modda yeniden bağlan
      if (activeRef.current && sessionIdRef.current) {
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }, []); // kasıtlı boş deps — tüm değerler ref üzerinden okunuyor

  // active veya sessionId değiştiğinde bağlantıyı aç/kapat
  useEffect(() => {
    if (active && sessionId) {
      connect();
    } else {
      disconnect();
    }
    return disconnect; // unmount temizliği
  }, [active, sessionId, connect, disconnect]);

  /** Anlık kopyasını döner (Result.js'e props olarak geçmek için). */
  const getTimeline = useCallback(() => timeline, [timeline]);

  return {
    cognitiveLoad,
    latestSample,
    timeline,
    connected,
    eegError,
    getTimeline,
  };
};

export default useEEGStream;
