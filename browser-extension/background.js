// Okur tarayıcı uzantısı — seçili metne sağ tık → "Oku (Okur ile)".
// Seçili metni yerel Okur uygulamasına (127.0.0.1) yollar.

const OKUR_PORT = 7889; // Okur ayarlarındaki httpPort ile aynı olmalı
const OKUR_URL = `http://127.0.0.1:${OKUR_PORT}/read`;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'okur-read',
    title: 'Oku (Okur ile)',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== 'okur-read') return;
  const text = (info.selectionText || '').trim();
  if (!text) return;
  fetch(OKUR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(() => {
    // Okur açık değilse sessizce geç
  });
});
