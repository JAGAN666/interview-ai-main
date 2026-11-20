const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  openDiscussion: (at, index) => ipcRenderer.send('open-discussion', at, index),
  closeDiscussion: () => ipcRenderer.send('close-discussion'),
  ask: prompt => ipcRenderer.send('ask', prompt),
  setLive: (enabled) => ipcRenderer.send('live', Boolean(enabled)),
  finish: () => ipcRenderer.send('finish'),
  analyze: () => ipcRenderer.send('analyze'),
  setNote: (value) => ipcRenderer.send('note', value),
  clear: () => ipcRenderer.send('clear'),
  quit: () => ipcRenderer.send('quit'),
  clickThrough: () => ipcRenderer.send('click-through'),
  hide: () => ipcRenderer.send('hide'),
  on: (channel, callback) => {
    const allowed = ['reply-text', 'discussion', 'live', 'config', 'status', 'result', 'error', 'clear', 'click-through'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_event, payload) => callback(payload));
  },
});
