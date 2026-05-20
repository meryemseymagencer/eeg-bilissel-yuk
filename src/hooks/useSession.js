/**
 * useSession
 * ----------
 * Backend session yönetimi.
 *
 * Temel akış:
 * - createSession(userInfo)        → POST /api/session              → session_id döner
 * - syncAnswers(answers)           → POST /api/session/{id}/answers
 * - syncNasa(difficulty, avg)      → POST /api/session/{id}/nasa    (eski format, geri uyumluluk)
 * - syncNasaDetailed(data)         → POST /api/session/{id}/nasa-detailed  ⚡ YENİ
 * - syncMarker(type, ts, meta)     → POST /api/session/{id}/marker  ⚡ YENİ (EEG analizi için kritik)
 *
 * Export işlemleri (yeni sekmede indirir):
 * - downloadStewData()             → GET /api/session/{id}/export/stew
 * - downloadFullData()             → GET /api/session/{id}/export/full      ⚡ YENİ
 * - downloadMarkers()              → GET /api/session/{id}/export/markers   ⚡ YENİ
 *
 * - reset()                        → state temizler
 *
 * Backend erişilemezse tüm çağrılar sessizce başarısız olur;
 * uygulama akışı bozulmaz (graceful degradation).
 *
 * ⚠️ ÖNEMLİ: syncMarker fire-and-forget mantığında await beklemez,
 *           çünkü Exam.js'te her soru başlangıcında çağrılıyor ve
 *           UI'ın takılmaması gerekiyor. Backend yavaşsa marker düşebilir
 *           ama bu kabul edilebilir bir trade-off — frontend RT kaydı
 *           her zaman doğru.
 * Yeni özellikler:
 * - syncUeqs(ueqsData)        → POST /api/session/{id}/ueqs       ⚡ YENİ
 * - finalizeSession()         → POST /api/session/{id}/finalize   ⚡ YENİ (otomatik kayıt)
 */

import { useState, useCallback, useRef } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const useSession = () => {
  const [sessionId, setSessionId] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null);
  const [finalizeStatus, setFinalizeStatus] = useState(null);
  const sessionIdRef = useRef(null);

  const _post = useCallback(async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }, []);

  const createSession = useCallback(async (userInfo) => {
    try {
      const res = await _post('/api/session', { userInfo });
      const data = await res.json();
      sessionIdRef.current = data.session_id;
      setSessionId(data.session_id);
      setBackendOnline(true);

      if (data.calibration_duration_sec) {
        console.log(`[useSession] Backend kalibrasyon: ${data.calibration_duration_sec} sn`);
      }
      return data.session_id;
    } catch (err) {
      console.warn('[useSession] Backend erişilemedi:', err.message);
      setBackendOnline(false);
      return null;
    }
  }, [_post]);

  const syncAnswers = useCallback(async (answers) => {
    if (!sessionIdRef.current) return;
    try {
      await _post(`/api/session/${sessionIdRef.current}/answers`, { answers });
    } catch (err) {
      console.warn('[useSession] Cevap senkronizasyonu başarısız:', err.message);
    }
  }, [_post]);

  const syncNasa = useCallback(async (difficulty, average) => {
    if (!sessionIdRef.current) return;
    try {
      await _post(`/api/session/${sessionIdRef.current}/nasa`, { difficulty, average });
    } catch (err) {
      console.warn('[useSession] NASA senkronizasyonu başarısız:', err.message);
    }
  }, [_post]);

  const syncNasaDetailed = useCallback(async (data) => {
    if (!sessionIdRef.current) return;
    try {
      await _post(`/api/session/${sessionIdRef.current}/nasa-detailed`, data);
    } catch (err) {
      console.warn('[useSession] NASA detaylı senkronizasyon başarısız:', err.message);
    }
  }, [_post]);

  const syncMarker = useCallback((eventType, timestampMs, metadata = {}) => {
    if (!sessionIdRef.current) return;
    _post(`/api/session/${sessionIdRef.current}/marker`, {
      event_type: eventType,
      timestamp_ms: timestampMs,
      metadata
    }).catch(err => {
      console.warn(`[useSession] Marker gönderilemedi (${eventType}):`, err.message);
    });
  }, [_post]);

  // ⚡ YENİ: UEQ-S
  const syncUeqs = useCallback(async (ueqsData) => {
    if (!sessionIdRef.current) {
      console.warn('[useSession] Oturum yok, UEQ-S gönderilemiyor');
      return;
    }
    try {
      await _post(`/api/session/${sessionIdRef.current}/ueqs`, ueqsData);
      console.log('[useSession] ✓ UEQ-S backend\'e gönderildi');
    } catch (err) {
      console.warn('[useSession] UEQ-S gönderilemedi:', err.message);
    }
  }, [_post]);

  // ⚡ YENİ: Session'ı sonlandır ve TÜM verileri otomatik dosyaya kaydet
  const finalizeSession = useCallback(async () => {
    if (!sessionIdRef.current) {
      console.warn('[useSession] Oturum yok, finalize edilemiyor');
      return null;
    }
    
    setFinalizeStatus('saving');
    console.log('[useSession] 📦 Session verisi diske kaydediliyor...');
    
    try {
      const res = await _post(`/api/session/${sessionIdRef.current}/finalize`, {});
      const data = await res.json();
      
      setFinalizeStatus('saved');
      console.log('[useSession] ✓ Tüm veriler kaydedildi:', data.folder_path);
      console.log('[useSession]   Dosyalar:', data.files_created);
      
      return data;
    } catch (err) {
      console.error('[useSession] ✗ Finalize başarısız:', err.message);
      setFinalizeStatus('error');
      return null;
    }
  }, [_post]);

  const downloadStewData = useCallback(() => {
    if (!sessionIdRef.current) return;
    window.open(`${API_BASE}/api/session/${sessionIdRef.current}/export/stew`, '_blank');
  }, []);

  const downloadFullData = useCallback(() => {
    if (!sessionIdRef.current) return;
    window.open(`${API_BASE}/api/session/${sessionIdRef.current}/export/full`, '_blank');
  }, []);

  const downloadMarkers = useCallback(() => {
    if (!sessionIdRef.current) return;
    window.open(`${API_BASE}/api/session/${sessionIdRef.current}/export/markers`, '_blank');
  }, []);

  const reset = useCallback(() => {
    sessionIdRef.current = null;
    setSessionId(null);
    setBackendOnline(null);
    setFinalizeStatus(null);
  }, []);

  return {
    sessionId,
    backendOnline,
    finalizeStatus,        // ⚡ YENİ

    createSession,
    finalizeSession,       // ⚡ YENİ
    reset,

    syncAnswers,
    syncNasa,
    syncNasaDetailed,
    syncMarker,
    syncUeqs,              // ⚡ YENİ

    downloadStewData,
    downloadFullData,
    downloadMarkers,
  };
};

export default useSession;