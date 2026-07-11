'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

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
  autoRead: true,                          // yanit bitince kendiliginden oku
  readScope: 'lastParagraph',              // 'all' | 'lastParagraph' | 'lastSentence' — ne okunsun
  settleMs: 2500,                          // yanit "bitti" sayilmadan once beklenen sessizlik (ms)
  cueSound: false,                         // sesli "Bitti/Soru" bildirimi (varsayilan kapali)
  cueFlash: true,                          // titreme + yazili bildirim
  muted: false,                            // ana sustur: acikken hicbir sey okumaz/titremez
  projectFilter: '',                       // yalniz bu proje klasorunu izle ('' = hepsi)
  x: null, y: null,                        // pencere konumu (hafiza)
};

let win = null;
let tray = null;
let watcher = null;
let config = { ...DEFAULT_CONFIG };
let lastLang = 'en';

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
  config.muted = !!m;
  saveConfig();
  if (m) clearBuffers();
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
  if (config.muted) return; // ana sustur
  let b = buffers.get(file);
  if (!b) { b = { items: [], timer: null }; buffers.set(file, b); }
  b.items.push({ text, cwd, ts });
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => flush(file), Math.max(500, config.settleMs || 2500));
}

function flush(file) {
  const b = buffers.get(file);
  if (!b || !b.items.length) { if (b) b.timer = null; return; }
  const items = b.items;
  b.items = [];
  b.timer = null;
  if (config.muted) return;

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
  const isQuestion = /[?？]["')\]]*$/.test(last);
  const label = labelFor(file, cwd);

  dlog('flush:', label, '| kapsam=' + scope, '| ' + sentences.length + ' cumle', '| soru=' + isQuestion);
  if (win && !win.isDestroyed()) {
    win.webContents.send('read', { sentences, lang, label, isQuestion });
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

// ---- IPC ----
ipcMain.on('renderer-ready', (e) => {
  e.sender.send('config', config);
  startWatcher();
});

ipcMain.on('state', () => { /* ileride tray ipucu guncellenebilir */ });

ipcMain.on('save-config', (_e, partial) => {
  const filterChanged = partial && 'projectFilter' in partial &&
    partial.projectFilter !== config.projectFilter;
  const mutedChanged = partial && 'muted' in partial && partial.muted !== config.muted;
  config = { ...config, ...partial };
  saveConfig();
  if (mutedChanged) { if (config.muted) clearBuffers(); rebuildTrayMenu(); }
  if (filterChanged) startWatcher();
});

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
  });

  // Pencere gizlense de tepside calismaya devam etsin.
  app.on('window-all-closed', () => { /* cikma; tepsiden yonetiliyor */ });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
