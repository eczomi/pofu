"""
Okur — yerel ses (TTS) sunucusu.

Iki motor destekler:

  edge        (VARSAYILAN) Microsoft Edge'in dogal noral sesleri (edge-tts).
              Kurulum saniyeler surer, ses cok akici, Turkce dahil yuzlerce ses.
              Internet gerektirir; metin Microsoft'un TTS servisine gider.

  chatterbox  Resemble AI'nin acik kaynak yerel modeli. Tamamen cevrimdisi,
              ama ~GB'larca model indirir ve GPU olmadan yavas calisir.

Kurulum (edge icin — onerilen):
    python -m venv .venv
    .venv\\Scripts\\pip install edge-tts
    .venv\\Scripts\\python server.py

Chatterbox icin ek olarak:
    .venv\\Scripts\\pip install chatterbox-tts soundfile
    .venv\\Scripts\\python server.py --engine chatterbox

Uc noktalar:
    GET  /health           -> {"ok": true, "engine": "edge"}
    GET  /voices           -> [{"name": "tr-TR-EmelNeural", "lang": "tr-TR", "gender": "Female"}, ...]
    POST /tts              -> govde: {"text": "...", "language": "tr", "voice": "opsiyonel"}
                              yanit: audio/mpeg (edge) ya da audio/wav (chatterbox)

Okur uygulamasi bu sunucuyu acilista kendisi baslatir (.venv varsa).
"""

import argparse
import asyncio
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ENGINE = "edge"

# ---- edge-tts ----------------------------------------------------------------
# Dil basina varsayilan dogal ses (kullanici /tts govdesinde "voice" ile ezebilir)
EDGE_DEFAULTS = {
    "tr": "tr-TR-EmelNeural",
    "en": "en-US-AriaNeural",
    "de": "de-DE-KatjaNeural",
    "fr": "fr-FR-DeniseNeural",
    "es": "es-ES-ElviraNeural",
    "it": "it-IT-ElsaNeural",
    "pt": "pt-BR-FranciscaNeural",
    "nl": "nl-NL-ColetteNeural",
    "pl": "pl-PL-ZofiaNeural",
    "sv": "sv-SE-SofieNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "ar": "ar-SA-ZariyahNeural",
    "hi": "hi-IN-SwaraNeural",
    "el": "el-GR-AthinaNeural",
    "he": "he-IL-HilaNeural",
    "th": "th-TH-PremwadeeNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
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


def edge_synth(text, language, voice):
    import edge_tts

    if not voice:
        voice = EDGE_DEFAULTS.get((language or "en")[:2].lower(), EDGE_DEFAULTS["en"])

    async def run():
        com = edge_tts.Communicate(text, voice)
        buf = io.BytesIO()
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()

    return asyncio.run(run()), "audio/mpeg"


# ---- chatterbox ---------------------------------------------------------------
_cb_model = None
_cb_lock = threading.Lock()


def cb_synth(text, language, _voice):
    global _cb_model
    import soundfile as sf
    with _cb_lock:
        if _cb_model is None:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"[okur-ses] Chatterbox modeli yukleniyor... (device={device})")
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            _cb_model = ChatterboxMultilingualTTS.from_pretrained(device=device)
            print("[okur-ses] Model hazir.")
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
            self._send(200, json.dumps({"ok": True, "engine": ENGINE}).encode())
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
        if not self.path.startswith("/tts"):
            self._send(404, b"{}")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            length = 0
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw or b"{}")
        except Exception:
            data = {}
        text = (data.get("text") or "").strip()
        language = (data.get("language") or "en")
        voice = (data.get("voice") or "").strip()
        if not text:
            self._send(400, b'{"error":"text gerekli"}')
            return
        try:
            if ENGINE == "edge":
                audio, ctype = edge_synth(text, language, voice)
            else:
                audio, ctype = cb_synth(text, language, voice)
            self._send(200, audio, ctype)
        except Exception as exc:  # noqa: BLE001
            self._send(500, json.dumps({"error": str(exc)}).encode())

    def log_message(self, *args):
        pass  # sessiz


def main():
    global ENGINE
    ap = argparse.ArgumentParser(description="Okur ses sunucusu")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=7888)
    ap.add_argument("--engine", choices=["edge", "chatterbox"], default="edge")
    args = ap.parse_args()
    ENGINE = args.engine

    print(f"[okur-ses] http://{args.host}:{args.port} (engine={ENGINE})")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
