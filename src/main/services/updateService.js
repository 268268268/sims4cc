import { shell } from 'electron'
import { resolve, sep } from 'path'
import { getModsByIds, downloadMod, pickLatestFile } from './curseForgeClient.js'
import { getDownloaded, recordDownload } from './downloadStore.js'
import { matchLocalMods } from './curseForgeLocalMatch.js'
import { jsonCache } from './jsonCache.js'

// Session cache: update checks are cheap but not free — one forced check
// refreshes everything, navigation reuses the result. Also persisted to disk so
// a large library shows its previous result instantly after a restart.
let lastCheck = null
const checkCache = jsonCache('cf-update-cache.json')

export function invalidateUpdateCache() {
  lastCheck = null
}

/**
 * Compare every recorded download against the latest file on CurseForge.
 * @returns {Promise<{ ok:boolean, checkedAt?:string, updates?:Array, mods?:Array, error?:string }>}
 */
export async function checkUpdates({ force = false } = {}) {
  if (lastCheck && !force) return lastCheck
  // Cold start: serve the previous result from disk instantly. fromCache tells the
  // UI to trigger one background refresh so a stale answer gets replaced.
  if (!force && !lastCheck) {
    const disk = await checkCache.load()
    if (disk) return (lastCheck = { ...disk, fromCache: true })
  }

  const downloaded = await getDownloaded()
  const ids = Object.keys(downloaded).map(Number)

  // fingerprint-matched local mods (covers mods installed outside the app) that
  // aren't already tracked in downloads.json
  let fpMatches = []
  try { fpMatches = await matchLocalMods() } catch { /* CF unreachable — fall back to downloads.json only */ }
  const downloadedSet = new Set(ids)
  const fpByModId = new Map()
  for (const m of fpMatches) if (!downloadedSet.has(m.modId) && !fpByModId.has(m.modId)) fpByModId.set(m.modId, m)

  const allIds = [...new Set([...ids, ...fpByModId.keys()])]
  if (!allIds.length) {
    lastCheck = { ok: true, checkedAt: new Date().toISOString(), updates: [], mods: [] }
    await checkCache.save(lastCheck)
    return lastCheck
  }

  const { data: mods, error } = await getModsByIds(allIds, { force })
  if (error && !mods.length) return { ok: false, error }

  const byId = new Map(mods.map(m => [m.id, m]))
  const updates = []
  for (const [idStr, rec] of Object.entries(downloaded)) {
    const modId = Number(idStr)
    const mod = byId.get(modId)
    if (!mod) {
      updates.push({ modId, name: rec.name, found: false, updateAvailable: false })
      continue
    }
    const latest = pickLatestFile(mod)
    updates.push({
      modId,
      name: mod.name ?? rec.name,
      found: true,
      installedFileId: rec.fileId ?? null,
      latestFileId: latest?.id ?? null,
      latestFileName: latest?.fileName ?? null,
      latestFileDate: latest?.fileDate ?? null,
      // fileId null on legacy records → unknown; re-download to start tracking
      updateAvailable: rec.fileId != null && latest?.id != null ? latest.id !== rec.fileId : null
    })
  }
  // fingerprint-only installs — not in downloads.json, but present on disk
  for (const [modId, fm] of fpByModId) {
    const mod = byId.get(modId)
    if (!mod) continue
    const latest = pickLatestFile(mod)
    updates.push({
      modId,
      name: mod.name,
      found: true,
      installedFileId: fm.installedFileId ?? null,
      latestFileId: latest?.id ?? null,
      latestFileName: latest?.fileName ?? null,
      latestFileDate: latest?.fileDate ?? null,
      updateAvailable: fm.hasUpdate ?? null,
      localPath: fm.filePath // lets the update replace the right file without a duplicate
    })
  }

  lastCheck = { ok: true, checkedAt: new Date().toISOString(), updates, mods, ...(error ? { error } : {}) }
  if (!error) await checkCache.save(lastCheck) // don't persist a partial result from a failed fetch
  return lastCheck
}

/**
 * Replace an installed mod with its latest version WITHOUT leaving a
 * "Name (2)" duplicate: trash the old install first, then download fresh.
 */
export async function updateInstalledMod(mod, modsFolder, opts = {}) {
  // Pre-flight: many Sims 4 CC authors disable third-party (app) downloads on
  // CurseForge. Bail BEFORE trashing the installed file, so a blocked mod never
  // leaves the user empty-handed with a broken update.
  if (mod?.allowModDistribution === false) {
    return {
      ok: false,
      blocked: true,
      error: 'The author disabled app downloads for this mod on CurseForge — open it there to update manually.'
    }
  }

  const downloaded = await getDownloaded()
  const rec = downloaded[String(mod?.id)]

  // Where the current version lives: the recorded path, or — for mods installed
  // outside the app — the fingerprint-matched file. Trash it first so the update
  // doesn't leave a "Name (2)" duplicate. No location found → plain fresh install.
  let oldPath = rec?.path ?? null
  if (!oldPath) {
    try {
      const fm = (await matchLocalMods()).find(m => m.modId === mod?.id)
      oldPath = fm?.filePath ?? null
    } catch { /* CF unreachable — fall back to a plain install */ }
  }

  if (oldPath) {
    const absOld = resolve(oldPath)
    const absFolder = resolve(modsFolder)
    const rel = absOld.slice(absFolder.length)
    const inside = absOld.toLowerCase().startsWith(absFolder.toLowerCase()) && rel !== '' && rel.startsWith(sep)
    if (!inside) {
      return { ok: false, error: 'Install path is outside the Mods folder — refusing to remove it.' }
    }
    try {
      await shell.trashItem(absOld)
    } catch (e) {
      // ENOENT-ish (“already gone”) is fine to proceed past; a locked file is not
      if (!/no such file|not found|ENOENT/i.test(e.message ?? '')) {
        return { ok: false, error: `Could not remove the old version (is the game running?): ${e.message}` }
      }
    }
  }

  const res = await downloadMod(mod, modsFolder, opts)
  if (!res.ok) {
    return {
      ok: false,
      error: `${res.error} — the previous version was moved to the Recycle Bin and can be restored from there.`
    }
  }
  await recordDownload(mod, res)
  invalidateUpdateCache()
  return res
}
