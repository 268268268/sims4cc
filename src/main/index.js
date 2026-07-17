import 'dotenv/config'

import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, session } from 'electron'
import { join, dirname, resolve, sep, basename } from 'path'
import { unlink, access, rm, mkdir, readdir, writeFile, readFile } from 'fs/promises'
import { pathToFileURL } from 'url'
import { scanMods, getCachedLocalMods, updateCachedMod, clearCachedLocalMods } from './services/localModScanner.js'
import { searchMods, downloadMod, getCategories, getModsByIds, getModDescription } from './services/curseForgeClient.js'
import { matchLocalMods } from './services/curseForgeLocalMatch.js'
import { jsonCache } from './services/jsonCache.js'
import { extractModArchive } from './services/archiveExtractor.js'
import { recordDownload, getDownloaded, recordDiscoverDownload, getDiscoverDownloaded } from './services/downloadStore.js'
import { getThumbCacheDir } from './services/dbpfThumbnail.js'
import { inspectLocalMod } from './services/localModInspector.js'
import { deleteLocalMod } from './services/localModDelete.js'
import { importFiles } from './services/modImporter.js'
import { checkUpdates, updateInstalledMod, invalidateUpdateCache } from './services/updateService.js'
import { getSources, followSource, followBatch, unfollowSource, fetchDiscover, fetchMoreDiscover, fetchSourceFeed, getDiscoverSnapshot, getSuggested, followSuggested, SOURCE_TYPES } from './services/discover.js'
import { downloadRemoteItem } from './services/remoteDownload.js'
import { resolveLink } from './services/linkResolver.js'
import { resolveMtsDetail } from './services/sources/modthesims.js'
import { listSavedLinks, addSavedLink, removeSavedLink } from './services/savedLinksStore.js'
import { startDownloadWatch } from './services/downloadWatcher.js'
import { installSessionFetch, authStatus, connect as authConnect, disconnect as authDisconnect } from './services/sessionManager.js'

import { toggleLocalModEnabled } from './services/localModActions.js'
import { fetchAndCacheCatalog } from './services/catalogStore.js'
import { readConfig, writeConfig } from './services/configStore.js'
import { listProfiles, getProfile, saveProfile, renameProfile, deleteProfile, setActiveProfile, addImportedProfile, modStableKey } from './services/profileStore.js'

/** dirname(modsFolder)/Tray, but only when it actually exists. */
async function findTrayFolder(modsFolder) {
  if (!modsFolder) return null
  const tray = join(dirname(modsFolder), 'Tray')
  try {
    await access(tray)
    return tray
  } catch {
    return null
  }
}

/** Progress relay: forwards service progress into the renderer, keyed by mod id. */
function progressSender(e, modId) {
  const sender = e.sender
  return (p) => {
    if (!sender.isDestroyed()) sender.send('curseforge:progress', { modId, ...p })
  }
}

