"""
Okur — opsiyonel Chatterbox TTS sunucusu.

Bu KUCUK bir yerel HTTP sunucusudur. Okur uygulamasi (Electron) buraya
metin gonderir, karsiliginda WAV sesi alir. Calismak zorunda DEGIL:
sunucu kapaliyken Okur otomatik olarak tarayicinin kendi sesini kullanir.

Chatterbox, Resemble AI'nin acik kaynak TTS modelidir. Cok dilli surumu
(ChatterboxMultilingualTTS) Turkce dahil ~23 dili destekler.

Kurulum:
    python -m venv .venv
    .venv\\Scripts\\activate         (Windows)      |  source .venv/bin/activate  (mac/linux)
    pip install -r requirements.txt
    python server.py                 (varsayilan: cok dilli, port 7888)

Ilk /tts isteginde model indirilip yuklenir; o istek yavas olur, sonrasi hizli.
GPU (CUDA) varsa otomatik kullanilir; yoksa CPU (yavas ama calisir).

Uc noktalar:
    GET  /health          -> {"ok": true}
    POST /tts             -> govde: {"text": "...", "language": "tr"}  => audio/wav
"""

import argparse
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

_model = None
_lock = threading.Lock()
_use_multilingual = True


def get_model():
    global _model
    with _lock:
        if _model is None:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"[okur] Model yukleniyor... (device={device}, "
                  f"multilingual={_use_multilingual})")
            if _use_multilingual:
                from chatterbox.mtl_tts import ChatterboxMultilingualTTS
                _model = ChatterboxMultilingualTTS.from_pretrained(device=device)
            else:
                from chatterbox.tts import ChatterboxTTS
                _model = ChatterboxTTS.from_pretrained(device=device)
            print("[okur] Model hazir.")
    return _model


def synth_wav(text, language):
    import soundfile as sf
    model = get_model()
    if _use_multilingual:
        wav = model.generate(text, language_id=(language or "en"))
    else:
        wav = model.generate(text)
    # wav: torch tensor [1, N] -> numpy [N]
    try:
        arr = wav.squeeze(0).detach().cpu().numpy()
    except AttributeError:
        arr = wav  # zaten numpy ise
    buf = io.BytesIO()
    sf.write(buf, arr, int(getattr(model, "sr", 24000)), format="WAV")
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            body = b'{"ok":true}'
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if not self.path.startswith("/tts"):
            self.send_response(404)
            self.end_headers()
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
        language = (data.get("language") or "en")[:2].lower()
        if not text:
            self.send_response(400)
            self._cors()
            self.end_headers()
            return
        try:
            audio = synth_wav(text, language)
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except Exception as exc:  # noqa: BLE001
            msg = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def log_message(self, *args):
        pass  # sessiz


def main():
    ap = argparse.ArgumentParser(description="Okur Chatterbox TTS sunucusu")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=7888)
    ap.add_argument("--english", action="store_true",
                    help="Cok dilli yerine yalniz Ingilizce temel modeli kullan")
    args = ap.parse_args()

    global _use_multilingual
    _use_multilingual = not args.english

    print(f"[okur] Chatterbox sunucusu: http://{args.host}:{args.port}")
    print("[okur] Model ilk istekte yuklenecek (biraz surebilir).")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
