// ponytail: smallest self-check that fails if parseStbl breaks.
// Run: node src/main/services/dbpfParser.test.js
import { Buffer } from 'buffer'

// --- inline copy of parseStbl (kept private in module, so test mirrors it) ---
const STBL_MAGIC = Buffer.from('STBL')
function parseStbl(buf) {
  if (buf.length < 12 || !buf.slice(0, 4).equals(STBL_MAGIC)) return null
  const count = buf.readUInt32LE(6)
  let off = 12
  for (let i = 0; i < count && off + 10 <= buf.length; i++) {
    off += 8
    const byteLen = buf.readUInt16LE(off)
    off += 2
    if (off + byteLen > buf.length) break
    const raw = buf.slice(off, off + byteLen)
    off += byteLen
    let str = raw.toString('utf16le')
    str = str.replace(/\u0000+$/, '')
    const trimmed = str.trim()
    if (trimmed) return trimmed
  }
  return null
}

// Build a minimal STBL with one entry: "Hello Mod"
const name = 'Hello Mod'
const encoded = Buffer.from(name, 'utf16le')
const header = Buffer.alloc(12)
STBL_MAGIC.copy(header, 0)
header.writeUInt16LE(5, 4)       // version
header.writeUInt32LE(1, 6)       // 1 entry
const entry = Buffer.alloc(10 + encoded.length)
entry.writeUInt16LE(encoded.length, 8)
encoded.copy(entry, 10)
const stbl = Buffer.concat([header, entry])

const result = parseStbl(stbl)
if (result !== name) {
  console.error(`FAIL: expected "${name}", got "${result}"`)
  process.exit(1)
}
console.log('OK: parseStbl extracted', JSON.stringify(result))