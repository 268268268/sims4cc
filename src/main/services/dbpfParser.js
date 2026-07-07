const STBL_MAGIC = Buffer.from('STBL')

/**
 * Legacy STBL parser (TS3-style layout: u32 count at 0x06, entries of
 * [8B key][2B byteLen][UTF-16LE bytes] from 0x0C). Kept as a fallback —
 * the primary TS4 v5 parser lives in packageMeta.js (parseStblV5).
 * Returns the first non-empty string, or null.
 */
export function parseStbl(buf) {
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
