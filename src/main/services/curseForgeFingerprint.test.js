import assert from 'node:assert'
import { computeFingerprint } from './curseForgeFingerprint.js'

// CF strips \t \n \r and space before hashing — same non-whitespace bytes must
// yield the same fingerprint, regardless of the whitespace between them.
const b = Buffer.from('packagedata123')
const spaced = Buffer.from('pa ck\tag\ne\rda ta1 23')
assert.strictEqual(computeFingerprint(spaced), computeFingerprint(b), 'whitespace must be ignored')

// different content → different fingerprint (deterministic, non-trivial hash)
assert.notStrictEqual(computeFingerprint(Buffer.from('packagedata124')), computeFingerprint(b), 'content differs')
assert.strictEqual(computeFingerprint(b), computeFingerprint(Buffer.from('packagedata123')), 'deterministic')

// 32-bit unsigned
const fp = computeFingerprint(Buffer.from('the sims 4 mod'))
assert.ok(Number.isInteger(fp) && fp >= 0 && fp <= 0xffffffff, 'fp is uint32')

console.log('curseForgeFingerprint: ok', fp)
