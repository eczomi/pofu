'use strict';

// ---- Durum ----
let cfg = {
  autoMode: true, translate: true, targetLang: '', targetLangResolved: 'tr',
  readWhat: 'translation', voiceGender: 'female',
  engine: 'auto', chatterboxUrl: 'http://127.0.0.1:7888', rate: 1.0, language: 'auto',
  voiceByLang: {}, accents: {}, skipCode: true, claudeMode: true, autoRead: false, claudeArrive: 'queue', readScope: 'lastParagraph',
  cueFlash: true, cueSound: 'chime', muted: false, projectFilter: '', hotkey: 'CommandOrControl+Alt+S',
  noteHotkey: 'CommandOrControl+Alt+Q', notes: [], readOnCopy: true, onNewText: 'interrupt', miniMode: false,
};

let sentences = [];      // seslendirilecek cumleler: { text, lang, el, label }
let idx = -1;            // su an okunan cumle
let state = 'idle';      // 'idle' | 'playing' | 'paused'
let engine = 'browser';  // fiili motor: 'browser' | 'chatterbox' (= yerel ses sunucusu)
let serverOk = false;
let serverEngine = '';   // sunucunun motoru: 'edge' | 'chatterbox'
let serverError = '';
let voices = [];         // Windows / tarayici sesleri
let serverVoices = [];   // sunucunun dogal sesleri
let stopped = false;
let cueTimer = null;
let gen = 0;             // konusma nesli: eski onend'ler ilerletmesin
let lastPayload = null;  // son okuma paketi (seslendirme tercihi degisince yeniden okumak icin)
let activeTab = 'read';
let busyText = '';
const audio = new Audio();

const LANGS = [
  ['tr', 'Türkçe'], ['en', 'İngilizce'], ['de', 'Almanca'], ['fr', 'Fransızca'],
  ['es', 'İspanyolca'], ['it', 'İtalyanca'], ['pt', 'Portekizce'], ['nl', 'Felemenkçe'],
  ['pl', 'Lehçe'], ['sv', 'İsveççe'], ['ru', 'Rusça'], ['ja', 'Japonca'], ['ko', 'Korece'],
  ['zh', 'Çince'], ['ar', 'Arapça'], ['hi', 'Hintçe'], ['el', 'Yunanca'], ['he', 'İbranice'], ['th', 'Tayca'],
];
const LANG_NAME = Object.fromEntries(LANGS);
const langName = (c) => LANG_NAME[c] || String(c || '').toUpperCase();

// Dil basina onerilen dogal sesler (kadin, erkek). Sunucu listesinde yoksa
// ayni dilden ilk uygun ses secilir.
const SERVER_DEFAULTS = {
  tr: ['tr-TR-EmelNeural', 'tr-TR-AhmetNeural'], en: ['en-US-AriaNeural', 'en-US-GuyNeural'],
  de: ['de-DE-KatjaNeural', 'de-DE-ConradNeural'], fr: ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
  es: ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'], it: ['it-IT-ElsaNeural', 'it-IT-DiegoNeural'],
  pt: ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'], nl: ['nl-NL-ColetteNeural', 'nl-NL-MaartenNeural'],
  pl: ['pl-PL-ZofiaNeural', 'pl-PL-MarekNeural'], sv: ['sv-SE-SofieNeural', 'sv-SE-MattiasNeural'],
  ru: ['ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural'], ja: ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
  ko: ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'], zh: ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
  ar: ['ar-SA-ZariyahNeural', 'ar-SA-HamedNeural'], hi: ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'],
  el: ['el-GR-AthinaNeural', 'el-GR-NestorasNeural'], he: ['he-IL-HilaNeural', 'he-IL-AvriNeural'],
  th: ['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural'],
};
// Aksan (bolge) secenekleri: [yerel kod, etiket, onerilen kadin, onerilen erkek].
// Ilk satir varsayilan. Onerilen ses sunucuda yoksa ayni bolgeden uygun ses secilir.
const ACCENTS = {
  en: [
    ['en-US', 'Amerikan', 'en-US-AriaNeural', 'en-US-GuyNeural'],
    ['en-GB', 'İngiliz', 'en-GB-SoniaNeural', 'en-GB-RyanNeural'],
    ['en-AU', 'Avustralya', 'en-AU-NatashaNeural', 'en-AU-WilliamMultilingualNeural'],
    ['en-CA', 'Kanada', 'en-CA-ClaraNeural', 'en-CA-LiamNeural'],
    ['en-IE', 'İrlanda', 'en-IE-EmilyNeural', 'en-IE-ConnorNeural'],
    ['en-IN', 'Hint', 'en-IN-NeerjaNeural', 'en-IN-PrabhatNeural'],
  ],
  pt: [
    ['pt-BR', 'Brezilya', 'pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'],
    ['pt-PT', 'Portekiz', 'pt-PT-RaquelNeural', 'pt-PT-DuarteNeural'],
  ],
  es: [
    ['es-ES', 'İspanya', 'es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
    ['es-MX', 'Meksika', 'es-MX-DaliaNeural', 'es-MX-JorgeNeural'],
    ['es-AR', 'Arjantin', 'es-AR-ElenaNeural', 'es-AR-TomasNeural'],
  ],
  fr: [
    ['fr-FR', 'Fransa', 'fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
    ['fr-CA', 'Québec', 'fr-CA-SylvieNeural', 'fr-CA-AntoineNeural'],
    ['fr-BE', 'Belçika', 'fr-BE-CharlineNeural', 'fr-BE-GerardNeural'],
    ['fr-CH', 'İsviçre', 'fr-CH-ArianeNeural', 'fr-CH-FabriceNeural'],
  ],
  de: [
    ['de-DE', 'Almanya', 'de-DE-KatjaNeural', 'de-DE-ConradNeural'],
    ['de-AT', 'Avusturya', 'de-AT-IngridNeural', 'de-AT-JonasNeural'],
    ['de-CH', 'İsviçre', 'de-CH-LeniNeural', 'de-CH-JanNeural'],
  ],
  zh: [
    ['zh-CN', 'Mandarin', 'zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
    ['zh-TW', 'Tayvan', 'zh-TW-HsiaoChenNeural', 'zh-TW-YunJheNeural'],
  ],
};
const ACCENT_SAMPLE = {
  en: 'Hello! This is how I sound.', pt: 'Olá! É assim que eu falo.', es: 'Hola, así es como sueno.',
  fr: 'Bonjour, voici ma voix.', de: 'Hallo, so klinge ich.', zh: '你好，这是我的声音。',
};
// Bu dil icin secili aksan satiri (yoksa null = dilin varsayilani)
function accentFor(lc) {
  const list = ACCENTS[lc];
  if (!list) return null;
  const want = cfg.accents && cfg.accents[lc];
  return list.find((a) => a[0] === want) || null;
}
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['tr'], { type: 'region' }); } catch { /* */ }
const regionOf = (loc) => { const r = String(loc || '').split('-')[1] || ''; try { return regionNames ? regionNames.of(r) : r; } catch { return r; } };

// Windows ses adlarindan cinsiyet tahmini
const FEMALE_RE = /zira|hazel|susan|heera|hoda|hedda|helena|elsa|laura|paulina|irina|haruka|ayumi|heami|huihui|yaoyao|tracy|catherine|linda|sabina|hortense|julie|hanna|caroline|kalpana|maria|emel|seda|filiz|female|kadın/i;
const MALE_RE = /david|mark|george|james|richard|ravi|stefan|hemant|ichiro|kangkang|tolga|pablo|raul|cosimo|paul|frank|bart|adam|pavel|ivan|andika|male|erkek/i;

const CUE_WORDS = {
  done: { en: 'Done', tr: 'Bitti', de: 'Fertig', fr: 'Terminé', es: 'Listo', it: 'Fatto', pt: 'Pronto', nl: 'Klaar', pl: 'Gotowe', sv: 'Klart', ru: 'Готово', ja: '完了', ko: '완료', zh: '完成', ar: 'تم', hi: 'हो गया', el: 'Έτοιμο', he: 'סיום', th: 'เสร็จ' },
  question: { en: 'Question', tr: 'Soru', de: 'Frage', fr: 'Question', es: 'Pregunta', it: 'Domanda', pt: 'Pergunta', nl: 'Vraag', pl: 'Pytanie', sv: 'Fråga', ru: 'Вопрос', ja: '質問', ko: '질문', zh: '问题', ar: 'سؤال', hi: 'सवाल', el: 'Ερώτηση', he: 'שאלה', th: 'คำถาม' },
};

const $ = (s) => document.querySelector(s);
const LISTEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

// ---- Sesler ----
function refreshVoices() {
  voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  populateVoiceSelect();
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = refreshVoices;

const lang2 = (s) => String(s || '').toLowerCase().split(/[-_]/)[0];
const wantMale = () => cfg.voiceGender === 'male';

// Kullanicinin bu dil icin sabitledigi ses (yalniz gelismis modda)
function userVoiceFor(lang) {
  if (cfg.autoMode) return '';
  return (cfg.voiceByLang && cfg.voiceByLang[lang]) || '';
}

function serverVoiceFor(lang) {
  const lc = lang2(lang) || 'en';
  const u = userVoiceFor(lc);
  if (u && isServerVoice(u)) return u;
  const g = wantMale() ? 'male' : 'female';
  const acc = accentFor(lc);
  if (acc) {
    const def = acc[wantMale() ? 3 : 2];
    if (!serverVoices.length || isServerVoice(def)) return def;
    const reg = serverVoices.filter((v) => v.lang === acc[0]);
    const pick = reg.find((v) => String(v.gender).toLowerCase() === g) || reg[0];
    if (pick) return pick.name;
  }
  const def = (SERVER_DEFAULTS[lc] || SERVER_DEFAULTS.en)[wantMale() ? 1 : 0];
  if (!serverVoices.length || isServerVoice(def)) return def;
  const same = serverVoices.filter((v) => lang2(v.lang) === lc);
  const byGender = same.find((v) => String(v.gender).toLowerCase() === g);
  return (byGender || same[0] || { name: '' }).name;
}

function browserVoiceFor(lang) {
  if (!voices.length) voices = speechSynthesis.getVoices();
  const lc = lang2(lang) || 'en';
  const u = userVoiceFor(lc);
  if (u) { const v = voices.find((x) => x.name === u); if (v) return v; }
  let same = voices.filter((v) => lang2(v.lang) === lc);
  if (!same.length) return null;
  const acc = accentFor(lc);
  if (acc) {
    const reg = same.filter((v) => String(v.lang).replace('_', '-').toLowerCase() === acc[0].toLowerCase());
    if (reg.length) same = reg;
  }
  const re = wantMale() ? MALE_RE : FEMALE_RE;
  return same.find((v) => re.test(v.name)) || same[0];
}

function isServerVoice(name) { return !!name && serverVoices.some((v) => v.name === name); }

// ---- Motor tespiti ----
let detectTries = 0;
let detectTimer = null;

async function detectEngine() {
  clearTimeout(detectTimer);
  let ok = false;
  if (cfg.engine !== 'browser') {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 900);
      const r = await fetch(cfg.chatterboxUrl.replace(/\/$/, '') + '/health', { signal: c.signal });
      clearTimeout(t);
      ok = r.ok;
      if (ok) {
        try { const j = await r.json(); serverEngine = j.engine || ''; serverError = j.error || ''; } catch { /* */ }
      }
    } catch { ok = false; }
  }
  serverOk = ok;
  if (cfg.engine === 'chatterbox') engine = ok ? 'chatterbox' : 'browser';
  else if (cfg.engine === 'browser') engine = 'browser';
  else engine = ok ? 'chatterbox' : 'browser';
  updateStatus();
  if (ok && !serverVoices.length) loadServerVoices();

  // Sunucu Pofu'yla birlikte aciliyor; hazir olana kadar tekrar dene, sonra seyrek kontrol et.
  if (!ok && cfg.engine !== 'browser') {
    detectTries++;
    detectTimer = setTimeout(detectEngine, detectTries < 8 ? 2000 : 20000);
  } else if (ok) {
    detectTries = 0;
    detectTimer = setTimeout(detectEngine, 30000);
  }
}

