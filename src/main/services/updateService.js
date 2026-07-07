import { shell } from 'electron'
import { resolve, sep } from 'path'
import { getModsByIds, downloadMod, pickLatestFile } from './curseForgeClient.js'
import { getDownloaded, recordDownload } from './downloadStore.js'

// Session cache: update checks are cheap but not free — one forced check
// refreshes everything, navigation reuses the result.
let lastCheck = null

export function invalidateUpdateCache() {
  lastCheck = null
}

/**
 * Compare every recorded download against the latest file on CurseForge.
 * @returns {Promise<{ ok:boolean, checkedAt?:string, updates?:Array, mods?:Array, error?:string }>}
 */
export async function checkUpdates({ force = false } = {}) {
  if (lastCheck && !force) return lastCheck

  const downloaded = await getDownloaded()
  const ids = Object.keys(downloaded).map(Number)
  if (!ids.length) {
    lastCheck = { ok: true, checkedAt: new Date().toISOString(), updates: [], mods: [] }
    return lastCheck
  }

  const { data: mods, error } = await getModsByIds(ids, { force })
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

  lastCheck = { ok: true, checkedAt: new Date().toISOString(), updates, mods, ...(error ? { error } : {}) }
  return lastCheck
}

/**
 * Replace an installed mod with its latest version WITHOUT leaving a
 * "Name (2)" duplicate: trash the old install first, then download fresh.
 */
export async function updateInstalledMod(mod, modsFolder, opts = {}) {
  const downloaded = await getDownloaded()
  const rec = downloaded[String(mod?.id)]

  // no record (or path already gone) → plain fresh install
  if (rec?.path) {
    const absOld = resolve(rec.path)
    const absFolder = resolve(modsFolder)
    const rel = absOld.slice(absFolder.length)
    const inside = absOld.toLowerCase().startsWith(absFolder.toLowerCase()) && rel !== '' && rel.startsWith(sep)
    if (!inside) {
      return { ok: false, error: 'Recorded install path is outside the Mods folder — refusing to remove it.' }
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
