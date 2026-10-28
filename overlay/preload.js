const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  analyze: () => ipcRenderer.send('analyze'),
  setNote: (value) => ipcRenderer.send('note', value),
  hide: () => ipcRenderer.send('hide'),
  on: (channel, callback) => {
    const allowed = ['config', 'status', 'result', 'error', 'clear', 'click-through'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_event, payload) => callback(payload));
  },
});
