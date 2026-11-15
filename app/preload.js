// 画面（index.html）とアプリ本体（main.js）の橋渡し。
// 画面側には、ここに書いた4つの操作だけを window.skApp として渡す（ファイルの場所は画面側に渡さない）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skApp', {
  save: (html, saveAs, name) => ipcRenderer.invoke('sk:save', String(html), !!saveAs, String(name)),
  open: () => ipcRenderer.invoke('sk:open'),
  reset: opened => ipcRenderer.send('sk:reset', !!opened),
  state: s => ipcRenderer.send('sk:state', { dirty: !!s.dirty, title: String(s.title || '') })
});
