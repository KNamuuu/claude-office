const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('office', {
  history: () => ipcRenderer.invoke('office:history'),
  info: () => ipcRenderer.invoke('office:info'),
  onEvents: (cb) => ipcRenderer.on('office:events', (_e, batch) => cb(batch)),
});
