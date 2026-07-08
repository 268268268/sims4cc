import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

// CurseForge identifies a local file by a MurmurHash2 (32-bit, seed=1) computed
// over the file bytes with the whitespace bytes (\t \n \r space) removed. It must
// match byte-for-byte or CF returns zero matches, so this stays close to the
// reference implementation.

function murmur2(data, seed) {
  const m = 0x5bd1e995
  const r = 24
  let len = data.length
  let h = (seed ^ len) >>> 0
  let i = 0
  while (len >= 4) {
    let k = (data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24)) >>> 0
    k = Math.imul(k, m) >>> 0
    k ^= k >>> r
    k = Math.imul(k, m) >>> 0
    h = Math.imul(h, m) >>> 0
    h = (h ^ k) >>> 0
    i += 4
    len -= 4
  }
  // tail (fallthrough is intentional — same as the C reference)
  switch (len) {
    case 3: h = (h ^ (data[i + 2] << 16)) >>> 0
    // falls through
    case 2: h = (h ^ (data[i + 1] << 8)) >>> 0
    // falls through
    case 1:
      h = (h ^ data[i]) >>> 0
      h = Math.imul(h, m) >>> 0
  }
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, m) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return h >>> 0
}

/** CF fingerprint of a file buffer. */
export function computeFingerprint(buf) {
  const filtered = Buffer.allocUnsafe(buf.length)
  let n = 0
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]
    if (b === 9 || b === 10 || b === 13 || b === 32) continue // \t \n \r space
    filtered[n++] = b
  }
  return murmur2(filtered.subarray(0, n), 1)
}

// Fingerprints are keyed by (path, version) so unchanged files are hashed once.
let FP_PATH = null
async function fpPath() {
  if (!FP_PATH) {
    const { app } = await import('electron')
    FP_PATH = join(app.getPath('userData'), 'cf-fingerprint-cache.json')
  }
  return FP_PATH
}
export async function loadFpCache() {
  try { return JSON.parse(await readFile(await fpPath(), 'utf-8')) } catch { return {} }
}
export async function saveFpCache(cache) {
  try { await writeFile(await fpPath(), JSON.stringify(cache), 'utf-8') } catch { /* best-effort */ }
}

/** Fingerprint a file, reusing the cached value when its version (mtime) is unchanged. */
export async function fingerprintFile(filePath, version, cache = null) {
  const hit = cache?.[filePath]
  if (hit && hit.v === version) return hit.fp
  const buf = await readFile(filePath)
  const fp = computeFingerprint(buf)
  if (cache) cache[filePath] = { v: version, fp }
  return fp
}
