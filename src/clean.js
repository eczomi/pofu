'use strict';

// Claude'un markdown cevabini sesli okumaya uygun duz metne cevirir,
// sonra cumlelere boler. Kod bloklari varsayilan olarak atlanir
// (kodu sesli dinlemek iskence).

function stripMarkdown(md, opts) {
  const skipCode = !opts || opts.skipCode !== false;
  let t = String(md == null ? '' : md);

  // Fenced kod bloklari
  if (skipCode) {
    t = t.replace(/```[\s\S]*?```/g, ' ');
    t = t.replace(/~~~[\s\S]*?~~~/g, ' ');
  } else {
    t = t.replace(/```[\w-]*\n?/g, ' ').replace(/```/g, ' ');
    t = t.replace(/~~~[\w-]*\n?/g, ' ').replace(/~~~/g, ' ');
  }

  // Satir ici kod `...`
  t = t.replace(/`([^`]+)`/g, '$1');
  // Gorseller ![alt](url) -> alt
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Baglantilar [metin](url) -> metin
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Basliklar
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  // Alinti isareti
  t = t.replace(/^\s{0,3}>\s?/gm, '');
  // Madde imleri ve numarali liste
  t = t.replace(/^\s*[-*+]\s+/gm, '');
  t = t.replace(/^\s*\d+[.)]\s+/gm, '');
  // Kalin / italik / ustu cizili
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');
  t = t.replace(/(\*|_)(.*?)\1/g, '$2');
  t = t.replace(/~~(.*?)~~/g, '$1');
  // Tablolar: | ve --- satirlarini sadelestir
  t = t.replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, ' '); // ayirici satir
  t = t.replace(/\|/g, ' ');
  // HTML etiketleri
  t = t.replace(/<[^>]+>/g, ' ');
  // Emoji ve piktograflar (sesli okuyucu bunlari isimlendirmesin)
  t = t.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
    ''
  );
  // URL kalintilari
  t = t.replace(/\bhttps?:\/\/\S+/g, ' baglanti ');
  // Bosluklari topla
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/ ?\n ?/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function splitSentences(text) {
  const out = [];
  const blocks = String(text || '').split(/\n+/);
  for (const b of blocks) {
    const trimmed = b.trim();
    if (!trimmed) continue;
    // . ! ? ... veya : ile biten parcalar; kalanini da al
    const parts = trimmed.match(/[^.!?…]+[.!?…]+["')\]]*(?:\s+|$)|[^.!?…]+$/g);
    if (!parts) {
      out.push(trimmed);
      continue;
    }
    for (const p of parts) {
      const s = p.trim();
      if (s) out.push(s);
    }
  }
  // Cok kisa parcalari bir oncekine yapistir (ornek: "vb." gibi bolunmeler)
  const merged = [];
  for (const s of out) {
    if (merged.length && s.length <= 2) {
      merged[merged.length - 1] += ' ' + s;
    } else {
      merged.push(s);
    }
  }
  return merged;
}

function toSentences(text, opts) {
  return splitSentences(stripMarkdown(text, opts));
}

// Yalniz son paragrafi (yanitin "son ozeti") dondurur.
function lastParagraph(md, opts) {
  const t = stripMarkdown(md, opts);
  if (!t) return '';
  const blocks = t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  return blocks.length ? blocks[blocks.length - 1] : t;
}

// Yalniz son cumleyi dondurur.
function lastSentence(md, opts) {
  const sents = toSentences(md, opts);
  return sents.length ? sents[sents.length - 1] : '';
}

// Okuma kapsamina gore ham metni sadelestir.
function scopedText(md, scope, opts) {
  if (scope === 'lastParagraph') return lastParagraph(md, opts);
  if (scope === 'lastSentence') return lastSentence(md, opts);
  return stripMarkdown(md, opts); // 'all'
}

module.exports = { stripMarkdown, splitSentences, toSentences, lastParagraph, lastSentence, scopedText };
