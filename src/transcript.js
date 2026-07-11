'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Claude Code oturum transcript'leri burada tutulur:
//   ~/.claude/projects/<proje-klasoru>/<oturum-uuid>.jsonl
// Her satir bir JSON kaydi. Bizi ilgilendiren: type === "assistant"
// kayitlarindaki message.content icindeki { type: "text" } parcalar.

function projectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

class TranscriptWatcher {
  constructor(opts) {
    opts = opts || {};
    this.root = opts.root || projectsRoot();
    this.onText = opts.onText || function () {};
    this.onActivity = opts.onActivity || function () {}; // dosya buyudu = oturum calisiyor
    this.pollMs = opts.pollMs || 1200;
    // Virgulle coklu suzgec: "para-app, okur" -> ikisinden birini iceren klasorler
    this.projectFilters = String(opts.projectFilter || '')
      .toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    this.startTime = Date.now();
    this.offsets = new Map();   // dosya -> islenen bayt konumu
    this.partials = new Map();  // dosya -> yarim kalan son satir
    this.seen = new Set();      // okunmus assistant uuid'leri
    this.cwds = new Map();      // dosya -> proje cwd'si (herhangi bir kayittan)
    this._timer = null;
    this._first = true;
  }

  start() {
    this._tick();
    this._timer = setInterval(() => this._tick(), this.pollMs);
    return this;
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _listJsonl() {
    let dirs;
    try { dirs = fs.readdirSync(this.root, { withFileTypes: true }); }
    catch { return []; }
    const files = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      if (this.projectFilters.length &&
          !this.projectFilters.some((f) => d.name.toLowerCase().includes(f))) continue;
      const dir = path.join(this.root, d.name);
      let entries;
      try { entries = fs.readdirSync(dir); } catch { continue; }
      for (const f of entries) {
        if (f.endsWith('.jsonl')) files.push(path.join(dir, f));
      }
    }
    return files;
  }

  _tick() {
    const first = this._first;
    this._first = false;
    const files = this._listJsonl();
    for (const file of files) {
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      const size = st.size;
      let off = this.offsets.get(file);
      if (off === undefined) {
        if (first) {
          // Acilista mevcut gecmisin tamamini atla; yalniz sonrasini oku.
          this.offsets.set(file, size);
          this.partials.set(file, '');
          continue;
        }
        // Acilis sonrasi beliren yeni dosya (yeni oturum) -> bastan oku.
        off = 0;
        this.partials.set(file, '');
      }
      if (size < off) { // truncate / rotate
        off = 0;
        this.partials.set(file, '');
      }
      if (size > off) {
        this._readChunk(file, off, size);
        // cwd, _readChunk icindeki satir ayristirmadan gelmis olabilir
        this.onActivity({ file, cwd: this.cwds.get(file) || '' });
      } else {
        this.offsets.set(file, size);
      }
    }
  }

  _readChunk(file, from, to) {
    let fd;
    try { fd = fs.openSync(file, 'r'); } catch { return; }
    try {
      const len = to - from;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, from);
      this.offsets.set(file, to);
      const data = (this.partials.get(file) || '') + buf.toString('utf8');
      const lines = data.split('\n');
      this.partials.set(file, lines.pop()); // son parca eksik olabilir
      for (const line of lines) {
        const s = line.trim();
        if (s) this._handleLine(s, file);
      }
    } catch {
      /* yoksay */
    } finally {
      try { fs.closeSync(fd); } catch {}
    }
  }

  _handleLine(line, file) {
    let o;
    try { o = JSON.parse(line); } catch { return; }
    if (!o) return;
    if (o.cwd && !this.cwds.has(file)) this.cwds.set(file, o.cwd);
    if (o.type !== 'assistant' || !o.message) return;
    const uuid = o.uuid;
    if (uuid) {
      if (this.seen.has(uuid)) return;
      this.seen.add(uuid);
    }
    const ts = o.timestamp ? Date.parse(o.timestamp) : Date.now();
    if (ts && ts < this.startTime - 5000) return; // acilistan onceki kayit
    const content = o.message.content;
    if (!Array.isArray(content)) return;
    const texts = [];
    for (const c of content) {
      if (c && c.type === 'text' && typeof c.text === 'string') texts.push(c.text);
    }
    const text = texts.join('\n\n').trim();
    if (!text) return;
    this.onText({ uuid: uuid || String(ts), text, file, ts, cwd: o.cwd || '' });
  }
}

module.exports = { TranscriptWatcher, projectsRoot };
