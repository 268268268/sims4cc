import { open, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import { parseDbpfEntries, decompress } from './dbpfThumbnail.js'
import { parseStbl as parseStblLegacy } from './dbpfParser.js'
import { KIND_OF_TYPE, STBL_TYPE } from './dbpfTypes.js'

/**
 * TS4 STBL v5 layout: "STBL" magic, u16 version(5), u8 compressed,
 * u64 numEntries, 2B reserved, u32 stringLength, then per entry:
 * u32 keyHash, u8 flags, u16 byteLen, UTF-8 bytes.
 * Returns the first non-empty string, or null.
 */
export function parseStblV5(buf) {
  if (buf.length < 21 || buf.slice(0, 4).toString('latin1') !== 'STBL') return null
  const version = buf.readUInt16LE(4)
  if (version !== 5) return null
  let count
  try {
    count = Number(buf.readBigUInt64LE(7))
  } catch {
    return null
  }
  if (!count || count > 1_000_000) return null
  let off = 21
  for (let i = 0; i < count && off + 7 <= buf.length; i++) {
    off += 4 // keyHash
    off += 1 // flags
    const len = buf.readUInt16LE(off); off += 2
    if (off + len > buf.length) break
    const str = buf.slice(off, off + len).toString('utf8')
    off += len
    const trimmed = str.trim()
    if (trimmed) return trimmed
  }
  return null
}

/** Try the real TS4 v5 layout first, then the legacy UTF-16 layout. */
function parseStblAny(buf) {
  return parseStblV5(buf) ?? parseStblLegacy(buf)
}

// One JSON cache file: { [sha1(filePath|mtimeMs)]: { name, kinds } } — mirrors
// the thumb-cache's mtime keying, so metadata is parsed once per file version.
// Electron is imported lazily so the pure parsers stay testable under plain node.
let CACHE_PATH = null
async function cachePath() {
  if (!CACHE_PATH) {
    const { app } = await import('electron')
    CACHE_PATH = join(app.getPath('userData'), 'pkg-meta-cache.json')
  }
  return CACHE_PATH
}

const STBL_READ_CAP = 1 << 20 // never inflate more than 1 MB looking for a name
const MAX_NAME_LEN = 80

export async function loadMetaCache() {
  try {
    return JSON.parse(await readFile(await cachePath(), 'utf-8'))
  } catch {
    return {}
  }
}

export async function saveMetaCache(cache) {
  try {
    await writeFile(await cachePath(), JSON.stringify(cache), 'utf-8')
  } catch {
    // best-effort — worst case we re-parse next scan
  }
}

function metaKey(filePath, mtimeMs) {
  return createHash('sha1').update(`${filePath}|${mtimeMs}`).digest('hex').slice(0, 16)
}

async function readAt(fh, len, pos) {
  const buf = Buffer.alloc(len)
  const { bytesRead } = await fh.read(buf, 0, len, pos)
  return buf.slice(0, bytesRead)
}

/** Extract the display name from the first usable STBL (English preferred). */
async function extractName(filePath, entries) {
  const stbls = entries.filter(e => e.type === STBL_TYPE && e.size > 0 && e.sizeDecompressed <= STBL_READ_CAP)
  if (!stbls.length) return null
  // English STBLs carry language 0x00 in the top byte of the 64-bit instance
  const ordered = [
    ...stbls.filter(e => ((e.instanceHigh >>> 24) & 0xff) === 0x00),
    ...stbls.filter(e => ((e.instanceHigh >>> 24) & 0xff) !== 0x00)
  ]
  let fh
  try {
    fh = await open(filePath, 'r')
    for (const e of ordered) {
      try {
        const data = decompress(await readAt(fh, e.size, e.position), e.compression)
        if (!data) continue // RefPack etc. — try the next candidate
        const name = parseStblAny(data)
        if (name) {
          const trimmed = name.trim()
          if (trimmed && trimmed.length <= MAX_NAME_LEN * 3) return trimmed.slice(0, MAX_NAME_LEN)
        }
      } catch {
        // corrupt candidate — try the next one
      }
    }
    return null
  } catch {
    return null
  } finally {
    if (fh) await fh.close().catch(() => {})
  }
}

/** Coarse content kinds for card badges, e.g. ['CAS'] or ['Object','Tuning']. */
function extractKinds(entries) {
  const kinds = new Set()
  for (const e of entries) {
    const kind = KIND_OF_TYPE[e.type >>> 0]
    if (kind) kinds.add(kind)
    if (kinds.size >= 3) break
  }
  return [...kinds]
}

/**
 * Name + kinds for a .package, cached by (path, mtime). Never throws.
 * @returns {Promise<{ name: string|null, kinds: string[], parsed: boolean }>}
 */
export async function getPackageMeta(filePath, mtimeMs, cache) {
  const key = metaKey(filePath, mtimeMs)
  if (cache && cache[key]) return { ...cache[key], parsed: true }

  const entries = await parseDbpfEntries(filePath)
  if (!entries) {
    const miss = { name: null, kinds: [] }
    if (cache) cache[key] = miss
    return { ...miss, parsed: false }
  }
  const meta = {
    name: await extractName(filePath, entries),
    kinds: extractKinds(entries)
  }
  if (cache) cache[key] = meta
  return { ...meta, parsed: true }
}
