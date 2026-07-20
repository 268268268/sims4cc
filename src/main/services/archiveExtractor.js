import AdmZip from 'adm-zip'
import { join, basename, extname, dirname } from 'path'
import { mkdir, writeFile, readdir, unlink, rmdir, access, mkdtemp, rm, rename, copyFile } from 'fs/promises'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** Archive extensions extractModArchive can unpack. */
export const ARCHIVE_RE = /\.(zip|rar|7z)$/i

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

// Flatten: target name is the entry's sanitized basename; on collision inside
// the archive, prefix with its parent dir so both variants survive.
function makeFlattener() {
  const used = new Set()
  return (entryName) => {
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
}

/**
 * Extract a downloaded mod archive into a fresh `modsFolder/<folderName>/`.
 *
 * Extracts EVERY non-junk entry unconditionally (Tray files, configs, readmes
 * included — deleting the zip afterwards must never lose content; only a truly
 * empty archive is refused), flattened to a single folder: .ts4script mods must sit
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

  // .rar/.7z can't be read in-memory by adm-zip — unpack to a temp dir first,
  // then install through the same flatten/tray logic.
  const ext = extname(zipPath).toLowerCase()
  if (ext === '.rar' || ext === '.7z') return extractViaTemp(zipPath, ext, modsFolder, nameHint, trayFolder)

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

  // Extract every archive unconditionally — even ones without recognized mod files
  // (folder-only layouts, unusual extensions). Only a truly empty archive is refused,
  // so we never delete a zip whose contents we failed to read.
  if (!entries.length) {
    return { ok: false, error: 'Archive is empty — nothing to extract.' }
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

  const targetNameFor = makeFlattener()

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

/** All files under dir, as paths relative to dir. */
async function listFilesRecursive(dir, prefix = '') {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? join(prefix, e.name) : e.name
    if (e.isDirectory()) out.push(...(await listFilesRecursive(join(dir, e.name), rel)))
    else out.push(rel)
  }
  return out
}

/** rename() with a copy fallback — temp dir and Mods may sit on different drives. */
async function moveFile(from, to) {
  try {
    await rename(from, to)
  } catch {
    await copyFile(from, to)
    await unlink(from).catch(() => {})
  }
}

/**
 * .rar/.7z path: unpack into a temp dir (unrar-wasm / bundled 7za), then install
 * through the same flatten + tray-routing rules as the zip path.
 */
async function extractViaTemp(archivePath, ext, modsFolder, nameHint, trayFolder) {
  let tmp
  try {
    tmp = await mkdtemp(join(tmpdir(), 's4cc-'))
  } catch (err) {
    return { ok: false, error: `Could not create a temp folder: ${err.message}` }
  }
  const files = []
  const trayFiles = []
  let folder = null
  try {
    if (ext === '.rar') {
      const { createExtractorFromFile } = await import('node-unrar-js')
      const extractor = await createExtractorFromFile({ filepath: archivePath, targetPath: tmp })
      void [...extractor.extract().files] // the generator is lazy — consuming it writes the files
    } else {
      const { path7za } = await import('7zip-bin')
      const bin = path7za.replace('app.asar', 'app.asar.unpacked') // binary can't run from inside the asar
      await execFileAsync(bin, ['x', archivePath, `-o${tmp}`, '-y'], { windowsHide: true, timeout: 120000 })
    }

    const all = (await listFilesRecursive(tmp)).filter(r => !JUNK_RE.test(r))
    if (!all.length) return { ok: false, error: 'Archive is empty — nothing to extract.' }
    const trayEntries = trayFolder ? all.filter(r => TRAY_EXTS.has(extname(r).toLowerCase())) : []
    const modEntries = trayFolder ? all.filter(r => !TRAY_EXTS.has(extname(r).toLowerCase())) : all

    folder = await pickTargetFolder(modsFolder, safeFolderName(nameHint || basename(archivePath)))
    await mkdir(folder, { recursive: true })
    const targetNameFor = makeFlattener()
    for (const rel of modEntries) {
      const target = join(folder, targetNameFor(rel))
      await moveFile(join(tmp, rel), target)
      files.push(target)
    }
    for (const rel of trayEntries) {
      const target = await uniqueFilePath(trayFolder, safeFileName(basename(rel)))
      await moveFile(join(tmp, rel), target)
      trayFiles.push(target)
    }
    console.log(`[archiveExtractor] Extracted ${files.length} file(s) from ${basename(archivePath)} → ${folder}${trayFiles.length ? ` + ${trayFiles.length} tray file(s)` : ''}`)
    return { ok: true, folder, files, trayFiles }
  } catch (err) {
    // never leave a half-installed mod behind
    for (const f of [...files, ...trayFiles]) await unlink(f).catch(() => {})
    if (folder) await rmdir(folder).catch(() => {})
    return { ok: false, error: `Could not unpack ${ext} archive: ${err.message}` }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}
