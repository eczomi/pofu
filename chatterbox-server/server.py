"""
Pofu — yerel ses (TTS) sunucusu.

Iki motor destekler:

  edge        (VARSAYILAN) Microsoft Edge'in dogal noral sesleri (edge-tts).
              Kurulum saniyeler surer, ses cok akici, Turkce dahil yuzlerce ses.
              Internet gerektirir; metin Microsoft'un TTS servisine gider.

  chatterbox  Resemble AI'nin acik kaynak yerel modeli. Tamamen cevrimdisi,
              ama ~GB'larca model indirir ve GPU olmadan yavas calisir.

Kurulum (edge icin — onerilen):  proje kokunde  `npm run voices`
  (ya da elle: python -m venv .venv && .venv\\Scripts\\pip install -U edge-tts)

Uc noktalar:
    GET  /health  -> {"ok": true, "engine": "edge", "error": "..."}  (son hata varsa)
    GET  /voices  -> [{"name": "tr-TR-EmelNeural", "lang": "tr-TR", "gender": "Female"}, ...]
    POST /tts     -> govde: {"text": "...", "language": "tr", "voice": "opsiyonel",
                             "gender": "female|male", "rate": 1.0}
                     yanit: audio/mpeg (edge) ya da audio/wav (chatterbox)

Pofu bu sunucuyu acilista kendisi baslatir (.venv varsa).
"""

import argparse
import asyncio
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ENGINE = "edge"
LAST_ERROR = ""

# ---- edge-tts ----------------------------------------------------------------
# Dil basina varsayilan dogal sesler (kadin / erkek). /tts govdesindeki "voice"
# bunlari ezer; "gender" ise hangi sutunun secilecegini belirler.
EDGE_DEFAULTS = {
    "tr": ("tr-TR-EmelNeural", "tr-TR-AhmetNeural"),
    "en": ("en-US-AriaNeural", "en-US-GuyNeural"),
    "de": ("de-DE-KatjaNeural", "de-DE-ConradNeural"),
    "fr": ("fr-FR-DeniseNeural", "fr-FR-HenriNeural"),
    "es": ("es-ES-ElviraNeural", "es-ES-AlvaroNeural"),
    "it": ("it-IT-ElsaNeural", "it-IT-DiegoNeural"),
    "pt": ("pt-BR-FranciscaNeural", "pt-BR-AntonioNeural"),
    "nl": ("nl-NL-ColetteNeural", "nl-NL-MaartenNeural"),
    "pl": ("pl-PL-ZofiaNeural", "pl-PL-MarekNeural"),
    "sv": ("sv-SE-SofieNeural", "sv-SE-MattiasNeural"),
    "ru": ("ru-RU-SvetlanaNeural", "ru-RU-DmitryNeural"),
    "ar": ("ar-SA-ZariyahNeural", "ar-SA-HamedNeural"),
    "hi": ("hi-IN-SwaraNeural", "hi-IN-MadhurNeural"),
    "el": ("el-GR-AthinaNeural", "el-GR-NestorasNeural"),
    "he": ("he-IL-HilaNeural", "he-IL-AvriNeural"),
    "th": ("th-TH-PremwadeeNeural", "th-TH-NiwatNeural"),
    "ja": ("ja-JP-NanamiNeural", "ja-JP-KeitaNeural"),
    "ko": ("ko-KR-SunHiNeural", "ko-KR-InJoonNeural"),
    "zh": ("zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"),
}

_edge_voices_cache = None


def edge_list_voices():
    global _edge_voices_cache
    if _edge_voices_cache is None:
        import edge_tts
        voices = asyncio.run(edge_tts.list_voices())
        _edge_voices_cache = [
            {"name": v["ShortName"], "lang": v["Locale"], "gender": v.get("Gender", "")}
            for v in voices
        ]
    return _edge_voices_cache


def pick_default_voice(language, gender):
    pair = EDGE_DEFAULTS.get((language or "en")[:2].lower(), EDGE_DEFAULTS["en"])
    return pair[1] if str(gender).lower().startswith("m") else pair[0]


def rate_str(rate):
    """1.0 -> '+0%', 1.25 -> '+25%', 0.8 -> '-20%'"""
    try:
        r = float(rate or 1.0)
    except (TypeError, ValueError):
        r = 1.0
    pct = int(round((r - 1.0) * 100))
    pct = max(-50, min(100, pct))
    return ("+" if pct >= 0 else "") + str(pct) + "%"


def edge_synth(text, language, voice, gender="female", rate=1.0):
    import edge_tts

    if not voice:
        voice = pick_default_voice(language, gender)

    async def run():
        com = edge_tts.Communicate(text, voice, rate=rate_str(rate))
        buf = io.BytesIO()
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()

    return asyncio.run(run()), "audio/mpeg"


# ---- chatterbox ---------------------------------------------------------------
_cb_model = None
_cb_lock = threading.Lock()


def cb_synth(text, language, _voice, _gender="female", _rate=1.0):
    global _cb_model
    import soundfile as sf
    with _cb_lock:
        if _cb_model is None:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"[pofu-ses] Chatterbox modeli yukleniyor... (device={device})")
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            _cb_model = ChatterboxMultilingualTTS.from_pretrained(device=device)
            print("[pofu-ses] Model hazir.")
    wav = _cb_model.generate(text, language_id=(language or "en")[:2].lower())
    try:
        arr = wav.squeeze(0).detach().cpu().numpy()
    except AttributeError:
        arr = wav
    buf = io.BytesIO()
    sf.write(buf, arr, int(getattr(_cb_model, "sr", 24000)), format="WAV")
    return buf.getvalue(), "audio/wav"


# ---- HTTP ----------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            self._send(200, json.dumps({"ok": True, "engine": ENGINE, "error": LAST_ERROR}).encode())
        elif self.path.startswith("/voices"):
            if ENGINE == "edge":
                try:
                    self._send(200, json.dumps(edge_list_voices()).encode())
                except Exception as exc:  # noqa: BLE001
                    self._send(500, json.dumps({"error": str(exc)}).encode())
            else:
                self._send(200, b"[]")
        else:
            self._send(404, b"{}")

    def do_POST(self):
        global LAST_ERROR
        if not self.path.startswith("/tts"):
            self._send(404, b"{}")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            length = 0
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8", errors="replace") or "{}")
        except Exception:
            data = {}
        text = (data.get("text") or "").strip()
        language = (data.get("language") or "en")
        voice = (data.get("voice") or "").strip()
        gender = (data.get("gender") or "female")
        rate = data.get("rate") or 1.0
        if not text:
            self._send(400, b'{"error":"text gerekli"}')
            return
        try:
            if ENGINE == "edge":
                audio, ctype = edge_synth(text, language, voice, gender, rate)
            else:
                audio, ctype = cb_synth(text, language, voice, gender, rate)
            LAST_ERROR = ""
            self._send(200, audio, ctype)
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            if "403" in msg:
                msg = "403: edge-tts guncel degil. Ayarlar > Dogal sesleri kur/guncelle (ya da `npm run voices`)."
            LAST_ERROR = msg
            print("[pofu-ses] hata:", msg)
            self._send(500, json.dumps({"error": msg}).encode())

    def log_message(self, *args):
        pass  # sessiz


def main():
    global ENGINE
    ap = argparse.ArgumentParser(description="Pofu ses sunucusu")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=7888)
    ap.add_argument("--engine", choices=["edge", "chatterbox"], default="edge")
    args = ap.parse_args()
    ENGINE = args.engine

    print(f"[pofu-ses] http://{args.host}:{args.port} (engine={ENGINE})")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
