const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('office', {
  history: () => ipcRenderer.invoke('office:history'),
  info: () => ipcRenderer.invoke('office:info'),
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    setToken: (t) => ipcRenderer.invoke('update:setToken', t),
    install: (url) => ipcRenderer.invoke('update:install', url),
    onProgress: (cb) => ipcRenderer.on('update:progress', (_e, p) => cb(p)),
    onOpen: (cb) => ipcRenderer.on('office:openUpdate', () => cb()),
  },
  feedback: {
    send: (title, text) => ipcRenderer.invoke('feedback:send', title, text),
    setToken: (t) => ipcRenderer.invoke('feedback:setToken', t),
    onOpen: (cb) => ipcRenderer.on('office:openFeedback', () => cb()),
  },
  onEvents: (cb) => ipcRenderer.on('office:events', (_e, batch) => cb(batch)),
});
