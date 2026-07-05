import 'dotenv/config'
import { join, basename } from 'path'
import { rename, unlink } from 'fs/promises'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { extractModArchive } from './archiveExtractor.js'

const API_BASE = 'https://api.curseforge.com/v1'
// ponytail: CurseForge gameId for The Sims 4. Verified live against /v1/games —
// 32197 returns 200 OK but 0 results (ghost id); 78062 is the real one.
const SIMS4_GAME_ID = 78062

/**
 * Search CurseForge mods for The Sims 4.
 * @param {Object} params
 * @param {string} [params.searchFilter] - free-text search query
 * @param {number} [params.categoryId]   - CurseForge category id
 * @param {number} [params.index=0]      - pagination offset
 * @param {number} [params.pageSize=50]  - results per page
 * @returns {Promise<{ data: Array, pagination: Object|null, error?: string }>}
 */
export async function searchMods(params = {}) {
  const { searchFilter = '', categoryId, index = 0, pageSize = 50 } = params

  // ponytail: import.meta.env is a Vite/renderer concept; in the main process it
  // is usually undefined, so guard with optional chaining to avoid a crash.
  const apiKey =
    process.env.CURSEFORGE_API_KEY ||
    import.meta.env?.MAIN_VITE_CURSEFORGE_API_KEY ||
    null

  console.log(
    'DEBUG: API Key exists:',
    !!process.env.CURSEFORGE_API_KEY || !!import.meta.env?.MAIN_VITE_CURSEFORGE_API_KEY
  )

  if (!apiKey) {
    console.error('DEBUG: CURSEFORGE_API_KEY is missing — check .env / electron-vite env.')
    return { data: [], pagination: null, error: 'CURSEFORGE_API_KEY is not set. Check your .env file.' }
  }

  const url = new URL(`${API_BASE}/mods/search`)
  url.searchParams.set('gameId', SIMS4_GAME_ID)
  if (searchFilter) url.searchParams.set('searchFilter', searchFilter)
  if (categoryId != null) url.searchParams.set('categoryId', categoryId)
  url.searchParams.set('index', index)
  url.searchParams.set('pageSize', pageSize)

  console.log('DEBUG: Fetching CurseForge URL:', url.toString())

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
      signal: AbortSignal.timeout(15000)
    })

    if (!res.ok) {
      // ponytail: surface the true error — body often carries the real reason
      const body = await res.text().catch(() => '')
      console.error('DEBUG: CurseForge API Error:', res.status, res.statusText, body)
      return {
        data: [],
        pagination: null,
        error: `CurseForge API error: ${res.status} ${res.statusText}`
      }
    }

    const json = await res.json()
    const data = json.data ?? []

    console.log('DEBUG: Response keys:', Object.keys(json))
    console.log(
      'DEBUG: Parsed — totalCount:',
      json.pagination?.totalCount,
      '| returned:',
      data.length,
      '| sample:',
      data[0] ? `${data[0].id} ${data[0].name}` : 'none'
    )

    // CurseForge shape: { data: [...], pagination: {...} }.
    // Backend returns the .data array; renderer maps over res.data.
    return { data, pagination: json.pagination ?? null }
  } catch (err) {
    console.error('[curseForgeClient] searchMods failed:', err)
    return { data: [], pagination: null, error: err.message }
  }
}

function getApiKey() {
  // ponytail: same fallback as searchMods — process.env first (dotenv), then Vite define if present
  return (
    process.env.CURSEFORGE_API_KEY ||
    import.meta.env?.MAIN_VITE_CURSEFORGE_API_KEY ||
    null
  )
}

/**
 * Download a CurseForge mod's latest file into the user's Mods folder.
 * @param {Object} mod               - CurseForge mod object (must have id + latestFiles)
 * @param {string} destinationFolder - absolute path to the local Mods folder
 * @returns {Promise<{ ok: boolean, path?: string, error?: string }>}
 */
