"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  getConfig: () => electron.ipcRenderer.invoke("get-config"),
  setConfig: (key, value) => electron.ipcRenderer.invoke("set-config", key, value),
  selectFolder: () => electron.ipcRenderer.invoke("select-folder"),
  clearGameCache: () => electron.ipcRenderer.invoke("clear-game-cache"),
  // local mods
  scanLocalMods: () => electron.ipcRenderer.invoke("localMods:scan"),
  getCachedLocalMods: () => electron.ipcRenderer.invoke("localMods:getCached"),
  getImageUrl: (absPath) => electron.ipcRenderer.invoke("localMods:imageUrl", absPath),
  toggleLocalModEnabled: (filePath, enabled) => electron.ipcRenderer.invoke("localMods:toggleEnabled", filePath, enabled),
  extractLocalArchive: (filePath) => electron.ipcRenderer.invoke("localMods:extractArchive", filePath),
  inspectLocalMod: (filePath) => electron.ipcRenderer.invoke("localMods:inspect", filePath),
  deleteLocalMod: (filePath) => electron.ipcRenderer.invoke("localMods:delete", filePath),
  importFiles: (paths) => electron.ipcRenderer.invoke("localMods:import", paths),
  // resolves an absolute path from a dropped File object (Electron 31 webUtils)
  getPathForFile: (file) => {
    try {
      return electron.webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  showItemInFolder: (p) => electron.ipcRenderer.invoke("shell:showItemInFolder", p),
  // creator catalog
  getCatalog: () => electron.ipcRenderer.invoke("catalog:get"),
  // curseforge
  searchCurseForge: (params) => electron.ipcRenderer.invoke("curseforge:search", params),
  getCurseForgeCategories: () => electron.ipcRenderer.invoke("curseforge:categories"),
  downloadCurseForgeMod: (mod) => electron.ipcRenderer.invoke("curseforge:download", mod),
  getDownloadedCurseForge: () => electron.ipcRenderer.invoke("curseforge:getDownloaded"),
  checkCurseForgeUpdates: (opts) => electron.ipcRenderer.invoke("curseforge:checkUpdates", opts),
  updateCurseForgeMod: (mod) => electron.ipcRenderer.invoke("curseforge:update", mod),
  getCurseForgeModsByIds: (ids) => electron.ipcRenderer.invoke("curseforge:getModsByIds", ids),
  getCurseForgeDescription: (modId) => electron.ipcRenderer.invoke("curseforge:description", modId),
  // subscribe to download/update progress; returns an unsubscribe function
  onCurseForgeProgress: (cb) => {
    const handler = (_e, p) => cb(p);
    electron.ipcRenderer.on("curseforge:progress", handler);
    return () => electron.ipcRenderer.removeListener("curseforge:progress", handler);
  },
  // connected accounts for external sources
  getAuthStatus: () => electron.ipcRenderer.invoke("auth:status"),
  connectAccount: (provider) => electron.ipcRenderer.invoke("auth:connect", provider),
  disconnectAccount: (provider) => electron.ipcRenderer.invoke("auth:disconnect", provider),
  // discover (external mod sources)
  getSourceTypes: () => electron.ipcRenderer.invoke("discover:sourceTypes"),
  getSources: () => electron.ipcRenderer.invoke("discover:sources"),
  followSource: (payload) => electron.ipcRenderer.invoke("discover:follow", payload),
  followSourcesBatch: (payload) => electron.ipcRenderer.invoke("discover:followBatch", payload),
  unfollowSource: (id) => electron.ipcRenderer.invoke("discover:unfollow", id),
  fetchDiscover: (opts) => electron.ipcRenderer.invoke("discover:fetch", opts),
  fetchMoreDiscover: () => electron.ipcRenderer.invoke("discover:fetchMore"),
  getDownloadedDiscover: () => electron.ipcRenderer.invoke("discover:getDownloaded"),
  getSuggestedSources: () => electron.ipcRenderer.invoke("discover:suggested"),
  followSuggestedSources: (entries) => electron.ipcRenderer.invoke("discover:followSuggested", entries),
  downloadDiscoverItem: (item) => electron.ipcRenderer.invoke("discover:download", item),
  onDiscoverProgress: (cb) => {
    const handler = (_e, p) => cb(p);
    electron.ipcRenderer.on("discover:progress", handler);
    return () => electron.ipcRenderer.removeListener("discover:progress", handler);
  },
  // maintenance
  openThumbCache: () => electron.ipcRenderer.invoke("thumbCache:open"),
  clearThumbCache: () => electron.ipcRenderer.invoke("thumbCache:clear"),
  openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url)
});
