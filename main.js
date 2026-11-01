'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, clipboard, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { TranscriptWatcher } = require('./src/transcript');
const { toSentences, scopedText, stripMarkdown } = require('./src/clean');
const { detect } = require('./src/detectLang');
const { translate, normLang } = require('./src/translate');

const DEBUG = !!process.env.OKUR_DEBUG;
function dlog(...a) { if (DEBUG) console.log('[okur]', ...a); }

const WIN_W = 320;   // normal genislik
const MINI_W = 76;   // mini mod genisligi

const DEFAULT_CONFIG = {
  // --- Kolay mod ---
  autoMode: true,                          // acikken motor/dil/ses kendiliginden secilir
  translate: true,                         // yabanci dildeki metni "benim dilim"e cevir
  targetLang: '',                          // benim dilim; '' = sistem dili
  readWhat: 'translation',                 // 'translation' | 'original' | 'both' — hangisi seslendirilsin
  voiceGender: 'female',                   // 'female' | 'male' — her dilde tercih edilen ses tipi
  accents: {},                             // dil -> aksan (ornek { en: 'en-GB' }); otomatik modda da gecerli
  // --- Gelismis ---
  engine: 'auto',                          // 'auto' | 'browser' | 'chatterbox'
  chatterboxUrl: 'http://127.0.0.1:7888',
  rate: 1.0,                               // konusma hizi
  language: 'auto',                        // TTS dili: 'auto' ya da sabit kod (autoMode kapaliyken)
  voiceByLang: {},                         // dil -> ses adi (autoMode kapaliyken)
  skipCode: true,                          // kod bloklarini okuma
  claudeMode: true,                        // Claude Code oturum takibi
  autoRead: false,                         // Claude yaniti gelince otomatik SESLI oku
  claudeArrive: 'queue',                   // autoRead acik ve okuma surerken: 'queue' | 'interrupt' | 'skip'
  readScope: 'lastParagraph',              // 'all' | 'lastParagraph' | 'lastSentence'
  settleMs: 2500,
  cueFlash: true,
  cueSound: 'chime',                       // bitince bildirim sesi: 'off' | 'ping' | 'chime' | 'bell' | 'pop' | 'marimba'
  muted: false,
  projectFilter: '',
  hotkey: 'CommandOrControl+Alt+S',
  noteHotkey: 'CommandOrControl+Alt+Q',
  notes: [],
  httpPort: 7889,
  readOnCopy: true,
  onNewText: 'interrupt',                  // yeni metin gelince: 'interrupt' (eskiyi kes) | 'queue' (siraya ekle)
  miniMode: false,
  cfgVersion: 4,
  x: null, y: null,
};

let win = null;
let tray = null;
let watcher = null;
let config = { ...DEFAULT_CONFIG };
let lastLang = 'en';
let hotkeyOk = false;

function configPath() {
  return process.env.OKUR_CONFIG || path.join(app.getPath('userData'), 'config.json');
}

function migrateOldConfig() {
  try {
    if (fs.existsSync(configPath()) || process.env.OKUR_CONFIG) return;
    const old = path.join(app.getPath('appData'), 'Okur', 'config.json');
    if (fs.existsSync(old)) {
      fs.mkdirSync(path.dirname(configPath()), { recursive: true });
      fs.copyFileSync(old, configPath());
    }
  } catch { /* yoksay */ }
}