async function loadServerVoices() {
  try {
    const r = await fetch(cfg.chatterboxUrl.replace(/\/$/, '') + '/voices');
    if (!r.ok) return;
    const all = await r.json();
    const known = new Set(LANGS.map((l) => l[0]));
    serverVoices = (all || []).filter((v) => known.has(lang2(v.lang)));
    populateVoiceSelect();
    updateStatus();
  } catch { /* sunucu yok */ }
}

// ---- Konusma ----
const audioCache = new Map(); // key -> Promise<Blob>
function cacheKey(text, lang) {
  return [text, lang, serverVoiceFor(lang), cfg.voiceGender, cfg.rate].join('|');
}

function fetchServerAudio(text, lang) {
  const key = cacheKey(text, lang);
  if (audioCache.has(key)) return audioCache.get(key);
  const p = (async () => {
    const r = await fetch(cfg.chatterboxUrl.replace(/\/$/, '') + '/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language: lang2(lang) || 'en',
        voice: serverVoiceFor(lang),
        gender: cfg.voiceGender,
        rate: cfg.rate || 1,
      }),
    });
    if (!r.ok) {
      let msg = 'tts ' + r.status;
      try { msg = (await r.json()).error || msg; } catch { /* */ }
      throw new Error(msg);
    }
    return r.blob();
  })();
  p.catch(() => audioCache.delete(key));
  audioCache.set(key, p);
  if (audioCache.size > 16) audioCache.delete(audioCache.keys().next().value);
  return p;
}

// Siradaki cumleyi onceden hazirla: cumleler arasi bosluk kalmasin.
function prefetch(i) {
  const s = sentences[i];
  if (!s || engine !== 'chatterbox') return;
  fetchServerAudio(s.text, s.lang).catch(() => {});
}

function speak(text, lang, onend) {
  console.log('[pofu] konus:', engine, lang, engine === 'chatterbox' ? serverVoiceFor(lang) : '', String(text).slice(0, 40));
  if (engine === 'chatterbox') return speakServer(text, lang, onend);
  return speakBrowser(text, lang, onend);
}

function speakBrowser(text, lang, onend) {
  try { speechSynthesis.cancel(); } catch { /* */ }
  const u = new SpeechSynthesisUtterance(text);
  const v = browserVoiceFor(lang);
  const acc = accentFor(lang2(lang));
  u.lang = v ? v.lang : (acc ? acc[0] : (lang || 'en'));
  if (v) u.voice = v;
  u.rate = cfg.rate || 1;
  u.onend = () => onend && onend();
  u.onerror = () => onend && onend();
  speechSynthesis.speak(u);
}

