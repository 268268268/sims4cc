import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname } from 'path'
import { readFile, writeFile, unlink, access } from 'fs/promises'
import { scanMods, getCachedLocalMods, updateCachedMod } from './services/localModScanner.js'
import { toggleLocalModEnabled } from './services/localModActions.js'

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

// IPC: convert absolute image path to safe file:// URL for renderer
ipcMain.handle('localMods:imageUrl', (_e, absPath) => {
  if (!absPath || typeof absPath !== 'string') return null
  // Only serve image files — block path traversal attempts
  if (!/\.(png|jpe?g|webp|gif)$/i.test(absPath)) return null
  return `file://${absPath.replace(/\\/g, '/')}`
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
