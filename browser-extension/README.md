# Okur — Tarayıcı uzantısı (sağ tık → Oku)

Seçili metne **sağ tıkla → "Oku (Okur ile)"** seçeneği ekler. Chrome ve Edge (Chromium) için.
Seçtiğin metni açık olan **Okur** uygulamasına yollar, Okur sesli okur.

## Kurulum (tek sefer)

1. **Okur** uygulaması açık olsun (`npm start`).
2. Chrome/Edge'de `chrome://extensions` (Edge: `edge://extensions`) aç.
3. Sağ üstten **Geliştirici modu**'nu aç.
4. **Paketlenmemiş öğe yükle** (Load unpacked) → bu `browser-extension` klasörünü seç.
5. Bitti. Artık herhangi bir sayfada metni **seç → sağ tık → "Oku (Okur ile)"**.

## Notlar

- Uzantı metni yalnız `http://127.0.0.1:7889/read` adresine (senin bilgisayarın) yollar —
  dışarı hiçbir yere gitmez.
- Okur ayarlarındaki **httpPort** değeri (varsayılan `7889`) ile `background.js` içindeki
  `OKUR_PORT` aynı olmalı.
- Word, PDF okuyucu gibi tarayıcı-dışı uygulamalarda sağ-tık menüsü eklenemez (işletim sistemi
  kısıtı); orada **seç → Ctrl+C** ("Kopyalayınca oku" açıkken) ya da **Ctrl+Alt+S** kısayolu kullan.
