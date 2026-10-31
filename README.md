<div align="center">
  <img src="assets/face.png" width="130" alt="Pofu" />

  <h1>Pofu</h1>
  <p><b>Ekranda yüzen minik ekran okuyucu.</b><br/>
  Kopyaladığın metnin dilini algılar, senin diline çevirir ve dile uygun doğal bir sesle okur.
  Claude Code kullananlara ayrıca oturum takibi sunar.</p>

  <p>
    <a href="https://github.com/eczomi/pofu/releases/latest"><b>⬇️ İndir (Windows) — Pofu-Setup.exe</b></a>
  </p>
</div>

---

## Ne yapar?

### Kopyala, dinle (herkes için)

- **Seç → Ctrl+C.** Pofu metni alır, dilini algılar, **senin diline çevirir** ve okur.
  Çeviri ile orijinal panelde birlikte görünür; okunan cümle vurgulanır.
- **Çeviriyi mi, orijinali mi?** Okuma panelindeki düğmeyle anında değiştir.
  İngilizce bir metni Türkçe dinleyebilir ya da İngilizce sesten dinleyebilirsin.
- **Her dil kendi sesiyle okunur.** Türkçe için Emel/Ahmet, İngilizce için Aria/Guy gibi;
  "Ses tipi" ayarından kadın/erkek seçersin, gerisi otomatik.
- **Sağ tık → "Oku (Pofu ile)"** Chrome/Edge uzantısıyla (`browser-extension/`),
  **kısayol** `Ctrl+Alt+S` panodaki metni okur.
- **Kuyruk.** Üst üste birkaç şey gönderirsen sırayla okur; ■ hepsini iptal eder.
- **Görevler.** Adım adım talimatı kopyala → `Ctrl+Alt+Q` → tik atılabilir liste.

### Otomatik ayar

Yeni kurulumda **Otomatik ayar** açıktır: motor, okuma dili ve ses Pofu tarafından seçilir.
Senin yapman gereken en fazla iki şey: *Benim dilim* (varsayılan: sistem dili) ve *Ses tipi* (kadın/erkek).
Ayarlarla uğraşmak isteyenler için **Gelişmiş** bölümü ayrıca duruyor (motor, sabit dil, dil başına ses seçimi, kısayollar).

### Claude Code takibi (isteğe bağlı)

- **Oturumlar sekmesi:** her Claude oturumu bir satır: çalışıyor / onay bekliyor / bitti + son mesajın özeti.
- **Satıra tıkla → o VS Code penceresine git.**
- Kullanmıyorsan Gelişmiş → **Claude oturum takibi** kapat; sekme kaybolur.

Claude Code her oturumu `~/.claude/projects/**/*.jsonl` dosyasına yazar. Pofu bu dosyaları izler; ekran kazıma, eklenti yok.

### Jestler

Maskota **tek tık** oku/duraklat · **çift tık** mini mod (yalnız kafa; bir şey bitince minik balon) ·
**sürükle** taşı · **sağ tık** ayarlar.

## Kurulum

**Kolay yol (Windows):** [Releases](https://github.com/eczomi/pofu/releases/latest) → `Pofu-Setup.exe`.

**Geliştirici yolu:**
```bash
git clone https://github.com/eczomi/pofu.git
cd pofu
npm install
npm run voices   # doğal sesler (Python 3.9+ gerekir; ~30 sn)
npm start        # ya da Pofu.vbs'ye çift tıkla (konsolsuz)
```

### Doğal sesler

Windows'un kendi sesi tek dildir ve robotiktir. `npm run voices` (ya da Ayarlar → **Doğal sesler → Kur**)
`edge-tts` tabanlı yerel ses sunucusunu kurar; Pofu açılırken sunucuyu kendisi başlatır.
Türkçe Emel/Ahmet dahil 300+ nöral ses, 19 dil.

> Sunucu "ses hatası" gösteriyorsa `edge-tts` güncel değildir: Ayarlar → Doğal sesler → **Güncelle**
> (ya da `npm run voices`). Detay ve tamamen çevrimdışı Chatterbox seçeneği: [`chatterbox-server/README.md`](chatterbox-server/README.md)

### Çeviri

Çeviri için anahtar gerektirmeyen Google Translate ucu kullanılır (yedek: MyMemory). Metin bu servislere gider;
istemiyorsan Ayarlar → **Çeviri** kapat. Çeviri yoksa (çevrimdışı) metin orijinal diliyle okunur.

### Sağ tık → Oku (Chrome / Edge)

`chrome://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** → `browser-extension` klasörü.

## Ayarlar

| Ayar | Açıklama |
|------|----------|
| **Otomatik ayar** | Motor, dil ve sesi Pofu seçer (önerilir) |
| **Benim dilim** | Çevirilerin hedef dili; boş = sistem dili |
| **Ses tipi** | Kadın / erkek; her dilde uygun ses seçilir |
| **Hız** | Konuşma hızı |
| **Çeviri** | Yabancı metni benim dilime çevir ve göster |
| **Kopyalayınca oku** | Seç → Ctrl+C → oku |
| **Doğal sesler** | Ses sunucusunu kur / güncelle |
| Gelişmiş → **Motor** | Otomatik / Doğal ses (sunucu) / Windows sesi |
| Gelişmiş → **Okuma dili** | Otomatik algıla ya da sabit dil |
| Gelişmiş → **Ses seçimi** | Dil başına belirli bir ses |
| Gelişmiş → **Seslendir** | Çeviriyi / orijinali / önce orijinali sonra çeviriyi |
| Gelişmiş → **Claude oturum takibi** | Kapat → saf ekran okuyucu |
| Gelişmiş → **Ne okunsun** | Claude yanıtının son paragrafı / son cümlesi / tümü |
| Gelişmiş → **Kısayollar** | Oku: `Ctrl+Alt+S` · Görev: `Ctrl+Alt+Q` |

## English

Pofu is a tiny floating screen reader for Windows. Copy any text (Ctrl+C): Pofu detects its language,
translates it into yours, shows both and reads it aloud with a language-matched neural voice
(local `edge-tts` server; female/male preference; per-language overrides). Switch between hearing the
translation or the original with one click. Optional Claude Code session tracking: a live session list
(working / waiting for approval / done), click a row to jump to that VS Code window. Auto mode picks
engine, language and voice for you.

```bash
git clone https://github.com/eczomi/pofu.git
cd pofu && npm install && npm run voices && npm start
```

## Lisans / License

MIT. Bkz. [LICENSE](LICENSE). Maskot Higgsfield ile üretilmiştir. / Mascot generated with Higgsfield.