export async function downloadMod(mod, destinationFolder) {
  if (!mod || !mod.id) return { ok: false, error: 'Invalid mod object.' }
  if (!destinationFolder) return { ok: false, error: 'Destination folder not provided.' }

  const apiKey = getApiKey()
  if (!apiKey) {
    return { ok: false, error: 'CURSEFORGE_API_KEY is not set. Check your .env file.' }
  }

  const file = mod.latestFiles?.[0]
  if (!file || !file.id) {
    return { ok: false, error: 'This mod has no downloadable file.' }
  }

  let downloadUrl = file.downloadUrl
  if (!downloadUrl) {
    // ponytail: CurseForge often omits downloadUrl from search results; the dedicated
    // endpoint returns a short-lived signed CDN URL we can fetch directly.
    try {
      const urlRes = await fetch(
        `${API_BASE}/mods/${mod.id}/files/${file.id}/download-url`,
        {
          headers: { Accept: 'application/json', 'x-api-key': apiKey },
          signal: AbortSignal.timeout(15000)
        }
      )
      if (!urlRes.ok) {
        const body = await urlRes.text().catch(() => '')
        return { ok: false, error: `Failed to resolve download URL (${urlRes.status}): ${body}` }
      }
      const urlJson = await urlRes.json()
      downloadUrl = urlJson?.data
      if (!downloadUrl) return { ok: false, error: 'CurseForge returned no download URL.' }
    } catch (err) {
      return { ok: false, error: `download-url request failed: ${err.message}` }
    }
  }

  // ponytail: basename() — fileName comes from a remote API; never let it path-escape the Mods folder
  const fileName = basename(file.fileName || `${mod.id}_${file.id}.zip`)
  const destPath = join(destinationFolder, fileName)
  // stream into a .part file and rename on success, so a failed download can
  // never leave a truncated .package behind for the game to choke on
  const partPath = destPath + '.part'

  // ponytail: no total time cap — big CC packs on slow links legitimately take
  // minutes. Abort only when the transfer stalls (no bytes for IDLE_TIMEOUT_MS).
  const IDLE_TIMEOUT_MS = 30000
  const controller = new AbortController()
  let idleTimer
  const resetIdle = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(
      () => controller.abort(new Error(`Download stalled (no data for ${IDLE_TIMEOUT_MS / 1000}s)`)),
      IDLE_TIMEOUT_MS
    )
  }

  try {
    resetIdle()
    // ponytail: fetch follows redirects by default, so the CDN bounce works transparently.
    const res = await fetch(downloadUrl, { signal: controller.signal })
    if (!res.ok) {
      return { ok: false, error: `Download failed: HTTP ${res.status} ${res.statusText}` }
    }
    if (!res.body) {
      return { ok: false, error: 'Download failed: empty response body.' }
    }
    let bytes = 0
    const body = Readable.fromWeb(res.body)
    body.on('data', (chunk) => {
      bytes += chunk.length
      resetIdle()
    })
    await pipeline(body, createWriteStream(partPath))
    await rename(partPath, destPath)
    console.log(`[curseForgeClient] Saved ${fileName} (${bytes} bytes) → ${destPath}`)

    // Zip archives are invisible to the game — unpack into Mods/<mod name>/
    // and drop the archive. Non-zip files (.package etc.) are already usable.
    if (/\.zip$/i.test(fileName)) {
      const extracted = await extractModArchive(destPath, destinationFolder, mod.name)
      if (!extracted.ok) {
        // keep the zip for manual inspection, but tell the user it is not installed
        return { ok: false, error: `Downloaded, but not installed: ${extracted.error}` }
      }
      await unlink(destPath).catch(() => {})
      return { ok: true, path: extracted.folder, files: extracted.files }
    }

    return { ok: true, path: destPath }
  } catch (err) {
    await unlink(partPath).catch(() => {})
    return { ok: false, error: `Download/write failed: ${err?.message ?? err}` }
  } finally {
    clearTimeout(idleTimer)
  }
}

