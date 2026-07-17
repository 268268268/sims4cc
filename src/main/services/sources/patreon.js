import { fetchJson, stripHtml, toIso } from './feedUtils.js'
import { httpFetch } from './http.js'

// campaign ids rarely change — cache per creator. Persisted to disk so a refresh
// (or a fresh launch) skips the creator-page request entirely and only hits the
// posts API: halves Patreon traffic, which matters a lot with many followed creators.
const campaignCache = new Map() // slug -> { id, name }
let CACHE_PATH = null

async function cachePath() {
  if (!CACHE_PATH) {
    const { app } = await import('electron')
    CACHE_PATH = (await import('path')).join(app.getPath('userData'), 'patreon-campaigns.json')
  }
  return CACHE_PATH
}

// Memoize the LOAD PROMISE, not a boolean — a boolean set before the async read
// completes lets concurrent cold-start callers proceed against an empty Map and
// re-fetch creator pages the cache already holds. Every caller awaits this one.
let loadPromise = null
function loadDisk() {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const { readFile } = await import('fs/promises')
        const obj = JSON.parse(await readFile(await cachePath(), 'utf-8'))
        for (const [slug, v] of Object.entries(obj)) {
          if (v?.id) campaignCache.set(slug, v)
        }
      } catch {
        // no cache yet, or running under plain node without electron — memory-only
      }
    })()
  }
  return loadPromise
}

async function saveDisk() {
  try {
    const { writeFile } = await import('fs/promises')
    await writeFile(await cachePath(), JSON.stringify(Object.fromEntries(campaignCache)), 'utf-8')
  } catch {
    // best-effort
  }
}

/** "CreatorName" | "@name" | patreon.com URL (incl. /c/, /cw/, user?u=id) → creator slug. */
export function normalizePatreonInput(input) {
  let s = String(input ?? '').trim()
  if (!s) return null
  s = s.replace(/^https?:\/\/(www\.)?patreon\.com\//i, '').replace(/^@/, '').replace(/^cw?\//i, '')
  // legacy id-based creator URLs — keep the query, resolveCampaign scrapes the page anyway
  const user = s.match(/^user\?u=(\d+)/i)
  if (user) return `user?u=${user[1]}`
  s = s.replace(/[/?#].*$/, '')
  // path segments that are never creator slugs (a pasted post URL yields "posts")
  if (/^(posts|user|login|signup|home|search|messages|c|cw)$/i.test(s)) return null
  return /^[\w.-]+$/.test(s) ? s : null
}

async function resolveCampaign(slug) {
  await loadDisk()
  if (campaignCache.has(slug)) return campaignCache.get(slug)
  // force English so og:title parsing is locale-independent (the app may run
  // under any system locale, which Patreon otherwise mirrors)
  const res = await httpFetch(`https://www.patreon.com/${slug}`, {
    headers: { Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for patreon.com`)
  const html = await res.text()
  const id =
    html.match(/patreon-media\/p\/campaign\/(\d+)/)?.[1] ??
    html.match(/"campaign_id[\\"]*[:=][\\"]*(\d+)/)?.[1] ??
    null
  // og:title = "Get more from <Creator> on Patreon"; the first <title> tag is the
  // inline SVG logo ("Patreon logo"), so never use that.
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,90})/i)?.[1] ?? ''
  const rawName = og.match(/Get more from (.+?) on Patreon/i)?.[1] || slug
  const name = rawName
    .replace(/&#x27;|&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim() || slug
  if (!id) throw new Error(`Could not find the Patreon campaign for "${slug}".`)
  const resolved = { id, name }
  campaignCache.set(slug, resolved)
  saveDisk() // fire-and-forget
  return resolved
}

/** Next-page cursor from the JSON:API response, or null on the last page. */
function patreonNextCursor(json) {
  if (json.meta?.pagination?.cursors?.next) return json.meta.pagination.cursors.next
  const m = json.links?.next?.match(/page(?:%5B|\[)cursor(?:%5D|\])=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * PUBLIC posts of a Patreon creator via the unauthenticated JSON API.
 * Patron-only posts are listed with locked:true (title/teaser/thumbnail only,
 * exactly what Patreon shows logged-out visitors) — no paywall is bypassed;
 * clicking opens the post page on patreon.com.
 * @returns {Promise<{ label: string, items: Array }>}
 */
export async function fetchPatreon(input, sourceId, opts = {}) {
  const slug = normalizePatreonInput(input)
  if (!slug) throw new Error('Not a valid Patreon creator name or URL.')
  const campaign = await resolveCampaign(slug)

  const api =
    `https://www.patreon.com/api/posts?filter[campaign_id]=${campaign.id}` +
    '&filter[contains_exclusive_posts]=true&sort=-published_at' +
    '&json-api-version=1.0&json-api-use-default-includes=false' +
    // media = files uploaded straight to the post (most free CC lives here, NOT in
    // attachments); page[count]=50 doubles first-page depth (cursor still paginates)
    '&include=attachments,media' +
    '&fields[post]=title,teaser_text,content,url,published_at,current_user_can_view,is_paid,image' +
    '&fields[attachment]=name,url' +
    '&fields[media]=file_name,download_url' +
    '&page[count]=50' +
    (opts.cursor ? `&page[cursor]=${encodeURIComponent(opts.cursor)}` : '')
  const json = await fetchJson(api)

  // resolvable files live in the `included` section, referenced by post relationships.
  // Normalize both kinds to { name, url } so downloads read from one shape.
  const fileById = {}
  for (const inc of json.included ?? []) {
    if (inc.type === 'attachment') fileById[inc.id] = { name: inc.attributes?.name, url: inc.attributes?.url }
    else if (inc.type === 'media') fileById[inc.id] = { name: inc.attributes?.file_name, url: inc.attributes?.download_url }
  }

  const items = []
  for (const post of json.data ?? []) {
    const a = post.attributes ?? {}
    const viewable = a.current_user_can_view !== false
    const rels = [
      ...(post.relationships?.attachments?.data ?? []),
      ...(post.relationships?.media?.data ?? [])
    ]
    // only offer installable files; dedupe by name (some posts list the zip twice)
    const seen = new Set()
    const downloads = viewable ? rels
      .map(r => fileById[r.id])
      .filter(f => f?.url && f?.name && isInstallable(f.name) && !seen.has(f.name) && seen.add(f.name))
      .map(f => ({ name: f.name, url: f.url, via: 'patreon' })) : []

    // Keep only mod posts: free posts must carry an installable file (drops news/
    // empty announcements); locked posts hide their files when logged-out, so keep
    // them all — on a CC creator they're the paid mods (the paid side of the mix).
    // ponytail: locked text-only posts (paywalled polls/news) slip through; add a
    // title/teaser heuristic if they clutter.
    if (viewable && downloads.length === 0) continue

    items.push({
      id: `patreon:${post.id}`,
      sourceId,
      sourceType: 'patreon',
      title: a.title || 'Untitled post',
      url: a.url,
      imageUrl: a.image?.thumb_url || a.image?.url || null,
      summary: await stripHtml(a.teaser_text ?? ''),
      author: campaign.name,
      date: toIso(a.published_at),
      locked: !viewable,
      downloads,
      tags: []
    })
  }
  return { label: campaign.name, items, nextCursor: patreonNextCursor(json) }
}

/** Installable in-game files we know how to place. */
export function isInstallable(name) {
  return /\.(zip|package|ts4script)$/i.test(String(name ?? ''))
}
