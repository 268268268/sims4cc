import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  clearGameCache: () => ipcRenderer.invoke('clear-game-cache'),
  scanLocalMods: () => ipcRenderer.invoke('localMods:scan'),
  getImageUrl: (absPath) => ipcRenderer.invoke('localMods:imageUrl', absPath),
  toggleLocalModEnabled: (filePath, enabled) => ipcRenderer.invoke('localMods:toggleEnabled', filePath, enabled)
})
