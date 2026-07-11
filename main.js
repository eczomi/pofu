'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, clipboard, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { TranscriptWatcher } = require('./src/transcript');
const { toSentences, scopedText } = require('./src/clean');
const { detect } = require('./src/detectLang');

const DEBUG = !!process.env.OKUR_DEBUG;
function dlog(...a) { if (DEBUG) console.log('[okur]', ...a); }

const DEFAULT_CONFIG = {
  engine: 'auto',                          // 'auto' | 'browser' | 'chatterbox'
  chatterboxUrl: 'http://127.0.0.1:7888',
  rate: 1.0,                               // konusma hizi
  language: 'auto',                        // 'auto' veya 'tr','en','de',... (TTS dili)
  voiceName: '',                           // belirli bir tarayici sesi; '' = otomatik
  skipCode: true,                          // kod bloklarini okuma
  autoRead: false,                         // metin-oncelikli: varsayilan otomatik SESLI okuma KAPALI
  readScope: 'lastParagraph',              // 'all' | 'lastParagraph' | 'lastSentence' — ne okunsun
  settleMs: 2500,                          // yanit "bitti" sayilmadan once beklenen sessizlik (ms)
  cueSound: false,                         // sesli "Bitti/Soru" bildirimi (varsayilan kapali)
  cueFlash: true,                          // titreme + yazili bildirim
  muted: false,                            // ana sustur: acikken hicbir sey okumaz/titremez
  projectFilter: '',                       // yalniz bu proje klasorunu izle ('' = hepsi)
  hotkey: 'CommandOrControl+Alt+S',        // secili/pano metni okuma kisayolu
  httpPort: 7889,                          // taray ici uzanti buraya metin yollar (sag tik -> Oku)
  x: null, y: null,                        // pencere konumu (hafiza)
};

let win = null;
let tray = null;
let watcher = null;
let config = { ...DEFAULT_CONFIG };
let lastLang = 'en';
let hotkeyOk = false;

