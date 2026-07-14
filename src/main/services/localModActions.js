import { rename, access } from 'fs/promises'
import { resolve, sep, basename } from 'path'
import { buildLocalModDto } from './localModScanner.js'

/**
 * Toggle a local mod enabled/disabled by renaming its file extension.
 *
 * Enabled:  CoolHair.package           / CoolScript.ts4script
 * Disabled: CoolHair.package.disabled  / CoolScript.ts4script.disabled
 *
 * @param {{ filePath: string, enabled: boolean, modsFolder: string }} opts
 * @returns {{ ok: true, mod, oldPath, newPath } | { ok: false, error: { message } }}
 */
export async function toggleLocalModEnabled({ filePath, enabled, modsFolder }) {
  // --- input validation ---
  if (!filePath || typeof filePath !== 'string') return err('filePath is required')
  if (typeof enabled !== 'boolean') return err('enabled must be a boolean')
  if (!modsFolder || typeof modsFolder !== 'string') return err('modsFolder is required')

  // --- security: filePath must be strictly INSIDE modsFolder ---
  const absFile = resolve(filePath)
  const absFolder = resolve(modsFolder)
  // must actually start with the folder AND have a separator after it — a bare
  // slice() check alone accepts `<folder>z\x.package` and short outside paths
  const rel = absFile.slice(absFolder.length)
  if (!absFile.toLowerCase().startsWith(absFolder.toLowerCase()) || !rel.startsWith(sep)) {
    return err('filePath is outside the configured Mods folder')
  }

  // --- file must exist ---
  try { await access(absFile) } catch { return err('File not found: ' + absFile) }

  // --- must be a known mod file ---
  const name = basename(absFile)
  const isMod = name.endsWith('.package') || name.endsWith('.ts4script') ||
    name.endsWith('.package.disabled') || name.endsWith('.ts4script.disabled')
  if (!isMod) return err('Not a recognized mod file: ' + name)

  // --- determine current state from filename ---
  const isDisabled = name.endsWith('.disabled')
  const isEnabled = !isDisabled

  // --- no-op: already in requested state ---
  if (enabled && isEnabled) {
    const mod = await buildLocalModDto(absFile, absFolder)
    return { ok: true, mod, oldPath: absFile, newPath: absFile }
  }
  if (!enabled && isDisabled) {
    const mod = await buildLocalModDto(absFile, absFolder)
    return { ok: true, mod, oldPath: absFile, newPath: absFile }
  }

  // --- calculate target path ---
  const newPath = enabled
    ? absFile.slice(0, -'.disabled'.length)   // strip .disabled
    : absFile + '.disabled'                    // append .disabled

  // --- conflict check: do not overwrite existing file ---
  try {
    await access(newPath)
    // if we get here, target exists — refuse
    return err('Target file already exists: ' + newPath)
  } catch {
    // ENOENT is expected — safe to proceed
  }

  // --- rename ---
  try {
    await rename(absFile, newPath)
  } catch (e) {
    return err('Rename failed: ' + e.message)
  }

  // --- build updated DTO for the new path ---
  const mod = await buildLocalModDto(newPath, absFolder)
  return { ok: true, mod, oldPath: absFile, newPath }
}

function err(message) {
  return { ok: false, error: { message } }
}
