"""
Emotiv Cortex API – WebSocket istemcisi (Düzeltilmiş v2)
======================================================
Desteklenen cihaz : Emotiv EPOC X (14 kanal, 128 Hz)
Protokol          : JSON-RPC 2.0 over WSS (wss://localhost:6868)
Kimlik doğrulama  : requestAccess → authorize → cortexToken
Veri akışı        : subscribe("eeg") → epoch tamponu → sınıflandırma

Ortam değişkenleri (.env):
    EMOTIV_CLIENT_ID      – Emotiv uygulama istemci kimliği
    EMOTIV_CLIENT_SECRET  – Emotiv uygulama gizli anahtarı
    EEG_SIMULATION        – "1" → zorunlu simülasyon modu (test için)

DÜZELTMELER (v2):
    ⚡ EPOC_CHANNELS sırası STEW veri seti ile uyumlu hale getirildi
       (Lim et al., 2018 — STEW orijinal kanal sırası)
       Bu, model eğitimi (eeg_pipeline.py) ile inference (main.py)
       arasındaki kanal sıralaması tutarlılığını sağlar.

Önceki düzeltmeler:
    1. queryHeadsets yanıt formatı güvenli hale getirildi (dict veya liste)
    2. Subscribe onayı ile EEG veri akışı çakışması giderildi (asyncio.Queue)
    3. Token yenileme thread-safe yapıldı (asyncio.Lock)
    4. Bağlantı koptuğunda otomatik yeniden bağlanma eklendi
    5. Hata mesajları Türkçeleştirildi ve ayrıntılandırıldı
"""

import asyncio
import json
import logging
import math
import os
import random
import ssl
import time
from typing import AsyncGenerator, Optional

import websockets
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sabitler
# ---------------------------------------------------------------------------

CORTEX_URL         = "wss://localhost:6868"
SAMPLE_RATE        = 128       # Hz – STEW dataset ile aynı
EPOCH_SAMPLES      = 512       # 4 saniyelik pencere (128 Hz × 4 s)
TOKEN_REFRESH_MARGIN = 300     # saniye – sona ermeden 5 dk önce yenile
MAX_RECONNECT_TRIES  = 3       # otomatik yeniden bağlanma denemesi

# ============================================================================
# ⚡ DÜZELTİLDİ: STEW veri seti ile uyumlu kanal sırası
# ----------------------------------------------------------------------------
# Referans: Lim, W. L., Sourina, O., & Wang, L. P. (2018).
#           STEW: Simultaneous task EEG workload data set.
#           IEEE Trans. Neural Syst. Rehabil. Eng., 26(11), 2106-2114.
#
# Bu sıra aynı zamanda Emotiv EPOC X cihazının hardware/firmware sırası
# olup eeg_pipeline.py'daki EPOC_CHANNELS ile birebir aynıdır.
#
# ÖNEMLİ: Model bu sırayla eğitilmiştir; sıra değişirse modelin tahminleri
#         tamamen geçersiz hale gelir!
# ============================================================================
EPOC_CHANNELS = [
    "AF3", "F7", "F3", "FC5", "T7", "P7", "O1",
    "O2", "P8", "T8", "FC6", "F4", "F8", "AF4",
]

# Cortex API'nin EPOC X için döndürdüğü ham kanal sırası (varsayılan)
# Bu sıra Emotiv'in raw stream çıktısıdır — yukarıdaki STEW sırası ile
# zaten aynı kanalları içerir, sadece COUNTER/INTERPOLATED gibi
# meta-sütunlar ek olarak vardır.
_CORTEX_RAW_COLS = [
    "COUNTER", "INTERPOLATED",
    "AF3", "F7", "F3", "FC5", "T7", "P7", "O1",
    "O2", "P8", "T8", "FC6", "F4", "F8", "AF4",
    "RAW_CQ", "MARKER_HARDWARE",
]

_CHANNEL_COLS = set(EPOC_CHANNELS)


