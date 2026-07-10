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
 * @param {number} [params.classId]      - CurseForge top-level class id (site section)
 * @param {number} [params.categoryId]   - single CurseForge leaf category id
 * @param {number[]} [params.categoryIds]- leaf category ids, AND-combined (narrows)
 * @param {number} [params.index=0]      - pagination offset
 * @param {number} [params.pageSize=50]  - results per page
 * @returns {Promise<{ data: Array, pagination: Object|null, error?: string }>}
 */
export async function searchMods(params = {}) {
  const { searchFilter = '', classId, categoryId, categoryIds, authorId, index = 0, pageSize = 50, sortField, sortOrder } = params

  const apiKey = await getApiKey()

  if (!apiKey) {
    console.error('DEBUG: CURSEFORGE_API_KEY is missing — check .env / Settings.')
    return { data: [], pagination: null, error: 'CurseForge API key is not set. Add it in Settings or .env.' }
  }

  const url = new URL(`${API_BASE}/mods/search`)
  url.searchParams.set('gameId', SIMS4_GAME_ID)
  if (searchFilter) url.searchParams.set('searchFilter', searchFilter)
  if (authorId != null) url.searchParams.set('authorId', authorId) // all mods by one author
  // classId = top-level site section (Create a Sim, Build/Buy…). categoryIds = leaf
  // filters with AND semantics (a mod must be in ALL of them) — narrows the result.
  if (classId != null) url.searchParams.set('classId', classId)
  if (Array.isArray(categoryIds) && categoryIds.length) {
    url.searchParams.set('categoryIds', JSON.stringify(categoryIds))
  } else if (categoryId != null) {
    url.searchParams.set('categoryId', categoryId)
  }
  // CF sortField enum: 2=Popularity, 3=LastUpdated, 4=Name, 6=TotalDownloads
  if (sortField != null) {
    url.searchParams.set('sortField', sortField)
    url.searchParams.set('sortOrder', sortOrder === 'asc' ? 'asc' : 'desc')
  }
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

async function getApiKey() {
  // precedence: .env (dotenv) → Vite define → user-entered key in Settings (config.json)
  if (process.env.CURSEFORGE_API_KEY) return process.env.CURSEFORGE_API_KEY
  if (import.meta.env?.MAIN_VITE_CURSEFORGE_API_KEY) return import.meta.env.MAIN_VITE_CURSEFORGE_API_KEY
  try {
    const { readConfig } = await import('./configStore.js')
    return (await readConfig()).curseForgeApiKey || null
  } catch {
    return null
  }
}

/**
 * The newest file of a mod. CF does NOT guarantee latestFiles[0] is newest —
 * pick by fileDate (fallback: highest id). Used by BOTH the download path and
 * the update check so a badge and its action can never disagree.
 * NOTE: the renderer mirrors this logic in src/renderer/src/lib/cfFile.js —
 * keep the two in lockstep.
 */
export function pickLatestFile(mod) {
  const files = mod?.latestFiles ?? []
  if (!files.length) return null
  return [...files].sort((a, b) => {
    const d = new Date(b.fileDate ?? 0) - new Date(a.fileDate ?? 0)
    return d !== 0 ? d : (b.id ?? 0) - (a.id ?? 0)
  })[0]
}

/**
 * Batch-fetch mods by id (POST /v1/mods). Chunked; session-cached.
 * @returns {Promise<{ data: Array, error?: string }>}
 */
const modsByIdCache = new Map() // modId -> mod (session)
export async function getModsByIds(modIds, { force = false } = {}) {
  const ids = [...new Set((modIds ?? []).map(Number).filter(Boolean))]
  if (!ids.length) return { data: [] }

  const apiKey = await getApiKey()
  if (!apiKey) return { data: [], error: 'CurseForge API key is not set.' }

  const missing = force ? ids : ids.filter(id => !modsByIdCache.has(id))
  let error
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200)
    try {
      const res = await fetch(`${API_BASE}/mods`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ modIds: chunk }),
        signal: AbortSignal.timeout(20000)
      })
      if (!res.ok) {
        error = `CurseForge batch error: ${res.status} ${res.statusText}`
        continue
      }
      const json = await res.json()
      for (const mod of json.data ?? []) modsByIdCache.set(mod.id, mod)
    } catch (err) {
      error = err.message
    }
  }
  return { data: ids.map(id => modsByIdCache.get(id)).filter(Boolean), ...(error ? { error } : {}) }
}

/**
 * Match local file fingerprints against CurseForge (POST /v1/fingerprints).
 * Chunked at 1000. Returns the raw exactMatches (each has .file with modId/id/
 * fileFingerprint, plus .latestFiles for update detection).
 * @returns {Promise<{ matches: Array, error?: string }>}
 */
export async function matchFingerprints(fingerprints) {
  const fps = [...new Set((fingerprints ?? []).filter(Boolean))]
  if (!fps.length) return { matches: [] }

  const apiKey = await getApiKey()
  if (!apiKey) return { matches: [], error: 'CurseForge API key is not set.' }

  const matches = []
  let error
  for (let i = 0; i < fps.length; i += 1000) {
    const chunk = fps.slice(i, i + 1000)
    try {
      const res = await fetch(`${API_BASE}/fingerprints`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ fingerprints: chunk }),
        signal: AbortSignal.timeout(20000)
      })
      if (!res.ok) { error = `CurseForge fingerprint error: ${res.status} ${res.statusText}`; continue }
      const json = await res.json()
      for (const m of json.data?.exactMatches ?? []) matches.push(m)
    } catch (err) {
      error = err.message
    }
  }
  return { matches, ...(error ? { error } : {}) }
}

/**
 * Full mod description (HTML), sanitized in main with cheerio. Session-cached.
 * @returns {Promise<{ html: string, error?: string }>}
 */
