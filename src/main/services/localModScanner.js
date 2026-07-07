import { readdir, stat, access } from 'fs/promises'
import { join, relative, dirname, basename, extname, sep } from 'path'
import { createHash } from 'crypto'
import { getCachedThumbnail } from './dbpfThumbnail.js'
import { getPackageMeta, loadMetaCache, saveMetaCache } from './packageMeta.js'

const MOD_EXTENSIONS = new Set(['.package', '.ts4script'])
// sidecar image suffixes to probe, in priority order
const SIDECAR_SUFFIXES = [
  '.png', '.jpg', '.jpeg', '.webp',
  '.preview.png', '.preview.jpg',
  '.thumbnail.png', '.thumbnail.jpg'
]
const FALLBACK_NAMES = ['preview.png', 'preview.jpg', 'thumbnail.png', 'thumbnail.jpg', 'cover.png', 'cover.jpg']

/** Deterministic id from relative path */
function makeId(relativePath) {
  return createHash('sha1').update(relativePath).digest('hex').slice(0, 16)
}

/** Strip .disabled, then .package/.ts4script; replace _/- with spaces; trim */
function deriveName(fileName) {
  let n = fileName
  if (n.endsWith('.disabled')) n = n.slice(0, -9)
  if (n.endsWith('.package')) n = n.slice(0, -8)
  else if (n.endsWith('.ts4script')) n = n.slice(0, -10)
  n = n.replace(/[_-]+/g, ' ').trim()
  return n || fileName
}

/** First folder segment under modsFolder → author, or null if file is at root */
function deriveAuthor(relativePath) {
  const parts = relativePath.split(sep)
  return parts.length > 1 ? parts[0] : null
}

/** Resolve mod type from the real extension (after stripping .disabled) */
function resolveType(fileName) {
  const base = fileName.endsWith('.disabled') ? fileName.slice(0, -9) : fileName
  if (base.endsWith('.package')) return 'package'
  if (base.endsWith('.ts4script')) return 'ts4script'
  return 'unknown'
}

/** Check if a path exists (fs.access is the cheapest way) */
async function exists(p) {
  try { await access(p); return true } catch { return false }
}

/** Find a sidecar thumbnail near the mod file */
async function detectThumbnail(filePath) {
  const dir = dirname(filePath)
  const base = basename(filePath)
  // strip .disabled then mod extension to get bare stem
  let stem = base
  if (stem.endsWith('.disabled')) stem = stem.slice(0, -9)
  if (stem.endsWith('.package')) stem = stem.slice(0, -8)
  else if (stem.endsWith('.ts4script')) stem = stem.slice(0, -10)

  // 1. stem-based sidecars
  for (const suffix of SIDECAR_SUFFIXES) {
    const candidate = join(dir, stem + suffix)
    if (await exists(candidate)) return { source: 'sidecar', path: candidate }
  }
  // 2. generic fallback names in same dir
  for (const name of FALLBACK_NAMES) {
    const candidate = join(dir, name)
    if (await exists(candidate)) return { source: 'sidecar', path: candidate }
  }
  return { source: 'fallback', path: null }
}

/** Walk directory recursively, collecting all file paths */
async function walkDir(dir, results = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results // unreadable dir — skip silently
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDir(full, results)
    } else if (entry.isFile()) {
      results.push(full)
    }
  }
  return results
}

/** Determine if a file is a known mod file we should process */
function isModFile(fileName) {
  if (MOD_EXTENSIONS.has(extname(fileName))) return true
  // .package.disabled / .ts4script.disabled
  if (fileName.endsWith('.package.disabled') || fileName.endsWith('.ts4script.disabled')) return true
  return false
}

/** Zip archives are shown as extractable items — the game itself ignores them */
function isArchiveFile(fileName) {
  return extname(fileName).toLowerCase() === '.zip'
}

/** Minimal DTO for an archive — no DBPF parse, no enable/disable semantics */
async function buildArchiveDto(filePath, modsFolder) {
  const fileName = basename(filePath)
  const relPath = relative(modsFolder, filePath)
  let size = 0
  let modifiedAt = new Date().toISOString()
  try {
    const info = await stat(filePath)
    size = info.size
    modifiedAt = info.mtime.toISOString()
  } catch {
    // keep zeros — the card still renders
  }
  return {
    id: makeId(relPath),
    name: deriveName(fileName.replace(/\.zip$/i, '')),
    author: deriveAuthor(relPath),
    fileName,
    filePath,
    relativePath: relPath,
    folderPath: dirname(filePath),
    type: 'archive',
    enabled: false,
    size,
    modifiedAt,
    thumbnail: { source: 'fallback', path: null },
    parseStatus: 'unsupported'
  }
}

