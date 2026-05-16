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
 */

import { useState, useCallback, useRef } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const useSession = () => {
  const [sessionId, setSessionId] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null);
  const sessionIdRef = useRef(null);

  // -----------------------------------------------------------------------
  // Düşük seviyeli HTTP helper
  // -----------------------------------------------------------------------
  const _post = useCallback(async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }, []);

  // -----------------------------------------------------------------------
  // Yeni oturum oluştur
  // -----------------------------------------------------------------------
  const createSession = useCallback(async (userInfo) => {
    try {
      const res = await _post('/api/session', { userInfo });
      const data = await res.json();
      sessionIdRef.current = data.session_id;
      setSessionId(data.session_id);
      setBackendOnline(true);

      // Backend kalibrasyon süresini de döndürüyor (yeni özellik)
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

  // -----------------------------------------------------------------------
  // Cevapları senkronize et
  // -----------------------------------------------------------------------
  const syncAnswers = useCallback(async (answers) => {
    if (!sessionIdRef.current) return;
    try {
      await _post(`/api/session/${sessionIdRef.current}/answers`, { answers });
    } catch (err) {
      console.warn('[useSession] Cevap senkronizasyonu başarısız:', err.message);
    }
  }, [_post]);

  // -----------------------------------------------------------------------
  // NASA-TLX senkronize et (ESKİ FORMAT — geri uyumluluk için saklandı)
  // -----------------------------------------------------------------------
  const syncNasa = useCallback(async (difficulty, average) => {
    if (!sessionIdRef.current) return;
    try {
      await _post(`/api/session/${sessionIdRef.current}/nasa`, { difficulty, average });
    } catch (err) {
      console.warn('[useSession] NASA senkronizasyonu başarısız:', err.message);
    }
  }, [_post]);

  // -----------------------------------------------------------------------
  // ⚡ YENİ: NASA-TLX detaylı (raw + adjusted + rtlx skor)
  // -----------------------------------------------------------------------
  /**
   * Detaylı NASA-TLX skorlarını backend'e gönderir.
   * data = {
   *   difficulty: "kolay" | "orta" | "zor",
   *   rtlxScore: 45.5,
   *   rawValues: { mental, physical, temporal, performance, effort, frustration },
   *   adjustedValues: { ...aynı boyutlar, performance ters çevrilmiş... }
   * }
   */
  const syncNasaDetailed = useCallback(async (data) => {
    if (!sessionIdRef.current) return;
    try {
      await _post(`/api/session/${sessionIdRef.current}/nasa-detailed`, data);
    } catch (err) {
      console.warn('[useSession] NASA detaylı senkronizasyon başarısız:', err.message);
    }
  }, [_post]);

  // -----------------------------------------------------------------------
  // ⚡ YENİ: Event marker gönder (EEG-davranış eşleştirmesi için kritik)
  // -----------------------------------------------------------------------
  /**
   * EEG kaydını sınav olaylarıyla eşleştirmek için kullanılır.
   *
   * Parametreler:
   *   eventType   : "question_onset" | "question_response" | "question_timeout"
   *                 | "fixation_onset" | "block_start" | "block_end"
   *                 | "nasa_onset" | "nasa_submit" | "calibration_start"
   *   timestampMs : performance.now() değeri (frontend yüksek hassasiyet)
   *   metadata    : { question_id, difficulty, category, is_correct, rt_ms, ... }
   *
   * Örnek kullanım:
   *   syncMarker('question_onset', performance.now(), {
   *     question_id: 15, difficulty: 'orta', category: 'C'
   *   });
   *
   * ⚠️ NOT: async fonksiyon ama await beklenmiyor (fire-and-forget).
   *        UI gecikmesin diye. Hata olursa sessizce yutulur.
   */
  const syncMarker = useCallback((eventType, timestampMs, metadata = {}) => {
    if (!sessionIdRef.current) return;

    // await beklemiyoruz, fire-and-forget
    _post(`/api/session/${sessionIdRef.current}/marker`, {
      event_type: eventType,
      timestamp_ms: timestampMs,
      metadata
    }).catch(err => {
      console.warn(`[useSession] Marker gönderilemedi (${eventType}):`, err.message);
    });
  }, [_post]);

  // -----------------------------------------------------------------------
  // Export: STEW formatında ham EEG
  // -----------------------------------------------------------------------
  const downloadStewData = useCallback(() => {
    if (!sessionIdRef.current) {
      console.warn('[useSession] Oturum yok, STEW indirme yapılamaz.');
      return;
    }
    window.open(`${API_BASE}/api/session/${sessionIdRef.current}/export/stew`, '_blank');
  }, []);

  // -----------------------------------------------------------------------
  // ⚡ YENİ: Export: Tam veri (JSON) — analiz için ana dosya
  // -----------------------------------------------------------------------
  const downloadFullData = useCallback(() => {
    if (!sessionIdRef.current) {
      console.warn('[useSession] Oturum yok, JSON indirme yapılamaz.');
      return;
    }
    window.open(`${API_BASE}/api/session/${sessionIdRef.current}/export/full`, '_blank');
  }, []);

  // -----------------------------------------------------------------------
  // ⚡ YENİ: Export: Marker'lar CSV
  // -----------------------------------------------------------------------
  const downloadMarkers = useCallback(() => {
    if (!sessionIdRef.current) {
      console.warn('[useSession] Oturum yok, marker indirme yapılamaz.');
      return;
    }
    window.open(`${API_BASE}/api/session/${sessionIdRef.current}/export/markers`, '_blank');
  }, []);

  // -----------------------------------------------------------------------
  // Sıfırla
  // -----------------------------------------------------------------------
  const reset = useCallback(() => {
    sessionIdRef.current = null;
    setSessionId(null);
    setBackendOnline(null);
  }, []);

  return {
    // State
    sessionId,
    backendOnline,

    // Session
    createSession,
    reset,

    // Sync (data POST)
    syncAnswers,
    syncNasa,             // Eski (geri uyumluluk)
    syncNasaDetailed,     // ⚡ Yeni
    syncMarker,           // ⚡ Yeni — Exam.js için kritik

    // Export (GET, yeni sekme açar)
    downloadStewData,
    downloadFullData,     // ⚡ Yeni
    downloadMarkers,      // ⚡ Yeni
  };
};

export default useSession;