import AdmZip from 'adm-zip'
import { join, basename, extname, dirname } from 'path'
import { mkdir, writeFile, readdir, unlink, rmdir, access } from 'fs/promises'

// files the game actually loads — an archive must contain at least one to count as a mod
const MOD_EXTS = new Set(['.package', '.ts4script'])
// lot/household files that belong in <Sims 4>/Tray, not in Mods
export const TRAY_EXTS = new Set(['.trayitem', '.householdbinary', '.blueprint', '.room', '.bpi', '.hhi', '.sgi'])
const JUNK_RE = /(^|[\\/])(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)/i
// Windows reserved device names — cannot be used as a file stem
const RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function stripForbidden(s) {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '') // Windows: no trailing dots/spaces
}

/** Strip the archive extension and every character Windows forbids in folder names. */
export function safeFolderName(name) {
  const clean = stripForbidden(name.replace(/\.(zip|rar|7z)$/i, ''))
  return clean.slice(0, 80) || 'mod'
}

/** Sanitize a single file basename, preserving the extension; guard reserved device stems. */
export function safeFileName(name) {
  const clean = stripForbidden(name)
  if (!clean) return 'file'
  const dot = clean.lastIndexOf('.')
  const stem = dot > 0 ? clean.slice(0, dot) : clean
  return RESERVED_RE.test(stem) ? `_${clean}` : clean
}

/** First non-existing file path in dir: "Name.ext", "Name (2).ext", … */
export async function uniqueFilePath(dir, fileName) {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  for (let i = 1; ; i++) {
    const candidate = join(dir, i === 1 ? fileName : `${stem} (${i})${ext}`)
    try {
      await access(candidate) // exists (file or dir) — try the next suffix
    } catch {
      return candidate
    }
  }
}

/** First folder path under modsFolder that does not already hold files: "Name", "Name (2)", … */
async function pickTargetFolder(modsFolder, baseName) {
  for (let i = 1; ; i++) {
    const name = i === 1 ? baseName : `${baseName} (${i})`
    const p = join(modsFolder, name)
    try {
      const entries = await readdir(p)
      if (entries.length === 0) return p // exists but empty — safe to use
    } catch {
      return p // does not exist yet
    }
  }
}

/**
 * Extract a downloaded mod archive into a fresh `modsFolder/<folderName>/`.
 *
 * Refuses archives with no .package/.ts4script. Extracts EVERY non-junk entry
 * (Tray files, configs, readmes included — deleting the zip afterwards must
 * never lose content), flattened to a single folder: .ts4script mods must sit
 * at most one level below Mods, so deep archive layouts would break in game.
 * The target folder is always new or empty ("Name (2)" on collision), so an
 * extraction can never overwrite another mod's files. On any error the files
 * written so far are removed again.
 *
 * @param {string} zipPath        absolute path to the .zip
 * @param {string} modsFolder     absolute path to the Mods folder
 * @param {string} [nameHint]     preferred folder name (falls back to zip name)
 * @param {{ trayFolder?: string|null }} [opts]  existing Tray dir — lot/household
 *        files (.trayitem etc.) are routed there instead of the mod folder
 * @returns {Promise<{ ok: true, folder: string, files: string[], trayFiles: string[] } | { ok: false, error: string }>}
 */
export async function extractModArchive(zipPath, modsFolder, nameHint, opts = {}) {
  const trayFolder = opts.trayFolder ?? null
  let zip
  try {
    zip = new AdmZip(zipPath)
  } catch (err) {
    return { ok: false, error: `Not a readable zip archive: ${err.message}` }
  }

  let entries
  try {
    entries = zip.getEntries().filter(e => !e.isDirectory && !JUNK_RE.test(e.entryName))
  } catch (err) {
    return { ok: false, error: `Corrupt zip index: ${err.message}` }
  }

  const hasModFile = entries.some(e => MOD_EXTS.has(extname(e.entryName).toLowerCase()))
  if (!hasModFile) {
    return { ok: false, error: 'No Sims 4 mod files (.package / .ts4script) found in the archive.' }
  }

  const trayEntries = trayFolder
    ? entries.filter(e => TRAY_EXTS.has(extname(e.entryName).toLowerCase()))
    : []
  const modEntries = trayFolder
    ? entries.filter(e => !TRAY_EXTS.has(extname(e.entryName).toLowerCase()))
    : entries

  const folder = await pickTargetFolder(modsFolder, safeFolderName(nameHint || basename(zipPath)))
  try {
    await mkdir(folder, { recursive: true })
  } catch (err) {
    return { ok: false, error: `Could not create mod folder: ${err.message}` }
  }

  // Flatten: target name is the entry's sanitized basename; on collision inside
  // the archive, prefix with its parent dir so both variants survive.
  const used = new Set()
  const targetNameFor = (entryName) => {
    const base = safeFileName(basename(entryName))
    if (!used.has(base.toLowerCase())) {
      used.add(base.toLowerCase())
      return base
    }
    const parent = basename(dirname(entryName))
    const prefixed = parent && parent !== '.' ? `${safeFolderName(parent)}_${base}` : base
    let candidate = prefixed
    let i = 2
    while (used.has(candidate.toLowerCase())) candidate = `${i++}_${prefixed}`
    used.add(candidate.toLowerCase())
    return candidate
  }

  const files = []
  const trayFiles = []
  try {
    for (const entry of modEntries) {
      const target = join(folder, targetNameFor(entry.entryName))
      const data = entry.getData() // throws on bad CRC / unsupported compression
      await writeFile(target, data)
      files.push(target)
    }
    // Tray files go into the game's Tray folder — never overwrite the user's
    // saves there, suffix "(2)" instead.
    for (const entry of trayEntries) {
      const target = await uniqueFilePath(trayFolder, safeFileName(basename(entry.entryName)))
      const data = entry.getData()
      await writeFile(target, data)
      trayFiles.push(target)
    }
  } catch (err) {
    // never leave a half-installed mod behind — the game would load the fragments
    for (const f of [...files, ...trayFiles]) await unlink(f).catch(() => {})
    await rmdir(folder).catch(() => {})
    return { ok: false, error: `Extraction failed: ${err.message}` }
  }

  console.log(`[archiveExtractor] Extracted ${files.length} file(s) from ${basename(zipPath)} → ${folder}${trayFiles.length ? ` + ${trayFiles.length} tray file(s)` : ''}`)
  return { ok: true, folder, files, trayFiles }
}