// modimg:// serves local thumbnails — <img src="file://..."> is blocked by
// Chromium when the renderer runs off http://localhost (dev mode).
protocol.registerSchemesAsPrivileged([
  { scheme: 'modimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

// dev is served over http://localhost by Vite; anything else is the built file://
// bundle (packaged app or `electron-vite preview`).
const IS_DEV = !!process.env['ELECTRON_RENDERER_URL']

// Locked-down policy for the shipped app. The renderer only shows our own bundled
// UI and never fetches remotely (all network goes through the main process over
// IPC), so scripts are pinned to 'self'. Images come from many hosts (CurseForge/
// Patreon/Tumblr CDNs, the modimg:// thumbnail scheme, data: SVG placeholders), so
// img-src stays broad. Not applied in dev — Vite's HMR needs inline/eval + ws:.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: modimg:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "media-src 'self' https: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ')

// config now lives in a shared service so other main-process services can read it

// Local mods changed on disk (download/update/import/delete): drop the mod-scan
// cache AND the update-check cache so the Installed view reflects new mods.
function onLocalModsChanged() {
  clearCachedLocalMods()
  invalidateUpdateCache()
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    // matches the renderer's body background so there's no colour flash on launch
    backgroundColor: '#070b09',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // the preload only uses contextBridge/ipcRenderer/webUtils, all of which work
      // in a sandboxed renderer — so a compromised page can't reach Node.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // No console for end users — disables DevTools (F12, right-click) in the
      // shipped app, so failed-image 404s and other noise stay hidden. Kept in dev.
      devTools: !app.isPackaged
    }
  })

  // The window must only ever display our own UI. A stray link in a mod
  // description or a window.open() is refused; http(s) links are handed to the
  // system browser instead of hijacking the app frame.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (IS_DEV && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) return // Vite HMR
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC: get full config
ipcMain.handle('get-config', async () => {
  return await readConfig()
})

// IPC: set a single config key
ipcMain.handle('set-config', async (_e, key, value) => {
  const config = await readConfig()
  config[key] = value
  await writeConfig(config)
})

// IPC: sanity-check that a folder looks like a Sims 4 Mods folder, so Settings can
// warn when the user has pointed the app at something unrelated (a game install,
// Downloads, …). Heuristic and non-blocking — the user can still use any folder.
ipcMain.handle('mods:validateFolder', async (_e, folder) => {
  const target = folder ?? (await readConfig()).modsFolder
  if (!target) return { ok: false, exists: false }
  try {
    await access(target)
  } catch {
    return { ok: false, exists: false }
  }
  const lower = target.toLowerCase()
  const isMods = basename(target).toLowerCase() === 'mods'
  const inSims4Path = lower.includes('the sims 4')
  let hasResourceCfg = false
  try { await access(join(target, 'Resource.cfg')); hasResourceCfg = true } catch { /* absent */ }
  // shallow probe for a .package at the root or one level down (Mods/<creator>/x.package)
  let hasPackages = false
  try {
    const entries = await readdir(target, { withFileTypes: true })
    hasPackages = entries.some(e => e.isFile() && /\.package(\.disabled)?$/i.test(e.name))
    if (!hasPackages) {
      for (const e of entries.filter(x => x.isDirectory()).slice(0, 40)) {
        const sub = await readdir(join(target, e.name)).catch(() => [])
        if (sub.some(n => /\.package(\.disabled)?$/i.test(n))) { hasPackages = true; break }
      }
    }
  } catch { /* unreadable — leave false */ }
  const looksValid = isMods || hasResourceCfg || hasPackages
  return { ok: true, exists: true, looksValid, isMods, inSims4Path, hasResourceCfg, hasPackages }
})

// IPC: open native folder picker
ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select your Sims 4 Mods folder'
  })
  return canceled ? null : filePaths[0]
})

// IPC: return cached mods (no disk I/O) — restores renderer state after unmount
ipcMain.handle('localMods:getCached', () => {
  return getCachedLocalMods()
})

// IPC: scan local mods folder
ipcMain.handle('localMods:scan', async () => {
  const now = new Date().toISOString()
  try {
    const config = await readConfig()
    if (!config.modsFolder) {
      return { ok: false, mods: [], scannedAt: now, count: 0, errors: [{ message: 'Mods folder not configured.' }] }
    }
    // validate folder exists
    try {
      await access(config.modsFolder)
    } catch {
      return { ok: false, mods: [], scannedAt: now, count: 0, errors: [{ message: `Mods folder not found: ${config.modsFolder}` }] }
    }
    const { mods, errors, durationMs } = await scanMods(config.modsFolder)
    return { ok: true, mods, scannedAt: now, count: mods.length, errors, durationMs }
  } catch (err) {
    return { ok: false, mods: [], scannedAt: now, count: 0, errors: [{ message: err.message }] }
  }
})

// IPC: convert absolute image path to a modimg:// URL the renderer may load
ipcMain.handle('localMods:imageUrl', (_e, absPath) => {
  if (!absPath || typeof absPath !== 'string') return null
  // Only serve image files — block path traversal attempts
  if (!/\.(png|jpe?g|webp|gif)$/i.test(absPath)) return null
  return `modimg://thumb/?p=${encodeURIComponent(absPath)}`
})

