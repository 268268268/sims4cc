import { getCachedLocalMods } from './localModScanner.js'
import { matchFingerprints, pickLatestFile } from './curseForgeClient.js'
import { fingerprintFile, loadFpCache, saveFpCache } from './curseForgeFingerprint.js'

/**
 * Fingerprint every local .package and match it against CurseForge — identifies
 * mods installed outside the app, and whether a newer file exists.
 * @returns {Promise<Array<{ filePath, modId, installedFileId, latestFileId, hasUpdate }>>}
 */
export async function matchLocalMods() {
  const mods = (await getCachedLocalMods()).filter(m => m.type === 'package' && m.filePath)
  if (!mods.length) return []

  const cache = await loadFpCache()
  const fpByPath = new Map() // fingerprint -> filePath
  let idx = 0
  await Promise.all(Array.from({ length: Math.min(8, mods.length) }, async () => {
    while (idx < mods.length) {
      const m = mods[idx++]
      try {
        fpByPath.set(await fingerprintFile(m.filePath, m.modifiedAt, cache), m.filePath)
      } catch { /* unreadable file — skip */ }
    }
  }))
  await saveFpCache(cache)

  const { matches } = await matchFingerprints([...fpByPath.keys()])
  const out = []
  for (const mt of matches) {
    const file = mt.file
    const filePath = file && fpByPath.get(file.fileFingerprint)
    if (!filePath) continue
    const latest = pickLatestFile({ latestFiles: mt.latestFiles })
    out.push({
      filePath,
      modId: file.modId,
      installedFileId: file.id,
      latestFileId: latest?.id ?? null,
      hasUpdate: !!(latest && latest.id !== file.id)
    })
  }
  return out
}
