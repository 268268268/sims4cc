import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  clearGameCache: () => ipcRenderer.invoke('clear-game-cache'),
  scanLocalMods: () => ipcRenderer.invoke('localMods:scan'),
  getCachedLocalMods: () => ipcRenderer.invoke('localMods:getCached'),
  getImageUrl: (absPath) => ipcRenderer.invoke('localMods:imageUrl', absPath),
  toggleLocalModEnabled: (filePath, enabled) => ipcRenderer.invoke('localMods:toggleEnabled', filePath, enabled),
  extractLocalArchive: (filePath) => ipcRenderer.invoke('localMods:extractArchive', filePath),
  inspectLocalMod: (filePath) => ipcRenderer.invoke('localMods:inspect', filePath),
  showItemInFolder: (p) => ipcRenderer.invoke('shell:showItemInFolder', p),
    getCatalog: () => {
      console.log('Preload: getCatalog called')
      return ipcRenderer.invoke('catalog:get')
    },
  searchCurseForge: (params) => ipcRenderer.invoke('curseforge:search', params),
  downloadCurseForgeMod: (mod) => ipcRenderer.invoke('curseforge:download', mod),
  getDownloadedCurseForge: () => ipcRenderer.invoke('curseforge:getDownloaded'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
})