function configPath() {
  // Test/tanilama icin OKUR_CONFIG ile ozel dosya gosterilebilir.
  return process.env.OKUR_CONFIG || path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig() {
  try { fs.writeFileSync(configPath(), JSON.stringify(config, null, 2)); } catch { /* yoksay */ }
}

function assetPath(name) {
  return path.join(__dirname, 'assets', name);
}

function createWindow() {
  const W = 320;
  const H = 400;
  const area = screen.getPrimaryDisplay().workAreaSize;
  const x = config.x != null ? config.x : area.width - W - 28;
  const y = config.y != null ? config.y : 90;

  win = new BrowserWindow({
    width: W,
    height: H,
    x, y,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Tam ekran uygulamalarin (Chrome tam ekran video, sunum, oyun) uzerinde de kal.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (DEBUG) {
    win.webContents.on('console-message', (_e, _lvl, msg) => console.log('[renderer]', msg));
    win.webContents.on('did-finish-load', () => dlog('renderer yuklendi'));
  }

  win.on('moved', () => {
    if (!win) return;
    const [nx, ny] = win.getPosition();
    config.x = nx;
    config.y = ny;
    saveConfig();
  });

  win.on('closed', () => { win = null; });
}

function createTray() {
  let img = nativeImage.createEmpty();
  try {
    const face = nativeImage.createFromPath(assetPath('face.png'));
    if (!face.isEmpty()) img = face.resize({ width: 18, height: 18 });
  } catch { /* yoksay */ }

  tray = new Tray(img);
  rebuildTrayMenu();
  tray.setToolTip('Okur — Claude sesli okuyucu');
  tray.on('click', () => toggleWindow());
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { id: 'mute', label: 'Sustur (hicbir sey okuma)', type: 'checkbox', checked: !!config.muted,
      click: (item) => setMuted(item.checked) },
    { label: 'Oku / Duraklat', click: () => sendCommand('toggle') },
    { label: 'Durdur', click: () => sendCommand('stop') },
    { type: 'separator' },
    { label: 'Goster / Gizle', click: () => toggleWindow() },
    { label: 'Cikis', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function setMuted(m) {
  config.muted = !!m; // yalniz ses susar; metin bildirimi devam eder
  saveConfig();
  if (win && !win.isDestroyed()) win.webContents.send('command', { action: m ? 'muted-on' : 'muted-off' });
  rebuildTrayMenu();
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else { win.show(); win.setAlwaysOnTop(true, 'screen-saver'); }
}

function sendCommand(action) {
  if (win && !win.isDestroyed()) win.webContents.send('command', { action });
}

// Her oturum (transcript dosyasi) icin okunabilir bir etiket uret:
// projenin klasor adi + ayni projede birden fazla oturum varsa numara.
const fileLabels = new Map();
const projectSeq = new Map();
function labelFor(file, cwd) {
  if (fileLabels.has(file)) return fileLabels.get(file);
  let name = 'Claude';
  if (cwd) { try { name = path.basename(cwd) || cwd; } catch { name = cwd; } }
  const n = (projectSeq.get(name) || 0) + 1;
  projectSeq.set(name, n);
  const label = n > 1 ? `${name} ${n}` : name;
  fileLabels.set(file, label);
  return label;
}

// Debounce tamponu: Claude yanitini adim adim yazar (araclar arasinda). Her
// parcada tetiklemek yerine, belli bir sure yeni metin gelmezse yanit "bitti"
// sayilir ve TEK sefer okunur.
const buffers = new Map(); // file -> { items: [{text, cwd, ts}], timer }

function clearBuffers() {
  for (const b of buffers.values()) { if (b.timer) clearTimeout(b.timer); }
  buffers.clear();
}

function onAssistantText({ text, file, ts, cwd }) {
  // Not: sustur (muted) yalniz SESI keser; metin bildirimi yine gelir.
  let b = buffers.get(file);
  if (!b) { b = { items: [], timer: null }; buffers.set(file, b); }
  b.items.push({ text, cwd, ts });
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => flush(file), Math.max(500, config.settleMs || 2500));
}

// Yanit "onay bekliyor" mu yoksa "konusma sonlandi" mi?
const APPROVAL_RE = /(onayl[ıia]|onay bekl|onaylıyor musun|devam edeyim mi|devam edeyim mı|başlayay[ıi]m m[ıi]|yapay[ıi]m m[ıi]|ister misin|olur mu|emin misin|should i\b|shall i\b|may i\b|proceed\??$|confirm\b|approve\b)/i;

function classifyKind(scoped, lastSentence) {
  if (/[?？]["')\]]*$/.test(lastSentence)) return 'approval';
  if (APPROVAL_RE.test(scoped)) return 'approval';
  return 'done';
}

function makeTitle(sentences) {
  const s = (sentences[0] || '').replace(/\s+/g, ' ').trim();
  return s.length > 54 ? s.slice(0, 52).trim() + '…' : s;
}

function flush(file) {
  const b = buffers.get(file);
  if (!b || !b.items.length) { if (b) b.timer = null; return; }
  const items = b.items;
  b.items = [];
  b.timer = null;

  const scope = config.readScope || 'lastParagraph';
  const cwd = items[items.length - 1].cwd || '';
  // 'all' -> tum parcalari birlestir; digerleri -> son parcadan kapsam al
  const raw = scope === 'all'
    ? items.map((i) => i.text).join('\n\n')
    : items[items.length - 1].text;
  const scoped = scopedText(raw, scope, { skipCode: config.skipCode });
  const sentences = toSentences(scoped, { skipCode: config.skipCode });
  if (!sentences.length) return;

  let lang = config.language;
  if (!lang || lang === 'auto') { lang = detect(scoped, lastLang); lastLang = lang; }

  const last = sentences[sentences.length - 1].trim();
  const kind = classifyKind(scoped, last);
  const label = labelFor(file, cwd);
  const title = makeTitle(sentences);

  dlog('flush:', label, '| ' + kind, '| ' + sentences.length + ' cumle');
  if (win && !win.isDestroyed()) {
    win.webContents.send('read', { sentences, lang, label, kind, title, isQuestion: kind === 'approval' });
  }
}

function startWatcher() {
  if (watcher) watcher.stop();
  clearBuffers();
  watcher = new TranscriptWatcher({
    projectFilter: config.projectFilter,
    onText: onAssistantText,
  });
  watcher.start();
}

// Kullanicinin secip istedigi metni HEMEN okur (otomatik okuma/sustur'u yok sayar).
// Kaynak: global kisayol -> pano, ya da surattaki yapistir-oku kutusu.
function manualRead(rawText) {
  const text = (rawText || '').trim();
  if (!text) return;
  const sentences = toSentences(text, { skipCode: config.skipCode });
  if (!sentences.length) return;
  let lang = config.language;
  if (!lang || lang === 'auto') { lang = detect(text, lastLang); lastLang = lang; }
  const title = makeTitle(sentences);
  dlog('manuel oku:', sentences.length, 'cumle, lang=' + lang);
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.webContents.send('read', { sentences, lang, label: 'Seçili metin', title, isQuestion: false, manual: true });
  }
}

function registerHotkey() {
  try { globalShortcut.unregisterAll(); } catch { /* */ }
  const acc = (config.hotkey || '').trim();
  hotkeyOk = false;
  if (acc) {
    try { hotkeyOk = globalShortcut.register(acc, () => manualRead(clipboard.readText())); }
    catch { hotkeyOk = false; }
  }
  dlog('kisayol', acc, hotkeyOk ? 'kayitli' : 'KAYIT EDILEMEDI (baska uygulama kullaniyor olabilir)');
  if (win && !win.isDestroyed()) {
    win.webContents.send('command', { action: 'hotkey', ok: hotkeyOk, hotkey: acc });
  }
  return hotkeyOk;
}

// Yerel API: tarayici uzantisi (sag tik -> Oku) secili metni buraya POST eder.
// Yalniz 127.0.0.1 dinler; disari kapali.
let apiServer = null;
function startApiServer() {
  const port = config.httpPort || 7889;
  try {
    apiServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (req.method === 'GET' && req.url.startsWith('/health')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }
      if (req.method === 'POST' && req.url.startsWith('/read')) {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 300000) req.destroy(); });
        req.on('end', () => {
          let text = '';
          try { text = (JSON.parse(body || '{}').text) || ''; } catch { text = ''; }
          manualRead(text);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        });
        return;
      }
      res.writeHead(404); res.end();
    });
    apiServer.on('error', (e) => dlog('api server hata:', e.message));
    apiServer.listen(port, '127.0.0.1', () => dlog('api server dinliyor:', port));
  } catch (e) { dlog('api server baslatilamadi:', e.message); }
}