function loadConfig() {
  let c;
  try {
    c = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch {
    c = { ...DEFAULT_CONFIG };
  }
  if (!c.cfgVersion || c.cfgVersion < 2) c.autoRead = false;
  if (!c.cfgVersion || c.cfgVersion < 3) c.readOnCopy = true;
  // Goc v4: kolay mod + ceviri. Eski "tek sabit ses" ayari dil uyumsuzluguna
  // yol aciyordu (her dili ayni kisi okuyordu); dil bazli secime tasindi.
  if (!c.cfgVersion || c.cfgVersion < 4) {
    c.autoMode = true;
    c.engine = 'auto';
    c.language = 'auto';
    c.translate = true;
    c.readWhat = 'translation';
    const old = String(c.voiceName || '');
    c.voiceByLang = {};
    if (old) {
      const m = old.match(/^([a-z]{2})-[A-Z]{2}-/);
      if (m) c.voiceByLang[m[1]] = old;
      c.voiceGender = /Ahmet|Guy|Christopher|Eric|Andrew|Brian|Roger|Steffan|David|Mark|Tolga|Conrad|Henri|Alvaro|Diego|Antonio|Maarten|Marek|Mattias|Dmitry|Keita|InJoon|Yunxi|Hamed|Madhur|Nestoras|Avri|Niwat/i.test(old) ? 'male' : 'female';
    }
    c.cfgVersion = 4;
  }
  delete c.voiceName;
  delete c.startWithWindows;
  // Eski surumlerde cueSound true/false idi; simdi ses adi
  if (typeof c.cueSound === 'boolean') c.cueSound = c.cueSound ? 'chime' : 'off';
  if (!c.cueSound) c.cueSound = 'chime';
  if (!c.voiceByLang || typeof c.voiceByLang !== 'object') c.voiceByLang = {};
  return c;
}

function saveConfig() {
  try { fs.writeFileSync(configPath(), JSON.stringify(config, null, 2)); } catch { /* yoksay */ }
}

// "Benim dilim": ayar bos ise sistem dili (tr-TR -> tr)
function targetLang() {
  const t = normLang(config.targetLang);
  if (t) return t;
  try { return normLang(app.getLocale()) || 'tr'; } catch { return 'tr'; }
}

function publicConfig() {
  return { ...config, targetLangResolved: targetLang() };
}

function assetPath(name) {
  return path.join(__dirname, 'assets', name);
}

function createWindow() {
  const W = WIN_W;
  const H = 300;
  const area = screen.getPrimaryDisplay().workAreaSize;
  let x = config.x != null ? config.x : area.width - W - 28;
  let y = config.y != null ? config.y : 90;
  // Ekran disinda kalmasin (cozunurluk degismis olabilir)
  x = Math.max(0, Math.min(x, area.width - 80));
  y = Math.max(0, Math.min(y, area.height - 80));

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

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (DEBUG) {
    win.webContents.on('console-message', (_e, _lvl, msg) => console.log('[renderer]', msg));
    win.webContents.on('did-finish-load', () => dlog('renderer yuklendi'));
  }

  // Gelistirici: OKUR_SHOT=dosya.png -> yuklendikten sonra ekran goruntusu al.
  if (process.env.OKUR_SHOT) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(process.env.OKUR_SHOT, img.toPNG());
          dlog('ekran goruntusu:', process.env.OKUR_SHOT);
        } catch (e) { dlog('goruntu alinamadi:', e.message); }
        if (process.env.OKUR_SHOT_QUIT) { app.isQuiting = true; app.quit(); }
      }, Number(process.env.OKUR_SHOT_DELAY || 4000));
    });
  }

  win.on('will-move', () => { dragUntil = Date.now() + 700; });

  let moveSaveTimer = null;
  const savePos = () => {
    if (!win || win.isDestroyed()) return;
    const [nx, ny] = win.getPosition();
    config.x = nx; config.y = ny;
    saveConfig();
  };
  win.on('moved', savePos);
  win.on('move', () => {
    dragUntil = Date.now() + 700;
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(savePos, 400);
  });

  // Alt+F4 vb. pencereyi YOK ETMESIN: gizle; tepsiden ya da tekrar acarak geri gelir.
  // (Eskiden pencere kapaninca Pofu tepside penceresiz kaliyor, "acilmiyor" sanilıyordu.)
  win.on('close', (e) => {
    if (app.isQuiting) return;
    e.preventDefault();
    win.hide();
  });
  win.on('closed', () => { win = null; });
}

// Pencere yoksa yeniden olustur, varsa goster ve one getir.
function showWindow() {
  if (!win || win.isDestroyed()) { createWindow(); }
  win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
}

// Boyutlandirma: tasima ve boyut HEP birlikte (setBounds) verilir; olcekli
// ekranlarda (%125 vb.) setPosition'in pencereyi sisirmesi onlenir.
let wantW = WIN_W;
let wantH = 300;
let dragUntil = 0;
let pendingSize = null;
let pendingTimer = null;
function applyResize(h, w) {
  if (!win || win.isDestroyed()) return;
  if (w) wantW = w;
  wantH = h;
  if (Date.now() < dragUntil) {
    pendingSize = { h, w };
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      if (pendingSize) { const p = pendingSize; pendingSize = null; applyResize(p.h, p.w); }
    }, 750);
    return;
  }
  const b = win.getBounds();
  if (Math.abs(b.height - wantH) < 6 && Math.abs(b.width - wantW) < 6) return;
  win.setBounds({ x: b.x, y: b.y, width: wantW, height: wantH });
}

