import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { listSources, addSource, addManySources, removeSource } from './sourcesStore.js'
import { SUGGESTED_SOURCES } from './suggestedSources.js'
import { fetchTumblr } from './sources/tumblr.js'
import { fetchPinterest } from './sources/pinterest.js'
import { fetchPatreon } from './sources/patreon.js'
import { fetchModTheSims } from './sources/modthesims.js'

const ADAPTERS = {
  tumblr: fetchTumblr,
  pinterest: fetchPinterest,
  patreon: fetchPatreon,
  modthesims: fetchModTheSims
}

export const SOURCE_TYPES = [
  { type: 'patreon', label: 'Patreon', hint: 'creator name or patreon.com URL' },
  { type: 'pinterest', label: 'Pinterest', hint: '"user" or "user/board"' },
  { type: 'tumblr', label: 'Tumblr', hint: 'blog name or URL' }
]

// Built-in aggregator sources that are always on.
const BUILTINS = [{ id: 'builtin-mts', type: 'modthesims', input: null, label: 'ModTheSims · Sims 4', builtin: true }]

// Session cache: one entry per source id, 10-minute TTL — feed etiquette and speed.
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map() // sourceId -> { at, label, items } | { at, error }

// The in-memory cache is lost on restart, so every launch re-scrapes every source
// before showing anything. Mirror the last aggregated feed to disk so the renderer
// can paint it instantly and revalidate in the background.
let SNAP_PATH = null
async function snapPath() {
  if (!SNAP_PATH) {
    const { app } = await import('electron')
    SNAP_PATH = join(app.getPath('userData'), 'discover-cache.json')
  }
  return SNAP_PATH
}
async function saveSnapshot(res) {
  try { await writeFile(await snapPath(), JSON.stringify(res), 'utf-8') } catch { /* best-effort */ }
}
export async function getDiscoverSnapshot() {
  try { return JSON.parse(await readFile(await snapPath(), 'utf-8')) } catch { return null }
}

async function fetchSource(source, force, cursor = null) {
  if (!cursor) {
    const hit = cache.get(source.id)
    if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit
  }
  const adapter = ADAPTERS[source.type]
  let entry
  try {
    // nextCursor is Patreon-only; other adapters ignore opts and return undefined.
    const { label, items, nextCursor } = await adapter(source.input, source.id, { cursor })
    entry = { at: Date.now(), label, items, nextCursor: nextCursor ?? null }
  } catch (err) {
    entry = { at: Date.now(), error: err.message, items: [] }
  }
  if (!cursor) cache.set(source.id, entry) // first page seeds the cache; later pages accumulate in fetchMore
  return entry
}

/** All followed sources incl. built-ins, with any cached error state. */
export async function getSources() {
  const user = await listSources()
  return [...BUILTINS, ...user].map(s => ({
    ...s,
    error: cache.get(s.id)?.error ?? null
  }))
}

/**
 * Validate + persist a new source. Validation = one real fetch, which also
 * warms the cache and derives the display label.
 */
let probeSeq = 0 // keep concurrent probe ids collision-free (Date.now alone can tie)

export async function followSource({ type, input }) {
  if (!ADAPTERS[type] || type === 'modthesims') return { ok: false, error: 'Unknown source type.' }
  const probeId = `probe-${type}-${Date.now()}-${probeSeq++}`
  const probe = await fetchSource({ id: probeId, type, input }, true)
  cache.delete(probeId)
  if (probe.error) return { ok: false, error: probe.error }
  const res = await addSource({ type, input, label: probe.label })
  if (!res.ok) return res
  cache.set(res.source.id, { ...probe })
  return { ok: true, source: res.source, count: probe.items.length }
}

export async function unfollowSource(id) {
  cache.delete(id)
  return removeSource(id)
}

/** Curated starter creators, flagged with whether they are already followed. */
export async function getSuggested() {
  const followed = new Set((await listSources()).map(s => `${s.type}|${String(s.input).toLowerCase()}`))
  return SUGGESTED_SOURCES.map(s => ({
    ...s,
    followed: followed.has(`${s.type}|${String(s.input).toLowerCase()}`)
  }))
}

/** Follow a batch of (pre-verified) suggested creators without re-validating. */
export async function followSuggested(entries) {
  const pick = (entries?.length ? entries : SUGGESTED_SOURCES)
    .map(e => ({ type: e.type, input: e.input, label: e.label }))
    .filter(e => e.type && e.input)
  return addManySources(pick)
}

/**
 * Aggregate items from all sources (parallel, per-source error isolation).
 * @returns {Promise<{ ok, items, sources: [{id,label,type,count,error}], fetchedAt }>}
 */
