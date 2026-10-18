// Прямой мост window.api к методам Wails Go и событиям runtime

import * as App from '../wailsjs/go/main/App'
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime'

const api = {
  // Config & System
  getConfig: () => App.GetConfig(),
  setConfig: (key, value) => App.SetConfig(key, value),
  selectFolder: () => App.SelectFolder(),
  validateModsFolder: (folder) => App.ValidateModsFolder(folder),
  clearGameCache: () => App.ClearGameCache(),
  showItemInFolder: (p) => App.ShowItemInFolder(p),
  openExternal: (url) => App.OpenExternal(url),

  // Local mods
  scanLocalMods: () => App.ScanLocalMods(),
  getCachedLocalMods: () => App.GetCachedLocalMods(),
  matchLocalCurseForge: (opts) => App.MatchLocalCurseForge(opts || {}),
  getImageUrl: (absPath) => Promise.resolve(absPath ? `/modimg?p=${encodeURIComponent(absPath)}` : ''),
  toggleLocalModEnabled: (filePath, enabled) => App.ToggleLocalModEnabled(filePath, enabled),
  extractLocalArchive: (filePath) => App.ExtractLocalArchive(filePath),
  extractAllArchives: () => App.ExtractAllArchives(),
  inspectLocalMod: (filePath) => App.InspectLocalMod(filePath),
  get3DModel: (filePath, swatchIndex) => App.Get3DModel(filePath, swatchIndex || 0),
  deleteLocalMod: (filePath) => App.DeleteLocalMod(filePath),
  batchToggleLocalMods: (filePaths, enabled) => App.BatchToggleLocalMods(filePaths, enabled),
  batchDeleteLocalMods: (filePaths) => App.BatchDeleteLocalMods(filePaths),
  importFiles: (paths) => App.ImportFiles(paths),
  getPathForFile: (file) => file?.path || null,

  // Conflicts & Duplicates
  scanConflicts: () => App.ScanConflicts(),
  deleteDuplicateMod: (filePath) => App.DeleteDuplicateMod(filePath),

  // Polycount Scanner
  scanPolycount: () => App.ScanPolycount(),

  // Save File Inspector
  listSaveFiles: (customFolder) => App.ListSaveFiles(customFolder || ''),
  analyzeSaveFile: (savePath) => App.AnalyzeSaveFile(typeof savePath === 'object' ? savePath.savePath : savePath),

  // CC Swiper
  swiperGetCards: (opts) => App.SwiperGetCards(opts || { filter: 'all', folder: '', onlyUnreviewed: true, shuffle: false }),
  swiperAction: (opts) => App.SwiperAction(opts),
  swiperUndo: () => App.SwiperUndo(),
  swiperResetReviewed: () => App.SwiperResetReviewed(),
  swiperStartServer: (port) => App.SwiperStartServer(port || 3456),
  swiperStopServer: () => App.SwiperStopServer(),
  swiperGetServerStatus: () => App.SwiperGetServerStatus(),

  // Profiles
  listProfiles: () => App.ListProfiles(),
  saveProfile: (payload) => App.SaveProfile(payload),
  applyProfile: (id) => App.ApplyProfile(id),
  renameProfile: (id, name) => App.RenameProfile(id, name),
  deleteProfile: (id) => App.DeleteProfile(id),
  exportProfile: (id) => App.ExportProfile(id),
  importProfile: () => App.ImportProfile(),

  // Creator catalog
  getCatalog: () => App.GetCatalog(),

  // CurseForge
  searchCurseForge: (params) => App.SearchCurseForge(params || {}),
  getCurseForgeCategories: () => App.GetCurseForgeCategories(),
  downloadCurseForgeMod: (mod) => App.DownloadCurseForgeMod(mod),
  getDownloadedCurseForge: () => App.GetDownloadedCurseForge(),
  checkCurseForgeUpdates: (opts) => App.CheckCurseForgeUpdates(opts),
  updateCurseForgeMod: (mod) => App.UpdateCurseForgeMod(mod),
  getCurseForgeModsByIds: (ids) => App.GetCurseForgeModsByIds(ids),
  getCurseForgeDescription: (modId) => App.GetCurseForgeDescription(modId),
  onCurseForgeProgress: (cb) => {
    EventsOn('curseforge:progress', cb)
    return () => EventsOff('curseforge:progress', cb)
  },

  // Accounts
  getAuthStatus: () => App.GetAuthStatus(),
  connectAccount: (provider) => App.ConnectAccount(provider),
  disconnectAccount: (provider) => App.DisconnectAccount(provider),

  // Discover
  getSourceTypes: () => App.GetSourceTypes(),
  getSources: () => App.GetSources(),
  followSource: (payload) => App.FollowSource(payload),
  followSourcesBatch: (payload) => App.FollowSourcesBatch(payload),
  unfollowSource: (id) => App.UnfollowSource(id),
  getCachedDiscover: () => App.GetCachedDiscover(),
  fetchDiscover: (opts) => App.FetchDiscover(opts),
  fetchMoreDiscover: () => App.FetchMoreDiscover(),
  fetchSourceDiscover: (payload) => App.FetchSourceDiscover(payload),
  getMtsDetail: (url) => App.GetMtsDetail(url),
  getTumblrDetail: (links) => App.GetTumblrDetail(links),
  fetchTumblrFeed: (payload) => App.FetchTumblrFeed(payload),
  fetchPinterestFeed: (payload) => App.FetchPinterestFeed(payload),
  getDownloadedDiscover: () => App.GetDownloadedDiscover(),
  getSuggestedSources: () => App.GetSuggestedSources(),
  followSuggestedSources: (entries) => App.FollowSuggestedSources(entries),
  downloadDiscoverItem: (item) => App.DownloadDiscoverItem(item),
  resolveDiscoverLink: (url) => App.ResolveDiscoverLink(url),
  getSavedLinks: () => App.GetSavedLinks(),
  removeSavedLink: (id) => App.RemoveSavedLink(id),
  onDiscoverProgress: (cb) => {
    EventsOn('discover:progress', cb)
    return () => EventsOff('discover:progress', cb)
  },

  // Background Download Queue Manager
  enqueueCurseForgeDownload: (mod, isUpdate = false) => App.EnqueueCurseForgeDownload(mod, Boolean(isUpdate)),
  enqueueDiscoverDownload: (item) => App.EnqueueDiscoverDownload(item),
  getDownloadQueue: () => App.GetDownloadQueue(),
  cancelDownloadJob: (jobId) => App.CancelDownloadJob(jobId),
  retryDownloadJob: (jobId) => App.RetryDownloadJob(jobId),
  clearCompletedDownloads: () => App.ClearCompletedDownloads(),
  onDownloadQueueUpdate: (cb) => {
    EventsOn('downloads:queue', cb)
    return () => EventsOff('downloads:queue', cb)
  },

  // Download watcher
  startDownloadWatch: (mod) => App.StartDownloadWatch(mod),
  installCaughtFile: (payload) => App.InstallCaughtFile(payload),
  onDownloadDetected: (cb) => {
    EventsOn('cfHelper:detected', cb)
    return () => EventsOff('cfHelper:detected', cb)
  },

  // ThumbCache Maintenance
  openThumbCache: () => App.OpenThumbCache(),
  clearThumbCache: () => App.ClearThumbCache()
}

window.api = api

export default api
