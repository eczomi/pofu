'use strict';

// Bagimsiz, hafif dil tespiti (kutuphane yok). Amac mukemmel siniflandirma
// degil; her mesaj icin dogru TTS sesini/dilini secmeye yetecek isabet.
// 2 harfli ISO kodu doner (en, tr, de, fr, es, it, pt, nl, pl, sv, ru,
// ar, hi, el, he, th, ja, ko, zh).

const STOPWORDS = {
  en: [' the ', ' and ', ' is ', ' to ', ' of ', ' you ', ' that ', ' it ', ' for ', ' with ', ' this ', ' have ', ' are ', ' will ', ' can ', ' your ', ' not '],
  tr: [' ve ', ' bir ', ' bu ', ' icin ', ' ile ', ' cok ', ' daha ', ' ama ', ' gibi ', ' olarak ', ' var ', ' degil ', ' senin ', ' su ', ' de ', ' da '],
  de: [' der ', ' die ', ' das ', ' und ', ' ist ', ' nicht ', ' ein ', ' eine ', ' mit ', ' auf ', ' fur ', ' ich ', ' sie ', ' den ', ' dem ', ' auch '],
  fr: [' le ', ' la ', ' les ', ' et ', ' est ', ' un ', ' une ', ' des ', ' vous ', ' que ', ' pour ', ' dans ', ' avec ', ' pas ', ' ce ', ' sur '],
  es: [' el ', ' la ', ' los ', ' las ', ' es ', ' un ', ' una ', ' que ', ' para ', ' con ', ' por ', ' su ', ' del ', ' se ', ' pero '],
  it: [' il ', ' lo ', ' la ', ' che ', ' di ', ' un ', ' una ', ' per ', ' con ', ' non ', ' sono ', ' questo ', ' come ', ' anche '],
  pt: [' os ', ' as ', ' que ', ' um ', ' uma ', ' para ', ' com ', ' nao ', ' voce ', ' isso ', ' seu ', ' mas ', ' por '],
  nl: [' de ', ' het ', ' een ', ' en ', ' is ', ' niet ', ' van ', ' voor ', ' met ', ' dat ', ' je ', ' op ', ' zijn '],
  pl: [' nie ', ' jest ', ' to ', ' na ', ' ze ', ' sie ', ' do ', ' co ', ' jak ', ' jego ', ' oraz ', ' przez '],
  sv: [' och ', ' att ', ' det ', ' ar ', ' en ', ' som ', ' for ', ' med ', ' inte ', ' du ', ' pa ', ' den '],
};

// Latin-alfabesi dilleri icin ayirt edici karakter bonuslari.
function langCharBonus(lang, s) {
  const has = (re) => (s.match(re) || []).length;
  switch (lang) {
    case 'tr': return has(/[ğşıİĞŞ]/g) * 0.8 + has(/[çöüÇÖÜ]/g) * 0.2;
    case 'de': return has(/[ß]/g) * 1.2 + has(/[äöüÄÖÜ]/g) * 0.3;
    case 'fr': return has(/[àâçéèêëîïôûùœ]/gi) * 0.3;
    case 'es': return has(/[ñ¿¡]/gi) * 1.0 + has(/[áíóúé]/gi) * 0.15;
    case 'pt': return has(/[ãõ]/gi) * 1.0 + has(/[çáâêô]/gi) * 0.2;
    case 'pl': return has(/[ąćęłńśźż]/gi) * 1.0;
    case 'sv': return has(/[åäö]/gi) * 0.4;
    case 'it': return has(/[àèéìòù]/gi) * 0.2;
    default: return 0;
  }
}

function scriptCounts(s) {
  const c = { cjk: 0, kana: 0, hangul: 0, cyr: 0, arab: 0, deva: 0, greek: 0, hebrew: 0, thai: 0, latin: 0 };
  for (const ch of s) {
    const p = ch.codePointAt(0);
    if ((p >= 0x3040 && p <= 0x309f) || (p >= 0x30a0 && p <= 0x30ff)) c.kana++;
    else if (p >= 0xac00 && p <= 0xd7a3) c.hangul++;
    else if ((p >= 0x4e00 && p <= 0x9fff) || (p >= 0x3400 && p <= 0x4dbf)) c.cjk++;
    else if (p >= 0x0400 && p <= 0x04ff) c.cyr++;
    else if (p >= 0x0600 && p <= 0x06ff) c.arab++;
    else if (p >= 0x0900 && p <= 0x097f) c.deva++;
    else if (p >= 0x0370 && p <= 0x03ff) c.greek++;
    else if (p >= 0x0590 && p <= 0x05ff) c.hebrew++;
    else if (p >= 0x0e00 && p <= 0x0e7f) c.thai++;
    else if ((p >= 0x41 && p <= 0x5a) || (p >= 0x61 && p <= 0x7a) || (p >= 0xc0 && p <= 0x17f)) c.latin++;
  }
  return c;
}

function detect(text, fallback) {
  const fb = fallback || 'en';
  const s = String(text == null ? '' : text);
  if (s.trim().length < 2) return fb;

  const sc = scriptCounts(s);
  if (sc.hangul > 2) return 'ko';
  if (sc.kana > 2) return 'ja';
  if (sc.cjk > 2) return 'zh';
  if (sc.arab > 2) return 'ar';
  if (sc.deva > 2) return 'hi';
  if (sc.greek > 2) return 'el';
  if (sc.hebrew > 2) return 'he';
  if (sc.thai > 2) return 'th';
  if (sc.cyr > 2) return 'ru';

  // Latin alfabesi: durak-kelime skoru + karakter bonusu
  const low = ' ' + s.toLowerCase().replace(/[^\p{L}]+/gu, ' ').trim() + ' ';
  let best = 'en';
  let bestScore = -1;
  for (const lang of Object.keys(STOPWORDS)) {
    let score = 0;
    for (const w of STOPWORDS[lang]) {
      let i = 0;
      while ((i = low.indexOf(w, i)) !== -1) { score++; i += Math.max(1, w.length - 1); }
    }
    score += langCharBonus(lang, s);
    if (score > bestScore) { bestScore = score; best = lang; }
  }
  if (bestScore <= 0) return fb;
  return best;
}

module.exports = { detect };