// IPC: extract a zip archive that already sits in the Mods folder
ipcMain.handle('localMods:extractArchive', async (_e, filePath) => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) return { ok: false, error: 'Mods folder not configured.' }
    if (!filePath || typeof filePath !== 'string' || !/\.zip$/i.test(filePath)) {
      return { ok: false, error: 'Not a zip archive.' }
    }
    // the archive must live inside the configured Mods folder
    const absFile = resolve(filePath)
    const absFolder = resolve(config.modsFolder)
    const rel = absFile.slice(absFolder.length)
    if (!absFile.startsWith(absFolder) || (rel !== '' && !rel.startsWith(sep))) {
      return { ok: false, error: 'Archive is outside the configured Mods folder.' }
    }
    const trayFolder = await findTrayFolder(config.modsFolder)
    const res = await extractModArchive(absFile, absFolder, undefined, { trayFolder })
    if (!res.ok) return res
    await unlink(absFile).catch(() => {})
    onLocalModsChanged()
    return res
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: extract every .zip in the Mods folder — each into its own named folder,
// zip deleted on success. Returns a summary; a bad archive doesn't abort the rest.
ipcMain.handle('localMods:extractAllArchives', async () => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) return { ok: false, error: 'Mods folder not configured.' }
    const absFolder = resolve(config.modsFolder)
    const trayFolder = await findTrayFolder(config.modsFolder)
    const archives = (await getCachedLocalMods())
      .filter(m => m.type === 'archive' && m.filePath && /\.zip$/i.test(m.filePath))
    let extracted = 0
    const failed = []
    for (const a of archives) {
      const absFile = resolve(a.filePath)
      const rel = absFile.slice(absFolder.length)
      if (!absFile.startsWith(absFolder) || (rel !== '' && !rel.startsWith(sep))) continue
      const res = await extractModArchive(absFile, absFolder, undefined, { trayFolder })
      if (res.ok) { await unlink(absFile).catch(() => {}); extracted++ }
      else failed.push({ name: basename(absFile), error: res.error })
    }
    if (extracted || failed.length) onLocalModsChanged()
    return { ok: true, extracted, failed }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: toggle local mod enabled/disabled (rename file extension)
ipcMain.handle('localMods:toggleEnabled', async (_e, filePath, enabled) => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) {
      return { ok: false, error: { message: 'Mods folder not configured.' } }
    }
    try {
      await access(config.modsFolder)
    } catch {
      return { ok: false, error: { message: `Mods folder not found: ${config.modsFolder}` } }
    }
    const res = await toggleLocalModEnabled({ filePath, enabled, modsFolder: config.modsFolder })
    if (res.ok) updateCachedMod(res.oldPath, res.mod)
    return res
  } catch (err) {
    return { ok: false, error: { message: err.message } }
  }
})

// IPC: fetch & cache remote creator catalog
  ipcMain.handle('catalog:get', async () => {
    return await fetchAndCacheCatalog()
})

// IPC: search CurseForge mods for The Sims 4
ipcMain.handle('curseforge:search', async (_e, params) => {
  return await searchMods(params)
})

// IPC: CurseForge category list for the browse filter
ipcMain.handle('curseforge:categories', async () => {
  return await getCategories()
})

// IPC: download a CurseForge mod into the configured Sims 4 Mods folder
ipcMain.handle('curseforge:download', async (e, mod) => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) {
      return { ok: false, error: 'Mods folder not configured.' }
    }
    try {
      await access(config.modsFolder)
    } catch {
      return { ok: false, error: `Mods folder not found: ${config.modsFolder}` }
    }
    const trayFolder = await findTrayFolder(config.modsFolder)
    const res = await downloadMod(mod, config.modsFolder, {
      trayFolder,
      onProgress: progressSender(e, mod?.id)
    })
    // new files may exist on disk even when extraction failed (the zip is kept
    // for inspection) — a stale scan cache would hide them from Local Mods
    onLocalModsChanged()
    if (res.ok) await recordDownload(mod, res)
    return res
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: which CurseForge mods have already been downloaded (persisted, self-healing)
ipcMain.handle('curseforge:getDownloaded', () => getDownloaded())

