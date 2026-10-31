'use strict';

// Ucretsiz, anahtarsiz ceviri. Birincil: Google Translate'in herkese acik
// "gtx" ucu (tarayici uzantilarinin kullandigi). Yedek: MyMemory.
// Metin internete gider; kullanici "Ceviri" ayarini kapatarak engelleyebilir.

const CACHE_MAX = 200;
const cache = new Map(); // key -> { text, srcLang }

function remember(key, val) {
  cache.set(key, val);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return val;
}

// Metni cumle sinirlarindan ~max karakterlik parcalara boler.
function chunk(text, max) {
  const out = [];
  const paras = String(text).split(/\n{2,}/);
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    const parts = p.match(/[^.!?…\n]+[.!?…]+["')\]]*\s*|[^.!?…\n]+\n?|\n/g) || [p];
    for (const s of parts) {
      if (s.length > max) { push(); for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max)); continue; }
      if ((cur + s).length > max) push();
      cur += s;
    }
    cur += '\n\n';
  }
  push();
  return out;
}

function normLang(code) {
  return String(code || '').toLowerCase().split(/[-_]/)[0];
}

async function fetchTimeout(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); }
  finally { clearTimeout(t); }
}

async function gtxOne(q, tl, sl) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'
    + '&sl=' + encodeURIComponent(sl || 'auto') + '&tl=' + encodeURIComponent(tl)
    + '&q=' + encodeURIComponent(q);
  const r = await fetchTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 9000);
  if (!r.ok) throw new Error('gtx ' + r.status);
  if (process.env.OKUR_DEBUG) console.log('[okur] gtx ok', q.length, 'karakter');
  const j = await r.json();
  const segs = j[0] || [];
  const text = segs.map((seg) => seg[0] || '').join('');
  // Google her kaynak cumleyi ayri bir parca olarak dondurur: [ceviri, orijinal, ...]
  const pairs = [];
  for (const seg of segs) {
    const src = String(seg[1] || '').trim();
    const tr = String(seg[0] || '').trim();
    if (!src) continue;
    pairs.push({ src, tr: tr || src });
  }
  return { text, srcLang: normLang(j[2]), pairs };
}

async function gtxRetry(q, tl, sl) {
  try { return await gtxOne(q, tl, sl); }
  catch (e) {
    // Ucretsiz uc ara sira gecici hata verir; kisa bekleyip bir kez daha dene.
    await new Promise((r) => setTimeout(r, 400));
    return gtxOne(q, tl, sl);
  }
}

async function viaGoogle(text, tl, sl) {
  const parts = chunk(text, 1500);
  const res = [];
  // En fazla 3 parca ayni anda
  for (let i = 0; i < parts.length; i += 3) {
    const batch = parts.slice(i, i + 3).map((p) => gtxOne(p, tl, sl).catch(() => gtxRetry(p, tl, sl)));
    res.push(...(await Promise.all(batch)));
  }
  return {
    text: res.map((r) => r.text).join('\n\n'),
    srcLang: res[0] ? res[0].srcLang : '',
    pairs: res.flatMap((r) => r.pairs || []),
  };
}

async function myMemoryOne(q, tl, sl) {
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q)
    + '&langpair=' + encodeURIComponent(sl + '|' + tl);
  const r = await fetchTimeout(url, {}, 9000);
  if (!r.ok) throw new Error('mymemory ' + r.status);
  const j = await r.json();
  const t = j && j.responseData && j.responseData.translatedText;
  if (!t || /QUERY LENGTH LIMIT|INVALID/i.test(t)) throw new Error('mymemory: ' + t);
  return t;
}

// Yedek servis cumle cumle cagrilir: hem 500 karakter siniri hem de
// orijinal/ceviri eslesmesi (hizali ciftler) icin.
async function viaMyMemory(text, tl, sl) {
  if (!sl || sl === 'auto') throw new Error('mymemory kaynak dil gerekli');
  if (sl === tl) return { text, srcLang: sl, pairs: [] }; // ceviri gerekmez
  const sents = String(text).split(/\n+/)
    .flatMap((b) => b.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [b])
    .map((x) => x.trim()).filter(Boolean);
  const pairs = [];
  for (const src of sents) {
    const parts = chunk(src, 450);
    const tr = (await Promise.all(parts.map((q) => myMemoryOne(q, tl, sl)))).join(' ');
    pairs.push({ src, tr });
  }
  return { text: pairs.map((p) => p.tr).join(' '), srcLang: sl, pairs };
}

// translate(text, targetLang, sourceHint) -> { text, srcLang, pairs: [{src, tr}] }
// srcLang: servisin algiladigi kaynak dil (2 harf). Kaynak == hedef ise
// text hedef metnin aynisidir; cagiran taraf karsilastirip atlar.
async function translate(text, target, sourceHint) {
  const t = String(text || '').trim();
  const tl = normLang(target);
  if (!t || !tl) return null;
  const key = tl + '|' + (sourceHint || 'auto') + '|' + t;
  if (cache.has(key)) return cache.get(key);
  try {
    return remember(key, await viaGoogle(t, tl, 'auto'));
  } catch (e1) {
    if (process.env.OKUR_DEBUG) console.log('[okur] gtx hata:', e1.message);
    try {
      return remember(key, await viaMyMemory(t, tl, normLang(sourceHint)));
    } catch (e2) {
      const err = new Error('ceviri basarisiz: ' + e1.message + ' / ' + e2.message);
      err.offline = true;
      throw err;
    }
  }
}

module.exports = { translate, chunk, normLang };
