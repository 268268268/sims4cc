import { open } from 'fs/promises'

const DBPF_MAGIC = Buffer.from('DBPF')
const STBL_TYPE = 0x220554DA
const STBL_MAGIC = Buffer.from('STBL')
// English language id occupies the top 16 bits of the 64-bit instance.
// English = 0x00, so InstanceHigh < 0x10000.
const ENGLISH_INST_HIGH_MAX = 0x10000
// Safety cap: never read more than 1 MB of STBL data into memory.
const STBL_READ_CAP = 1 << 20

/**
 * Read N bytes from a file handle at a given offset.
 * Returns a Buffer of exactly `length` bytes (or fewer at EOF).
 */
async function readBytes(fh, length, position) {
  const buf = Buffer.alloc(length)
  const { bytesRead } = await fh.read(buf, 0, length, position)
  return buf.slice(0, bytesRead)
}

/**
 * Parse a single STBL resource buffer and return the first non-empty string.
 * STBL v5 layout:
 *   0x00  4B  "STBL"
 *   0x04  2B  version (uint16 LE)
 *   0x06  4B  entry count (uint32 LE)
 *   0x0A  2B  unused
 *   0x0C  ...  entries: [8B key u64][2B byteLen u16][byteLen bytes UTF-16LE]
 * Returns null if nothing usable found.
 */
function parseStbl(buf) {
  if (buf.length < 12 || !buf.slice(0, 4).equals(STBL_MAGIC)) return null
  const count = buf.readUInt32LE(6)
  let off = 12
  for (let i = 0; i < count && off + 10 <= buf.length; i++) {
    // skip 8-byte key
    off += 8
    const byteLen = buf.readUInt16LE(off)
    off += 2
    if (off + byteLen > buf.length) break
    const raw = buf.slice(off, off + byteLen)
    off += byteLen
    // STBL strings are UTF-16LE, often null-terminated (trailing 0x0000)
    let str = raw.toString('utf16le')
    // strip trailing nulls
    str = str.replace(/\u0000+$/, '')
    const trimmed = str.trim()
    if (trimmed) return trimmed
  }
  return null
}

/**
 * Best-effort DBPF parse: reads the index table, finds an English STBL,
 * and extracts the first human-readable string (the mod's display name).
 *
 * Non-blocking, streams only the small index + one STBL resource.
 * Never throws — always returns a safe result object.
 *
 * ponytail: reads index + first STBL only; ignores other resource types.
 * Ceiling: picks the first non-empty STBL string, which is the conventional
 * mod name but not guaranteed for every mod. Upgrade path: match specific
 * FNV string keys if a known name-key registry is needed.
 *
 * @param {string} filePath absolute path to .package file
 * @returns {{ ok: boolean, isDbpf: boolean, name?: string, error?: string }}
 */
export async function tryParseDbpf(filePath) {
  let fh = null
  try {
    fh = await open(filePath, 'r')

    // --- Header (96 bytes) ---
    const header = await readBytes(fh, 96, 0)
    if (header.length < 96 || !header.slice(0, 4).equals(DBPF_MAGIC)) {
      return { ok: true, isDbpf: false }
    }

    const entryCount = header.readUInt32LE(0x18)
    const indexOffset = Number(header.readBigUInt64LE(0x20))
    // indexSize at 0x28; flags at 0x1C (bit 0 → extended 32-byte entries)
    const flags = header.readUInt32LE(0x1C)
    const entrySize = flags & 0x01 ? 32 : 20

    if (entryCount === 0 || entryCount > 5_000_000) {
      // ponytail: sanity cap to avoid insane allocations on corrupt headers
      return { ok: true, isDbpf: true, name: null }
    }

    // --- Index table ---
    const indexLen = entryCount * entrySize
    const index = await readBytes(fh, indexLen, indexOffset)
    if (index.length < indexLen) {
      return { ok: true, isDbpf: true, name: null }
    }

    // Collect STBL entries, preferring English (InstanceHigh < 0x10000).
    let stblEntry = null
    let stblFallback = null
    for (let i = 0; i < entryCount; i++) {
      const base = i * entrySize
      const type = index.readUInt32LE(base)
      if (type !== STBL_TYPE) continue
      const instHigh = index.readUInt32LE(base + 8)
      const offset = index.readUInt32LE(base + 12)
      const size = index.readUInt32LE(base + 16)
      if (offset === 0 || size === 0) continue
      const candidate = { offset, size }
      if (instHigh < ENGLISH_INST_HIGH_MAX) {
        stblEntry = candidate
        break // first English STBL is good enough
      }
      stblFallback ??= candidate
    }
    stblEntry ??= stblFallback
    if (!stblEntry) return { ok: true, isDbpf: true, name: null }

    // --- STBL resource ---
    const readLen = Math.min(stblEntry.size, STBL_READ_CAP)
    const stblBuf = await readBytes(fh, readLen, stblEntry.offset)
    const name = parseStbl(stblBuf)

    return { ok: true, isDbpf: true, name: name ?? null }
  } catch (err) {
    return { ok: false, isDbpf: false, error: err.message }
  } finally {
    if (fh) await fh.close().catch(() => {})
  }
}