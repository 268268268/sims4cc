"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  getConfig: () => electron.ipcRenderer.invoke("get-config"),
  setConfig: (key, value) => electron.ipcRenderer.invoke("set-config", key, value),
  selectFolder: () => electron.ipcRenderer.invoke("select-folder"),
  clearGameCache: () => electron.ipcRenderer.invoke("clear-game-cache"),
  scanLocalMods: () => electron.ipcRenderer.invoke("localMods:scan"),
  getImageUrl: (absPath) => electron.ipcRenderer.invoke("localMods:imageUrl", absPath),
  toggleLocalModEnabled: (filePath, enabled) => electron.ipcRenderer.invoke("localMods:toggleEnabled", filePath, enabled)
});
