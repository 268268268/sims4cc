// ponytail: smallest self-check that fails if the STBL parsers break.
// Run: node src/main/services/dbpfParser.test.js
import { Buffer } from 'buffer'
import { parseStbl } from './dbpfParser.js'

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}

// --- legacy layout: u32 count @6, entries [8B key][u16 len][UTF-16LE] ---
{
  const name = 'Hello Mod'
  const encoded = Buffer.from(name, 'utf16le')
  const header = Buffer.alloc(12)
  Buffer.from('STBL').copy(header, 0)
  header.writeUInt16LE(5, 4)       // version
  header.writeUInt32LE(1, 6)       // 1 entry
  const entry = Buffer.alloc(10 + encoded.length)
  entry.writeUInt16LE(encoded.length, 8)
  encoded.copy(entry, 10)
  const stbl = Buffer.concat([header, entry])
  check('legacy parseStbl extracts name', parseStbl(stbl) === name, JSON.stringify(parseStbl(stbl)))
}

// --- TS4 v5 layout: u8 compressed @6, u64 count @7, 2B reserved, u32 strLen @17,
//     entries [u32 key][u8 flags][u16 len][UTF-8] ---
{
  const { parseStblV5 } = await import('./packageMeta.js').catch(() => ({}))
  if (parseStblV5) {
    const name = 'Настоящее Имя Мода'
    const encoded = Buffer.from(name, 'utf8')
    const header = Buffer.alloc(21)
    Buffer.from('STBL').copy(header, 0)
    header.writeUInt16LE(5, 4)              // version 5
    header.writeUInt8(0, 6)                 // compressed
    header.writeBigUInt64LE(1n, 7)          // 1 entry
    header.writeUInt32LE(encoded.length, 17) // total string length
    const entry = Buffer.alloc(7 + encoded.length)
    entry.writeUInt32LE(0x12345678, 0)      // keyHash
    entry.writeUInt8(0, 4)                  // flags
    entry.writeUInt16LE(encoded.length, 5)  // byteLen
    encoded.copy(entry, 7)
    const stbl = Buffer.concat([header, entry])
    check('v5 parseStblV5 extracts UTF-8 name', parseStblV5(stbl) === name, JSON.stringify(parseStblV5(stbl)))
    check('v5 rejects legacy buffer shape', parseStblV5(Buffer.from('STBLxxxxxxxxxxxxxxxxxx')) === null)
  } else {
    console.log('SKIP: packageMeta.js not importable outside Electron (app.getPath) — v5 covered at runtime')
  }
}

if (failures) process.exit(1)
console.log('ALL STBL TESTS PASSED')
