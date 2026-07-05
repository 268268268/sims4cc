import 'dotenv/config'

import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } from 'electron'
import { join, dirname, resolve, sep } from 'path'
import { readFile, writeFile, unlink, access } from 'fs/promises'
import { pathToFileURL } from 'url'
import { scanMods, getCachedLocalMods, updateCachedMod, clearCachedLocalMods } from './services/localModScanner.js'
import { searchMods, downloadMod, getCategories } from './services/curseForgeClient.js'
import { extractModArchive } from './services/archiveExtractor.js'
import { recordDownload, getDownloaded } from './services/downloadStore.js'
import { getThumbCacheDir } from './services/dbpfThumbnail.js'
import { inspectLocalMod } from './services/localModInspector.js'

import { toggleLocalModEnabled } from './services/localModActions.js'
import { fetchAndCacheCatalog } from './services/catalogStore.js'

// modimg:// serves local thumbnails — <img src="file://..."> is blocked by
// Chromium when the renderer runs off http://localhost (dev mode).
protocol.registerSchemesAsPrivileged([
  { scheme: 'modimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

const CONFIG_PATH = join(app.getPath('userData'), 'config.json')

// ponytail: simple JSON file for config — no SQLite needed for 2 keys
async function readConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { modsFolder: null }
  }
}

async function writeConfig(config) {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

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
    const { mods, errors } = await scanMods(config.modsFolder)
    return { ok: true, mods, scannedAt: now, count: mods.length, errors }
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
    const res = await extractModArchive(absFile, absFolder)
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
ipcMain.handle('curseforge:download', async (_e, mod) => {
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
    const res = await downloadMod(mod, config.modsFolder)
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
  protocol.handle('modimg', async (request) => {
    try {
      const u = new URL(request.url)
      // searchParams.get already percent-decodes — decoding twice corrupts paths containing '%'
      const p = u.searchParams.get('p') ?? ''
      if (!/\.(png|jpe?g|webp|gif)$/i.test(p)) return new Response('forbidden', { status: 403 })
      // serve only from inside the Mods folder or our own thumbnail cache
      const config = await readConfig()
      const absFile = resolve(p)
      const roots = [config.modsFolder, getThumbCacheDir()].filter(Boolean).map(r => resolve(r))
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
