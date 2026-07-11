'use strict';

// `npm start` bunu calistirir. Bazi ortamlarda ( or. entegre terminaller)
// ELECTRON_RUN_AS_NODE=1 ayarli olur; bu, Electron'u duz Node gibi calistirip
// arayuzu hic acmaz. Bu baslatici o degiskeni temizleyip Electron'u GERCEK
// uygulama olarak baslatir — nerede calistirdigin fark etmez.

const { spawn } = require('child_process');

let electronPath;
try {
  electronPath = require('electron'); // electron npm paketi binary yolunu (string) dondurur
} catch (e) {
  console.error('Electron bulunamadi. Once "npm install" calistir.');
  process.exit(1);
}

if (typeof electronPath !== 'string') {
  // Zaten Electron icindeysek dogrudan uygulamayi yukle (guvenlik agi)
  require('./main.js');
  return;
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env, cwd: __dirname });
child.on('close', (code) => process.exit(code == null ? 0 : code));
child.on('error', (err) => { console.error('Baslatma hatasi:', err); process.exit(1); });
