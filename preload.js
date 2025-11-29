const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timerAPI', {
  start: (ms) => ipcRenderer.invoke('timer:start', ms),
  pause: () => ipcRenderer.invoke('timer:pause'),
  reset: () => ipcRenderer.invoke('timer:reset'),
  resume: () => ipcRenderer.invoke('timer:resume'),
  setTitle: (title) => ipcRenderer.invoke("timer:setTitle", title),
  onTitle: (cb) => ipcRenderer.on("timer:title", (_e, data) => cb(data)),
  getState: () => ipcRenderer.invoke('timer:getState'),
  onUpdate: (cb) => ipcRenderer.on('timer:update', (_e, data) => cb(data)),
  onFinished: (cb) => ipcRenderer.on('timer:finished', (_e, data) => cb(data)),
});