async function speakServer(text, lang, onend) {
  const myGen = gen;
  try {
    const blob = await fetchServerAudio(text, lang);
    if (myGen !== gen) return; // bu arada durduruldu / atlandi
    if (audio.src) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(blob);
    // edge: hiz sunucuda uygulanir; chatterbox: oynatma hiziyla
    audio.playbackRate = serverEngine === 'edge' ? 1 : (cfg.rate || 1);
    audio.onended = () => onend && onend();
    audio.onerror = () => onend && onend();
    await audio.play();
    serverError = '';
  } catch (e) {
    if (myGen !== gen) return;
    serverError = (e && e.message) || 'ses sunucusu hatasi';
    console.log('[pofu] ses sunucusu hatasi:', serverError);
    updateStatus();
    speakBrowser(text, lang, onend); // bu cumle icin Windows sesine dus
  }
}

// ---- Oynatma dongusu ----
function playFrom(i) {
  idx = i;
  if (idx >= sentences.length) { setState('idle'); setFace(false); updateStatus(); return; }
  highlight(idx);
  const myGen = ++gen;
  const s = sentences[idx];
  updateStatus();
  speak(s.text, s.lang, () => {
    if (myGen !== gen || stopped || state !== 'playing') return;
    playFrom(idx + 1);
  });
  prefetch(idx + 1);
}

function cancelCurrent() {
  gen++;
  try { speechSynthesis.cancel(); } catch { /* */ }
  try { audio.pause(); audio.currentTime = 0; } catch { /* */ }
}

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
  if (idx + 1 >= sentences.length) {
    // Her sey okunduysa bastan oku
    if (sentences.length) jumpTo(0);
    return;
  }
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
  updateStatus();
}

function resume() {
  setState('playing');
  setFace(true);
  if (engine === 'browser') { try { speechSynthesis.resume(); } catch { /* */ } }
  else { audio.play().catch(() => {}); }
  updateStatus();
}

// Durdur: ses kesilir, kuyruk ve liste temizlenir.
function stopAll(keepList) {
  stopped = true;
  gen++;
  setState('idle');
  setFace(false);
  try { speechSynthesis.cancel(); } catch { /* */ }
  try { audio.pause(); audio.currentTime = 0; } catch { /* */ }
  if (!keepList) {
    sentences = [];
    idx = -1;
    $('#lines').innerHTML = '';
    updateReadEmpty();
  } else {
    for (const s of sentences) s.el.classList.remove('lit');
    idx = -1;
  }
  updateStatus();
  requestResize();
}

function toggle() {
  if (state === 'playing') pause();
  else if (state === 'paused') resume();
  else startNext();
}

// ---- Okuma paneli ----
function voicedParts(p) {
  const rw = cfg.translate ? (cfg.readWhat || 'translation') : 'original';
  if (!p.tr || rw === 'original') return [{ key: 'src', ...p.src }];
  if (rw === 'both') return [{ key: 'src', ...p.src }, { key: 'tr', ...p.tr }];
  return [{ key: 'tr', ...p.tr }];
}

function mkChip(text, cls) {
  const c = document.createElement('span');
  c.className = 'chip ' + (cls || '');
  c.textContent = text;
  return c;
}

// Bir okuma paketini listeye ekler; seslendirilecek cumleleri kuyruga koyar.
function addBlock(p) {
  const linesEl = $('#lines');
  const block = document.createElement('div');
  block.className = 'block';

  const head = document.createElement('div');
  head.className = 'block-head';
  const lbl = document.createElement('span');
  lbl.className = 'block-label';
  lbl.textContent = p.label || 'Metin';
  head.appendChild(lbl);
  head.appendChild(mkChip(p.tr ? `${langName(p.src.lang)} → ${langName(p.tr.lang)}` : langName(p.src.lang), 'lang'));
  if (p.trError) head.appendChild(mkChip(p.trError, 'err'));
  block.appendChild(head);

  const voiced = voicedParts(p);
  const voicedKeys = new Set(voiced.map((v) => v.key));
  const parts = [];
  // Cumle cumle hizali ceviri: her satirda seslendirilen cumle + altinda karsiligi
  const aligned = p.tr && p.tr.aligned && voiced.length === 1
    && p.src.sentences.length === p.tr.sentences.length;
  // Seslendirilen parca ustte, digeri (varsa) altta soluk
  const order = aligned ? [] : (voicedKeys.has('tr') && !voicedKeys.has('src') ? ['tr', 'src'] : ['src', 'tr']);
  if (aligned) {
    const v = voiced[0];
    const other = v.key === 'tr' ? p.src : p.tr;
    const el = document.createElement('div');
    el.className = 'part primary pairs';
    v.sentences.forEach((text, i) => {
      const line = document.createElement('div');
      line.className = 'line';
      line.title = 'Buradan oku';
      const main = document.createElement('span');
      main.className = 'l-main';
      main.textContent = text;
      main.dataset.lang = v.lang;
      const sub = document.createElement('span');
      sub.className = 'l-sub';
      sub.textContent = other.sentences[i] || '';
      sub.dataset.lang = other.lang;
      line.append(main, sub);
      bindLineClick(line);
      el.appendChild(line);
      parts.push({ text, lang: v.lang, el: line, label: p.label || '' });
    });
    block.appendChild(el);
  }
  for (const key of order) {
    const part = key === 'src' ? p.src : p.tr;
    if (!part) continue;
    const el = document.createElement('div');
    const isVoiced = voicedKeys.has(key);
    el.className = 'part ' + (isVoiced ? 'primary' : 'secondary collapsed');
    if (p.tr) {
      const ph = document.createElement('div');
      ph.className = 'part-head';
      ph.textContent = key === 'tr' ? 'Çeviri · ' + langName(part.lang) : 'Orijinal · ' + langName(part.lang);
      if (!isVoiced) ph.addEventListener('click', () => { el.classList.toggle('collapsed'); requestResize(); });
      el.appendChild(ph);
    }
    if (isVoiced) {
      for (const text of part.sentences) {
        const line = document.createElement('div');
        line.className = 'line';
        line.textContent = text;
        line.title = 'Buradan oku';
        line.dataset.lang = part.lang;
        bindLineClick(line);
        el.appendChild(line);
        parts.push({ text, lang: part.lang, el: line, label: p.label || '' });
      }
    } else {
      const pl = document.createElement('p');
      pl.className = 'plain';
      pl.textContent = part.sentences.join(' ');
      pl.dataset.lang = part.lang;
      el.appendChild(pl);
    }
    block.appendChild(el);
  }
  // Seslendirme sirasi: voiced listesi sirasiyla (both: once orijinal sonra ceviri)
  const ordered = [];
  for (const v of voiced) for (const s of parts) if (s.lang === v.lang && !ordered.includes(s) && v.sentences.includes(s.text)) ordered.push(s);
  for (const s of ordered) sentences.push(s);

  linesEl.appendChild(block);
  updateReadEmpty();
  trimList();
}

// Satira tek tik: buradan oku. Cift tik: yalniz o kelimeyi oku (telaffuz).
// Metin seciliyken tik, okumaya atlamaz (secim balonu kullanilir).
function bindLineClick(line) {
  let t = null;
  line.addEventListener('click', () => {
    if (hasSelection()) return;
    clearTimeout(t);
    t = setTimeout(() => { if (!hasSelection()) jumpTo(indexOfEl(line)); }, 260);
  });
  line.addEventListener('dblclick', (e) => {
    clearTimeout(t);
    e.preventDefault();
    onSelectionMade(true);
  });
}

