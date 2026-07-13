import { rename, unlink } from 'fs/promises'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { extractModArchive, uniqueFilePath, safeFileName } from './archiveExtractor.js'
import { httpFetch } from './sources/http.js'

const IDLE_TIMEOUT_MS = 30000

/** Stream a URL to disk with a stall watchdog and .part→rename safety. */
async function streamToFile(url, destPath, onProgress) {
  const partPath = destPath + '.part'
  const controller = new AbortController()
  let idleTimer
  const resetIdle = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => controller.abort(new Error(`stalled (no data for ${IDLE_TIMEOUT_MS / 1000}s)`)), IDLE_TIMEOUT_MS)
  }
  try {
    resetIdle()
    const res = await httpFetch(url, { signal: controller.signal })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    if (!res.body) return { ok: false, error: 'empty response body' }
    resetIdle() // fresh 30s for the streaming phase — connect+retry time shouldn't count as a stall
    const total = Number(res.headers.get('content-length')) || null
    let bytes = 0
    let last = 0
    const body = Readable.fromWeb(res.body)
    body.on('data', (chunk) => {
      bytes += chunk.length
      resetIdle()
      const now = Date.now()
      if (onProgress && (now - last > 250 || bytes === total)) {
        last = now
        onProgress({ received: bytes, total })
      }
    })
    await pipeline(body, createWriteStream(partPath))
    await rename(partPath, destPath)
    return { ok: true, bytes }
  } catch (err) {
    await unlink(partPath).catch(() => {})
    return { ok: false, error: err?.message ?? String(err) }
  } finally {
    clearTimeout(idleTimer)
  }
}

/**
 * Install every downloadable file of a Discover item into the Mods folder.
 * Zips are extracted (tray files routed); loose .package/.ts4script saved as-is.
 * @returns {Promise<{ ok, installed: string[], errors: string[] }>}
 */
export async function downloadRemoteItem(item, modsFolder, { onProgress, trayFolder } = {}) {
  const downloads = item?.downloads ?? []
  if (!downloads.length) return { ok: false, installed: [], errors: ['Nothing downloadable in this item.'] }

  const installed = []
  const errors = []
  const count = downloads.length
  let idx = 0

  for (const d of downloads) {
    idx++
    const emit = (p) => onProgress?.({ ...p, fileIndex: idx, fileCount: count, phase: 'downloading' })
    const isZip = /\.zip$/i.test(d.name)

    if (isZip) {
      const tmp = await uniqueFilePath(modsFolder, safeFileName(d.name))
      const r = await streamToFile(d.url, tmp, emit)
      if (!r.ok) { errors.push(`${d.name}: ${r.error}`); continue }
      onProgress?.({ fileIndex: idx, fileCount: count, phase: 'installing' })
      const ex = await extractModArchive(tmp, modsFolder, d.name.replace(/\.zip$/i, ''), { trayFolder })
      await unlink(tmp).catch(() => {})
      if (!ex.ok) { errors.push(`${d.name}: ${ex.error}`); continue }
      installed.push(...ex.files, ...(ex.trayFiles ?? []))
    } else {
      const dest = await uniqueFilePath(modsFolder, safeFileName(d.name))
      const r = await streamToFile(d.url, dest, emit)
      if (!r.ok) { errors.push(`${d.name}: ${r.error}`); continue }
      installed.push(dest)
    }
  }

  return { ok: installed.length > 0, installed, errors }
}