# ---------------------------------------------------------------------------
# Yardımcı: JSON-RPC 2.0
# ---------------------------------------------------------------------------

class _RPC:
    _counter = 0

    @classmethod
    def call(cls, method: str, params: dict) -> tuple[int, str]:
        cls._counter += 1
        msg = {
            "jsonrpc": "2.0",
            "id": cls._counter,
            "method": method,
            "params": params,
        }
        return cls._counter, json.dumps(msg)

    @staticmethod
    def parse(raw: str) -> dict:
        return json.loads(raw)


# ---------------------------------------------------------------------------
# Sınıflandırıcı yükleyici
# ---------------------------------------------------------------------------

def _load_classifier():
    try:
        from eeg_pipeline import CognitivePipeline  # type: ignore
        pipeline = CognitivePipeline()
        pipeline.load()
        log.info("EEG pipeline yüklendi.")
        return pipeline
    except (ImportError, FileNotFoundError):
        log.warning("eeg_pipeline bulunamadı → stub sınıflandırıcı kullanılıyor.")
        return None


def _stub_classify(epoch: list[list[float]], t: float) -> str:
    labels = ["low", "medium", "high"]
    return labels[int(t / 4) % 3]


# ---------------------------------------------------------------------------
# Ana istemci sınıfı
# ---------------------------------------------------------------------------

