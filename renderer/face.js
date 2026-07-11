'use strict';

// ---- Durum ----
let cfg = {
  engine: 'auto',
  chatterboxUrl: 'http://127.0.0.1:7888',
  rate: 1.0,
  language: 'auto',
  voiceName: '',
  skipCode: true,
  autoRead: true,
  readScope: 'lastParagraph',
  cueSound: false,
  cueFlash: true,
  muted: false,
  projectFilter: '',
  hotkey: 'CommandOrControl+Alt+S',
  readOnCopy: false,
};

let sentences = [];      // { text, lang, el }
let idx = -1;            // su an okunan cumle (yoksa -1)
let state = 'idle';      // 'idle' | 'playing' | 'paused'
let engine = 'browser';  // fiili motor
let chatterboxOk = false;
let voices = [];
let stopped = false;
let cueTimer = null;
let gen = 0; // konusma nesli — eski onend'lerin yanlislikla ilerletmesini onler
const audio = new Audio();

// Algilanan dile gore bildirim kelimesi
const CUE_WORDS = {
  done: { en: 'Done', tr: 'Bitti', de: 'Fertig', fr: 'Termine', es: 'Listo', it: 'Fatto', pt: 'Pronto', nl: 'Klaar', pl: 'Gotowe', sv: 'Klart', ru: 'Gotovo', ja: 'Kanryo', ko: 'Wanryo', zh: 'Wancheng', ar: 'Tamma', hi: 'Ho gaya', el: 'Etoimo', he: 'Siyum', th: 'Set' },
  question: { en: 'Question', tr: 'Soru', de: 'Frage', fr: 'Question', es: 'Pregunta', it: 'Domanda', pt: 'Pergunta', nl: 'Vraag', pl: 'Pytanie', sv: 'Fraga', ru: 'Vopros', ja: 'Shitsumon', ko: 'Jilmun', zh: 'Wenti', ar: 'Sual', hi: 'Sawaal', el: 'Erotisi', he: 'Sheela', th: 'Kamtham' },
};

const LANGS = [
  ['auto', 'Otomatik'], ['tr', 'Turkce'], ['en', 'English'], ['de', 'Deutsch'],
  ['fr', 'Francais'], ['es', 'Espanol'], ['it', 'Italiano'], ['pt', 'Portugues'],
  ['nl', 'Nederlands'], ['pl', 'Polski'], ['sv', 'Svenska'], ['ru', 'Russian'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['ar', 'Arabic'],
  ['hi', 'Hindi'], ['el', 'Greek'], ['he', 'Hebrew'], ['th', 'Thai'],
];

const $ = (s) => document.querySelector(s);

// ---- Sesler ----
function refreshVoices() {
  voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  populateVoiceSelect();
}
if (window.speechSynthesis) {
  speechSynthesis.onvoiceschanged = refreshVoices;
}

function pickVoice(langCode) {
  if (!voices.length) voices = speechSynthesis.getVoices();
  const lc = (langCode || 'en').toLowerCase();
  // Kullanicinin sabitledigi ses (yalniz dil otomatik degilse anlamli)
  if (cfg.voiceName) {
    const chosen = voices.find((v) => v.name === cfg.voiceName);
    if (chosen && (cfg.language !== 'auto' || chosen.lang.toLowerCase().startsWith(lc))) return chosen;
  }
  let v = voices.find((x) => x.lang && x.lang.toLowerCase().startsWith(lc + '-'));
  if (!v) v = voices.find((x) => x.lang && x.lang.toLowerCase().startsWith(lc));
  if (!v && lc === 'en') v = voices.find((x) => /^en/i.test(x.lang));
  return v || null;
}

// ---- Motor tespiti ----
async function detectEngine() {
  chatterboxOk = false;
  if (cfg.engine !== 'browser') {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 800);
      const url = cfg.chatterboxUrl.replace(/\/$/, '') + '/health';
      const r = await fetch(url, { signal: c.signal });
      clearTimeout(t);
      chatterboxOk = r.ok;
    } catch { chatterboxOk = false; }
  }
  if (cfg.engine === 'chatterbox') engine = 'chatterbox';
  else if (cfg.engine === 'browser') engine = 'browser';
  else engine = chatterboxOk ? 'chatterbox' : 'browser';
  updateStatus();
}

// ---- Konusma ----
function speak(text, lang, onend) {
  if (engine === 'chatterbox') return speakChatterbox(text, lang, onend);
  return speakBrowser(text, lang, onend);
}

function speakBrowser(text, lang, onend) {
  try { speechSynthesis.cancel(); } catch { /* yoksay */ }
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(lang);
  u.lang = v ? v.lang : (lang || 'en');
  if (v) u.voice = v;
  u.rate = cfg.rate || 1;
  u.onend = () => onend && onend();
  u.onerror = () => onend && onend();
  speechSynthesis.speak(u);
}

