/**
 * The newest file of a CurseForge mod — MUST mirror pickLatestFile in
 * src/main/services/curseForgeClient.js (badge and install action must agree).
 */
export function pickLatestFile(mod) {
  const files = mod?.latestFiles ?? []
  if (!files.length) return null
  return [...files].sort((a, b) => {
    const d = new Date(b.fileDate ?? 0) - new Date(a.fileDate ?? 0)
    return d !== 0 ? d : (b.id ?? 0) - (a.id ?? 0)
  })[0]
}

export const RELEASE_TYPE = {
  1: { label: 'R', title: 'Release', cls: 'bg-emerald-700/60 text-emerald-200' },
  2: { label: 'β', title: 'Beta', cls: 'bg-amber-700/60 text-amber-200' },
  3: { label: 'α', title: 'Alpha', cls: 'bg-red-800/60 text-red-200' }
}