// ---- IPC ----
ipcMain.on('renderer-ready', (e) => {
  e.sender.send('config', config);
  e.sender.send('command', { action: 'hotkey', ok: hotkeyOk, hotkey: config.hotkey });
  startWatcher();
});

ipcMain.on('state', () => { /* ileride tray ipucu guncellenebilir */ });

ipcMain.on('save-config', (_e, partial) => {
  const filterChanged = partial && 'projectFilter' in partial &&
    partial.projectFilter !== config.projectFilter;
  const mutedChanged = partial && 'muted' in partial && partial.muted !== config.muted;
  const hotkeyChanged = partial && 'hotkey' in partial && partial.hotkey !== config.hotkey;
  config = { ...config, ...partial };
  saveConfig();
  if (mutedChanged) rebuildTrayMenu();
  if (filterChanged) startWatcher();
  if (hotkeyChanged) registerHotkey();
});

// Manuel okuma: surattaki kutudan gelen metin ya da pano.
ipcMain.on('read-text', (_e, payload) => manualRead(payload && payload.text));
ipcMain.on('read-clipboard', () => manualRead(clipboard.readText()));

ipcMain.on('quit', () => { app.isQuiting = true; app.quit(); });

// ---- Yasam dongusu ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus(); }
  });

  app.whenReady().then(() => {
    config = loadConfig();
    createWindow();
    createTray();
    registerHotkey();
    startApiServer();
  });

  app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch { /* */ }
    try { if (apiServer) apiServer.close(); } catch { /* */ }
  });

  // Pencere gizlense de tepside calismaya devam etsin.
  app.on('window-all-closed', () => { /* cikma; tepsiden yonetiliyor */ });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
