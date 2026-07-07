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

async function fetchSource(source, force) {
  const hit = cache.get(source.id)
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit
  const adapter = ADAPTERS[source.type]
  let entry
  try {
    const { label, items } = await adapter(source.input, source.id)
    entry = { at: Date.now(), label, items }
  } catch (err) {
    entry = { at: Date.now(), error: err.message, items: [] }
  }
  cache.set(source.id, entry)
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
export async function followSource({ type, input }) {
  if (!ADAPTERS[type] || type === 'modthesims') return { ok: false, error: 'Unknown source type.' }
  const probeId = `probe-${type}-${Date.now()}`
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
  return { ok: true, items, sources: sourceMeta, fetchedAt: new Date().toISOString() }
}