function cleanupLoginItem() {
  try {
    app.setLoginItemSettings({ openAtLogin: false, path: process.execPath, args: [path.resolve(__dirname)] });
  } catch { /* yoksay */ }
}

// ---- Yerel ses (TTS) sunucusu ----
let ttsProc = null;
function ttsPaths() {
  const base = path.join(__dirname, 'chatterbox-server');
  const py = process.platform === 'win32'
    ? path.join(base, '.venv', 'Scripts', 'python.exe')
    : path.join(base, '.venv', 'bin', 'python');
  return { base, py, script: path.join(base, 'server.py') };
}

function startTtsServer() {
  const { py, script } = ttsPaths();
  if (!fs.existsSync(py) || !fs.existsSync(script)) { dlog('ses sunucusu: venv yok, atlandi'); return; }
  try {
    const { spawn } = require('child_process');
    ttsProc = spawn(py, [script], { cwd: path.dirname(script), windowsHide: true, stdio: 'ignore' });
    ttsProc.on('exit', (code) => { dlog('ses sunucusu kapandi:', code); ttsProc = null; });
    ttsProc.on('error', (e) => { dlog('ses sunucusu hatasi:', e.message); ttsProc = null; });
    dlog('ses sunucusu baslatildi (pid ' + ttsProc.pid + ')');
  } catch (e) { dlog('ses sunucusu baslatilamadi:', e.message); }
}