const descriptionCache = new Map() // modId -> html
const ALLOWED_TAGS = new Set([
  'p', 'br', 'a', 'b', 'i', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'span', 'div',
  'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr'
])
export async function getModDescription(modId) {
  const id = Number(modId)
  if (!id) return { html: '', error: 'Invalid mod id.' }
  if (descriptionCache.has(id)) return { html: descriptionCache.get(id) }

  const apiKey = await getApiKey()
  if (!apiKey) return { html: '', error: 'CurseForge API key is not set.' }

  try {
    const res = await fetch(`${API_BASE}/mods/${id}/description`, {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return { html: '', error: `CurseForge description error: ${res.status}` }
    const json = await res.json()
    const raw = json.data ?? ''

    const cheerio = await import('cheerio')
    const $ = cheerio.load(raw)
    $('script, style, iframe, object, embed, form, link, meta').remove()
    // 'body *' — a bare '*' would also match cheerio's html/body wrappers and
    // unwrapping those destroys the document (empty output)
    $('body *').each((_, el) => {
      if (el.type !== 'tag') return
      if (!ALLOWED_TAGS.has(el.tagName?.toLowerCase())) {
        $(el).replaceWith($(el).contents()) // unwrap unknown tags, keep text
        return
      }
      const attribs = { ...el.attribs }
      for (const attr of Object.keys(attribs)) {
        const val = attribs[attr] ?? ''
        const keep =
          (attr === 'href' && /^https:/i.test(val)) ||
          (attr === 'src' && /^https:/i.test(val))
        if (!keep) $(el).removeAttr(attr)
      }
    })
    const html = $('body').html() ?? ''
    descriptionCache.set(id, html)
    return { html }
  } catch (err) {
    return { html: '', error: err.message }
  }
}

// Categories rarely change — cache the list for the app's lifetime.
let categoriesCache = null

/**
 * Fetch the CurseForge category list for The Sims 4 (for the browse filter).
 * @returns {Promise<{ classes: Array, categories: Array, error?: string }>}
 */
export async function getCategories() {
  if (categoriesCache) return categoriesCache

  const apiKey = await getApiKey()
  if (!apiKey) return { classes: [], categories: [], error: 'CurseForge API key is not set.' }

  try {
    const url = new URL(`${API_BASE}/categories`)
    url.searchParams.set('gameId', SIMS4_GAME_ID)
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { classes: [], categories: [], error: `CurseForge categories error: ${res.status} ${res.statusText} ${body}` }
    }
    const json = await res.json()
    // Two levels: classes (isClass) are the top-level site sections — filtered via
    // search's classId; leaf categories carry a classId and filter via categoryIds.
    const all = (json.data ?? []).filter(c => c && c.name)
    const classes = all.filter(c => c.isClass).sort((a, b) => a.name.localeCompare(b.name))
    const categories = all.filter(c => !c.isClass).sort((a, b) => a.name.localeCompare(b.name))
    categoriesCache = { classes, categories }
    return categoriesCache
  } catch (err) {
    return { classes: [], categories: [], error: err.message }
  }
}

/**
 * Download a CurseForge mod's latest file into the user's Mods folder.
 * @param {Object} mod               - CurseForge mod object (must have id + latestFiles)
 * @param {string} destinationFolder - absolute path to the local Mods folder
 * @returns {Promise<{ ok: boolean, path?: string, error?: string }>}
 */
export async function downloadMod(mod, destinationFolder, opts = {}) {
  const { onProgress = null, trayFolder = null } = opts
  if (!mod || !mod.id) return { ok: false, error: 'Invalid mod object.' }
  if (!destinationFolder) return { ok: false, error: 'Destination folder not provided.' }

  const apiKey = await getApiKey()
  if (!apiKey) {
    return { ok: false, error: 'CurseForge API key is not set. Add it in Settings or .env.' }
  }

  const file = pickLatestFile(mod)
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
    const total = Number(res.headers.get('content-length')) || file.fileLength || null
    let lastTick = 0
    const body = Readable.fromWeb(res.body)
    body.on('data', (chunk) => {
      bytes += chunk.length
      resetIdle()
      // throttle progress to ~4/sec — enough for a smooth bar, no IPC spam
      const now = Date.now()
      if (onProgress && (now - lastTick > 250 || bytes === total)) {
        lastTick = now
        try { onProgress({ received: bytes, total, phase: 'downloading' }) } catch { /* renderer gone */ }
      }
    })
    await pipeline(body, createWriteStream(partPath))
    await rename(partPath, destPath)
    console.log(`[curseForgeClient] Saved ${fileName} (${bytes} bytes) → ${destPath}`)

    // Zip archives are invisible to the game — unpack into Mods/<mod name>/
    // and drop the archive. Non-zip files (.package etc.) are already usable.
    if (/\.zip$/i.test(fileName)) {
      if (onProgress) {
        try { onProgress({ received: bytes, total, phase: 'installing' }) } catch { /* renderer gone */ }
      }
      const extracted = await extractModArchive(destPath, destinationFolder, mod.name, { trayFolder })
      if (!extracted.ok) {
        // keep the zip for manual inspection, but tell the user it is not installed
        return { ok: false, error: `Downloaded, but not installed: ${extracted.error}` }
      }
      await unlink(destPath).catch(() => {})
      return { ok: true, path: extracted.folder, files: extracted.files, trayFiles: extracted.trayFiles ?? [] }
    }

    return { ok: true, path: destPath }
  } catch (err) {
    await unlink(partPath).catch(() => {})
    return { ok: false, error: `Download/write failed: ${err?.message ?? err}` }
  } finally {
    clearTimeout(idleTimer)
  }
}

