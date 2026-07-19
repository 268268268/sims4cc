import { fetchText, parseRss, firstImage, stripHtml, decodeEntities, toIso } from './feedUtils.js'
import { resolveLink, isBoringHost } from '../linkResolver.js'

/** "blogname" | "blogname.tumblr.com" | full URL → canonical blog host. */
export function normalizeTumblrInput(input) {
  let s = String(input ?? '').trim()
  if (!s) return null
  s = s.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  if (!s.includes('.')) s = `${s}.tumblr.com`
  return /^[\w-]+(\.[\w-]+)+$/.test(s) ? s : null
}

const FILE_RE = /\.(zip|package|ts4script)(\?|#|$)/i

/**
 * Stable per-post item id. API and RSS render the same post's URL differently
 * (with/without slug), so key on the numeric post id whenever it's present —
 * otherwise the "already downloaded" marker breaks when a blog switches paths.
 */
export function tumblrPostKey(host, url) {
  const m = String(url ?? '').match(/\/post\/(\d+)/)
  // short blog name, not host — the v2 tag API only knows blog names, and the
  // "already downloaded" marker must match across both feeds
  const blog = String(host ?? '').replace(/\.tumblr\.com$/, '')
  return `tumblr:${m ? `${blog}:${m[1]}` : url}`
}

/** Unwrap Tumblr's outbound-link redirectors (t.umblr.com/redirect?z=…, href.li/?…). */
function unwrapRedirect(href) {
  try {
    const u = new URL(href)
    if (u.hostname === 't.umblr.com') return u.searchParams.get('z')
    if (u.hostname === 'href.li') return u.search.slice(1)
    return href
  } catch {
    return null
  }
}

/** Outbound links in a post's HTML that resolveLink() can turn into installable files. */
export function extractCcLinks(html) {
  if (!html) return []
  const out = []
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const href = unwrapRedirect(decodeEntities(m[1]))
    if (!href) continue
    let u
    try { u = new URL(href) } catch { continue }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
    const host = u.hostname.toLowerCase()
    // Candidates = anything resolveLink() has a real shot at: known hosts plus
    // ANY external page (the generic one-hop resolver mines those for CC links).
    // Excluded: socials/donations, known-gated sites, Patreon profiles, and
    // tumblr-internal links (reblog chains / tag pages — pure noise). tmblr.co
    // short links stay: they redirect to the creator's download post.
    const gated = host.endsWith('thesimsresource.com') || host.endsWith('modcollective.gg')
    const tumblrInternal = host.endsWith('tumblr.com') || host === 'tumblr.com'
    const patreonProfile = host.endsWith('patreon.com') && !/\/posts\//.test(u.pathname)
    const megaFolder = host.endsWith('mega.nz') && /\/folder\/|#F!/.test(href) // needs per-child keys — browser
    const resolvable =
      FILE_RE.test(u.pathname) ||
      (!gated && !tumblrInternal && !patreonProfile && !megaFolder && !isBoringHost(host))
    if (resolvable && !out.includes(href)) out.push(href)
    if (out.length >= 4) break // ponytail: reblog chains repeat the same links — 4 candidates is plenty
  }
  return out
}

/**
 * A post's candidate links → concrete installable files, via the shared resolver.
 * Called lazily (download click / detail modal), never during the feed scrape.
 * @returns {Promise<Array<{name, url, via}>>}
 */
export async function resolveTumblrDownloads(links) {
  const downloads = []
  const seen = new Set()
  for (const link of (links ?? []).slice(0, 4)) {
    const res = await resolveLink(String(link))
    for (const d of res?.ok ? res.downloads : []) {
      if (seen.has(d.url)) continue
      seen.add(d.url)
      // keep per-download flags: mega (decrypting stream) and cfMod (CF-store record)
      downloads.push({ ...d, via: res.via ?? 'tumblr', ...(res.cfMod ? { cfMod: res.cfMod } : {}) })
    }
  }
  return downloads
}

const PAGE_SIZE = 50

/**
 * Tumblr's legacy v1 read API — no key needed, pages the full archive.
 * Response is `var tumblr_api_read = {…};` — slice out the object literal.
 */
