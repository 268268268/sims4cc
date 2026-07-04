import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { app } from 'electron'

const CATALOG_URL =
  'https://raw.githubusercontent.com/PoZi268/sims4-cc-manager/refs/heads/main/catalog.json'
const CACHE_PATH = join(app.getPath('userData'), 'catalog_cache.json')

const EMPTY_CATALOG = { creators: [], items: [] }

/**
 * Fetch remote catalog.json and cache it locally.
 * Falls back to cache on failure; returns empty structure if no cache either.
 */
export async function fetchAndCacheCatalog() {
  console.log('[catalogStore] Fetching catalog from:', CATALOG_URL)
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
    const json = await res.json()
    if (!json || !Array.isArray(json.creators) || !Array.isArray(json.items)) {
      throw new Error('Invalid catalog schema')
    }
    await writeFile(CACHE_PATH, JSON.stringify(json, null, 2), 'utf-8')
    return json
  } catch (err) {
    console.error('CRITICAL: Failed to fetch catalog from GitHub:', err)
    // RETURN THE LOCAL CACHE IF AVAILABLE, ELSE EMPTY
    return await loadLocalCache()
  }
}

async function loadLocalCache() {
  try {
    const raw = await readFile(CACHE_PATH, 'utf-8')
    const cached = JSON.parse(raw)
    if (cached && Array.isArray(cached.creators) && Array.isArray(cached.items)) {
      console.log('[catalogStore] Using local cache as fallback')
      return cached
    }
    throw new Error('bad cache')
  } catch (err) {
    console.error('[catalogStore] No valid local cache available:', err.message)
    return EMPTY_CATALOG
  }
}
