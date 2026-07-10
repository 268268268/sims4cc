import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

// Tiny persisted JSON blob in userData — a "last result" cache that survives
// restarts so the UI can show the previous answer instantly and recompute in
// the background. load() returns null when absent; save() is best-effort.
export function jsonCache(fileName) {
  let path = null
  const resolve = async () => (path ??= join((await import('electron')).app.getPath('userData'), fileName))
  return {
    load: async () => { try { return JSON.parse(await readFile(await resolve(), 'utf-8')) } catch { return null } },
    save: async (v) => { try { await writeFile(await resolve(), JSON.stringify(v), 'utf-8') } catch { /* best-effort */ } }
  }
}
