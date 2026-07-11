# Okur — ses sunucusu (doğal, akıcı sesler)

Okur'un varsayılan tarayıcı sesi robotiktir. Bu küçük sunucu **çok daha akıcı, doğal
sesler** sağlar. Kuruluysa **Okur açılırken sunucuyu kendisi başlatır** — senin bir şey
yapman gerekmez; Ayarlar → Ses listesine "Doğal sesler (sunucu)" grubu düşer.

## Kurulum (tek sefer, ~30 saniye)

```bash
cd chatterbox-server
python -m venv .venv
.venv\Scripts\pip install edge-tts
```

Bu kadar. Okur'u yeniden başlat → doğal sesler hazır (Türkçe: **Emel** kadın / **Ahmet**
erkek + 20 dilde yüzlerce ses).

## Motorlar

| Motor | Ne | Artı | Eksi |
|-------|----|------|------|
| **edge** (varsayılan) | Microsoft'un nöral TTS'i (`edge-tts`) | Çok akıcı, saniyede kurulur, 322 ses | İnternet ister; metin Microsoft'a gider |
| **chatterbox** | Resemble AI'nin yerel modeli | Tamamen çevrimdışı | GB'larca indirme, GPU'suz yavaş |

Chatterbox'a geçmek için: `pip install chatterbox-tts soundfile` sonra
`python server.py --engine chatterbox` (elle başlatılan sunucu varsa Okur onu kullanır).

## Uç noktalar

| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/health` | `{"ok": true, "engine": "edge"}` |
| GET | `/voices` | Tüm sesler: `[{"name","lang","gender"}]` |
| POST | `/tts` | `{"text","language","voice"?}` → mp3 (edge) / wav (chatterbox) |

Sunucu yalnız `127.0.0.1` dinler; dışarıya kapalıdır.
