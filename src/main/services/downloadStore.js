import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, access } from 'fs/promises'
import { pickLatestFile } from './curseForgeClient.js'

// One small JSON file in userData records every CurseForge download so the
// "Installed" marker survives restarts. Keyed by CurseForge mod id (string).
const STORE_PATH = join(app.getPath('userData'), 'downloads.json')

async function readStore() {
  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

async function writeStore(data) {
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Record a successful download.
 * @param {object} mod    CurseForge mod object (needs id, name, latestFiles)
 * @param {object} result downloadMod result ({ ok, path, files? })
 */
export async function recordDownload(mod, result) {
  if (!mod?.id) return
  const store = await readStore()
  store[String(mod.id)] = {
    name: mod.name ?? null,
    path: result?.path ?? null, // extracted folder or the .package file on disk
    // must match what downloadMod actually installed (pickLatestFile, not [0])
    fileId: pickLatestFile(mod)?.id ?? null,
    at: new Date().toISOString()
  }
  await writeStore(store).catch(() => {})
}

/**
 * Return the record of downloaded mods, self-healing: entries whose file/folder
 * no longer exists on disk (user deleted the mod) are dropped so the marker
 * reflects reality.
 * @returns {Promise<Record<string, { name, path, fileId, at }>>}
 */
export async function getDownloaded() {
  const store = await readStore()
  const alive = {}
  let changed = false
  for (const [id, rec] of Object.entries(store)) {
    if (rec?.path) {
      try {
        await access(rec.path)
        alive[id] = rec
      } catch {
        changed = true // the mod was removed from disk — forget it
      }
    } else {
      alive[id] = rec
    }
  }
  if (changed) await writeStore(alive).catch(() => {})
  return alive
}