async function speakChatterbox(text, lang, onend) {
  try {
    const url = cfg.chatterboxUrl.replace(/\/$/, '') + '/tts';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: (lang || 'en').slice(0, 2) }),
    });
    if (!r.ok) throw new Error('tts ' + r.status);
    const blob = await r.blob();
    if (audio.src) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(blob);
    audio.playbackRate = cfg.rate || 1;
    audio.onended = () => onend && onend();
    audio.onerror = () => onend && onend();
    await audio.play();
  } catch {
    // Bu cumle icin tarayici sesine dus
    engine = 'browser';
    updateStatus();
    speakBrowser(text, lang, onend);
  }
}

// ---- Oynatma dongusu ----
function playFrom(i) {
  idx = i;
  if (idx >= sentences.length) { setState('idle'); setFace(false); return; }
  highlight(idx);
  const myGen = ++gen;
  const s = sentences[idx];
  speak(s.text, s.lang, () => {
    if (myGen !== gen || stopped || state !== 'playing') return;
    playFrom(idx + 1);
  });
}

// Su anki konusmayi durdurur (durumu sifirlamadan) — atlama/manuel okuma icin.
function cancelCurrent() {
  gen++; // bekleyen onend'leri gecersiz kil
  if (engine === 'browser') { try { speechSynthesis.cancel(); } catch { /* */ } }
  else { try { audio.pause(); audio.currentTime = 0; } catch { /* */ } }
}

// Belirli bir cumleye atla ve oradan oku (tiklayinca) — uzerinde lighter yanar.
function jumpTo(i) {
  if (i < 0 || i >= sentences.length) return;
  cancelCurrent();
  stopped = false;
  setState('playing');
  setFace(true);
  playFrom(i);
}

function indexOfEl(el) {
  for (let j = 0; j < sentences.length; j++) if (sentences[j].el === el) return j;
  return -1;
}

function startNext() {
  if (idx + 1 >= sentences.length) return;
  stopped = false;
  setState('playing');
  setFace(true);
  playFrom(idx + 1);
}

function pause() {
  setState('paused');
  setFace(false);
  if (engine === 'browser') { try { speechSynthesis.pause(); } catch { /* */ } }
  else { try { audio.pause(); } catch { /* */ } }
}

function resume() {
  setState('playing');
  setFace(true);
  if (engine === 'browser') {
    try { speechSynthesis.resume(); } catch { /* */ }
  } else {
    audio.play().catch(() => {});
  }
}

function stopAll() {
  stopped = true;
  gen++; // bekleyen onend'leri gecersiz kil
  setState('idle');
  setFace(false);
  if (engine === 'browser') { try { speechSynthesis.cancel(); } catch { /* */ } }
  else { try { audio.pause(); audio.currentTime = 0; } catch { /* */ } }
  // idx yerinde kalir: "son kaldigin yer" alevle isikli durmaya devam eder.
}

function toggle() {
  if (state === 'playing') pause();
  else if (state === 'paused') resume();
  else startNext();
}

// ---- Altyazi / lighter ----
// Her cevap bir "blok"tur; blok basinda hangi oturumdan geldigi yazar.
function addSentences(list, lang, label) {
  const linesEl = $('#lines');
  const block = document.createElement('div');
  block.className = 'block';
  if (label) {
    const h = document.createElement('div');
    h.className = 'block-label';
    h.textContent = label;
    block.appendChild(h);
  }
  for (const text of list) {
    const el = document.createElement('div');
    el.className = 'line';
    el.textContent = text;
    el.title = 'Buradan oku';
    el.addEventListener('click', () => jumpTo(indexOfEl(el)));
    block.appendChild(el);
    sentences.push({ text, lang, label: label || '', el });
  }
  linesEl.appendChild(block);
  $('#caption').classList.remove('hidden');
  trimCaption();
}

function trimCaption() {
  // Cok uzamasin: en fazla 120 cumle tut.
  const MAX = 120;
  while (sentences.length > MAX && idx > 10) {
    const s = sentences.shift();
    const el = s.el;
    const block = el && el.parentNode;
    if (el && block) {
      block.removeChild(el);
      if (block.querySelectorAll('.line').length === 0 && block.parentNode) {
        block.parentNode.removeChild(block);
      }
    }
    idx--;
  }
}

function highlight(i) {
  for (let j = 0; j < sentences.length; j++) {
    const el = sentences[j].el;
    el.classList.toggle('lit', j === i);
    el.classList.toggle('read', j < i);
  }
  const cur = sentences[i];
  if (cur) {
    if (cur.el) cur.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const nr = $('#nowReading');
    if (nr) nr.textContent = cur.label || '';
  }
}