function hasSelection() {
  const s = window.getSelection();
  return !!(s && !s.isCollapsed && String(s).trim());
}

function selectionInfo() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const text = String(sel).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  let node = sel.anchorNode;
  if (node && node.nodeType === 3) node = node.parentElement;
  const holder = node && node.closest ? node.closest('[data-lang]') : null;
  if (!holder || !$('#lines').contains(holder)) return null;
  return { text: text.slice(0, 300), lang: holder.dataset.lang, rect: sel.getRangeAt(0).getBoundingClientRect() };
}

// Secilen kelime/cumleyi kendi dilinde oku; suren okumayi kesmez, bitince kaldigi cumleden devam eder.
let snippetText = '';
function speakSnippet(text, lang) {
  if (!text) return;
  const wasPlaying = state === 'playing';
  const resumeIdx = idx;
  cancelCurrent();
  snippetText = text;
  setFace(true);
  updateStatus();
  const myGen = ++gen;
  speak(text, lang, () => {
    if (myGen !== gen) return;
    snippetText = '';
    if (wasPlaying && resumeIdx >= 0 && resumeIdx < sentences.length) playFrom(resumeIdx);
    else { setFace(state === 'playing'); updateStatus(); }
  });
}

let selCur = null;
function hidePop() { $('#selPop').classList.add('hidden'); selCur = null; }

async function onSelectionMade(autoRead) {
  const info = selectionInfo();
  if (!info) { hidePop(); return; }
  selCur = info;
  const pop = $('#selPop');
  const tr = $('#selTr');
  tr.textContent = '';
  pop.classList.remove('hidden');
  const card = $('#card').getBoundingClientRect();
  const left = Math.max(8, Math.min(info.rect.left - card.left, card.width - 160));
  pop.style.left = left + 'px';
  pop.style.top = (info.rect.bottom - card.top + 6) + 'px';
  if (autoRead) speakSnippet(info.text, info.lang);
  if (cfg.translate && lang2(info.lang) !== lang2(cfg.targetLangResolved || 'tr')) {
    tr.textContent = '…';
    const t = await window.okur.translateSnippet(info.text);
    if (selCur && selCur.text === info.text) tr.textContent = t || '';
  }
}

function trimList() {
  const MAX = 160;
  while (sentences.length > MAX && idx > 10) {
    const s = sentences.shift();
    const el = s.el;
    const part = el && el.parentNode;
    if (el && part) {
      part.removeChild(el);
      const block = part.parentNode;
      if (part.querySelectorAll('.line').length === 0 && block) {
        block.removeChild(part);
        if (!block.querySelector('.line') && block.parentNode) block.parentNode.removeChild(block);
      }
    }
    idx--;
  }
}

function updateReadEmpty() {
  const has = $('#lines').children.length > 0;
  $('#readEmpty').style.display = has ? 'none' : '';
  $('#btnCapClear').style.visibility = has ? '' : 'hidden';
}

function highlight(i) {
  for (let j = 0; j < sentences.length; j++) {
    const el = sentences[j].el;
    el.classList.toggle('lit', j === i);
    el.classList.toggle('read', j < i);
  }
  const cur = sentences[i];
  if (cur && cur.el && activeTab === 'read') cur.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---- Surat / durum ----
function setFace(speaking) {
  $('#face').classList.toggle('speaking', !!speaking);
  $('#face').classList.toggle('idle', !speaking);
  $('#app').classList.toggle('paused', state === 'paused');
  updateToggleBtn();
}
function updateToggleBtn() { $('#btnToggle').classList.toggle('playing', state === 'playing'); }
function setState(s) { state = s; window.okur.setState({ state }); updateToggleBtn(); }

function updateStatus() {
  const chip = $('#engineChip');
  const line = $('#statusLine');
  if (engine === 'chatterbox') {
    if (serverError) { chip.textContent = 'ses hatası'; chip.className = 'chip err'; chip.title = serverError; }
    else { chip.textContent = 'doğal ses'; chip.className = 'chip ok'; chip.title = 'Yerel ses sunucusu bağlı (' + (serverEngine || 'edge') + ')'; }
  } else if (cfg.engine === 'browser') {
    chip.textContent = 'Windows sesi'; chip.className = 'chip'; chip.title = 'Ayarlar: Motor = Windows sesi';
  } else if (!serverOk) {
    chip.textContent = detectTries < 8 && detectTries > 0 ? 'ses aranıyor' : 'Windows sesi';
    chip.className = 'chip warn';
    chip.title = 'Doğal ses sunucusu bulunamadı. Ayarlar > Doğal sesler > Kur';
  }

  let txt;
  const cur = sentences[idx];
  if (busyText) { txt = busyText; line.className = 'busy'; }
  else if (snippetText) { txt = 'Okunuyor · "' + (snippetText.length > 28 ? snippetText.slice(0, 26) + '…' : snippetText) + '"'; line.className = 'reading'; }
  else if (state === 'playing' && cur) { txt = 'Okunuyor · ' + langName(cur.lang); line.className = 'reading'; }
  else if (state === 'paused') { txt = 'Duraklatıldı'; line.className = ''; }
  else {
    const tl = cfg.targetLangResolved || 'tr';
    txt = cfg.translate ? ('Çeviri: ' + langName(tl) + ' · ' + (cfg.voiceGender === 'male' ? 'erkek ses' : 'kadın ses')) : ('Dil otomatik · ' + (cfg.voiceGender === 'male' ? 'erkek ses' : 'kadın ses'));
    line.className = '';
  }
  line.textContent = txt;

  const st = $('#status');
  if (st) {
    const eng = engine === 'chatterbox' ? 'Doğal ses' : 'Windows sesi';
    st.textContent = eng + (serverVoices.length ? ' · ' + serverVoices.length + ' ses' : voices.length ? ' · ' + voices.length + ' ses' : '');
  }
  updateVoiceSetupRow();
}

function setBusy(text) { busyText = text || ''; updateStatus(); }

// ---- Bildirim (Claude yaniti) ----
let bubbleShowing = false;
let bubbleTimer = null;
let cueSessionId = ''; // son bildirimin oturumu: rozete/balona tiklayinca oraya gidilir
function showBubble(label, isQuestion, title) {
  const b = $('#bubble');
  b.classList.toggle('go', !!cueSessionId);
  $('#bubbleHead').textContent = label + ' · ' + (isQuestion ? 'soru' : 'bitti');
  $('#bubbleText').textContent = title || '';
  b.classList.remove('hidden');
  bubbleShowing = true;
  requestResize();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { b.classList.add('hidden'); bubbleShowing = false; requestResize(); }, 5000);
}

function flashBadge(text, isQuestion, ms, sessionId) {
  const badge = $('#cueBadge');
  cueSessionId = sessionId || '';
  badge.textContent = text;
  badge.classList.toggle('q', !!isQuestion);
  badge.classList.toggle('go', !!cueSessionId);
  badge.classList.add('show');
  clearTimeout(cueTimer);
  cueTimer = setTimeout(() => { badge.classList.remove('show'); $('#face').classList.remove('shake', 'blink'); }, ms || 3000);
}

