<div align="center">
  <img src="assets/face.png" width="130" alt="Pofu" />

  <h1>Pofu</h1>
  <p><b>Claude Code yoldaşın: ekranda yüzen minik maskot.</b><br/>
  Hangi sekme çalışıyor, hangisi onay bekliyor, hangisi bitti — tek bakışta.
  İstersen seçtiğin her metni doğal bir sesle okur.</p>

  <p>
    <a href="https://github.com/eczomi/pofu/releases/latest"><b>⬇️ İndir (Windows) — Pofu-Setup.exe</b></a>
  </p>
</div>

---

## 🇹🇷 Ne yapar?

Aynı anda 5 projede 10 Claude sekmesiyle mi çalışıyorsun? Pofu köşede durur,
sen başka işlere bakarken sekmelerini izler:

- 🔔 **Oturum barı** — her Claude oturumu canlı bir satır:
  **çalışıyor** = akan ışık çubuğu · **onay bekliyor** = parlak nabız · **bitti** = parlak ✓ + son mesajın özeti
- 🖱️ **Satıra tıkla → o pencereye git** — VS Code'daki o pencere öne gelir
- ✋ **Seçtiğin metni okut** (web sayfası, kitap, PDF; yapıştırmadan):
  - **Sağ tık → "Oku (Pofu ile)"** — Chrome/Edge uzantısıyla (`browser-extension/`)
  - **Seç → Ctrl+C** — "Kopyalayınca oku" açıkken her uygulamada
  - **Kısayol** `Ctrl+Alt+S` — panodaki metni okur
  - Ne okuduğu üstünde yazar; okunan cümle **neon ışıkla** aydınlanır, kaldığın yeri kaybetmezsin
- 🗣️ **Doğal, akıcı sesler** — Türkçe Emel/Ahmet dahil 300+ nöral ses (aşağıya bak)
- 👆 **Jestler** — maskota: **tek tık** oku/duraklat · **çift tık** mini mod (sadece küçük kafa;
  bir şey bitince minik konuşma balonu çıkar: "para-app · bitti") · **sürükle** taşı
- 🌍 **Çok dilli** — mesajın dilini algılar, uygun sesi seçer
- 🔇 **Sustur** = yalnız ses susar; görsel bildirimler devam eder
- 🔒 **Gizli** — transcript'ler bilgisayarından çıkmaz; tarayıcı sesi tamamen çevrimdışı

### Nasıl çalışır?

Claude Code her oturumu `~/.claude/projects/**/*.jsonl` dosyasına yazar. Pofu bu dosyaları
izler: dosya büyüyorsa oturum **çalışıyor**dur; yazma durunca yanıt **bitmiştir** (son cümle
soruysa **onay bekliyor**). Ekran kazıma, eklenti, hile yok — sadece dosya okuma.

## Kurulum

**Kolay yol (Windows):** [Releases](https://github.com/eczomi/pofu/releases/latest)
sayfasından `Pofu-Setup.exe` indir, çalıştır. Bitti.

**Geliştirici yolu:**
```bash
git clone https://github.com/eczomi/pofu.git
cd pofu
npm install
npm start        # ya da Pofu.vbs'ye çift tıkla (konsolsuz)
```

### Doğal sesler (şiddetle önerilir)

Varsayılan Windows sesi robotiktir. 30 saniyelik kurulumla çok daha akıcı seslere geç:

```bash
cd chatterbox-server
python -m venv .venv
.venv\Scripts\pip install edge-tts
```

Pofu'yu yeniden başlat — ses sunucusunu kendisi açar, Ayarlar → Ses listesine
**"Doğal sesler (sunucu)"** grubu gelir (tr-TR-Emel, tr-TR-Ahmet, en-US-Aria...).
Detay + tamamen çevrimdışı Chatterbox seçeneği: [`chatterbox-server/README.md`](chatterbox-server/README.md)

### Sağ tık → Oku (Chrome / Edge)

`chrome://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** →
`browser-extension` klasörü. Detay: [`browser-extension/README.md`](browser-extension/README.md)

## Ayarlar (⚙)

| Ayar | Açıklama |
|------|----------|
| **Motor** | Otomatik / Tarayıcı sesi / Ses sunucusu (doğal) |
| **Ne okunsun** | Son paragraf (özet) / Son cümle / Tümü |
| **Dil** | Otomatik (mesajdan algıla) veya sabit |
| **Ses** | Doğal sunucu sesleri + Windows sesleri |
| **Hız** | Konuşma hızı |
| **Gelince otomatik SESLİ oku** | Varsayılan kapalı (metin öncelikli) |
| **Kod bloklarını atla** | Kodu sesli okuma (önerilir) |
| **Bitince titresin** | Görsel bildirim |
| **Kopyalayınca oku** | Seç → Ctrl+C → oku |
| **Proje süzgeci** | Boş = hepsi · `para-app` · `para-app, pofu` (virgülle çoklu) |
| **Kısayol** | Pano okuma kısayolu (varsayılan `Ctrl+Alt+S`) |

## 🇬🇧 English

Pofu is a tiny floating desktop companion for **Claude Code**. It watches your session
transcripts (`~/.claude/projects/**/*.jsonl`) and shows a live session bar: **working**
(animated), **waiting for approval** (glowing pulse), **done** (bright + summary). Click a
row to jump to that VS Code window. It also reads any selected text aloud (right-click menu
via the bundled Chrome extension, or Ctrl+C with read-on-copy) using natural neural voices
(optional local `edge-tts` server; fully-offline Chatterbox also supported). Multilingual,
private by default. Gestures: single-click = play/pause, double-click = mini mode with tiny
speech-bubble notifications, drag to move.

```bash
git clone https://github.com/eczomi/pofu.git
cd pofu && npm install && npm start
```

## Lisans / License

MIT — bkz. [LICENSE](LICENSE). Maskot Higgsfield ile üretilmiştir. / Mascot generated with Higgsfield.
