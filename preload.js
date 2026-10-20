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
  onEvents: (cb) => ipcRenderer.on('office:events', (_e, batch) => cb(batch)),
});