// ---- Bildirim sesleri (Web Audio; dosya gerekmez) ----
// Her ses: nota listesi { f: frekans, t: baslangic (s), d: sure (s), w: dalga, g: kazanc }
const SOUNDS = {
  ping:    [{ f: 880, t: 0, d: 0.22, w: 'sine' }],
  chime:   [{ f: 659, t: 0, d: 0.18, w: 'sine' }, { f: 988, t: 0.13, d: 0.32, w: 'sine' }],
  bell:    [{ f: 1318, t: 0, d: 0.7, w: 'triangle' }, { f: 2637, t: 0, d: 0.35, w: 'sine', g: 0.25 }],
  pop:     [{ f: 420, t: 0, d: 0.07, w: 'square', g: 0.35 }, { f: 640, t: 0.07, d: 0.09, w: 'square', g: 0.3 }],
  marimba: [{ f: 523, t: 0, d: 0.22, w: 'triangle' }, { f: 784, t: 0.14, d: 0.3, w: 'triangle' }],
};
let actx = null;

function playCueSound(name, isQuestion) {
  const notes = SOUNDS[name];
  if (!notes || cfg.muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const seq = notes.slice();
    if (isQuestion) {
      // Soru: sona yukselen bir nota ekle
      const last = notes[notes.length - 1];
      seq.push({ f: last.f * 1.5, t: last.t + last.d * 0.7, d: 0.35, w: last.w, g: last.g });
    }
    const t0 = actx.currentTime + 0.02;
    for (const n of seq) {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = n.w || 'sine';
      osc.frequency.value = n.f;
      const g = (n.g == null ? 0.5 : n.g) * 0.5;
      gain.gain.setValueAtTime(0.0001, t0 + n.t);
      gain.gain.exponentialRampToValueAtTime(g, t0 + n.t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.d);
      osc.connect(gain).connect(actx.destination);
      osc.start(t0 + n.t);
      osc.stop(t0 + n.t + n.d + 0.05);
    }
  } catch { /* ses yoksa sessiz gec */ }
}

function playCue(isQuestion, lang, label, title, sessionId) {
  playCueSound(cfg.cueSound, isQuestion);
  if (!cfg.cueFlash) return;
  const face = $('#face');
  face.classList.remove('shake', 'blink');
  void face.offsetWidth;
  face.classList.add(isQuestion ? 'blink' : 'shake');
  if (cfg.miniMode) {
    cueSessionId = sessionId || '';
    showBubble(label || 'Claude', isQuestion, title || '');
    clearTimeout(cueTimer);
    cueTimer = setTimeout(() => face.classList.remove('shake', 'blink'), 3000);
  } else {
    const kind = isQuestion ? 'question' : 'done';
    flashBadge((label ? label + ' · ' : '') + (CUE_WORDS[kind][lang] || CUE_WORDS[kind].en), isQuestion, 5000, sessionId);
  }
}

// Rozete / balona tikla -> o oturumun VS Code penceresine git
function goToCueSession() {
  if (!cueSessionId) return;
  window.okur.focusSession(cueSessionId);
  if (!cfg.miniMode) setTab('sessions');
}

// ---- Sustur ----
function applyMuted(m) {
  cfg.muted = !!m;
  $('#app').classList.toggle('muted', m);
  if (m) { stopAll(true); flashBadge('Sessiz', false, 1500); }
}
function toggleMute() { const m = !cfg.muted; applyMuted(m); window.okur.saveConfig({ muted: m }); }

// ---- Okuma akisi ----
const lastMsgs = new Map(); // oturum id -> paket

// opts.interrupt: okuma surerken eskisini kes (varsayilan: manuel metinde onNewText ayari)
function readNow(p, opts) {
  console.log('[pofu] okuma geldi:', (p.src && p.src.sentences.length) || 0, 'cumle, durum=' + state);
  lastPayload = p;
  const startIdx = sentences.length;
  addBlock(p);
  if (!cfg.miniMode) setTab('read');
  const interrupt = opts && 'interrupt' in opts ? !!opts.interrupt : (!!p.manual && cfg.onNewText !== 'queue');
  if (state !== 'idle' && interrupt) {
    // Eskisini kes, yeniyi hemen oku (okunmayan eski cumleler listede kalir)
    stopAll(true);
    stopped = false;
    console.log('[pofu] yeni metin: eski okuma kesildi');
  } else if (state !== 'idle') {
    // Siraya eklendi; duraklatilmissa devam edince sirasi gelir
    flashBadge('sıraya eklendi', false, 1400);
    requestResize();
    return;
  }
  if (sentences.length > startIdx) jumpTo(startIdx);
  requestResize();
}

function onRead(msg) {
  if (!msg || !msg.src || !msg.src.sentences || !msg.src.sentences.length) return;
  if (msg.manual) { readNow(msg); return; }
  if (msg.id) lastMsgs.set(msg.id, msg);
  playCue(msg.kind === 'approval', msg.src.lang, msg.label, msg.title || '', msg.id);
  if (cfg.autoRead && !cfg.muted) {
    const mode = cfg.claudeArrive || 'queue';
    if (state === 'idle') setTimeout(() => { if (state === 'idle') readNow(msg); }, 150);
    else if (mode === 'interrupt') readNow(msg, { interrupt: true });
    else if (mode === 'queue') readNow(msg, { interrupt: false });
    // 'skip': okuma surerken yalniz bildirim
  }
}

// ---- Sekmeler ----
function setTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
  requestResize();
}

// ---- Oturumlar ----
const STATUS_TEXT = { working: 'çalışıyor', approval: 'onay bekliyor', done: 'bitti' };
function fmtTime(ts) {
  const d = new Date(ts || Date.now());
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function renderSessions(list) {
  const listEl = $('#sessionList');
  listEl.innerHTML = '';
  const order = { approval: 0, working: 1, done: 2 };
  const sorted = (list || []).slice().sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || (b.ts || 0) - (a.ts || 0));

  for (const s of sorted) {
    const row = document.createElement('div');
    row.className = 'session s-' + (s.status || 'done');
    row.title = 'Tıkla: bu pencereye git';
    const head = document.createElement('div');
    head.className = 'shead';
    const dot = document.createElement('span'); dot.className = 'sdot';
    const name = document.createElement('span'); name.className = 'sname'; name.textContent = s.label || '…';
    const st = document.createElement('span'); st.className = 'sstate'; st.textContent = STATUS_TEXT[s.status] || s.status;
    const time = document.createElement('span'); time.className = 'stime'; time.textContent = fmtTime(s.ts);
    head.append(dot, name, st, time);
    if (lastMsgs.has(s.id)) {
      const btn = document.createElement('button');
      btn.className = 'icon-btn';
      btn.title = 'Son mesajı dinle';
      btn.innerHTML = LISTEN_SVG;
      btn.addEventListener('click', (e) => { e.stopPropagation(); readNow(lastMsgs.get(s.id)); });
      head.appendChild(btn);
    }
    row.appendChild(head);
    if (s.status === 'working') { const bar = document.createElement('div'); bar.className = 'sbar'; row.appendChild(bar); }
    else if (s.title) { const t = document.createElement('div'); t.className = 'stitle'; t.textContent = s.title; row.appendChild(t); }
    row.addEventListener('click', () => window.okur.focusSession(s.id));
    listEl.appendChild(row);
  }
  $('#sessEmpty').style.display = sorted.length ? 'none' : '';
  const badge = $('#sessBadge');
  const hot = sorted.filter((s) => s.status === 'approval').length;
  badge.textContent = hot || sorted.length || '';
  badge.classList.toggle('show', sorted.length > 0);
  badge.classList.toggle('hot', hot > 0);
  requestResize();
}

// ---- Gorevler ----
function noteId() { return 'n' + Math.random().toString(36).slice(2, 9); }