// ---- Surat durumu + ipuclari ----
function setFace(speaking) {
  const face = $('#face');
  face.classList.toggle('speaking', !!speaking);
  face.classList.toggle('idle', !speaking);
  $('#app').classList.toggle('paused', state === 'paused');
  updateToggleBtn();
}

function updateToggleBtn() {
  const b = $('#btnToggle');
  if (b) b.classList.toggle('playing', state === 'playing');
}

function isQuestionMessage(list) {
  for (let k = list.length - 1; k >= 0; k--) {
    const t = (list[k] || '').trim();
    if (!t) continue;
    return /[?？]["')\]]*$/.test(t);
  }
  return false;
}

function playCue(isQuestion, lang, label) {
  const kind = isQuestion ? 'question' : 'done';
  const face = $('#face');
  const badge = $('#cueBadge');
  // Yazili bildirim: hangi oturum + tip (✓ bitti / ❓ soru)
  const text = label || (CUE_WORDS[kind][lang] || CUE_WORDS[kind].en);

  // Gorsel ipucu (titreme + yazili bildirim)
  if (cfg.cueFlash) {
    face.classList.remove('shake', 'blink');
    void face.offsetWidth; // animasyonu yeniden tetikle
    face.classList.add(isQuestion ? 'blink' : 'shake');
    badge.textContent = text;
    badge.classList.toggle('q', isQuestion);
    badge.classList.add('show');
    clearTimeout(cueTimer);
    cueTimer = setTimeout(() => {
      badge.classList.remove('show');
      face.classList.remove('shake', 'blink');
    }, 3500);
  }

  // Sesli "Bitti/Soru" — yalniz acikca istenirse ve bosta iken
  if (cfg.cueSound && !cfg.muted && state !== 'playing') {
    try { speechSynthesis.cancel(); } catch { /* */ }
    const u = new SpeechSynthesisUtterance(CUE_WORDS[kind][lang] || CUE_WORDS[kind].en);
    const v = pickVoice(lang);
    u.lang = v ? v.lang : (lang || 'en');
    if (v) u.voice = v;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }
}

// ---- Ana sustur ----
function applyMuted(m) {
  cfg.muted = !!m;
  $('#app').classList.toggle('muted', m);
  if (m) {
    stopAll();
    const badge = $('#cueBadge');
    if (badge) {
      badge.textContent = 'Sessiz';
      badge.classList.remove('q');
      badge.classList.add('show');
      clearTimeout(cueTimer);
      cueTimer = setTimeout(() => badge.classList.remove('show'), 1500);
    }
  }
}

function toggleMute() {
  const m = !cfg.muted;
  applyMuted(m);
  window.okur.saveConfig({ muted: m });
}

// ---- Yeni cevap / manuel okuma geldi ----
function onRead({ sentences: list, lang, label, isQuestion, manual }) {
  if (!manual && cfg.muted) return;
  if (!list || !list.length) return;
  const language = lang || 'en';

  // Manuel (secili/pano metni): hemen oku — mute/autoRead'i yok say.
  if (manual) {
    const startIdx = sentences.length;
    addSentences(list, language, label || 'Seçili metin');
    jumpTo(startIdx);
    return;
  }

  playCue(!!isQuestion, language, label || '');
  const wasIdle = (state === 'idle');
  addSentences(list, language, label || '');
  if (cfg.autoRead && wasIdle) {
    setTimeout(() => { if (state === 'idle' && !cfg.muted) startNext(); }, cfg.cueSound ? 650 : 150);
  }
}

// ---- Durum yazisi ----
function setState(s) { state = s; window.okur.setState({ state }); updateToggleBtn(); }

function updateStatus() {
  const eng = engine === 'chatterbox' ? 'Chatterbox' : 'Tarayici';
  const langLabel = cfg.language === 'auto' ? 'oto' : cfg.language;
  const st = $('#status');
  if (st) st.textContent = `${eng} • ${langLabel}`;
}

// ---- Ayar UI ----
function populateLangSelect() {
  const sel = $('#setLang');
  sel.innerHTML = '';
  for (const [code, label] of LANGS) {
    const o = document.createElement('option');
    o.value = code; o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = cfg.language;
}

function populateVoiceSelect() {
  const sel = $('#setVoice');
  if (!sel) return;
  const prev = cfg.voiceName;
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = ''; auto.textContent = 'Otomatik (dile gore)';
  sel.appendChild(auto);
  for (const v of voices) {
    const o = document.createElement('option');
    o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  }
  sel.value = prev || '';
}

function prettyHotkey(acc) {
  return String(acc || '')
    .replace(/CommandOrControl|CmdOrCtrl/gi, 'Ctrl')
    .replace(/Command|Cmd/gi, 'Cmd')
    .replace(/Control/gi, 'Ctrl');
}

function setHotkeyHint(hk, ok) {
  const hint = $('#hotkeyHint');
  if (!hint) return;
  const pk = prettyHotkey(hk);
  hint.textContent = ok === false
    ? '⚠ ' + pk + ' kayıt edilemedi (başka uygulamada). Ayarlardan değiştir.'
    : 'Seç → kopyala (Ctrl+C) → oku. Ya da kısayol: ' + pk;
}

function applyConfigToUI() {
  $('#setEngine').value = cfg.engine;
  $('#setScope').value = cfg.readScope || 'lastParagraph';
  populateLangSelect();
  populateVoiceSelect();
  $('#setRate').value = cfg.rate;
  $('#rateVal').textContent = (Number(cfg.rate).toFixed(2)) + 'x';
  $('#setAutoRead').checked = !!cfg.autoRead;
  $('#setSkipCode').checked = !!cfg.skipCode;
  $('#setCueSound').checked = !!cfg.cueSound;
  $('#setCueFlash').checked = !!cfg.cueFlash;
  $('#setFilter').value = cfg.projectFilter || '';
  $('#setHotkey').value = cfg.hotkey || '';
  $('#setReadOnCopy').checked = !!cfg.readOnCopy;
  setHotkeyHint(cfg.hotkey, undefined);
  applyMuted(!!cfg.muted);
}

function save(partial) {
  cfg = { ...cfg, ...partial };
  window.okur.saveConfig(partial);
}

function bindUI() {
  // Surat gorseli yuklenemezse yedek emoji
  const img = $('#faceImg');
  img.addEventListener('error', () => {
    img.classList.add('missing');
    $('#fallbackFace').classList.add('show');
  });

  $('#face').addEventListener('click', toggle);
  $('#btnMute').addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
  $('#btnToggle').addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  $('#btnStop').addEventListener('click', stopAll);
  $('#btnSettings').addEventListener('click', () => {
    $('#settings').classList.toggle('hidden');
  });
  $('#btnSpeak').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#speakBox').classList.toggle('hidden');
    const t = $('#speakText');
    if (!$('#speakBox').classList.contains('hidden') && t) t.focus();
  });
  $('#btnReadText').addEventListener('click', () => {
    const t = $('#speakText');
    if (t && t.value.trim()) { window.okur.readText(t.value); }
  });
  $('#btnReadClip').addEventListener('click', () => window.okur.readClipboard());
  $('#btnQuit').addEventListener('click', () => window.okur.quit());

  $('#setEngine').addEventListener('change', (e) => { save({ engine: e.target.value }); detectEngine(); });
  $('#setLang').addEventListener('change', (e) => { save({ language: e.target.value }); updateStatus(); });
  $('#setVoice').addEventListener('change', (e) => { save({ voiceName: e.target.value }); });
  $('#setRate').addEventListener('input', (e) => {
    const r = Number(e.target.value);
    $('#rateVal').textContent = r.toFixed(2) + 'x';
    save({ rate: r });
  });
  $('#setScope').addEventListener('change', (e) => save({ readScope: e.target.value }));
  $('#setAutoRead').addEventListener('change', (e) => save({ autoRead: e.target.checked }));
  $('#setSkipCode').addEventListener('change', (e) => save({ skipCode: e.target.checked }));
  $('#setCueSound').addEventListener('change', (e) => save({ cueSound: e.target.checked }));
  $('#setCueFlash').addEventListener('change', (e) => save({ cueFlash: e.target.checked }));
  $('#setFilter').addEventListener('change', (e) => save({ projectFilter: e.target.value.trim() }));
  $('#setReadOnCopy').addEventListener('change', (e) => save({ readOnCopy: e.target.checked }));
  $('#setHotkey').addEventListener('change', (e) => {
    save({ hotkey: e.target.value.trim() });
    setHotkeyHint(e.target.value.trim(), undefined);
  });
}

// ---- Baslat ----
window.okur.onConfig((c) => {
  cfg = { ...cfg, ...c };
  refreshVoices();
  applyConfigToUI();
  detectEngine();
  updateStatus();
});
window.okur.onRead(onRead);
window.okur.onCommand((msg) => {
  const action = msg && msg.action;
  if (action === 'toggle') toggle();
  else if (action === 'stop') stopAll();
  else if (action === 'muted-on') applyMuted(true);
  else if (action === 'muted-off') applyMuted(false);
  else if (action === 'hotkey') setHotkeyHint(msg.hotkey, msg.ok);
});

window.addEventListener('DOMContentLoaded', () => {
  bindUI();
  if (window.speechSynthesis) speechSynthesis.getVoices();
  updateToggleBtn();
  window.okur.ready();
});