/**
 * Build a LocalMod DTO for a single file.
 * Never throws — errors are captured in the DTO.
 * Exported so toggle action can reuse it after rename.
 */
export async function buildLocalModDto(filePath, modsFolder, metaCache = null) {
  const fileName = basename(filePath)
  const relPath = relative(modsFolder, filePath)
  const id = makeId(relPath)
  const enabled = !fileName.endsWith('.disabled')
  const type = resolveType(fileName)

  let size = 0
  let modifiedAt = new Date().toISOString()
  let dateAdded = null
  let mtimeMs = 0
  let parseStatus = 'fallback'
  let error

  try {
    const info = await stat(filePath)
    size = info.size
    modifiedAt = info.mtime.toISOString()
    dateAdded = info.birthtime?.toISOString() ?? null
    mtimeMs = info.mtimeMs
  } catch (err) {
    error = `stat failed: ${err.message}`
    parseStatus = 'error'
  }

  // DBPF parse — real display name from STBL + coarse content kinds
  let realName = null
  let kinds = []
  if (type === 'package' && !error) {
    const meta = await getPackageMeta(filePath, mtimeMs, metaCache)
    parseStatus = meta.parsed ? 'parsed' : 'unsupported'
    realName = meta.name
    kinds = meta.kinds
  }

  let thumbnail = await detectThumbnail(filePath)
  // No sidecar image? Pull the embedded CAS/catalog thumbnail out of the .package.
  if (thumbnail.source === 'fallback' && type === 'package' && !error) {
    const cached = await getCachedThumbnail(filePath, mtimeMs)
    if (cached) thumbnail = { source: 'dbpf', path: cached }
  }

  return {
    id,
    name: realName || deriveName(fileName),
    author: deriveAuthor(relPath),
    fileName,
    filePath,
    relativePath: relPath,
    folderPath: dirname(filePath),
    type,
    enabled,
    size,
    modifiedAt,
    dateAdded,
    kinds,
    thumbnail,
    parseStatus,
    ...(error ? { error } : {})
  }
}

// ponytail: in-memory cache so renderer can restore mods after unmount; lost on app restart, which is fine
let cachedMods = null

/**
 * Scan modsFolder and return all LocalMod DTOs.
 * @param {string} modsFolder absolute path
 * @returns {{ mods: object[], errors: object[] }}
 */
export async function scanMods(modsFolder) {
  const t0 = Date.now()
  const allFiles = await walkDir(modsFolder)
  const modFiles = allFiles.filter(f => isModFile(basename(f)))
  const archiveFiles = allFiles.filter(f => isArchiveFile(basename(f)))

  const mods = []
  const errors = []
  const metaCache = await loadMetaCache()

  // ponytail: sequential to avoid hammering disk with hundreds of parallel opens
  for (const filePath of modFiles) {
    try {
      const mod = await buildLocalModDto(filePath, modsFolder, metaCache)
      mods.push(mod)
    } catch (err) {
      errors.push({ file: filePath, message: err.message })
    }
  }
  for (const filePath of archiveFiles) {
    try {
      mods.push(await buildArchiveDto(filePath, modsFolder))
    } catch (err) {
      errors.push({ file: filePath, message: err.message })
    }
  }
  await saveMetaCache(metaCache)

  // Per-folder rollups so cards can show "part of a multi-file mod" info.
  // Sums scanned items only (packages/scripts/archives) — cheap, no extra I/O.
  const folderSize = new Map()
  const folderFiles = new Map()
  for (const m of mods) {
    folderSize.set(m.folderPath, (folderSize.get(m.folderPath) || 0) + (m.size || 0))
    folderFiles.set(m.folderPath, (folderFiles.get(m.folderPath) || 0) + 1)
  }
  for (const m of mods) {
    m.folderSize = folderSize.get(m.folderPath) || m.size
    m.folderFiles = folderFiles.get(m.folderPath) || 1
  }

  cachedMods = mods
  return { mods, errors, durationMs: Date.now() - t0 }
}

/** Return cached mods (or [] if none scanned yet). */
export function getCachedLocalMods() {
  return cachedMods ?? []
}

/** Drop the cache — next Local Mods mount will re-scan (e.g. after a download). */
export function clearCachedLocalMods() {
  cachedMods = null
}

/** Update a single mod in the cache after a toggle (match by old filePath). */
export function updateCachedMod(oldPath, mod) {
  if (!cachedMods) return
  const idx = cachedMods.findIndex(m => m.filePath === oldPath)
  if (idx !== -1) cachedMods[idx] = mod
}