// Dogal ses kurulumu / guncellemesi (Ayarlar -> "Doğal sesleri kur").
// Sonuc 'command' ile arayuze bildirilir.
let voiceSetupRunning = false;
function setupVoices() {
  if (voiceSetupRunning) return;
  voiceSetupRunning = true;
  sendCommand('voices-setup', { status: 'running' });
  const { spawn } = require('child_process');
  const script = path.join(__dirname, 'scripts', 'setup-voices.js');
  const child = spawn(process.execPath, [script], {
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    cwd: __dirname,
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => {
    voiceSetupRunning = false;
    dlog('ses kurulumu bitti:', code, out.slice(-400));
    if (code === 0) {
      try { if (ttsProc) ttsProc.kill(); } catch { /* */ }
      setTimeout(startTtsServer, 500);
      sendCommand('voices-setup', { status: 'ok' });
    } else {
      sendCommand('voices-setup', { status: 'error', log: out.slice(-600) });
    }
  });
  child.on('error', (e) => {
    voiceSetupRunning = false;
    sendCommand('voices-setup', { status: 'error', log: e.message });
  });
}

// ---- Pano izleyici: "Kopyalayinca oku" ----
let lastClip = '';
let clipTimer = null;
function startClipboardWatch() {
  try { lastClip = clipboard.readText() || ''; } catch { lastClip = ''; }
  if (clipTimer) clearInterval(clipTimer);
  clipTimer = setInterval(() => {
    let t = '';
    try { t = clipboard.readText() || ''; } catch { return; }
    if (t && t !== lastClip) {
      lastClip = t;
      if (config.readOnCopy && !config.muted) manualRead(t, 'Kopyalanan metin');
    }
  }, 500);
}

function createTray() {
  let img = nativeImage.createEmpty();
  try {
    const face = nativeImage.createFromPath(assetPath('face.png'));
    if (!face.isEmpty()) img = face.resize({ width: 18, height: 18 });
  } catch { /* yoksay */ }
  tray = new Tray(img);
  rebuildTrayMenu();
  tray.setToolTip('Pofu');
  tray.on('click', () => toggleWindow());
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Sustur', type: 'checkbox', checked: !!config.muted, click: (item) => setMuted(item.checked) },
    { label: 'Oku / Duraklat', click: () => sendCommand('toggle') },
    { label: 'Durdur', click: () => sendCommand('stop') },
    { type: 'separator' },
    { label: 'Panoyu oku', click: () => manualRead(clipboard.readText(), 'Pano') },
    { label: 'Goster / Gizle', click: () => toggleWindow() },
    { label: 'Cikis', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function setMuted(m) {
  config.muted = !!m;
  saveConfig();
  sendCommand(m ? 'muted-on' : 'muted-off');
  rebuildTrayMenu();
}

function toggleWindow() {
  if (!win || win.isDestroyed()) { showWindow(); return; }
  if (win.isVisible()) win.hide();
  else showWindow();
}

function sendCommand(action, extra) {
  if (win && !win.isDestroyed()) win.webContents.send('command', { action, ...(extra || {}) });
}

// ---- Oturum etiketleri ----
const fileLabels = new Map();
const projectSeq = new Map();
function labelFor(file, cwd) {
  if (fileLabels.has(file)) return fileLabels.get(file);
  if (!cwd) return '';
  let name;
  try { name = path.basename(cwd) || cwd; } catch { name = cwd; }
  const n = (projectSeq.get(name) || 0) + 1;
  projectSeq.set(name, n);
  const label = n > 1 ? `${name} ${n}` : name;
  fileLabels.set(file, label);
  return label;
}

// ---- Oturum durumu ----
const sessions = new Map();

function touchSession(file, cwd) {
  let s = sessions.get(file);
  if (!s) {
    s = { id: file, label: '', cwd: '', status: 'working', title: '', ts: Date.now(), lastActivity: Date.now() };
    sessions.set(file, s);
  }
  if (cwd && !s.cwd) s.cwd = cwd;
  if (!s.label) s.label = labelFor(file, s.cwd);
  return s;
}

function sendSessions() {
  if (!win || win.isDestroyed()) return;
  const list = [...sessions.values()].map((s) => ({
    id: s.id, label: s.label || '…', status: s.status, title: s.title || '', ts: s.ts,
  }));
  win.webContents.send('sessions', list);
}

setInterval(() => {
  const cutoff = Date.now() - 45 * 60 * 1000;
  let changed = false;
  for (const [f, s] of sessions) {
    if (s.lastActivity < cutoff) { sessions.delete(f); changed = true; }
  }
  if (changed) sendSessions();
}, 60 * 1000);

// ---- Claude yanit tamponu ----
const buffers = new Map();

function clearBuffers() {
  for (const b of buffers.values()) { if (b.timer) clearTimeout(b.timer); }
  buffers.clear();
}

function onAssistantText({ text, file, ts, cwd }) {
  let b = buffers.get(file);
  if (!b) { b = { items: [], timer: null }; buffers.set(file, b); }
  b.items.push({ text, cwd, ts });
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => flush(file), Math.max(500, config.settleMs || 2500));
}

const APPROVAL_RE = /(onayl[ıia]|onay bekl|onaylıyor musun|devam edeyim mi|devam edeyim mı|başlayay[ıi]m m[ıi]|yapay[ıi]m m[ıi]|ister misin|olur mu|emin misin|should i\b|shall i\b|may i\b|proceed\??$|confirm\b|approve\b)/i;

function classifyKind(scoped, lastSentence) {
  if (/[?？]["')\]]*$/.test(lastSentence)) return 'approval';
  if (APPROVAL_RE.test(scoped)) return 'approval';
  return 'done';
}

function makeTitle(sentences) {
  const s = (sentences[0] || '').replace(/\s+/g, ' ').trim();
  return s.length > 60 ? s.slice(0, 58).trim() + '…' : s;
}

// ---- Okuma paketi: dil algila + (istenirse) cevir ----
// Donus: { src: {lang, sentences}, tr: {lang, sentences} | null, ... }
const KNOWN = new Set(['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'sv', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'el', 'he', 'th']);

async function buildRead(plainText, meta) {
  const text = String(plainText || '').trim();
  const srcSentences = toSentences(text, { skipCode: config.skipCode });
  if (!srcSentences.length) return null;

  const fixed = config.autoMode ? 'auto' : (config.language || 'auto');
  let srcLang = fixed !== 'auto' ? fixed : detect(text, lastLang);
  const target = targetLang();
  let tr = null;
  let trError = '';

  if (config.translate) {
    sendCommand('busy', { text: 'Çevriliyor…' });
    try {
      const clean = stripMarkdown(text, { skipCode: config.skipCode });
      const res = await translate(clean, target, srcLang);
      if (res) {
        if (fixed === 'auto' && res.srcLang && KNOWN.has(res.srcLang)) srcLang = res.srcLang;
        if (res.srcLang !== target && res.text && res.text.trim() !== clean.trim()) {
          const pairs = (res.pairs || []).filter((p) => p.src && p.tr);
          if (pairs.length) {
            // Cumle cumle hizali: orijinal[i] <-> ceviri[i]
            srcSentences.length = 0;
            srcSentences.push(...pairs.map((p) => p.src));
            tr = { lang: target, sentences: pairs.map((p) => p.tr), aligned: true };
          } else {
            const trSentences = toSentences(res.text, { skipCode: false });
            if (trSentences.length) tr = { lang: target, sentences: trSentences };
          }
        }
      }
    } catch (e) {
      trError = e.message;
      dlog('ceviri hatasi:', e.message);
    }
    sendCommand('busy', { text: '' });
  }
  lastLang = srcLang;
  return {
    ...meta,
    title: meta.title || makeTitle(srcSentences),
    src: { lang: srcLang, sentences: srcSentences },
    tr,
    trError: trError ? 'Çeviri yapılamadı (internet?)' : '',
    // Geriye uyumluluk
    sentences: srcSentences, lang: srcLang,
  };
}

async function flush(file) {
  const b = buffers.get(file);
  if (!b || !b.items.length) { if (b) b.timer = null; return; }
  const items = b.items;
  b.items = [];
  b.timer = null;

  const scope = config.readScope || 'lastParagraph';
  const cwd = items[items.length - 1].cwd || '';
  const raw = scope === 'all' ? items.map((i) => i.text).join('\n\n') : items[items.length - 1].text;
  const scoped = scopedText(raw, scope, { skipCode: config.skipCode });
  const sentences = toSentences(scoped, { skipCode: config.skipCode });
  if (!sentences.length) return;

  const last = sentences[sentences.length - 1].trim();
  const kind = classifyKind(scoped, last);
  const title = makeTitle(sentences);

  const s = touchSession(file, cwd);
  s.status = kind;
  s.title = title;
  s.ts = Date.now();
  const label = s.label || 'Claude';
  sendSessions();

  dlog('flush:', label, '| ' + kind, '| ' + sentences.length + ' cumle');
  const payload = await buildRead(scoped, { id: file, label, kind, title, manual: false, isQuestion: kind === 'approval' });
  if (payload && win && !win.isDestroyed()) win.webContents.send('read', payload);
}

function startWatcher() {
  if (watcher) { watcher.stop(); watcher = null; }
  clearBuffers();
  sessions.clear();
  sendSessions();
  if (!config.claudeMode) { dlog('claude modu kapali; izleyici yok'); return; }
  watcher = new TranscriptWatcher({
    projectFilter: config.projectFilter,
    onText: onAssistantText,
    onActivity: ({ file, cwd }) => {
      const s = touchSession(file, cwd);
      s.lastActivity = Date.now();
      if (!s.label) s.label = labelFor(file, s.cwd || cwd);
      const b = buffers.get(file);
      if (b && b.timer && b.items.length) {
        clearTimeout(b.timer);
        b.timer = setTimeout(() => flush(file), Math.max(500, config.settleMs || 2500));
      }
      if (s.status !== 'working') {
        s.status = 'working';
        s.ts = Date.now();
        sendSessions();
      } else if (s._new !== false) {
        s._new = false;
        sendSessions();
      }
    },
  });
  watcher.start();
}

// ---- VS Code penceresine odaklan ----
function focusWindows(needle, cb) {
  const script = path.join(__dirname, 'src', 'focus-window.ps1');
  const { execFile } = require('child_process');
  execFile('powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, needle],
    { windowsHide: true },
    (err, out) => cb(err ? 'err' : String(out).trim()));
}

function focusMac(needle) {
  const { execFile } = require('child_process');
  const safe = String(needle).replace(/["\\]/g, '');
  const osa = [
    'tell application "Visual Studio Code" to activate',
    'tell application "System Events" to tell process "Code"',
    '  repeat with w in windows',
    `    if name of w contains "${safe}" then perform action "AXRaise" of w`,
    '  end repeat',
    'end tell',
  ].join('\n');
  execFile('osascript', ['-e', osa], (err) => dlog('focus(mac):', needle, err ? err.message : 'ok'));
}

function focusSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  let needle = '';
  if (s.cwd) { try { needle = path.basename(s.cwd); } catch { needle = ''; } }
  if (!needle) needle = (s.label || '').replace(/ \d+$/, '');
  if (!needle) return;
  if (process.platform === 'darwin') { focusMac(needle); return; }
  focusWindows(needle, (r1) => {
    dlog('focus:', needle, r1);
    if (r1 === 'notfound') focusWindows('Visual Studio Code', (r2) => dlog('focus fallback:', r2));
  });
}

// ---- Manuel okuma (pano / kisayol / uzanti / kutu) ----
const MAX_READ_CHARS = 20000;
let lastManual = { text: '', ts: 0 };

async function manualRead(rawText, label) {
  let text = String(rawText || '').trim();
  if (!text) return;
  if (text.length > MAX_READ_CHARS) text = text.slice(0, MAX_READ_CHARS);
  // Ayni metin pes pese iki kaynaktan gelirse (pano + kisayol) tek sefer oku
  if (text === lastManual.text && Date.now() - lastManual.ts < 2500) return;
  lastManual = { text, ts: Date.now() };

  const payload = await buildRead(text, { label: label || 'Seçili metin', manual: true, kind: 'manual', isQuestion: false });
  if (!payload) return;
  dlog('manuel oku:', payload.src.sentences.length, 'cumle, lang=' + payload.src.lang, payload.tr ? '-> ' + payload.tr.lang : '');
  if (!win || win.isDestroyed()) showWindow();
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.webContents.send('read', payload);
  }
}

function addNoteFromClipboard() {
  let t = '';
  try { t = (clipboard.readText() || '').trim(); } catch { t = ''; }
  if (!t) return;
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.webContents.send('command', { action: 'add-note', text: t });
  }
}

let noteHotkeyOk = false;
function registerHotkey() {
  try { globalShortcut.unregisterAll(); } catch { /* */ }
  const acc = (config.hotkey || '').trim();
  const nAcc = (config.noteHotkey || '').trim();
  hotkeyOk = false;
  noteHotkeyOk = false;
  if (acc) {
    try { hotkeyOk = globalShortcut.register(acc, () => manualRead(clipboard.readText(), 'Pano')); }
    catch { hotkeyOk = false; }
  }
  if (nAcc) {
    try { noteHotkeyOk = globalShortcut.register(nAcc, addNoteFromClipboard); }
    catch { noteHotkeyOk = false; }
  }
  dlog('kisayol', acc, hotkeyOk ? 'ok' : 'KAYIT EDILEMEDI', '| not:', nAcc, noteHotkeyOk ? 'ok' : 'KAYIT EDILEMEDI');
  sendCommand('hotkey', { ok: hotkeyOk, hotkey: acc, noteOk: noteHotkeyOk, noteHotkey: nAcc });
  return hotkeyOk;
}

// ---- Yerel API (tarayici uzantisi) ----
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
          manualRead(text, 'Sayfadan');
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

// Gelistirici: OKUR_DEMO=1 -> ornek icerik (tasarim kontrolu icin)
function runDemo() {
  const demo = 'Pofu reads any text you copy. It detects the language, translates it into yours and reads it aloud with a natural voice. Should I continue with the next step?';
  setTimeout(() => manualRead(demo, 'Kopyalanan metin'), 800);
  if (process.env.OKUR_DEMO === '2') setTimeout(() => manualRead('İkinci metin: bu yeni kopyalanan yazı, eskisini kesmeli.', 'Kopyalanan metin'), 4500);
  if (process.env.OKUR_DEMO_TAB) setTimeout(() => sendCommand('tab', { tab: process.env.OKUR_DEMO_TAB }), 5000);
  if (process.env.OKUR_DEMO_SEL) setTimeout(() => sendCommand('demo-sel'), Number(process.env.OKUR_DEMO_SEL));
  if (process.env.OKUR_DEMO_CUE && win) setTimeout(() => win.webContents.send('read', {
    id: 'a', label: 'para-app', kind: 'approval', isQuestion: true, manual: false,
    title: 'Veritabanı şemasını değiştireyim mi?',
    src: { lang: 'tr', sentences: ['Veritabanı şemasını değiştireyim mi?'] }, tr: null,
  }), Number(process.env.OKUR_DEMO_CUE));
  if (config.claudeMode) {
    setTimeout(() => {
      const mk = (id, label, status, title) => sessions.set(id, { id, label, cwd: '', status, title, ts: Date.now(), lastActivity: Date.now() });
      mk('a', 'para-app', 'approval', 'Veritabanı şemasını değiştireyim mi?');
      mk('b', 'pofu', 'working', '');
      mk('c', 'web-site', 'done', 'Testler geçti, derleme hazır.');
      sendSessions();
    }, 1200);
  }
}

// ---- IPC ----
ipcMain.on('renderer-ready', (e) => {
  e.sender.send('config', publicConfig());
  e.sender.send('command', { action: 'hotkey', ok: hotkeyOk, hotkey: config.hotkey, noteOk: noteHotkeyOk, noteHotkey: config.noteHotkey });
  startWatcher();
  sendSessions();
  if (process.env.OKUR_DEMO) runDemo();
});

ipcMain.on('focus-session', (_e, payload) => {
  if (payload && payload.id) focusSession(payload.id);
});

ipcMain.handle('win-pos', () => (win && !win.isDestroyed()) ? win.getPosition() : [0, 0]);
ipcMain.on('win-move', (_e, p) => {
  if (!win || win.isDestroyed() || !p) return;
  dragUntil = Date.now() + 700;
  win.setBounds({ x: Math.round(p.x), y: Math.round(p.y), width: wantW, height: wantH });
});

ipcMain.on('resize', (_e, payload) => {
  if (!payload) return;
  const h = Math.max(70, Math.min(760, Math.round(payload.height || 0)));
  const w = payload.width ? Math.max(MINI_W, Math.min(420, Math.round(payload.width))) : null;
  applyResize(h, w);
});

ipcMain.on('state', () => { /* tepsi ipucu icin yer */ });

ipcMain.on('save-config', (_e, partial) => {
  if (!partial || typeof partial !== 'object') return;
  const filterChanged = ('projectFilter' in partial && partial.projectFilter !== config.projectFilter)
    || ('claudeMode' in partial && partial.claudeMode !== config.claudeMode);
  const mutedChanged = 'muted' in partial && partial.muted !== config.muted;
  const hotkeyChanged = ('hotkey' in partial && partial.hotkey !== config.hotkey)
    || ('noteHotkey' in partial && partial.noteHotkey !== config.noteHotkey);
  const targetChanged = 'targetLang' in partial && partial.targetLang !== config.targetLang;
  config = { ...config, ...partial };
  if (config.autoMode) { config.engine = 'auto'; config.language = 'auto'; }
  saveConfig();
  if (mutedChanged) rebuildTrayMenu();
  if (filterChanged) startWatcher();
  if (hotkeyChanged) registerHotkey();
  if (targetChanged && win && !win.isDestroyed()) win.webContents.send('config', publicConfig());
});

ipcMain.on('read-text', (_e, payload) => manualRead(payload && payload.text, 'Yazılan metin'));
ipcMain.on('read-clipboard', () => manualRead(clipboard.readText(), 'Pano'));
ipcMain.on('setup-voices', () => setupVoices());

// Panelde secilen kelime/cumle icin kisa ceviri (ceviri kapaliysa bos doner)
ipcMain.handle('translate-snippet', async (_e, payload) => {
  const text = String((payload && payload.text) || '').trim().slice(0, 300);
  if (!text || !config.translate) return '';
  try {
    const target = targetLang();
    const res = await translate(text, target, detect(text, lastLang));
    if (!res || res.srcLang === target) return '';
    return String(res.text || '').trim();
  } catch { return ''; }
});
ipcMain.on('quit', () => { app.isQuiting = true; app.quit(); });

// ---- Yasam dongusu ----
// Gelistirici: OKUR_USERDATA=klasor -> ayri profil (calisan Pofu'yla cakismaz)
if (process.env.OKUR_USERDATA) app.setPath('userData', process.env.OKUR_USERDATA);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Ikinci kez calistirilinca (kisayol/Pofu.vbs) mevcut pencereyi goster.
  app.on('second-instance', () => {
    showWindow();
    try { win.focus(); } catch { /* */ }
  });

  app.whenReady().then(() => {
    migrateOldConfig();
    config = loadConfig();
    createWindow();
    createTray();
    registerHotkey();
    startApiServer();
    startClipboardWatch();
    startTtsServer();
    cleanupLoginItem();
  });

  app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch { /* */ }
    try { if (apiServer) apiServer.close(); } catch { /* */ }
    try { if (ttsProc) ttsProc.kill(); } catch { /* */ }
  });

  app.on('window-all-closed', () => { /* tepsiden yonetiliyor */ });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
