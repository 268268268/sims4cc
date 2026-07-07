import 'dotenv/config'

import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } from 'electron'
import { join, dirname, resolve, sep } from 'path'
import { unlink, access, rm, mkdir } from 'fs/promises'
import { pathToFileURL } from 'url'
import { scanMods, getCachedLocalMods, updateCachedMod, clearCachedLocalMods } from './services/localModScanner.js'
import { searchMods, downloadMod, getCategories, getModsByIds, getModDescription } from './services/curseForgeClient.js'
import { extractModArchive } from './services/archiveExtractor.js'
import { recordDownload, getDownloaded, recordDiscoverDownload, getDiscoverDownloaded } from './services/downloadStore.js'
import { getThumbCacheDir } from './services/dbpfThumbnail.js'
import { inspectLocalMod } from './services/localModInspector.js'
import { deleteLocalMod } from './services/localModDelete.js'
import { importFiles } from './services/modImporter.js'
import { checkUpdates, updateInstalledMod } from './services/updateService.js'
import { getSources, followSource, followBatch, unfollowSource, fetchDiscover, fetchMoreDiscover, getSuggested, followSuggested, SOURCE_TYPES } from './services/discover.js'
import { downloadRemoteItem } from './services/remoteDownload.js'
import { installSessionFetch, authStatus, connect as authConnect, disconnect as authDisconnect } from './services/sessionManager.js'

import { toggleLocalModEnabled } from './services/localModActions.js'
import { fetchAndCacheCatalog } from './services/catalogStore.js'
import { readConfig, writeConfig } from './services/configStore.js'

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

// config now lives in a shared service so other main-process services can read it

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
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
    clearCachedLocalMods()
    return res
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
    console.log('Main: Fetching catalog...')
    const data = await fetchAndCacheCatalog()
    console.log('Main: Returning catalog:', data)
    return data
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
    clearCachedLocalMods()
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
    clearCachedLocalMods()
    return res
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: batch-fetch CurseForge mods by id (Installed view, local "from CF" detail)
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
    if (res.ok) clearCachedLocalMods()
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
    if (res.ok) clearCachedLocalMods()
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
ipcMain.handle('discover:suggested', () => getSuggested())
ipcMain.handle('discover:followSuggested', async (_e, entries) => {
  try {
    return await followSuggested(entries)
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
    const res = await downloadRemoteItem(item, config.modsFolder, {
      trayFolder,
      onProgress: (p) => { if (!sender.isDestroyed()) sender.send('discover:progress', { itemId: item?.id, ...p }) }
    })
    if (res.ok) {
      clearCachedLocalMods()
      await recordDiscoverDownload(item, res) // remember it so it shows Installed / can't re-download
    }
    return res
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
ipcMain.handle('discover:getDownloaded', () => getDiscoverDownloaded())

// IPC: thumbnail cache maintenance (Settings)
ipcMain.handle('thumbCache:open', async () => {
  shell.openPath(await getThumbCacheDir())
})
ipcMain.handle('thumbCache:clear', async () => {
  try {
    const dir = await getThumbCacheDir()
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    clearCachedLocalMods()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// IPC: inspect a local mod — sibling files + DBPF resource summary
ipcMain.handle('localMods:inspect', (_e, filePath) => inspectLocalMod(filePath))

// IPC: reveal a file/folder in the OS file manager
ipcMain.handle('shell:showItemInFolder', (_e, p) => {
  if (typeof p === 'string' && p) shell.showItemInFolder(p)
})

// IPC: open external URL in default system browser (keeps links out of the app window)
ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url))

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
