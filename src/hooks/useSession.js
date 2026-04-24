/**
 * useSession
 * ----------
 * Backend session yönetimi.
 *
 * - createSession(userInfo)  → POST /api/session  → session_id döner
 * - syncAnswers(answers)     → POST /api/session/{id}/answers
 * - syncNasa(difficulty, avg)→ POST /api/session/{id}/nasa
 * - reset()                  → state temizler
 *
 * Backend erişilemezse tüm çağrılar sessizce başarısız olur;
 * uygulama akışı bozulmaz (graceful degradation).
 */

import { useState, useCallback, useRef } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const useSession = () => {
  const [sessionId, setSessionId] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null); // null=bilinmiyor
  const sessionIdRef = useRef(null); // async callback'lerde güncel değer için

  const _post = useCallback(async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }, []);

  /**
   * Yeni bir backend oturumu başlatır.
   * UserForm'dan alınan userInfo gönderilir.
   * Döner: session_id string veya null (backend kapalıysa)
   */
  const createSession = useCallback(async (userInfo) => {
    try {
      const res = await _post('/api/session', { userInfo });
      const data = await res.json();
      sessionIdRef.current = data.session_id;
      setSessionId(data.session_id);
      setBackendOnline(true);
      return data.session_id;
    } catch (err) {
      console.warn('[useSession] Backend erişilemedi, oturum oluşturulamadı:', err.message);
      setBackendOnline(false);
      return null;
    }
  }, [_post]);

  /**
   * Bir zorluk seviyesinin cevaplarını backend'e gönderir.
   * App.js → onFinishLevel callback'inden çağrılır.
   */
  const syncAnswers = useCallback(async (answers) => {
    if (!sessionIdRef.current) return;
    try {
      await _post(`/api/session/${sessionIdRef.current}/answers`, { answers });
    } catch (err) {
      console.warn('[useSession] Cevap senkronizasyonu başarısız:', err.message);
    }
  }, [_post]);

  /**
   * NASA-TLX ortalamasını backend'e gönderir.
   * App.js → NasaTLX onSubmit callback'inden çağrılır.
   *
   * difficulty : "kolay" | "orta" | "zor"
   * average    : "12.3" (string, 1 ondalık)
   */
  const syncNasa = useCallback(async (difficulty, average) => {
    if (!sessionIdRef.current) return;
    try {
      await _post(`/api/session/${sessionIdRef.current}/nasa`, { difficulty, average });
    } catch (err) {
      console.warn('[useSession] NASA senkronizasyonu başarısız:', err.message);
    }
  }, [_post]);
  /**
   * Arka planda biriken 128Hz'lik ham EEG verisini 
   * STEW (txt/bilimsel gösterim) formatında indirir.
   */
  const downloadStewData = useCallback(() => {
    if (!sessionIdRef.current) {
      console.warn('[useSession] Oturum yok, indirme yapılamaz.');
      return;
    }
    // Tarayıcıda yeni sekme açarak dosya indirme işlemini tetikler
    window.open(`${API_BASE}/api/session/${sessionIdRef.current}/export/stew`, '_blank');
  }, []);
  /** Uygulamayı yeniden başlatırken çağrılır. */
  const reset = useCallback(() => {
    sessionIdRef.current = null;
    setSessionId(null);
    setBackendOnline(null);
  }, []);

  return { sessionId, backendOnline, createSession, syncAnswers, syncNasa, reset, downloadStewData }; 
};

export default useSession;