function noteLines(text) {
  let lines = String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  lines = lines.flatMap((l) => l.split(/(?=(?:^|\s)\d+[.)]\s)/).map((s) => s.trim()).filter(Boolean));
  lines = lines.flatMap((l) => l.split(/(?=(?:^|\s)[-•▪–]\s)/).map((s) => s.trim()).filter(Boolean));
  if (lines.length === 1 && lines[0].length > 90) {
    const parts = lines[0].match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g);
    if (parts && parts.length > 1) lines = parts.map((s) => s.trim()).filter(Boolean);
  }
  return lines.map((l) => l.replace(/^(\d+[.)]|[-•▪–])\s+/, ''));
}

function addNote(text) {
  const t = (text || '').trim();
  if (!t) return;
  const notes = cfg.notes || [];
  notes.unshift({ id: noteId(), text: t, lines: noteLines(t), done: {} });
  while (notes.length > 20) notes.pop();
  save({ notes });
  renderNotes();
  if (cfg.miniMode) { miniNotesOpen = true; $('#app').classList.add('notes-open'); }
  else setTab('notes');
  requestResize();
}

function renderNotes() {
  const listEl = $('#noteList');
  listEl.innerHTML = '';
  const notes = cfg.notes || [];
  let undoneTotal = 0;
  for (const n of notes) {
    const box = document.createElement('div');
    box.className = 'note';
    const head = document.createElement('div');
    head.className = 'note-head';
    const lines = n.lines || noteLines(n.text);
    const doneCount = Object.values(n.done || {}).filter(Boolean).length;
    undoneTotal += Math.max(0, lines.length - doneCount);
    const count = document.createElement('span');
    count.className = 'note-count';
    count.textContent = doneCount + ' / ' + lines.length + ' yapıldı';
    const play = document.createElement('button');
    play.className = 'icon-btn'; play.title = 'Sesli oku'; play.innerHTML = LISTEN_SVG;
    play.addEventListener('click', (e) => { e.stopPropagation(); window.okur.readText(n.text); });
    const del = document.createElement('button');
    del.className = 'icon-btn danger'; del.title = 'Sil'; del.innerHTML = CLOSE_SVG;
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      save({ notes: (cfg.notes || []).filter((x) => x.id !== n.id) });
      renderNotes();
      requestResize();
    });
    head.append(count, play, del);
    box.appendChild(head);
    lines.forEach((line, i) => {
      const row = document.createElement('div');
      row.className = 'note-line' + ((n.done || {})[i] ? ' done' : '');
      row.textContent = line;
      row.title = 'Tıkla: yapıldı';
      row.addEventListener('click', () => {
        n.done = n.done || {};
        n.done[i] = !n.done[i];
        save({ notes: cfg.notes });
        renderNotes();
      });
      box.appendChild(row);
    });
    listEl.appendChild(box);
  }
  $('#noteEmpty').style.display = notes.length ? 'none' : '';
  $('#noteHint').textContent = 'Adımları kopyala, ' + prettyHotkey(cfg.noteHotkey) + ' bas: tik atılabilir liste olur.';
  const badge = $('#notesBadge');
  badge.textContent = undoneTotal || '';
  badge.classList.toggle('show', undoneTotal > 0);
  const chip = $('#miniChip');
  chip.textContent = undoneTotal + ' görev';
  chip.classList.toggle('has', notes.length > 0);
}

// ---- Ayarlar ----
function fillSelect(sel, items, value) {
  sel.innerHTML = '';
  for (const [v, label] of items) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = value;
  if (sel.value !== value && sel.options.length) sel.selectedIndex = 0;
}

function populateAccent() {
  const langSel = $('#setAccentLang');
  const sel = $('#setAccent');
  if (!langSel || !sel) return;
  if (!langSel.options.length) {
    const tl = cfg.targetLangResolved;
    const first = ACCENTS[tl] && tl !== 'en' ? tl : 'en';
    fillSelect(langSel, LANGS.filter(([c]) => ACCENTS[c]), first);
  }
  const lc = langSel.value || 'en';
  const cur = accentFor(lc);
  fillSelect(sel, ACCENTS[lc].map((a) => [a[0], a[1]]), cur ? cur[0] : ACCENTS[lc][0][0]);
}

function populateVoiceSelect() {
  const langSel = $('#setVoiceLang');
  const sel = $('#setVoice');
  if (!langSel || !sel) return;
  if (!langSel.options.length) fillSelect(langSel, LANGS, cfg.targetLangResolved || 'tr');
  const lc = langSel.value || 'tr';
  const cur = (cfg.voiceByLang && cfg.voiceByLang[lc]) || '';
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = ''; auto.textContent = 'Otomatik (' + (cfg.voiceGender === 'male' ? 'erkek' : 'kadın') + ')';
  sel.appendChild(auto);
  const sv = serverVoices.filter((v) => lang2(v.lang) === lc);
  if (sv.length) {
    const g = document.createElement('optgroup'); g.label = 'Doğal sesler';
    for (const v of sv) {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = v.name.replace(/^[a-z]{2,3}-[A-Za-z]{2,4}-/, '').replace(/(Multilingual)?Neural$/, '') + ' · ' + regionOf(v.lang) + (v.gender ? ' · ' + (v.gender === 'Female' ? 'kadın' : 'erkek') : '');
      g.appendChild(o);
    }
    sel.appendChild(g);
  }
  const bv = voices.filter((v) => lang2(v.lang) === lc);
  if (bv.length) {
    const g = document.createElement('optgroup'); g.label = 'Windows sesleri';
    for (const v of bv) { const o = document.createElement('option'); o.value = v.name; o.textContent = v.name.replace(/^Microsoft /, ''); g.appendChild(o); }
    sel.appendChild(g);
  }
  sel.value = cur;
  if (sel.value !== cur) sel.value = '';
}

function prettyHotkey(acc) {
  return String(acc || '').replace(/CommandOrControl|CmdOrCtrl/gi, 'Ctrl').replace(/Command|Cmd/gi, 'Cmd').replace(/Control/gi, 'Ctrl');
}

function setHotkeyHint(hk, ok) {
  const hint = $('#hotkeyHint');
  const pk = prettyHotkey(hk);
  hint.textContent = ok === false
    ? pk + ' kısayolu başka bir uygulamada kullanımda. Ayarlardan değiştir.'
    : 'Kısayol: ' + pk + ' panodaki metni okur.';
}

function setSeg(id, value) {
  document.querySelectorAll('#' + id + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === value));
}

let voiceSetupState = ''; // '' | 'running' | 'ok' | 'error'
function updateVoiceSetupRow() {
  const row = $('#voiceSetupRow');
  const hint = $('#voiceSetupHint');
  const btn = $('#btnSetupVoices');
  if (!row) return;
  row.className = 'srow voices';
  btn.disabled = voiceSetupState === 'running';
  if (voiceSetupState === 'running') { hint.textContent = 'Kuruluyor, bir dakika sürebilir…'; btn.textContent = 'Kuruluyor'; return; }
  if (voiceSetupState === 'error') { row.classList.add('err'); hint.textContent = 'Kurulum başarısız. Python 3.9+ ve internet gerekir.'; btn.textContent = 'Tekrar dene'; return; }
  if (serverOk && !serverError) { row.classList.add('ok'); hint.textContent = 'Kurulu ve bağlı. ' + (serverVoices.length ? serverVoices.length + ' doğal ses hazır.' : ''); btn.textContent = 'Güncelle'; }
  else if (serverOk && serverError) { row.classList.add('err'); hint.textContent = 'Sunucu hata veriyor: güncelleme gerekli.'; btn.textContent = 'Güncelle'; }
  else { hint.textContent = 'Kurulu değil. Windows sesi kullanılıyor (tek dil).'; btn.textContent = 'Kur'; }
}