// IPC: compare installed CurseForge mods with the latest versions
ipcMain.handle('curseforge:checkUpdates', async (_e, opts) => {
  try {
    return await checkUpdates(opts ?? {})
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: replace an installed mod with its latest version (no duplicates)
ipcMain.handle('curseforge:update', async (e, mod) => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) return { ok: false, error: 'Mods folder not configured.' }
    try {
      await access(config.modsFolder)
    } catch {
      return { ok: false, error: `Mods folder not found: ${config.modsFolder}` }
    }
    const trayFolder = await findTrayFolder(config.modsFolder)
    const res = await updateInstalledMod(mod, config.modsFolder, {
      trayFolder,
      onProgress: progressSender(e, mod?.id)
    })
    onLocalModsChanged()
    return res
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: identify which local mods come from CurseForge (by file fingerprint) and
// whether a newer file exists. Returns { [filePathLower]: { modId, name, hasUpdate } }.
const matchLocalCache = jsonCache('cf-match-cache.json')
ipcMain.handle('curseforge:matchLocal', async (_e, { cached = false } = {}) => {
  // cached:true → return the last persisted match instantly (empty {} if none),
  // so a large library shows badges on first paint and recomputes in the background.
  if (cached) return (await matchLocalCache.load()) ?? {}
  const found = await matchLocalMods()
  if (!found.length) {
    await matchLocalCache.save({})
    return {}
  }
  const { data } = await getModsByIds(found.map(f => f.modId))
  const nameById = new Map((data ?? []).map(m => [m.id, m.name]))
  const result = {}
  for (const f of found) {
    result[f.filePath.toLowerCase()] = { modId: f.modId, name: nameById.get(f.modId) ?? null, hasUpdate: f.hasUpdate }
  }
  await matchLocalCache.save(result)
  return result
})

ipcMain.handle('curseforge:getModsByIds', async (_e, ids) => {
  try {
    return await getModsByIds(ids)
  } catch (err) {
    return { data: [], error: err.message }
  }
})

// IPC: sanitized full HTML description of a mod
ipcMain.handle('curseforge:description', async (_e, modId) => {
  try {
    return await getModDescription(modId)
  } catch (err) {
    return { html: '', error: err.message }
  }
})

// IPC: connected-account auth for external sources (Patreon/Pinterest)
ipcMain.handle('auth:status', () => authStatus())
ipcMain.handle('auth:connect', async (_e, provider) => {
  try {
    return await authConnect(provider)
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
ipcMain.handle('auth:disconnect', async (_e, provider) => {
  try {
    return await authDisconnect(provider)
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: move a local mod to the Recycle Bin (plus emptied parent folders)
ipcMain.handle('localMods:delete', async (_e, filePath) => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) return { ok: false, error: { message: 'Mods folder not configured.' } }
    const res = await deleteLocalMod({ filePath, modsFolder: config.modsFolder })
    if (res.ok) onLocalModsChanged()
    return res
  } catch (err) {
    return { ok: false, error: { message: err.message } }
  }
})

// IPC: install files dropped onto the window (zip/package/ts4script/tray)
ipcMain.handle('localMods:import', async (_e, paths) => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) return { ok: false, results: [], error: 'Mods folder not configured.' }
    try {
      await access(config.modsFolder)
    } catch {
      return { ok: false, results: [], error: `Mods folder not found: ${config.modsFolder}` }
    }
    const trayFolder = await findTrayFolder(config.modsFolder)
    const res = await importFiles({ paths, modsFolder: config.modsFolder, trayFolder })
    if (res.ok) onLocalModsChanged()
    return res
  } catch (err) {
    return { ok: false, results: [], error: err.message }
  }
})

// IPC: external mod sources (Discover tab)
ipcMain.handle('discover:sourceTypes', () => SOURCE_TYPES)
ipcMain.handle('discover:sources', () => getSources())
ipcMain.handle('discover:follow', async (_e, payload) => {
  try {
    return await followSource(payload ?? {})
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
ipcMain.handle('discover:followBatch', async (_e, payload) => {
  try {
    return await followBatch(payload ?? {})
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
ipcMain.handle('discover:unfollow', async (_e, id) => {
  try {
    return await unfollowSource(id)
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
ipcMain.handle('discover:getCached', () => getDiscoverSnapshot())
ipcMain.handle('discover:fetch', async (_e, opts) => {
  try {
    return await fetchDiscover(opts ?? {})
  } catch (err) {
    return { ok: false, items: [], sources: [], error: err.message }
  }
})
ipcMain.handle('discover:fetchMore', async () => {
  try {
    return await fetchMoreDiscover()
  } catch (err) {
    return { ok: false, items: [], hasMore: false, error: err.message }
  }
})
ipcMain.handle('discover:fetchSource', async (_e, { sourceId, cursor, sort, cat } = {}) => {
  try {
    return await fetchSourceFeed(sourceId, cursor ?? null, { sort, cat })
  } catch (err) {
    return { ok: false, items: [], error: err.message }
  }
})
ipcMain.handle('discover:suggested', () => getSuggested())
ipcMain.handle('discover:followSuggested', async (_e, entries) => {
  try {
    return await followSuggested(entries)
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Which Discover tab a pasted link belongs on — derived from where the user
// pasted it FROM (a Pinterest pin stays on the Pinterest tab even though it
// resolves to a Patreon file), falling back to the resolved host's own type.
function tabTypeForUrl(pastedUrl, resolved) {
  try {
    const h = new URL(pastedUrl).hostname.toLowerCase()
    if (h.endsWith('pinterest.com') || h === 'pin.it') return 'pinterest'
    if (h.endsWith('patreon.com')) return 'patreon'
    if (h.endsWith('tumblr.com')) return 'tumblr'
  } catch { /* ignore */ }
  return resolved?.sourceType || 'pinterest'
}

// IPC: resolve any URL (Pinterest pin / Patreon post / SimFileShare / direct file)
// to installable files — for the "Download from link" box. A successful resolve
// is remembered (saved-links.json) so it keeps showing on its Discover tab.
ipcMain.handle('discover:resolveLink', async (_e, url) => {
  try {
    const res = await resolveLink(url)
    if (res?.ok && res.id) {
      await addSavedLink({
        id: res.id,
        pinUrl: url,
        title: res.title ?? 'Saved link',
        author: res.author ?? null,
        imageUrl: res.imageUrl ?? null,
        sourceType: tabTypeForUrl(url, res),
        url: res.url ?? url,
        downloads: res.downloads ?? [],
        locked: !!res.locked,
        saved: true
      }).catch(() => {})
    }
    return res
  } catch (err) {
    return { ok: false, openUrl: url, reason: err.message }
  }
})
// Download helper: the user is about to grab a distribution-blocked mod from its
// CurseForge page in their browser — watch Downloads and offer to install what lands.
ipcMain.handle('cfHelper:watch', (e, mod) => { startDownloadWatch(e.sender, mod ?? null); return { ok: true } })

// Install a file the helper caught. Same import path as drag-drop, but when we
// know which CurseForge mod the user opened, ALSO record it as that mod's
// download — otherwise the CurseForge tab would never mark it Installed.
ipcMain.handle('cfHelper:install', async (_e, { path, mod } = {}) => {
  try {
    if (!path) return { ok: false, results: [], error: 'No file to install.' }
    const config = await readConfig()
    if (!config.modsFolder) return { ok: false, results: [], error: 'Mods folder not configured.' }
    try {
      await access(config.modsFolder)
    } catch {
      return { ok: false, results: [], error: `Mods folder not found: ${config.modsFolder}` }
    }
    const trayFolder = await findTrayFolder(config.modsFolder)
    const res = await importFiles({ paths: [path], modsFolder: config.modsFolder, trayFolder })
    if (res.ok) {
      onLocalModsChanged()
      const installed = (res.results ?? []).find(r => r.ok)
      // zips land in `folder`, loose mod files in `dest` — recordDownload needs a
      // real path so its self-heal can drop the entry if the user deletes the mod
      const modPath = installed?.folder ?? installed?.dest ?? null
      if (mod?.id && modPath) await recordDownload(mod, { ok: true, path: modPath }).catch(() => {})
    }
    return { ...res, recordedModId: mod?.id ?? null }
  } catch (err) {
    return { ok: false, results: [], error: err.message }
  }
})
ipcMain.handle('discover:savedLinks', () => listSavedLinks())
ipcMain.handle('discover:removeSavedLink', async (_e, id) => {
  try {
    return await removeSavedLink(id)
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: download a free Discover item's files straight into the Mods folder
ipcMain.handle('discover:download', async (e, item) => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) return { ok: false, error: 'Mods folder not configured.' }
    try {
      await access(config.modsFolder)
    } catch {
      return { ok: false, error: `Mods folder not found: ${config.modsFolder}` }
    }
    const trayFolder = await findTrayFolder(config.modsFolder)
    const sender = e.sender
    // Saved links persist their download URLs, but Patreon signs those and they
    // expire — re-resolve from the original link so a saved card downloaded days
    // later still gets a fresh, working file URL (falls back to the stored one).
    let toDownload = item
    if (item?.saved && (item.pinUrl || item.url)) {
      try {
        const fresh = await resolveLink(item.pinUrl || item.url)
        if (fresh?.ok && fresh.downloads?.length) toDownload = { ...item, downloads: fresh.downloads }
      } catch { /* keep the stored URLs */ }
    }
    // MTS cards carry no download list (resolving needs a per-mod page fetch) —
    // resolve it here, on click only.
    if (item?.sourceType === 'modthesims' && !toDownload.downloads?.length && item.url) {
      const { downloads } = await resolveMtsDetail(item.url)
      if (!downloads.length) return { ok: false, error: 'No installable files found on this ModTheSims page.' }
      toDownload = { ...toDownload, downloads }
    }
    const res = await downloadRemoteItem(toDownload, config.modsFolder, {
      trayFolder,
      onProgress: (p) => { if (!sender.isDestroyed()) sender.send('discover:progress', { itemId: item?.id, ...p }) }
    })
    if (res.ok) {
      onLocalModsChanged()
      // record the RESOLVED item — MTS/saved-link file names only exist after the
      // resolve above, and they're what the cross-post "already downloaded" match uses
      await recordDiscoverDownload(toDownload, res)
    }
    return res
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
ipcMain.handle('discover:getDownloaded', () => getDiscoverDownloaded())

// IPC: screenshots + file list of one MTS mod page (detail modal, on demand)
ipcMain.handle('discover:mtsDetail', async (_e, url) => {
  try {
    return { ok: true, ...(await resolveMtsDetail(url)) }
  } catch (err) {
    return { ok: false, error: err.message, downloads: [], images: [] }
  }
})

// IPC: thumbnail cache maintenance (Settings)
ipcMain.handle('thumbCache:open', async () => {
  shell.openPath(await getThumbCacheDir())
})
ipcMain.handle('thumbCache:clear', async () => {
  try {
    const dir = await getThumbCacheDir()
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    onLocalModsChanged()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ---- Profiles (named mod sets) ----

// IPC: all profiles + the active id
ipcMain.handle('profiles:list', () => listProfiles())

// IPC: snapshot the current mod states into a new profile (or overwrite `id`)
ipcMain.handle('profiles:save', async (_e, payload = {}) => {
  try {
    const mods = await getCachedLocalMods()
    return await saveProfile({ name: payload.name, id: payload.id, mods })
  } catch (err) {
    return { profiles: [], activeId: null, error: err.message }
  }
})

// IPC: toggle mods so their enabled/disabled state matches the profile. Mods the
// profile has never recorded are left as they are.
ipcMain.handle('profiles:apply', async (_e, id) => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) return { ok: false, error: 'Mods folder not configured.' }
    const profile = await getProfile(id)
    if (!profile) return { ok: false, error: 'Profile not found.' }
    const mods = await getCachedLocalMods()
    let changed = 0
    const errors = []
    for (const m of mods) {
      if (m.type === 'archive') continue
      const desired = profile.states[modStableKey(m)]
      if (desired === undefined || desired === m.enabled) continue
      const res = await toggleLocalModEnabled({ filePath: m.filePath, enabled: desired, modsFolder: config.modsFolder })
      if (res.ok) { changed++; updateCachedMod(res.oldPath, res.mod) }
      else errors.push({ file: m.filePath, error: res.error?.message ?? 'toggle failed' })
    }
    await setActiveProfile(id)
    if (changed) onLocalModsChanged()
    return { ok: true, changed, errors }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: rename / delete
ipcMain.handle('profiles:rename', (_e, id, name) => renameProfile(id, name))
ipcMain.handle('profiles:delete', (_e, id) => deleteProfile(id))

// IPC: export a profile to a user-picked .json file
ipcMain.handle('profiles:export', async (_e, id) => {
  try {
    const profile = await getProfile(id)
    if (!profile) return { ok: false, error: 'Profile not found.' }
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export profile',
      defaultPath: `${profile.name.replace(/[^\w.-]+/g, '_')}.s4profile.json`,
      filters: [{ name: 'Sims 4 Mod Profile', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    const payload = { app: 'sims4-mod-manager', kind: 'profile', name: profile.name, states: profile.states }
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: import a profile from a .json file the user picks
ipcMain.handle('profiles:import', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import profile',
      properties: ['openFile'],
      filters: [{ name: 'Sims 4 Mod Profile', extensions: ['json'] }]
    })
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true }
    const raw = JSON.parse(await readFile(filePaths[0], 'utf-8'))
    if (!raw || typeof raw.states !== 'object') return { ok: false, error: 'Not a valid profile file.' }
    const { data, id } = await addImportedProfile(raw)
    return { ok: true, data, id }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: inspect a local mod — sibling files + DBPF resource summary
ipcMain.handle('localMods:inspect', (_e, filePath) => inspectLocalMod(filePath))

// IPC: reveal a file/folder in the OS file manager — only inside the Mods folder
// or our own thumbnail cache, so a compromised renderer can't pop Explorer anywhere
ipcMain.handle('shell:showItemInFolder', async (_e, p) => {
  if (typeof p !== 'string' || !p) return
  try {
    const abs = resolve(p)
    const config = await readConfig()
    const roots = [config.modsFolder, await getThumbCacheDir()].filter(Boolean).map(r => resolve(r))
    const ok = roots.some(root => {
      const rel = abs.slice(root.length)
      return abs.toLowerCase().startsWith(root.toLowerCase()) && (rel === '' || rel.startsWith(sep))
    })
    if (ok) shell.showItemInFolder(abs)
  } catch { /* ignore */ }
})

// IPC: open external URL in default system browser (keeps links out of the app window).
// Only http(s) — never file: or a custom scheme that could launch another program.
ipcMain.handle('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url)
})

// IPC: delete localthumbcache.package (one dir above modsFolder)
ipcMain.handle('clear-game-cache', async () => {
  try {
    const config = await readConfig()
    if (!config.modsFolder) {
      return { success: false, error: 'Mods folder not configured.' }
    }
    const cachePath = join(dirname(config.modsFolder), 'localthumbcache.package')
    await unlink(cachePath)
    return { success: true }
  } catch (err) {
    // ENOENT means cache didn't exist — treat as success
    if (err.code === 'ENOENT') return { success: true, alreadyGone: true }
    return { success: false, error: err.message }
  }
})

app.whenReady().then(() => {
  // route all external-source HTTP through the logged-in session (net.fetch)
  installSessionFetch()

  // Stamp a strict CSP on every response the renderer loads — but only for the
  // built file:// bundle. Dev is served by Vite (HMR needs inline scripts, eval
  // and a websocket) so applying it there would break hot reload.
  if (!IS_DEV) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CONTENT_SECURITY_POLICY]
        }
      })
    })
  }

  protocol.handle('modimg', async (request) => {
    try {
      const u = new URL(request.url)
      // searchParams.get already percent-decodes — decoding twice corrupts paths containing '%'
      const p = u.searchParams.get('p') ?? ''
      if (!/\.(png|jpe?g|webp|gif)$/i.test(p)) return new Response('forbidden', { status: 403 })
      // serve only from inside the Mods folder or our own thumbnail cache
      const config = await readConfig()
      const absFile = resolve(p)
      const roots = [config.modsFolder, await getThumbCacheDir()].filter(Boolean).map(r => resolve(r))
      const allowed = roots.some(root => {
        const rel = absFile.slice(root.length)
        return absFile.startsWith(root) && (rel === '' || rel.startsWith(sep))
      })
      if (!allowed) return new Response('forbidden', { status: 403 })
      return net.fetch(pathToFileURL(absFile).toString())
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
