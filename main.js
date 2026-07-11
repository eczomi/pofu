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
  cueFlash: true,                          // bitince titreme + yazili rozet
  muted: false,                            // ana sustur: acikken hicbir sey okumaz/titremez
  projectFilter: '',                       // yalniz bu proje klasorunu izle ('' = hepsi)
  hotkey: 'CommandOrControl+Alt+S',        // secili/pano metni okuma kisayolu
  noteHotkey: 'CommandOrControl+Alt+Q',    // panodaki metni Gorevler panosuna at (OKUMAZ)
  notes: [],                               // gorevler panosu icerigi (kalici)
  httpPort: 7889,                          // taray ici uzanti buraya metin yollar (sag tik -> Oku)
  readOnCopy: true,                        // sec + kopyala (Ctrl+C) -> otomatik oku
  miniMode: false,                         // cift tik: yalniz maskot (mini) modu
  cfgVersion: 3,                           // ayar goc surumu
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

// "Okur" adindan "Pofu"ya gecis: eski ayar dosyasi varsa bir kez tasi.
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
    const raw = fs.readFileSync(configPath(), 'utf8');
    c = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    c = { ...DEFAULT_CONFIG };
  }
  // Goc v2: metin-oncelikli surume gecis — eski kayitli autoRead=true'yu bir
  // kereligine kapat (kullanici sonra ayardan bilincli acabilir).
  if (!c.cfgVersion || c.cfgVersion < 2) {
    c.autoRead = false;
  }
  // Goc v3: "kopyalayinca oku" geri geldi (istek uzerine) — bir kereligine ac.
  if (!c.cfgVersion || c.cfgVersion < 3) {
    c.readOnCopy = true;
    c.cfgVersion = 3;
  }
  delete c.startWithWindows; // kaldirilan ozellik
  delete c.cueSound;         // kaldirilan ozellik (sesli Bitti/Soru)
  return c;
}

function saveConfig() {
  try { fs.writeFileSync(configPath(), JSON.stringify(config, null, 2)); } catch { /* yoksay */ }
}

function assetPath(name) {
  return path.join(__dirname, 'assets', name);
}

function createWindow() {
  const W = 248;
  const H = 300;
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

  // Suruklerken pencereyi YENIDEN BOYUTLANDIRMA — Windows'ta programatik
  // boyutlandirma suruklemeyi iptal eder ("donma" hissi). Tasima bitene
  // kadar boyutlandirmayi ertele.
  win.on('will-move', () => {
    dragUntil = Date.now() + 700;
  });

  let moveSaveTimer = null;
  const savePos = () => {
    if (!win || win.isDestroyed()) return;
    const [nx, ny] = win.getPosition();
    config.x = nx;
    config.y = ny;
    saveConfig();
  };
  win.on('moved', savePos);
  win.on('move', () => {
    dragUntil = Date.now() + 700;
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(savePos, 400);
  });

  win.on('closed', () => { win = null; });
}

// Surukleme bittikten sonra bekleyen boyutlandirmayi uygula
// Istenen pencere boyutu — tasima ve boyutlandirma HEP birlikte (setBounds)
// verilir; olcekli ekranlarda (%125 vb.) setPosition'in pencereyi sisirmesi
// bilinen bir Electron hatasidir, bu yontem onu onler.
let wantW = 248;
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

// "Windows ile baslat" ozelligi kaldirildi — eski kayit varsa temizle.
function cleanupLoginItem() {
  try {
    app.setLoginItemSettings({
      openAtLogin: false,
      path: process.execPath,
      args: [path.resolve(__dirname)],
    });
  } catch { /* yoksay */ }
}

// Yerel ses (TTS) sunucusunu otomatik baslat — chatterbox-server/.venv kuruluysa.
// Kurulu degilse sessizce atlanir; tarayici sesi calismaya devam eder.
let ttsProc = null;
function startTtsServer() {
  const py = process.platform === 'win32'
    ? path.join(__dirname, 'chatterbox-server', '.venv', 'Scripts', 'python.exe')
    : path.join(__dirname, 'chatterbox-server', '.venv', 'bin', 'python');
  const script = path.join(__dirname, 'chatterbox-server', 'server.py');
  if (!fs.existsSync(py) || !fs.existsSync(script)) { dlog('ses sunucusu: venv yok, atlandi'); return; }
  try {
    const { spawn } = require('child_process');
    ttsProc = spawn(py, [script], { cwd: path.dirname(script), windowsHide: true, stdio: 'ignore' });
    ttsProc.on('exit', (code) => { dlog('ses sunucusu kapandi:', code); ttsProc = null; });
    ttsProc.on('error', (e) => { dlog('ses sunucusu hatasi:', e.message); ttsProc = null; });
    dlog('ses sunucusu baslatildi (pid ' + ttsProc.pid + ')');
  } catch (e) { dlog('ses sunucusu baslatilamadi:', e.message); }
}

// Pano izleyici: "Kopyalayinca oku" acikken yeni kopyalanan metni okur.
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
      if (config.readOnCopy && !config.muted) manualRead(t);
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
  tray.setToolTip('Pofu — Claude yoldaşı');
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
  if (!cwd) return ''; // cwd henuz bilinmiyorsa etiketi sabitleme
  let name;
  try { name = path.basename(cwd) || cwd; } catch { name = cwd; }
  const n = (projectSeq.get(name) || 0) + 1;
  projectSeq.set(name, n);
  const label = n > 1 ? `${name} ${n}` : name;
  fileLabels.set(file, label);
  return label;
}