function applyConfigToUI() {
  $('#app').classList.toggle('auto', !!cfg.autoMode);
  $('#setAuto').checked = !!cfg.autoMode;
  fillSelect($('#setTarget'), [['', 'Sistem dili (' + langName(cfg.targetLangResolved || 'tr') + ')'], ...LANGS], cfg.targetLang || '');
  setSeg('segGender', cfg.voiceGender === 'male' ? 'male' : 'female');
  populateAccent();
  setSeg('segReadWhat', cfg.readWhat === 'original' ? 'original' : 'translation');
  $('#readTools').classList.toggle('no-tr', !cfg.translate);
  $('#btnTranslate').classList.toggle('on', !!cfg.translate);
  $('#setRate').value = cfg.rate;
  $('#rateVal').textContent = Number(cfg.rate).toFixed(2) + 'x';
  $('#setTranslate').checked = !!cfg.translate;
  $('#setReadOnCopy').checked = !!cfg.readOnCopy;
  $('#setOnNewText').value = cfg.onNewText === 'queue' ? 'queue' : 'interrupt';
  $('#setEngine').value = cfg.engine || 'auto';
  fillSelect($('#setLang'), [['auto', 'Otomatik algıla'], ...LANGS], cfg.language || 'auto');
  populateVoiceSelect();
  $('#setReadWhat').value = cfg.readWhat || 'translation';
  $('#setClaudeMode').checked = cfg.claudeMode !== false;
  $('#setScope').value = cfg.readScope || 'lastParagraph';
  $('#setAutoRead').checked = !!cfg.autoRead;
  $('#setClaudeArrive').value = ['queue', 'interrupt', 'skip'].includes(cfg.claudeArrive) ? cfg.claudeArrive : 'queue';
  $('#setSkipCode').checked = !!cfg.skipCode;
  $('#setCueFlash').checked = !!cfg.cueFlash;
  $('#setCueSound').value = cfg.cueSound || 'chime';
  if ($('#setCueSound').value !== (cfg.cueSound || 'chime')) $('#setCueSound').value = 'chime';
  $('#setFilter').value = cfg.projectFilter || '';
  $('#setHotkey').value = cfg.hotkey || '';
  $('#setNoteHotkey').value = cfg.noteHotkey || '';
  document.querySelector('.tab[data-tab="sessions"]').classList.toggle('hidden', cfg.claudeMode === false);
  if (cfg.claudeMode === false && activeTab === 'sessions') setTab('read');
  setHotkeyHint(cfg.hotkey, undefined);
  applyMuted(!!cfg.muted);
  applyMini(!!cfg.miniMode);
  renderNotes();
  updateStatus();
}

function save(partial) {
  cfg = { ...cfg, ...partial };
  window.okur.saveConfig(partial);
}

// Seslendirme tercihi degisti: son paketi yeni tercihle yeniden oku
function rereadLast() {
  if (!lastPayload || !lastPayload.tr) return;
  stopAll();
  readNow(lastPayload);
}

// ---- Maskot jestleri ----
let miniNotesOpen = false;

function applyMini(m) {
  cfg.miniMode = !!m;
  const app = $('#app');
  app.classList.toggle('mini', !!m);
  if (!m) { miniNotesOpen = false; app.classList.remove('notes-open'); }
  requestResize();
}
function toggleMini() { const m = !cfg.miniMode; applyMini(m); window.okur.saveConfig({ miniMode: m }); }

function bindFaceGestures() {
  const face = $('#face');
  let drag = null;
  let tapTimer = null;

  face.addEventListener('mousedown', async (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = await window.okur.getWinPos();
    drag = { sx: e.screenX, sy: e.screenY, wx: pos[0], wy: pos[1], moved: false };
  });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.screenX - drag.sx;
    const dy = e.screenY - drag.sy;
    if (!drag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) drag.moved = true;
    if (drag.moved) window.okur.moveWin(drag.wx + dx, drag.wy + dy);
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    if (wasDrag) return;
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; toggleMini(); }
    else tapTimer = setTimeout(() => { tapTimer = null; toggle(); }, 280);
  });
  face.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (cfg.miniMode) { applyMini(false); window.okur.saveConfig({ miniMode: false }); }
    setTab('settings');
  });
  $('#miniChip').addEventListener('click', (e) => {
    e.stopPropagation();
    miniNotesOpen = !miniNotesOpen;
    $('#app').classList.toggle('notes-open', miniNotesOpen);
    if (miniNotesOpen) renderNotes();
    requestResize();
  });
}

