import { firstImage, stripHtml, decodeEntities } from './feedUtils.js'
import { httpFetch } from './http.js'
import { extractCcLinks } from './tumblr.js'
import { msg } from '../messages.js'

// Tumblr-wide tag browse via the official v2 API. The shared key's limits
// (1000/hr, 5000/day across all users) are the scarce resource here — hence the
// page-1 cache and no background refreshes; requests happen only on user action.

// App-wide default key (public client key by design). Users can override it in
// Settings (tumblrApiKey) to get their own quota.
const DEFAULT_KEY = 'FjJOWvdFDVZHNJyq8PoZQiSCL6aIhR0vMfXXdIfyU9NyL4ysU6'

async function apiKey() {
  if (process.env.TUMBLR_API_KEY) return process.env.TUMBLR_API_KEY
  try {
    const { readConfig } = await import('../configStore.js')
    const userKey = (await readConfig()).tumblrApiKey
    if (userKey) return userKey
  } catch { /* fall back to the bundled key */ }
  return DEFAULT_KEY
}

// 10-min cache for first pages — repeat visits to a tag cost zero quota.
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map() // tag -> { at, result }

/**
 * Merged feed across several tags: one page per tag in parallel, deduped by
 * root post, newest first. cursors = { tag: before-timestamp } from the prior
 * page (null = first page). A tag that fails keeps its cursor so the next
 * scroll retries it; a tag with no more posts drops out (cursor null).
 * @returns {Promise<{ items: Array, cursors: Record<string, number|null>, hasMore: boolean }>}
 */
export async function fetchTumblrFeed(tags, cursors = null) {
  const list = [...new Set((tags ?? []).map(t => String(t).trim().replace(/^#/, '').toLowerCase()).filter(Boolean))].slice(0, 8)
  if (!list.length) throw new Error('No tags to browse.')
  const pages = await Promise.all(list.map(async (tag) => {
    const cur = cursors?.[tag]
    if (cursors && cur == null) return { tag, items: [], nextCursor: null } // exhausted
    try {
      return { tag, ...(await fetchTumblrTag(tag, cursors ? cur : null)) }
    } catch {
      return { tag, items: [], nextCursor: cursors ? cur : null } // transient — retry later
    }
  }))
  const items = []
  const seen = new Set()
  for (const p of pages) {
    for (const it of p.items) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      items.push(it)
    }
  }
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const outCursors = Object.fromEntries(pages.map(p => [p.tag, p.nextCursor ?? null]))
  return { items, cursors: outCursors, hasMore: Object.values(outCursors).some(c => c != null) }
}

/**
 * One page of Tumblr posts for a tag, mapped to Discover items. Reblogs of the
 * same original post collapse into one card (keyed by the trail's root post).
 * cursor = unix timestamp ("posts older than"), from the previous page.
 * @returns {Promise<{ items: Array, nextCursor: number|null }>}
 */
export async function fetchTumblrTag(tag, cursor = null) {
  tag = String(tag ?? '').trim().toLowerCase()
  if (!tag) throw new Error('Empty tag.')
  if (!cursor) {
    const hit = cache.get(tag)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result
  }
  const url =
    `https://api.tumblr.com/v2/tagged?tag=${encodeURIComponent(tag)}` +
    `&api_key=${await apiKey()}&limit=20${cursor ? `&before=${cursor}` : ''}`
  const res = await httpFetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) {
    throw new Error(res.status === 429 ? msg('rateLimited') : `Tumblr API error (HTTP ${res.status}).`)
  }
  const posts = (await res.json()).response
  if (!Array.isArray(posts)) throw new Error('Unexpected Tumblr API response.')

  const items = []
  const seen = new Set()
  for (const p of posts) {
    // key on the ORIGINAL post (trail root) so reblogs of one CC collapse; ids
    // exceed MAX_SAFE_INTEGER, so only string forms are safe to use
    const root = p.trail?.[0]
    const blog = root?.blog?.name || p.blog_name
    const postId = root?.post?.id || p.id_string
    const id = `tumblr:${blog}:${postId}`
    if (seen.has(id)) continue
    seen.add(id)
    const html = p.body || p.caption || ''
    items.push({
      id,
      sourceId: 'tumblr-tag',
      sourceType: 'tumblr',
      title: decodeEntities(p.title || '') || decodeEntities(p.summary || '').slice(0, 80) || 'Untitled post',
      url: p.post_url,
      imageUrl: p.photos?.[0]?.original_size?.url || (await firstImage(html)),
      summary: await stripHtml(html),
      author: blog,
      date: p.timestamp ? new Date(p.timestamp * 1000).toISOString() : null,
      locked: false,
      notes: Number(p.note_count) || 0,
      tags: p.tags?.slice(0, 6) ?? [],
      links: extractCcLinks(html),
      reblog: false // already collapsed to the root — treat every card as original
    })
  }
  // page done — older posts exist as long as the API keeps returning full-ish pages
  const oldest = posts.length ? Math.min(...posts.map(p => p.timestamp).filter(Boolean)) : null
  const result = { items, nextCursor: posts.length >= 10 && oldest ? oldest : null }
  if (!cursor) cache.set(tag, { at: Date.now(), result })
  return result
}
