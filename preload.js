'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Renderer (surat penceresi) ile ana surec arasindaki guvenli kopru.
contextBridge.exposeInMainWorld('okur', {
  onConfig: (cb) => ipcRenderer.on('config', (_e, d) => cb(d)),
  onRead: (cb) => ipcRenderer.on('read', (_e, d) => cb(d)),
  onCommand: (cb) => ipcRenderer.on('command', (_e, d) => cb(d)),
  onSessions: (cb) => ipcRenderer.on('sessions', (_e, d) => cb(d)),
  focusSession: (id) => ipcRenderer.send('focus-session', { id }),
  resize: (height) => ipcRenderer.send('resize', { height }),
  ready: () => ipcRenderer.send('renderer-ready'),
  setState: (s) => ipcRenderer.send('state', s),
  saveConfig: (c) => ipcRenderer.send('save-config', c),
  readText: (text) => ipcRenderer.send('read-text', { text }),
  readClipboard: () => ipcRenderer.send('read-clipboard'),
  quit: () => ipcRenderer.send('quit'),
});
