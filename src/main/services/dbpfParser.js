import { open } from 'fs/promises'

const DBPF_MAGIC = Buffer.from('DBPF')

/**
 * Best-effort DBPF header check.
 * Reads only the first 96 bytes (standard DBPF header size).
 * Never throws — always returns a safe result object.
 *
 * ponytail: scaffold only — returns fallback for all files.
 * Ceiling: no index/resource parsing yet. Upgrade path: read
 * the index table at header offset 0x24 and walk resource entries.
 *
 * @param {string} filePath absolute path to .package file
 * @returns {{ ok: boolean, isDbpf: boolean, error?: string }}
 */
export async function tryParseDbpf(filePath) {
  let fh = null
  try {
    fh = await open(filePath, 'r')
    const buf = Buffer.alloc(96)
    const { bytesRead } = await fh.read(buf, 0, 96, 0)
    if (bytesRead < 4) return { ok: false, isDbpf: false, error: 'file too small' }
    const isDbpf = buf.slice(0, 4).equals(DBPF_MAGIC)
    return { ok: true, isDbpf }
  } catch (err) {
    return { ok: false, isDbpf: false, error: err.message }
  } finally {
    if (fh) await fh.close().catch(() => {})
  }
}