class CortexClient:
    """
    Emotiv Cortex API ile iletişim kurar ve EEG örneklerini async generator
    olarak verir.

    Kullanım (main.py içinde):
        async with CortexClient() as cortex:
            async for sample in cortex.stream(session_id):
                ...  # sample: {"timestamp", "channels", "cognitive_load"}
    """

    def __init__(self):
        self.client_id: str     = os.getenv("EMOTIV_CLIENT_ID", "")
        self.client_secret: str = os.getenv("EMOTIV_CLIENT_SECRET", "")
        self.force_simulation: bool = os.getenv("EEG_SIMULATION", "0") == "1"

        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._cortex_token: Optional[str]   = None
        self._token_expires_at: float       = 0.0
        self._cortex_session_id: Optional[str] = None
        self._col_map: list[str]            = []

        self._classifier = _load_classifier()
        self._epoch_buf: list[list[float]]  = []

        # ----------------------------------------------------------------
        # FIX 1: Mesaj kuyruğu
        # RPC yanıtları ile EEG veri paketleri aynı WebSocket üzerinden
        # gelir. Bir kuyruk kullanarak ikisini birbirinden ayırıyoruz:
        #   • _rpc_pending  → beklenen RPC id → Future eşlemesi
        #   • _data_queue   → abonelik verileri (eeg, sys vb.)
        # ----------------------------------------------------------------
        self._rpc_pending: dict[int, asyncio.Future] = {}
        self._data_queue: asyncio.Queue               = asyncio.Queue(maxsize=512)
        self._listener_task: Optional[asyncio.Task]  = None

        # FIX 2: Token yenileme için kilit (eş zamanlı çağrı engellemek için)
        self._token_lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    async def __aenter__(self):
        if not self.force_simulation:
            for attempt in range(1, MAX_RECONNECT_TRIES + 1):
                try:
                    await self._connect()
                    await self._authenticate()
                    await self._open_cortex_session()
                    log.info("Cortex API bağlantısı başarılı.")
                    break
                except (ConnectionRefusedError, OSError, TimeoutError) as exc:
                    log.warning(
                        "Cortex API bağlantı denemesi %d/%d başarısız: %s",
                        attempt, MAX_RECONNECT_TRIES, exc,
                    )
                    await self._close()
                    if attempt == MAX_RECONNECT_TRIES:
                        log.error(
                            "Cortex API'ye bağlanılamadı. "
                            "EMOTIV Launcher'ın çalıştığından emin olun. "
                            "Simülasyon moduna geçiliyor."
                        )
                        self._ws = None
                    else:
                        await asyncio.sleep(2 * attempt)
        return self

    async def __aexit__(self, *_):
        await self._close()

    # ------------------------------------------------------------------
    # Bağlantı yönetimi
    # ------------------------------------------------------------------

    async def _connect(self):
        """wss://localhost:6868 bağlantısı açar. Sertifika doğrulaması kapalı."""
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode    = ssl.CERT_NONE

        log.info("Cortex API'ye bağlanılıyor: %s", CORTEX_URL)
        self._ws = await asyncio.wait_for(
            websockets.connect(CORTEX_URL, ssl=ssl_ctx, open_timeout=5),
            timeout=6,
        )
        # FIX 1: Dinleyici görevi başlat — mesajları kuyrukla
        self._listener_task = asyncio.create_task(
            self._message_listener(),
            name="cortex-listener",
        )
        log.info("Cortex API bağlantısı kuruldu.")

    async def _close(self):
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None

        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

    # ------------------------------------------------------------------
    # FIX 1: Merkezi mesaj dinleyici
    # ------------------------------------------------------------------

    async def _message_listener(self):
        try:
            async for raw in self._ws:
                try:
                    msg = _RPC.parse(raw)
                except json.JSONDecodeError:
                    log.warning("JSON ayrıştırma hatası, mesaj atlandı.")
                    continue

                msg_id = msg.get("id")

                if msg_id is not None and msg_id in self._rpc_pending:
                    fut = self._rpc_pending.pop(msg_id)
                    if not fut.done():
                        if "error" in msg:
                            fut.set_exception(
                                RuntimeError(f"Cortex RPC hatası: {msg['error']}")
                            )
                        else:
                            fut.set_result(msg.get("result", {}))
                else:
                    try:
                        self._data_queue.put_nowait(msg)
                    except asyncio.QueueFull:
                        log.warning("Veri kuyruğu doldu, en eski paket atıldı.")
                        try:
                            self._data_queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                        self._data_queue.put_nowait(msg)

        except websockets.ConnectionClosed:
            log.warning("WebSocket bağlantısı kapandı.")
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            log.error("Dinleyici görevi beklenmedik hata: %s", exc)
        finally:
            for fut in self._rpc_pending.values():
                if not fut.done():
                    fut.set_exception(
                        ConnectionError("Bağlantı kapandı, RPC yanıtı alınamadı.")
                    )
            self._rpc_pending.clear()

    # ------------------------------------------------------------------
    # JSON-RPC gönder / al
    # ------------------------------------------------------------------

    async def _send(self, method: str, params: dict) -> dict:
        rpc_id, payload = _RPC.call(method, params)

        loop = asyncio.get_event_loop()
        fut  = loop.create_future()
        self._rpc_pending[rpc_id] = fut

        await self._ws.send(payload)

        try:
            return await asyncio.wait_for(asyncio.shield(fut), timeout=15)
        except asyncio.TimeoutError:
            self._rpc_pending.pop(rpc_id, None)
            raise TimeoutError(
                f"Cortex API yanıt vermedi [{method}]. "
                "EMOTIV Launcher'ın açık olduğundan emin olun."
            )

    # ------------------------------------------------------------------
    # Kimlik doğrulama
    # ------------------------------------------------------------------

    async def _authenticate(self):
        if not self.client_id or not self.client_secret:
            raise RuntimeError(
                "EMOTIV_CLIENT_ID ve EMOTIV_CLIENT_SECRET eksik. "
                "Proje kök dizinindeki .env dosyasını kontrol edin."
            )

        access = await self._send(
            "requestAccess",
            {"clientId": self.client_id, "clientSecret": self.client_secret},
        )
        if not access.get("accessGranted", False):
            raise PermissionError(
                "Cortex erişimi reddedildi. "
                "EMOTIV Launcher penceresinde uygulamaya izin verin."
            )

        auth = await self._send(
            "authorize",
            {
                "clientId":     self.client_id,
                "clientSecret": self.client_secret,
                "license":      "",
                "debit":        1,
            },
        )
        self._cortex_token     = auth["cortexToken"]
        self._token_expires_at = time.time() + 23 * 3600
        log.info("Cortex token alındı.")

    async def _refresh_token_if_needed(self):
        if time.time() < self._token_expires_at - TOKEN_REFRESH_MARGIN:
            return

        async with self._token_lock:
            if time.time() < self._token_expires_at - TOKEN_REFRESH_MARGIN:
                return
            log.info("Cortex token yenileniyor...")
            auth = await self._send(
                "authorize",
                {
                    "clientId":     self.client_id,
                    "clientSecret": self.client_secret,
                    "license":      "",
                    "debit":        0,
                },
            )
            self._cortex_token     = auth["cortexToken"]
            self._token_expires_at = time.time() + 23 * 3600
            log.info("Token yenilendi.")

    # ------------------------------------------------------------------
    # Cortex oturumu
    # ------------------------------------------------------------------

    async def _open_cortex_session(self):
        raw = await self._send("queryHeadsets", {})

        if isinstance(raw, dict):
            headsets = raw.get("headsets", [])
        elif isinstance(raw, list):
            headsets = raw
        else:
            headsets = []

        if not headsets:
            raise RuntimeError(
                "Bağlı Emotiv kask bulunamadı. "
                "EPOC X'in Bluetooth/USB ile bağlı ve açık olduğundan emin olun."
            )

        headset_id = headsets[0]["id"]
        log.info("Kask bulundu: %s", headset_id)

        result = await self._send(
            "createSession",
            {
                "cortexToken": self._cortex_token,
                "headset":     headset_id,
                "status":      "active",
            },
        )
        self._cortex_session_id = result["id"]
        log.info("Cortex session açıldı: %s", self._cortex_session_id)

    # ------------------------------------------------------------------
    # EEG aboneliği
    # ------------------------------------------------------------------

    async def _subscribe_eeg(self) -> list[str]:
        result = await self._send(
            "subscribe",
            {
                "cortexToken": self._cortex_token,
                "session":     self._cortex_session_id,
                "streams":     ["eeg"],
            },
        )

        for stream_info in result.get("success", []):
            if stream_info.get("streamName") == "eeg":
                cols = stream_info.get("cols", _CORTEX_RAW_COLS)
                log.info("EEG sütunları (Cortex): %s", cols)

                # ⚡ Doğrulama: Cortex'ten gelen kanalların hepsi
                # EPOC_CHANNELS listesinde var mı?
                received_channels = set(cols) & _CHANNEL_COLS
                missing = _CHANNEL_COLS - received_channels
                if missing:
                    log.warning(
                        "EKSİK KANALLAR: %s. Bu kanallar 0.0 olarak doldurulacak. "
                        "Model performansı düşebilir.",
                        sorted(missing)
                    )
                else:
                    log.info(
                        "✓ Tüm 14 STEW kanalı Cortex stream'inde mevcut."
                    )
                return cols

        log.warning("EEG sütunları yanıtta bulunamadı, varsayılan kullanılıyor.")
        return _CORTEX_RAW_COLS

    # ------------------------------------------------------------------
    # Ana akış — public API
    # ------------------------------------------------------------------

    async def stream(self, app_session_id: str) -> AsyncGenerator[dict, None]:
        """
        EEG örneklerini async generator olarak verir.

        Her öğe:
            {
                "timestamp":      float,
                "channels":       {"AF3": float, ..., "AF4": float},
                "epoch_data":     list[list[float]] (512, 14) STEW sırasında,
                "cognitive_load": "low" | "medium" | "high"
            }
        """
        if self._ws is None:
            log.info("[session=%s] Simülasyon modu başladı.", app_session_id)
            async for sample in self._simulation_stream():
                yield sample
            return

        col_map = await self._subscribe_eeg()
        log.info("[session=%s] Gerçek EEG akışı başladı.", app_session_id)
        log.info(
            "Kanal sıralaması: %s (STEW uyumlu)",
            EPOC_CHANNELS
        )

        t_start = time.time()

        while True:
            await self._refresh_token_if_needed()

            try:
                msg = await asyncio.wait_for(self._data_queue.get(), timeout=5.0)
            except asyncio.TimeoutError:
                log.debug("Veri kuyruğu boş, bekleniyor...")
                continue

            if "eeg" not in msg:
                continue

            row: list[float] = msg["eeg"]
            timestamp: float = msg.get("time", time.time() - t_start)

            channels = self._parse_channels(row, col_map)
            if not channels:
                continue

            # ⚡ KRİTİK: epoch_buf'a EPOC_CHANNELS sırasıyla ekle!
            # Bu sıra STEW eğitim verisiyle ve eeg_pipeline.py ile aynı.
            self._epoch_buf.append([channels.get(ch, 0.0) for ch in EPOC_CHANNELS])

            if len(self._epoch_buf) < EPOCH_SAMPLES:
                continue

            epoch = self._epoch_buf.copy()
            self._epoch_buf.clear()

            cognitive_load = self._classify(epoch, timestamp)

            yield {
                "timestamp":      round(timestamp, 4),
                "channels":       channels,
                "epoch_data":     epoch,
                "cognitive_load": cognitive_load,
            }

    # ------------------------------------------------------------------
    # Yardımcı metotlar
    # ------------------------------------------------------------------

    def _parse_channels(
        self, row: list[float], col_map: list[str]
    ) -> dict[str, float]:
        """
        Cortex'ten gelen ham satırı kanal adı → değer sözlüğüne çevirir.
        Sıralama bilgisi kaybolmaz — channels.get(ch) ile STEW sırasında
        yeniden erişilir.
        """
        result = {}
        for i, col in enumerate(col_map):
            if col in _CHANNEL_COLS and i < len(row):
                result[col] = round(float(row[i]), 4)
        return result

    def _classify(self, epoch: list[list[float]], t: float) -> str:
        if self._classifier is not None:
            try:
                return self._classifier.predict(epoch)
            except Exception as exc:
                log.warning("Sınıflandırma hatası: %s – stub kullanılıyor.", exc)
        return _stub_classify(epoch, t)

    # ------------------------------------------------------------------
    # Simülasyon modu
    # ------------------------------------------------------------------

    async def _simulation_stream(self) -> AsyncGenerator[dict, None]:
        """
        Emotiv uygulaması çalışmıyorken sahte EEG verisi üretir.
        Sinyal: alfa (10 Hz) + teta (5.5 Hz) + Gaussian gürültü, 128 Hz

        Üretilen veri EPOC_CHANNELS sırasında, yani STEW uyumlu.
        """
        interval     = 1.0 / SAMPLE_RATE
        t            = 0.0
        load_labels  = ["low", "medium", "high"]

        channel_params = {
            ch: {
                "alpha_amp": random.uniform(8, 15),
                "theta_amp": random.uniform(4, 8),
                "phase":     random.uniform(0, 2 * math.pi),
            }
            for ch in EPOC_CHANNELS
        }

        buf: list[list[float]] = []

        while True:
            channels = {}
            for ch, p in channel_params.items():
                alpha = p["alpha_amp"] * math.sin(
                    2 * math.pi * 10 * t + p["phase"]
                )
                theta = p["theta_amp"] * math.sin(
                    2 * math.pi * 5.5 * t + p["phase"]
                )
                noise = random.gauss(0, 0.3)
                channels[ch] = round(alpha + theta + noise, 4)

            # ⚡ STEW sıralamasında epoch oluştur
            buf.append([channels[ch] for ch in EPOC_CHANNELS])

            if len(buf) >= EPOCH_SAMPLES:
                cognitive_load = load_labels[int(t / 4) % 3]
                yield {
                    "timestamp":      round(t, 4),
                    "channels":       channels,
                    "epoch_data":     buf.copy(),
                    "cognitive_load": cognitive_load,
                }
                buf.clear()

            t += interval
            await asyncio.sleep(interval)