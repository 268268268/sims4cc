import { readdir, stat } from 'fs/promises'
import { join, dirname, basename, extname } from 'path'
import { parseDbpfEntries } from './dbpfThumbnail.js'
import { TYPE_LABELS } from './dbpfTypes.js'

function labelFor(type) {
  return TYPE_LABELS[type >>> 0] || `Other (0x${(type >>> 0).toString(16)})`
}

/**
 * Inspect a local mod: list the files that ship alongside it (its folder) and,
 * for a .package, summarize what resources it contains. Never throws.
 * @param {string} filePath absolute path to the mod file
 * @returns {Promise<{ ok, folder, files, packageContents, error? }>}
 */
export async function inspectLocalMod(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'No file path given.' }
  }
  const folder = dirname(filePath)
  const result = { ok: true, folder, files: [], packageContents: null }

  // sibling files in the mod's folder (packages, scripts, tray files, images, readmes)
  try {
    const names = await readdir(folder, { withFileTypes: true })
    for (const ent of names) {
      if (!ent.isFile()) continue
      const full = join(folder, ent.name)
      let size = 0
      try { size = (await stat(full)).size } catch { /* keep 0 */ }
      result.files.push({
        name: ent.name,
        size,
        ext: extname(ent.name).toLowerCase(),
        isSelf: full.toLowerCase() === filePath.toLowerCase()
      })
    }
    result.files.sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    result.error = `Could not read folder: ${err.message}`
  }

  // DBPF resource summary for .package files
  if (/\.package(\.disabled)?$/i.test(basename(filePath))) {
    try {
      const entries = await parseDbpfEntries(filePath)
      if (entries) {
        const counts = new Map()
        for (const e of entries) {
          const label = labelFor(e.type)
          counts.set(label, (counts.get(label) || 0) + 1)
        }
        result.packageContents = {
          total: entries.length,
          types: [...counts.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count)
        }
      }
    } catch {
      // leave packageContents null — the file list is still useful
    }
  }

  return result
}
