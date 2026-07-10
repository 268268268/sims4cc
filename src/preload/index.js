import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  clearGameCache: () => ipcRenderer.invoke('clear-game-cache'),

  // local mods
  scanLocalMods: () => ipcRenderer.invoke('localMods:scan'),
  getCachedLocalMods: () => ipcRenderer.invoke('localMods:getCached'),
  matchLocalCurseForge: (opts) => ipcRenderer.invoke('curseforge:matchLocal', opts),
  getImageUrl: (absPath) => ipcRenderer.invoke('localMods:imageUrl', absPath),
  toggleLocalModEnabled: (filePath, enabled) => ipcRenderer.invoke('localMods:toggleEnabled', filePath, enabled),
  extractLocalArchive: (filePath) => ipcRenderer.invoke('localMods:extractArchive', filePath),
  extractAllArchives: () => ipcRenderer.invoke('localMods:extractAllArchives'),
  inspectLocalMod: (filePath) => ipcRenderer.invoke('localMods:inspect', filePath),
  deleteLocalMod: (filePath) => ipcRenderer.invoke('localMods:delete', filePath),
  importFiles: (paths) => ipcRenderer.invoke('localMods:import', paths),
  // resolves an absolute path from a dropped File object (Electron 31 webUtils)
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return null
    }
  },
  showItemInFolder: (p) => ipcRenderer.invoke('shell:showItemInFolder', p),

  // creator catalog
  getCatalog: () => ipcRenderer.invoke('catalog:get'),

  // curseforge
  searchCurseForge: (params) => ipcRenderer.invoke('curseforge:search', params),
  getCurseForgeCategories: () => ipcRenderer.invoke('curseforge:categories'),
  downloadCurseForgeMod: (mod) => ipcRenderer.invoke('curseforge:download', mod),
  getDownloadedCurseForge: () => ipcRenderer.invoke('curseforge:getDownloaded'),
  checkCurseForgeUpdates: (opts) => ipcRenderer.invoke('curseforge:checkUpdates', opts),
  updateCurseForgeMod: (mod) => ipcRenderer.invoke('curseforge:update', mod),
  getCurseForgeModsByIds: (ids) => ipcRenderer.invoke('curseforge:getModsByIds', ids),
  getCurseForgeDescription: (modId) => ipcRenderer.invoke('curseforge:description', modId),
  // subscribe to download/update progress; returns an unsubscribe function
  onCurseForgeProgress: (cb) => {
    const handler = (_e, p) => cb(p)
    ipcRenderer.on('curseforge:progress', handler)
    return () => ipcRenderer.removeListener('curseforge:progress', handler)
  },

  // connected accounts for external sources
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),
  connectAccount: (provider) => ipcRenderer.invoke('auth:connect', provider),
  disconnectAccount: (provider) => ipcRenderer.invoke('auth:disconnect', provider),

  // discover (external mod sources)
  getSourceTypes: () => ipcRenderer.invoke('discover:sourceTypes'),
  getSources: () => ipcRenderer.invoke('discover:sources'),
  followSource: (payload) => ipcRenderer.invoke('discover:follow', payload),
  followSourcesBatch: (payload) => ipcRenderer.invoke('discover:followBatch', payload),
  unfollowSource: (id) => ipcRenderer.invoke('discover:unfollow', id),
  getCachedDiscover: () => ipcRenderer.invoke('discover:getCached'),
  fetchDiscover: (opts) => ipcRenderer.invoke('discover:fetch', opts),
  fetchMoreDiscover: () => ipcRenderer.invoke('discover:fetchMore'),
  fetchSourceDiscover: (payload) => ipcRenderer.invoke('discover:fetchSource', payload),
  getDownloadedDiscover: () => ipcRenderer.invoke('discover:getDownloaded'),
  getSuggestedSources: () => ipcRenderer.invoke('discover:suggested'),
  followSuggestedSources: (entries) => ipcRenderer.invoke('discover:followSuggested', entries),
  downloadDiscoverItem: (item) => ipcRenderer.invoke('discover:download', item),
  onDiscoverProgress: (cb) => {
    const handler = (_e, p) => cb(p)
    ipcRenderer.on('discover:progress', handler)
    return () => ipcRenderer.removeListener('discover:progress', handler)
  },

  // maintenance
  openThumbCache: () => ipcRenderer.invoke('thumbCache:open'),
  clearThumbCache: () => ipcRenderer.invoke('thumbCache:clear'),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
})
