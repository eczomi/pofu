'use strict';

// Dogal sesleri kurar / gunceller: chatterbox-server/.venv olusturur ve
// edge-tts'in en yeni surumunu yukler. Hem `npm run voices` ile hem de
// uygulama icinden (Ayarlar > Dogal sesleri kur) calistirilir.
//
// Not: edge-tts'in eski surumleri Microsoft tarafinda 403 alir; o yuzden
// kurulu olsa bile her calistirmada guncelleme denenir.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', 'chatterbox-server');
const win = process.platform === 'win32';
const venvPy = win ? path.join(base, '.venv', 'Scripts', 'python.exe') : path.join(base, '.venv', 'bin', 'python');

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true, ...opts });
  return r.status === 0;
}

function findPython() {
  const cands = win ? [['py', ['-3']], ['python', []], ['python3', []]] : [['python3', []], ['python', []]];
  for (const [c, a] of cands) {
    const r = spawnSync(c, [...a, '--version'], { windowsHide: true, encoding: 'utf8' });
    if (r.status === 0 && /Python 3\.(9|1\d)/.test(r.stdout + r.stderr)) return [c, a];
  }
  return null;
}

(function main() {
  if (!fs.existsSync(venvPy)) {
    const py = findPython();
    if (!py) {
      console.error('Python 3.9+ bulunamadi. https://www.python.org/downloads/ adresinden kur ("Add to PATH" isaretle), sonra tekrar dene.');
      process.exit(2);
    }
    console.log('Sanal ortam olusturuluyor...');
    if (!run(py[0], [...py[1], '-m', 'venv', path.join(base, '.venv')])) process.exit(3);
  }
  console.log('edge-tts kuruluyor / guncelleniyor...');
  const ok = run(venvPy, ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', '-U', 'edge-tts']);
  if (!ok) { console.error('pip kurulumu basarisiz (internet?)'); process.exit(4); }
  console.log('Tamam. Pofu dogal sesleri bir sonraki acilista (ya da hemen) kullanir.');
})();
