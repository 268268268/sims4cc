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

// ---- Discover (Patreon/Tumblr) downloads ----
// Separate file, keyed by Discover item id (e.g. "patreon:12345"). Records the
// installed file paths so the "Installed" marker self-heals when the user deletes
// the files, and the offered file names so the same file re-posted elsewhere is
// still recognised as already-downloaded.
const DISCOVER_STORE_PATH = join(app.getPath('userData'), 'discover-downloads.json')

async function readDiscover() {
  try { return JSON.parse(await readFile(DISCOVER_STORE_PATH, 'utf-8')) } catch { return {} }
}

/** Record a successful Discover download. @param result downloadRemoteItem result. */
export async function recordDiscoverDownload(item, result) {
  if (!item?.id || !result?.installed?.length) return
  const store = await readDiscover()
  store[item.id] = {
    name: item.title ?? null,
    paths: result.installed,                         // files on disk (for self-heal)
    files: (item.downloads ?? []).map(d => d.name),  // offered names (for cross-post match)
    at: new Date().toISOString()
  }
  await writeFile(DISCOVER_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8').catch(() => {})
}

/**
 * Downloaded Discover items, self-healing: an entry is dropped once none of its
 * installed files still exist on disk.
 * @returns {Promise<{ ids: string[], files: string[] }>} ids + all offered file names
 */
export async function getDiscoverDownloaded() {
  const store = await readDiscover()
  const alive = {}
  let changed = false
  for (const [id, rec] of Object.entries(store)) {
    const paths = rec?.paths ?? []
    if (!paths.length) { alive[id] = rec; continue }
    let anyAlive = false
    for (const p of paths) { try { await access(p); anyAlive = true; break } catch { /* gone */ } }
    if (anyAlive) alive[id] = rec; else changed = true
  }
  if (changed) await writeFile(DISCOVER_STORE_PATH, JSON.stringify(alive, null, 2)).catch(() => {})
  return {
    ids: Object.keys(alive),
    files: [...new Set(Object.values(alive).flatMap(r => r.files ?? []))]
  }
}
