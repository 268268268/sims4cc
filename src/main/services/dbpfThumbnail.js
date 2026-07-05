import { app } from 'electron'
import { open, mkdir, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import zlib from 'zlib'

// Sims 4 DBPF 2.1 resource type for the CAS-part / catalog JPEG thumbnail.
const THUMB_TYPE = 0x3c1af1f2
const DBPF_MAGIC = Buffer.from('DBPF')
// zlib is the compression TS4 CC overwhelmingly uses; 0 = stored. RefPack (0xFFFF)
// is not handled here — such resources are skipped (thumbnail simply not extracted).
const COMP_NONE = 0x0000
const COMP_ZLIB = 0x5a42
const MAX_RESOURCE_BYTES = 4 * 1024 * 1024 // never inflate anything bigger than this

// Lazily resolved so importing this module never touches Electron internals at load.
let CACHE_DIR = null
function cacheDir() {
  if (!CACHE_DIR) CACHE_DIR = join(app.getPath('userData'), 'thumb-cache')
  return CACHE_DIR
}
export function getThumbCacheDir() {
  return cacheDir()
}

function imgExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  return null
}

async function readAt(fh, len, pos) {
  const buf = Buffer.alloc(len)
  const { bytesRead } = await fh.read(buf, 0, len, pos)
  return buf.slice(0, bytesRead)
}

function decompress(buf, compression) {
  if (compression === COMP_NONE) return buf
  if (compression === COMP_ZLIB) return zlib.inflateSync(buf)
  return null // unsupported (e.g. RefPack)
}

/**
 * Parse a DBPF 2.1 index into a flat list of resource entries. Never throws.
 * @returns {Promise<Array<{ type, position, size, sizeDecompressed, compression }>|null>}
 */
export async function parseDbpfEntries(filePath) {
  let fh
  try {
    fh = await open(filePath, 'r')
    const header = await readAt(fh, 96, 0)
    if (header.length < 96 || !header.slice(0, 4).equals(DBPF_MAGIC)) return null

    const count = header.readUInt32LE(0x24)
    const indexSize = header.readUInt32LE(0x2c)
    const indexPos = Number(header.readBigUInt64LE(0x40))
    // sanity guards against corrupt headers driving huge allocations
    if (count < 1 || count > 500_000 || indexPos < 96 || indexSize < 4 || indexSize > 64 * 1024 * 1024) {
      return null
    }

    const idx = await readAt(fh, indexSize, indexPos)
    if (idx.length < indexSize) return null

    let o = 0
    const flags = idx.readUInt32LE(o); o += 4
    let cType = 0
    if (flags & 0x1) { cType = idx.readUInt32LE(o); o += 4 }
    if (flags & 0x2) { o += 4 } // constant group — unused
    if (flags & 0x4) { o += 4 } // constant instance high — unused

    const entries = []
    for (let i = 0; i < count; i++) {
      let type = cType
      if (!(flags & 0x1)) { type = idx.readUInt32LE(o); o += 4 }
      if (!(flags & 0x2)) { o += 4 } // group — unused
      if (!(flags & 0x4)) { o += 4 } // instance high — unused
      o += 4 // instance low
      const position = idx.readUInt32LE(o); o += 4
      const sizeField = idx.readUInt32LE(o); o += 4
      const size = sizeField & 0x7fffffff
      const hasExt = (sizeField & 0x80000000) !== 0
      const sizeDecompressed = idx.readUInt32LE(o); o += 4
      let compression = COMP_NONE
      if (hasExt) { compression = idx.readUInt16LE(o); o += 4 } // uint16 compression + uint16 committed
      entries.push({ type, position, size, sizeDecompressed, compression })
    }
    return entries
  } catch {
    return null
  } finally {
    if (fh) await fh.close().catch(() => {})
  }
}

/**
 * Parse the DBPF index and return the embedded thumbnail image bytes, or null.
 * Never throws.
 * @returns {Promise<{ buffer: Buffer, ext: 'jpg'|'png' } | null>}
 */
async function extractThumbnailBuffer(filePath) {
  const entries = await parseDbpfEntries(filePath)
  if (!entries) return null
  let fh
  try {
    fh = await open(filePath, 'r')
    // Prefer the dedicated thumbnail resource; fall back to any small JPEG/PNG resource.
    const ordered = [
      ...entries.filter(e => e.type === THUMB_TYPE),
      ...entries.filter(e => e.type !== THUMB_TYPE)
    ]
    let best = null
    for (const e of ordered) {
      if (e.sizeDecompressed > MAX_RESOURCE_BYTES || e.size <= 0) continue
      if (e.compression !== COMP_NONE && e.compression !== COMP_ZLIB) continue
      let data
      try {
        data = decompress(await readAt(fh, e.size, e.position), e.compression)
      } catch {
        continue
      }
      const ext = data && imgExt(data)
      if (!ext) continue
      // thumbnail-type match wins immediately; otherwise keep the largest image
      if (e.type === THUMB_TYPE) return { buffer: data, ext }
      if (!best || data.length > best.buffer.length) best = { buffer: data, ext }
    }
    return best
  } catch {
    return null
  } finally {
    if (fh) await fh.close().catch(() => {})
  }
}

/**
 * Return a cached thumbnail image path for a .package, extracting + caching on
 * first use. Uses a negative marker so packages without a thumbnail are not
 * re-parsed on every scan. Never throws.
 * @param {string} filePath  absolute path to the .package
 * @param {number} mtimeMs   file mtime, so the cache invalidates when it changes
 * @returns {Promise<string|null>} absolute path to a cached image, or null
 */
export async function getCachedThumbnail(filePath, mtimeMs) {
  try {
    const dir = cacheDir()
    const key = createHash('sha1').update(`${filePath}|${mtimeMs}`).digest('hex').slice(0, 16)
    const jpg = join(dir, `${key}.jpg`)
    const png = join(dir, `${key}.png`)
    const none = join(dir, `${key}.none`)
    // fast path: already resolved (positive or negative) on a previous scan
    if (await exists(jpg)) return jpg
    if (await exists(png)) return png
    if (await exists(none)) return null

    const result = await extractThumbnailBuffer(filePath)
    await mkdir(dir, { recursive: true })
    if (!result) {
      await writeFile(none, '').catch(() => {})
      return null
    }
    const out = join(dir, `${key}.${result.ext}`)
    await writeFile(out, result.buffer)
    return out
  } catch {
    return null
  }
}

async function exists(p) {
  try { await access(p); return true } catch { return false }
}
