<div align="center">
  <img src="assets/face.png" width="160" alt="Okur" style="border-radius:50%" />

  <h1>Okur</h1>
  <p><b>Claude'un cevaplarını sesli okuyan, ekranda her şeyin üstünde yüzen minik bir surat.</b><br/>
  <i>A tiny floating face that reads Claude's answers out loud — on top of every window.</i></p>
</div>

---

## 🇹🇷 Türkçe

Bilgisayarında gezerken (Chrome, e-posta, ne olursa) Claude Code'a bir şey sorarsın;
Okur cevabı **sesli okur**. Ekranın köşesinde küçük, yuvarlak, sevimli bir surat durur —
her uygulamanın üstünde. Sen başka bir işle uğraşırken Claude'un yazdığını dinlersin.

### Ne yapar?

- 🗣️ **Sesli okur** — Claude yanıtı **tamamlandığında** okur (adım adım değil; yanıt
  gerçekten bitene kadar bekler, sonra bir kez okur).
- ✂️ **Sadece son özet** — istersen tüm cevabı değil yalnız **son paragrafı** okutabilirsin
  (Ayarlar → Ne okunsun: Son paragraf / Son cümle / Tümü).
- 🪄 **Ekranın üstünde yüzer** — Chrome'da, Word'de, neredeysen görünür (her zaman en üstte).
- 🔥 **"Lighter" ile son kaldığın yeri aydınlatır** — okunan cümle bir alevle işaretlenir;
  duraklatınca o satır aydınlık kalır, nerede kaldığını hep bilirsin.
- 👆 **Tıkla → dur / devam et.** Suratın kendisi duraklat düğmesidir. Altyazıdaki bir
  **satıra tıklarsan oradan okumaya devam eder** (o satır alevle aydınlanır).
- ✋ **Seçtiğin herhangi bir metni okut** — üç yolla, yapıştırmadan:
  - **Sağ tık → "Oku (Okur ile)"** — Chrome/Edge'de (küçük uzantıyla, bkz. `browser-extension/`).
  - **Seç → Ctrl+C** — "Kopyalayınca oku" açıkken her uygulamada (Word, PDF...).
  - **Kısayol** `Ctrl+Alt+S` — seçili/pano metnini okur.
- 🔇 **Sustur düğmesi** — canını sıkarsa tek tıkla tamamen sustur (surattaki 🔊 düğmesi
  veya sistem tepsisi → Sustur). Uygulama açık kalır ama hiçbir şey okumaz/titremez.
- 🎬 **Yanıt bitince titrer + yazılı bildirim** — hangi oturumdan geldiğini gösterir
  (örn. `✓ para-app`). **Soru gelince yanıp söner** (`❓ para-app`) — Claude sana bir şey
  sorduğunda fark edersin. Sesli "Bitti/Soru" isteğe bağlıdır (varsayılan kapalı).
- 🗂️ **Birden fazla oturum** — birden çok Claude penceresi açıkken her biri ayrı izlenir,
  bildirimde hangisinin bittiği yazar.
- 🌍 **Çok dilli** — mesajın dilini otomatik algılar, doğru sesi seçer
  (Türkçe, İngilizce, Almanca, Fransızca, İspanyolca, Rusça, Japonca ve daha fazlası).
- 🔒 **Gizli** — metin bilgisayarından çıkmaz. Tarayıcı sesi (varsayılan) tamamen çevrimdışıdır.

### Nasıl çalışır?

Claude Code her cevabı `~/.claude/projects/<proje>/<oturum>.jsonl` dosyasına yazar.
Okur bu dosyaları arka planda izler, yeni cevabı görünce metni sadeleştirir (markdown/kod
temizlenir), cümlelere böler ve okur. Ekran kazıma, eklenti, hile yok — sadece dosya okuma.

### Kurulum

Gereken: [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/sevgiikilic/okur.git
cd okur
npm install
npm start
```

Suratı köşeye sürükle (üstteki `⠿` tutamacından). Bir Claude Code oturumu aç, soru sor —
cevap gelince Okur okumaya başlar. Uygulama sistem tepsisinde (tray) çalışır; oradan
Göster/Gizle ve Çıkış yapabilirsin.

### Ayarlar (⚙ düğmesi)

| Ayar | Açıklama |
|------|----------|
| **Motor** | Otomatik / Tarayıcı sesi / Chatterbox |
| **Ne okunsun** | Son paragraf (özet) / Son cümle / Tümü |
| **Dil** | Otomatik (mesajdan algıla) veya sabit bir dil |
| **Ses** | Belirli bir işletim sistemi sesi seç |
| **Hız** | Konuşma hızı |
| **Gelince otomatik oku** | Yanıt bitince kendiliğinden okusun mu |
| **Kod bloklarını atla** | Kodu sesli okumasın (önerilir) |
| **Bildirim sesi (Bitti / Soru)** | Sesli "Bitti"/"Soru" bildirimini aç/kapat (varsayılan kapalı) |
| **Titreme / yanıp sönme** | Görsel + yazılı bildirimi aç/kapat |
| **Kopyalayınca oku** | Seç → Ctrl+C → otomatik oku (yapıştırmadan) |
| **Kısayol** | Seçili/pano metnini okuma kısayolu (varsayılan `Ctrl+Alt+S`) |
| **Proje süzgeci** | Yalnız belirli bir proje klasörünü izle (boş = tüm aktif oturumlar) |

> **Susturmak için:** surattaki 🔊 düğmesine bas, ya da sistem tepsisindeki (tray) Okur
> simgesine sağ tıkla → **Sustur**. Tamamen kapatmak için tepsi → **Çıkış** (veya Ayarlar → Çıkış).

### Sağ tık → Oku (Chrome / Edge uzantısı)

Chrome/Edge'de seçili metne **sağ tıkla → "Oku (Okur ile)"** demek için küçük bir uzantı var.
Kurulum: `chrome://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** →
`browser-extension` klasörünü seç. Detay: [`browser-extension/README.md`](browser-extension/README.md).

### Daha doğal ses (opsiyonel): Chatterbox

Varsayılan tarayıcı sesi kurulumsuz çalışır. Daha doğal, tutarlı bir ses istersen
[Chatterbox](https://github.com/resemble-ai/chatterbox) sunucusunu çalıştır —
Okur onu otomatik algılar. Bkz. [`chatterbox-server/README.md`](chatterbox-server/README.md).

---

## 🇬🇧 English

Okur is a tiny floating face that reads **Claude Code**'s answers out loud while you do
something else. It sits in a corner of your screen, on top of every app, and speaks each
new answer. It marks where it is with a little **flame** ("lighter"), so when you pause you
always know where you left off. It **shakes + says "Done"** when an answer lands and
**blinks + says "Question"** when Claude is asking you something.

It works by watching Claude Code's session transcripts
(`~/.claude/projects/**/*.jsonl`) — no screen scraping, no plugins. Multilingual: it
auto-detects each message's language and picks a matching voice. Private by default: the
browser voice is fully offline; text never leaves your machine.

```bash
git clone https://github.com/sevgiikilic/okur.git
cd okur && npm install && npm start
```

Optional [Chatterbox](https://github.com/resemble-ai/chatterbox) local server for
higher-quality TTS — auto-detected when running (see `chatterbox-server/`).

---

## Paketleme / Packaging

Tek `.exe`/uygulama üretmek için (opsiyonel):

```bash
npm install --save-dev electron-builder
npx electron-builder
```

## Lisans / License

MIT — bkz. [LICENSE](LICENSE).

> Surat görseli Higgsfield ile üretilmiştir. / Mascot generated with Higgsfield.