// ---- Oturum durumu (calisiyor / onay bekliyor / bitti) ----
const sessions = new Map(); // file -> { id, label, cwd, status, title, ts, lastActivity }

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
  dlog('sessions:', list.map((s) => `${s.label}=${s.status}`).join(', ') || '(bos)');
}

// 45 dk hareketsiz oturumlari listeden dusur
setInterval(() => {
  const cutoff = Date.now() - 45 * 60 * 1000;
  let changed = false;
  for (const [f, s] of sessions) {
    if (s.lastActivity < cutoff) { sessions.delete(f); changed = true; }
  }
  if (changed) sendSessions();
}, 60 * 1000);

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
  const title = makeTitle(sentences);

  // Oturum durumunu guncelle: yanit bitti -> done ya da approval
  const s = touchSession(file, cwd);
  s.status = kind;
  s.title = title;
  s.ts = Date.now();
  const label = s.label || 'Claude';
  sendSessions();

  dlog('flush:', label, '| ' + kind, '| ' + sentences.length + ' cumle');
  if (win && !win.isDestroyed()) {
    win.webContents.send('read', { id: file, sentences, lang, label, kind, title, isQuestion: kind === 'approval' });
  }
}

function startWatcher() {
  if (watcher) watcher.stop();
  clearBuffers();
  sessions.clear();
  watcher = new TranscriptWatcher({
    projectFilter: config.projectFilter,
    onText: onAssistantText,
    onActivity: ({ file, cwd }) => {
      // Dosya buyudu = o oturumda is donuyor (arac, dusunme, kullanici...).
      const s = touchSession(file, cwd);
      s.lastActivity = Date.now();
      if (!s.label) s.label = labelFor(file, s.cwd || cwd);
      // Aktivite surdukce yanit "bitti" sayilmaz: bekleyen flush'i ertele.
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

// Oturumun VS Code penceresine odaklan (baslikta proje adini ara).
// Baslikta proje adi yoksa (or. isimsiz calisma alani "Untitled (Workspace)")
// herhangi bir VS Code penceresine odaklan.
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
    if (r1 === 'notfound') {
      // Proje adi baslikta yok -> en azindan VS Code'a git
      focusWindows('Visual Studio Code', (r2) => dlog('focus fallback:', r2));
    }
  });
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

// Panodaki metni Gorevler panosuna at (OKUMAZ — kullanici ▶ ile okutur)
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
    try { hotkeyOk = globalShortcut.register(acc, () => manualRead(clipboard.readText())); }
    catch { hotkeyOk = false; }
  }
  if (nAcc) {
    try { noteHotkeyOk = globalShortcut.register(nAcc, addNoteFromClipboard); }
    catch { noteHotkeyOk = false; }
  }
  dlog('kisayol', acc, hotkeyOk ? 'ok' : 'KAYIT EDILEMEDI', '| not:', nAcc, noteHotkeyOk ? 'ok' : 'KAYIT EDILEMEDI');
  if (win && !win.isDestroyed()) {
    win.webContents.send('command', {
      action: 'hotkey', ok: hotkeyOk, hotkey: acc,
      noteOk: noteHotkeyOk, noteHotkey: nAcc,
    });
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
  e.sender.send('command', {
    action: 'hotkey', ok: hotkeyOk, hotkey: config.hotkey,
    noteOk: noteHotkeyOk, noteHotkey: config.noteHotkey,
  });
  startWatcher();
  sendSessions();
});

// Oturum satirina tiklandi -> o VS Code penceresine git
ipcMain.on('focus-session', (_e, payload) => {
  if (payload && payload.id) focusSession(payload.id);
});

// Maskottan tutup tasima (renderer elle surukler).
// setBounds (konum+boyut birlikte): DPI olcekli ekranlarda buyume hatasini onler.
ipcMain.handle('win-pos', () => (win && !win.isDestroyed()) ? win.getPosition() : [0, 0]);
ipcMain.on('win-move', (_e, p) => {
  if (!win || win.isDestroyed() || !p) return;
  dragUntil = Date.now() + 700; // tasima sirasinda resize erteleme
  win.setBounds({ x: Math.round(p.x), y: Math.round(p.y), width: wantW, height: wantH });
});

// Icerik boyutu degisti -> pencereyi icerige gore boyutla
// (surukleme sirasinda applyResize erteler — donma yok)
ipcMain.on('resize', (_e, payload) => {
  if (!payload) return;
  const h = Math.max(70, Math.min(700, Math.round(payload.height || 0)));
  const w = payload.width ? Math.max(70, Math.min(400, Math.round(payload.width))) : null;
  applyResize(h, w);
});

ipcMain.on('state', () => { /* ileride tray ipucu guncellenebilir */ });

ipcMain.on('save-config', (_e, partial) => {
  const filterChanged = partial && 'projectFilter' in partial &&
    partial.projectFilter !== config.projectFilter;
  const mutedChanged = partial && 'muted' in partial && partial.muted !== config.muted;
  const hotkeyChanged = partial && (
    ('hotkey' in partial && partial.hotkey !== config.hotkey) ||
    ('noteHotkey' in partial && partial.noteHotkey !== config.noteHotkey));
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

  // Pencere gizlense de tepside calismaya devam etsin.
  app.on('window-all-closed', () => { /* cikma; tepsiden yonetiliyor */ });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
