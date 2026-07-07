import { stat, copyFile } from 'fs/promises'
import { join, basename, extname, resolve, sep } from 'path'
import { extractModArchive, uniqueFilePath, safeFileName, TRAY_EXTS } from './archiveExtractor.js'

const MOD_EXTS = new Set(['.package', '.ts4script'])

function isInside(absFile, absFolder) {
  const rel = absFile.slice(absFolder.length)
  return absFile.toLowerCase().startsWith(absFolder.toLowerCase()) && (rel === '' || rel.startsWith(sep))
}

/**
 * Install files dropped onto the window: zips are extracted, loose mod files
 * copied into Mods, tray files routed to the Tray folder. Sources are NEVER
 * deleted (a dropped file from Downloads is not ours to remove).
 * @returns {Promise<{ ok: boolean, results: Array }>}
 */
export async function importFiles({ paths, modsFolder, trayFolder }) {
  const absFolder = resolve(modsFolder)
  const results = []

  for (const source of Array.isArray(paths) ? paths : []) {
    const name = basename(source)
    const ext = extname(source).toLowerCase()
    try {
      const info = await stat(source)
      if (info.isDirectory()) {
        results.push({ source, kind: 'rejected', ok: false, error: 'Drop files, not folders.' })
        continue
      }

      if (ext === '.zip') {
        const res = await extractModArchive(source, absFolder, name, { trayFolder })
        results.push(res.ok
          ? { source, kind: 'zip', ok: true, folder: res.folder, files: res.files, trayFiles: res.trayFiles }
          : { source, kind: 'zip', ok: false, error: res.error })
        continue
      }

      if (MOD_EXTS.has(ext)) {
        if (isInside(resolve(source), absFolder)) {
          results.push({ source, kind: 'package', ok: true, dest: source, note: 'Already in the Mods folder.' })
          continue
        }
        const dest = await uniqueFilePath(absFolder, safeFileName(name))
        await copyFile(source, dest)
        results.push({ source, kind: ext === '.ts4script' ? 'script' : 'package', ok: true, dest })
        continue
      }

      if (TRAY_EXTS.has(ext)) {
        const targetDir = trayFolder ?? absFolder
        const dest = await uniqueFilePath(targetDir, safeFileName(name))
        await copyFile(source, dest)
        results.push({ source, kind: 'tray', ok: true, dest, note: trayFolder ? 'Installed to Tray.' : 'No Tray folder found — placed in Mods.' })
        continue
      }

      results.push({ source, kind: 'rejected', ok: false, error: `Not a Sims 4 mod file (${ext || 'no extension'}).` })
    } catch (err) {
      results.push({ source, kind: 'rejected', ok: false, error: err.message })
    }
  }

  return { ok: results.some(r => r.ok), results }
}
