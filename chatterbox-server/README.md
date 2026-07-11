# Chatterbox TTS sunucusu (opsiyonel)

Okur varsayılan olarak **tarayıcının kendi sesini** (Web Speech / işletim
sistemi sesleri) kullanır — kurulum gerektirmez, hemen çalışır. Daha doğal ve
tutarlı bir ses istersen bu küçük sunucuyu çalıştırabilirsin; Okur onu otomatik
algılayıp ona geçer.

[Chatterbox](https://github.com/resemble-ai/chatterbox), Resemble AI'nin açık
kaynak TTS modelidir. Çok dilli sürümü Türkçe dahil ~23 dili destekler.

## Kurulum

```bash
cd chatterbox-server
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt
python server.py
```

- İlk `/tts` isteğinde model indirilir/yüklenir (birkaç GB, biraz sürer). Sonrası hızlıdır.
- GPU (CUDA) varsa otomatik kullanılır; yoksa CPU'da çalışır (yavaş ama çalışır).
- Yalnız İngilizce (daha hafif) temel model için: `python server.py --english`
- Farklı port: `python server.py --port 7000` → Okur ayarlarında `chatterboxUrl`'i güncelle.

## Uç noktalar

| Metot | Yol       | Açıklama |
|-------|-----------|----------|
| GET   | `/health` | `{"ok": true}` — Okur bununla sunucunun açık olduğunu anlar |
| POST  | `/tts`    | Gövde: `{"text": "...", "language": "tr"}` → `audio/wav` döner |

## Notlar

- Sunucu yalnız `127.0.0.1` (localhost) dinler; dışarı açık değildir.
- **Veri gizliliği:** metin yalnız kendi bilgisayarında işlenir, hiçbir yere gitmez.
- Okur'da **Motor = Otomatik** ise: sunucu açıksa Chatterbox, kapalıysa tarayıcı sesi kullanılır.