async function fetchViaApi(host, sourceId, start) {
  const raw = await fetchText(`https://${host}/api/read/json?num=${PAGE_SIZE}&start=${start}`, 'application/json')
  const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
  const posts = json.posts
  if (!Array.isArray(posts)) throw new Error('Unexpected Tumblr API response.')
  const author = host.replace('.tumblr.com', '')
  const items = []
  for (const p of posts) {
    const html =
      p['regular-body'] || p['photo-caption'] || p['video-caption'] || p['caption'] ||
      p['answer'] || p['quote-text'] || p['link-description'] || ''
    // reblogs key on the ROOT post (same as the tag browser) so one CC reblogged
    // by several followed blogs collapses to one card in the aggregate feed
    let id = null
    const rootUrl = p['reblogged-root-url']
    if (rootUrl) { try { id = tumblrPostKey(new URL(rootUrl).hostname, rootUrl) } catch { /* fall back */ } }
    items.push({
      id: id ?? tumblrPostKey(host, p.url),
      sourceId,
      sourceType: 'tumblr',
      title: decodeEntities(p['regular-title'] || p['question'] || '') || (await stripHtml(html, 80)) || 'Untitled post',
      url: p['url-with-slug'] || p.url,
      imageUrl: p['photo-url-1280'] || p['photo-url-500'] || p.photos?.[0]?.['photo-url-1280'] || (await firstImage(html)),
      summary: await stripHtml(html),
      author,
      date: toIso(p['date-gmt']),
      locked: false,
      notes: Number(p['note-count']) || 0, // likes+reblogs — powers the "Popular" sort
      tags: p.tags?.slice(0, 6) ?? [],
      links: extractCcLinks(html),
      // someone else's post reblogged here (self-reblogs count as own posts) —
      // the feed's "All" filter hides these when they carry no CC links
      reblog: !!p['reblogged-from-name'] && p['reblogged-from-name'] !== author
    })
  }
  const total = Number(json['posts-total']) || 0
  const nextCursor = posts.length && start + posts.length < total ? start + posts.length : null
  return { label: decodeEntities(json.tumblelog?.title) || host, items, nextCursor }
}

/** RSS fallback for blogs that block the v1 API — latest ~20 posts, no paging. */
async function fetchViaRss(host, sourceId) {
  const xml = await fetchText(`https://${host}/rss`, 'application/rss+xml, text/xml')
  const rssTitle = decodeEntities(xml.match(/<title>([^<]{1,80})<\/title>/)?.[1]?.trim())
  const items = []
  for (const it of await parseRss(xml)) {
    items.push({
      id: tumblrPostKey(host, it.link || it.title),
      sourceId,
      sourceType: 'tumblr',
      title: decodeEntities(it.title) || (await stripHtml(it.description, 80)) || 'Untitled post',
      url: it.link,
      imageUrl: await firstImage(it.description),
      summary: await stripHtml(it.description),
      author: host.replace('.tumblr.com', ''),
      date: toIso(it.pubDate),
      locked: false,
      tags: it.categories?.slice(0, 6) ?? [],
      links: extractCcLinks(it.description),
      // RSS has no reblog field — reblogged descriptions open with the
      // attribution link <a class="tumblr_blog" …>
      reblog: /class="tumblr_blog"/.test(it.description ?? '')
    })
  }
  return { label: rssTitle || host, items, nextCursor: null }
}

/**
 * Public posts of a Tumblr blog. v1 API first (full archive, cursor = post offset),
 * RSS as fallback when the API is blocked for the blog.
 * @returns {Promise<{ label: string, items: Array, nextCursor: number|null }>}
 */
export async function fetchTumblr(input, sourceId, opts = {}) {
  const host = normalizeTumblrInput(input)
  if (!host) throw new Error('Not a valid Tumblr blog name or URL.')
  const start = Number(opts.cursor) || 0
  try {
    return await fetchViaApi(host, sourceId, start)
  } catch (err) {
    if (start > 0) throw err // RSS can't page — nothing more to load
    return fetchViaRss(host, sourceId)
  }
}