/** Run async tasks with a small concurrency cap — be polite to source sites. */
async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Follow a group of creators from a free-form string: names and/or URLs split on
 * spaces, commas, semicolons or newlines. Each is validated with a real probe
 * fetch (capped concurrency to stay polite) and added if it resolves.
 * @returns {Promise<{ ok, added, results: [{ input, ok, label?, count?, error? }] }>}
 */
export async function followBatch({ type, text }) {
  if (!ADAPTERS[type] || type === 'modthesims') return { ok: false, error: 'Unknown source type.' }
  const inputs = [...new Set(String(text ?? '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))]
  if (!inputs.length) return { ok: false, error: 'Enter at least one creator name or URL.' }
  // Skip authors already followed — don't re-probe (network) or duplicate them.
  const existing = new Set((await listSources()).map(s => `${s.type}|${String(s.input).toLowerCase()}`))
  const key = (i) => `${type}|${i.toLowerCase()}`
  const fresh = inputs.filter(i => !existing.has(key(i)))
  const skipped = inputs.filter(i => existing.has(key(i)))
  // Probe all in parallel (this IS the validation), then persist the winners in a
  // SINGLE write via addManySources — concurrent addSource() calls would race on
  // sources.json (read-modify-write) and drop entries.
  const probed = await mapPool(fresh, 5, async (input) => {
    const probeId = `probe-${type}-${Date.now()}-${probeSeq++}`
    const probe = await fetchSource({ id: probeId, type, input }, true)
    cache.delete(probeId)
    return { input, ok: !probe.error, label: probe.label, count: probe.items?.length ?? 0, error: probe.error }
  })
  const res = await addManySources(
    probed.filter(p => p.ok).map(p => ({ type, input: p.input, label: p.label }))
  )
  const results = [...probed, ...skipped.map(input => ({ input, ok: true, skipped: true, label: input }))]
  return { ok: res.added > 0 || skipped.length > 0, added: res.added, skipped: skipped.length, results }
}

export async function fetchDiscover({ force = false } = {}) {
  const sources = [...BUILTINS, ...(await listSources())]
  // cap concurrency so following 20+ creators doesn't hammer Patreon at once
  const results = await mapPool(sources, 5, async (s) => ({ s, r: await fetchSource(s, force) }))

  const items = []
  const seenIds = new Set()
  const sourceMeta = []
  for (const { s, r } of results) {
    // re-stamp sourceId — cached probe items carry the probe id.
    // Dedupe by id: MTS lists featured mods twice, and duplicate React keys
    // corrupt list reconciliation in the renderer.
    for (const it of r.items ?? []) {
      if (seenIds.has(it.id)) continue
      seenIds.add(it.id)
      items.push({ ...it, sourceId: s.id })
    }
    sourceMeta.push({
      id: s.id,
      type: s.type,
      label: r.label ?? s.label,
      builtin: !!s.builtin,
      count: r.items?.length ?? 0,
      error: r.error ?? null
    })
  }
  // newest first; undated items sink to the end but stay grouped by source order
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const hasMore = sources.some(s => cache.get(s.id)?.nextCursor)
  const result = { ok: true, items, sources: sourceMeta, fetchedAt: new Date().toISOString(), hasMore }
  saveSnapshot(result) // fire-and-forget; next launch paints this instantly
  return result
}

/**
 * Fetch the next page from every source that still has a cursor (Patreon), append
 * to the session cache, and return the freshly-loaded items to the renderer.
 * @returns {Promise<{ ok, items, hasMore }>}
 */
export async function fetchMoreDiscover() {
  const sources = [...BUILTINS, ...(await listSources())]
  const pageable = sources.filter(s => cache.get(s.id)?.nextCursor)
  if (!pageable.length) return { ok: true, items: [], hasMore: false }

  const pages = await mapPool(pageable, 5, async (s) => {
    const page = await fetchSource(s, true, cache.get(s.id).nextCursor) // cursor set → bypasses cache
    const base = cache.get(s.id)
    if (base && !page.error) {
      base.nextCursor = page.nextCursor ?? null
      base.items = [...(base.items ?? []), ...(page.items ?? [])]
    }
    return { s, items: page.items ?? [] }
  })

  const items = []
  const seen = new Set()
  for (const { s, items: its } of pages) {
    for (const it of its) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      items.push({ ...it, sourceId: s.id })
    }
  }
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return { ok: true, items, hasMore: sources.some(s => cache.get(s.id)?.nextCursor) }
}
