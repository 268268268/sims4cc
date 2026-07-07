import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

// One JSON file in userData for all app settings. Lazily resolved so importing
// this module never touches Electron internals at load time.
let CONFIG_PATH = null
function configPath() {
  if (!CONFIG_PATH) CONFIG_PATH = join(app.getPath('userData'), 'config.json')
  return CONFIG_PATH
}

// In-memory copy so hot paths (per-keystroke search) don't hit disk.
let cached = null

export async function readConfig() {
  if (cached) return cached
  try {
    cached = JSON.parse(await readFile(configPath(), 'utf-8'))
  } catch {
    cached = { modsFolder: null }
  }
  return cached
}

export async function writeConfig(config) {
  cached = config
  await writeFile(configPath(), JSON.stringify(config, null, 2), 'utf-8')
}

export async function getConfigValue(key) {
  return (await readConfig())[key]
}