function bindUI() {
  const img = $('#faceImg');
  img.addEventListener('error', () => { img.classList.add('missing'); $('#fallbackFace').classList.add('show'); });

  bindFaceGestures();
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

  $('#btnMute').addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
  $('#btnToggle').addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  $('#btnStop').addEventListener('click', () => stopAll(true));
  $('#btnCapClear').addEventListener('click', () => stopAll());

  $('#btnNewText').addEventListener('click', () => {
    const box = $('#speakBox');
    box.classList.toggle('hidden');
    $('#btnNewText').classList.toggle('on', !box.classList.contains('hidden'));
    if (!box.classList.contains('hidden')) $('#speakText').focus();
    requestResize();
  });
  $('#btnReadText').addEventListener('click', () => {
    const t = $('#speakText');
    if (t.value.trim()) { window.okur.readText(t.value); t.value = ''; }
  });
  $('#btnReadClip').addEventListener('click', () => window.okur.readClipboard());
  $('#btnTranslate').addEventListener('click', () => {
    const on = !cfg.translate;
    save({ translate: on });
    $('#setTranslate').checked = on;
    $('#btnTranslate').classList.toggle('on', on);
    $('#readTools').classList.toggle('no-tr', !on);
    updateStatus();
  });
  // Metin secimi -> kucuk "oku" balonu
  $('#lines').addEventListener('mouseup', () => setTimeout(() => { if (hasSelection()) onSelectionMade(false); }, 10));
  $('#selPlay').addEventListener('click', (e) => { e.stopPropagation(); if (selCur) speakSnippet(selCur.text, selCur.lang); });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#selPop')) hidePop(); });
  $('#panelRead').addEventListener('scroll', hidePop);
  $('#btnQuit').addEventListener('click', () => window.okur.quit());
  $('#btnSetupVoices').addEventListener('click', () => { voiceSetupState = 'running'; updateVoiceSetupRow(); window.okur.setupVoices(); });

  document.querySelectorAll('#segReadWhat button').forEach((b) => b.addEventListener('click', () => {
    save({ readWhat: b.dataset.v });
    setSeg('segReadWhat', b.dataset.v);
    $('#setReadWhat').value = b.dataset.v;
    rereadLast();
  }));
  document.querySelectorAll('#segGender button').forEach((b) => b.addEventListener('click', () => {
    save({ voiceGender: b.dataset.v });
    setSeg('segGender', b.dataset.v);
    audioCache.clear();
    populateVoiceSelect();
    updateStatus();
  }));

  $('#setAccentLang').addEventListener('change', populateAccent);
  $('#setAccent').addEventListener('change', (e) => {
    const lc = $('#setAccentLang').value;
    const loc = e.target.value;
    const patch = { accents: { ...(cfg.accents || {}), [lc]: loc } };
    // Bu dil icin baska bolgeden sabitlenmis ses varsa birak: aksan secimi gecerli olsun
    const pin = cfg.voiceByLang && cfg.voiceByLang[lc];
    if (pin && /^[a-z]{2}-[A-Z]{2}-/.test(pin) && !pin.startsWith(loc + '-')) {
      const map = { ...cfg.voiceByLang }; delete map[lc]; patch.voiceByLang = map;
    }
    save(patch);
    audioCache.clear();
    populateVoiceSelect();
    updateStatus();
    speakSnippet(ACCENT_SAMPLE[lc] || 'Hello!', loc); // nasil duyuldugunu hemen dinlet
  });

  $('#setAuto').addEventListener('change', (e) => {
    const on = e.target.checked;
    save(on ? { autoMode: true, engine: 'auto', language: 'auto' } : { autoMode: false });
    $('#app').classList.toggle('auto', on);
    if (on) { $('#setEngine').value = 'auto'; $('#setLang').value = 'auto'; detectEngine(); }
  });
  $('#setTarget').addEventListener('change', (e) => save({ targetLang: e.target.value }));
  $('#setTranslate').addEventListener('change', (e) => {
    save({ translate: e.target.checked });
    $('#readTools').classList.toggle('no-tr', !e.target.checked);
    $('#btnTranslate').classList.toggle('on', e.target.checked);
    updateStatus();
  });
  $('#setReadOnCopy').addEventListener('change', (e) => save({ readOnCopy: e.target.checked }));
  $('#setOnNewText').addEventListener('change', (e) => save({ onNewText: e.target.value }));
  $('#setRate').addEventListener('input', (e) => {
    const r = Number(e.target.value);
    $('#rateVal').textContent = r.toFixed(2) + 'x';
    save({ rate: r });
    audioCache.clear();
  });
  $('#setEngine').addEventListener('change', (e) => { save({ engine: e.target.value }); detectTries = 0; detectEngine(); });
  $('#setLang').addEventListener('change', (e) => { save({ language: e.target.value }); updateStatus(); });
  $('#setVoiceLang').addEventListener('change', populateVoiceSelect);
  $('#setVoice').addEventListener('change', (e) => {
    const lc = $('#setVoiceLang').value;
    const map = { ...(cfg.voiceByLang || {}) };
    if (e.target.value) map[lc] = e.target.value; else delete map[lc];
    save({ voiceByLang: map });
    audioCache.clear();
  });
  $('#setReadWhat').addEventListener('change', (e) => { save({ readWhat: e.target.value }); setSeg('segReadWhat', e.target.value === 'original' ? 'original' : 'translation'); });
  $('#setClaudeMode').addEventListener('change', (e) => {
    save({ claudeMode: e.target.checked });
    document.querySelector('.tab[data-tab="sessions"]').classList.toggle('hidden', !e.target.checked);
    if (!e.target.checked && activeTab === 'sessions') setTab('read');
  });
  $('#setScope').addEventListener('change', (e) => save({ readScope: e.target.value }));
  $('#setAutoRead').addEventListener('change', (e) => save({ autoRead: e.target.checked }));
  $('#setClaudeArrive').addEventListener('change', (e) => save({ claudeArrive: e.target.value }));
  $('#cueBadge').addEventListener('click', (e) => { e.stopPropagation(); goToCueSession(); });
  $('#bubble').addEventListener('click', (e) => { e.stopPropagation(); goToCueSession(); });
  $('#setSkipCode').addEventListener('change', (e) => save({ skipCode: e.target.checked }));
  $('#setCueFlash').addEventListener('change', (e) => save({ cueFlash: e.target.checked }));
  $('#setCueSound').addEventListener('change', (e) => { save({ cueSound: e.target.value }); playCueSound(e.target.value, false); });
  $('#btnCueTest').addEventListener('click', () => playCueSound(cfg.cueSound, false));
  $('#setFilter').addEventListener('change', (e) => save({ projectFilter: e.target.value.trim() }));
  $('#setHotkey').addEventListener('change', (e) => { save({ hotkey: e.target.value.trim() }); setHotkeyHint(e.target.value.trim(), undefined); });
  $('#setNoteHotkey').addEventListener('change', (e) => save({ noteHotkey: e.target.value.trim() }));
  $('#advanced').addEventListener('toggle', requestResize);
}

// ---- Baslat ----
window.okur.onConfig((c) => {
  cfg = { ...cfg, ...c };
  refreshVoices();
  applyConfigToUI();
  detectEngine();
});
window.okur.onRead(onRead);
window.okur.onSessions(renderSessions);
window.okur.onCommand((msg) => {
  const action = msg && msg.action;
  if (action === 'toggle') toggle();
  else if (action === 'stop') stopAll(true);
  else if (action === 'muted-on') applyMuted(true);
  else if (action === 'muted-off') applyMuted(false);
  else if (action === 'hotkey') setHotkeyHint(msg.hotkey, msg.ok);
  else if (action === 'add-note') addNote(msg.text);
  else if (action === 'busy') setBusy(msg.text);
  else if (action === 'demo-sel') {
    // Gelistirici: ikinci satirdaki alt metnin 2. kelimesini sec ve oku
    const sub = document.querySelectorAll('#lines .l-sub')[1] || document.querySelector('#lines [data-lang]');
    if (sub && sub.firstChild) {
      const txt = sub.textContent;
      const m = /\S+\s+(\S+)/.exec(txt);
      const start = m ? m.index + m[0].length - m[1].length : 0;
      const end = m ? start + m[1].length : txt.length;
      const r = document.createRange();
      r.setStart(sub.firstChild, start); r.setEnd(sub.firstChild, end);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      onSelectionMade(true);
    }
  }
  else if (action === 'tab') {
    // Gelistirici: 'settings-top' -> ayarlarin ustu (kaydirmadan)
    if (msg.tab === 'settings-top') { setTab('settings'); console.log('[pofu] en sesi:', serverVoiceFor('en')); return; }
    setTab(msg.tab);
    if (msg.tab === 'settings') { $('#advanced').open = true; setTimeout(() => $('#setCueSound').scrollIntoView({ block: 'center' }), 300); }
  }
  else if (action === 'voices-setup') {
    voiceSetupState = msg.status === 'running' ? 'running' : msg.status === 'ok' ? 'ok' : 'error';
    if (msg.status === 'ok') { serverVoices = []; detectTries = 0; setTimeout(detectEngine, 2500); }
    updateVoiceSetupRow();
  }
});

// Pencereyi icerige gore boyutla
let lastH = 0;
let lastW = 0;
function contentWidth() {
  if (cfg.miniMode) return (bubbleShowing || miniNotesOpen) ? 320 : 76;
  return 320;
}
let resizeTimer = null;
function requestResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const app = $('#app');
    const h = Math.ceil(app.getBoundingClientRect().height) + 4;
    const w = contentWidth();
    if (Math.abs(h - lastH) > 4 || w !== lastW) {
      lastH = h; lastW = w;
      window.okur.resize(h, w);
    }
  }, 120);
}

window.addEventListener('DOMContentLoaded', () => {
  bindUI();
  if (window.speechSynthesis) speechSynthesis.getVoices();
  updateToggleBtn();
  updateReadEmpty();
  try { new ResizeObserver(requestResize).observe($('#app')); } catch { /* */ }
  window.okur.ready();
  requestResize();
});
