"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  getConfig: () => electron.ipcRenderer.invoke("get-config"),
  setConfig: (key, value) => electron.ipcRenderer.invoke("set-config", key, value),
  selectFolder: () => electron.ipcRenderer.invoke("select-folder"),
  clearGameCache: () => electron.ipcRenderer.invoke("clear-game-cache"),
  scanLocalMods: () => electron.ipcRenderer.invoke("localMods:scan"),
  getCachedLocalMods: () => electron.ipcRenderer.invoke("localMods:getCached"),
  getImageUrl: (absPath) => electron.ipcRenderer.invoke("localMods:imageUrl", absPath),
  toggleLocalModEnabled: (filePath, enabled) => electron.ipcRenderer.invoke("localMods:toggleEnabled", filePath, enabled),
  extractLocalArchive: (filePath) => electron.ipcRenderer.invoke("localMods:extractArchive", filePath),
  inspectLocalMod: (filePath) => electron.ipcRenderer.invoke("localMods:inspect", filePath),
  showItemInFolder: (p) => electron.ipcRenderer.invoke("shell:showItemInFolder", p),
  getCatalog: () => {
    console.log("Preload: getCatalog called");
    return electron.ipcRenderer.invoke("catalog:get");
  },
  searchCurseForge: (params) => electron.ipcRenderer.invoke("curseforge:search", params),
  getCurseForgeCategories: () => electron.ipcRenderer.invoke("curseforge:categories"),
  downloadCurseForgeMod: (mod) => electron.ipcRenderer.invoke("curseforge:download", mod),
  getDownloadedCurseForge: () => electron.ipcRenderer.invoke("curseforge:getDownloaded"),
  openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url)
});
