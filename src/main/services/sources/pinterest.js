import { fetchText, parseRss, firstImage, decodeEntities, toIso } from './feedUtils.js'

/**
 * "user" | "user/board" | pinterest.com URL → RSS feed URL.
 * Pinterest serves public RSS at /<user>/feed.rss and /<user>/<board>.rss.
 */
export function pinterestFeedUrl(input) {
  let s = String(input ?? '').trim()
  if (!s) return null
  s = s.replace(/^https?:\/\/(www\.)?pinterest\.[a-z.]+\//i, '').replace(/^\/+|\/+$/g, '')
  const parts = s.split('/').filter(Boolean)
  if (!parts.length || parts.some(p => !/^[\w.-]+$/.test(p))) return null
  if (parts.length === 1) return `https://www.pinterest.com/${parts[0]}/feed.rss`
  return `https://www.pinterest.com/${parts[0]}/${parts[1]}.rss`
}

/**
 * Public pins of a Pinterest user or board via RSS.
 * @returns {Promise<{ label: string, items: Array }>}
 */
export async function fetchPinterest(input, sourceId) {
  const feed = pinterestFeedUrl(input)
  if (!feed) throw new Error('Not a valid Pinterest user or board (use "user" or "user/board").')
  const xml = await fetchText(feed, 'application/rss+xml, text/xml')
  const rssTitle = decodeEntities(xml.match(/<title>([^<]{1,80})<\/title>/)?.[1]?.trim())
  const user = feed.split('/')[3]
  const items = []
  for (const it of await parseRss(xml)) {
    items.push({
      id: `pinterest:${it.link || it.title}`,
      sourceId,
      sourceType: 'pinterest',
      title: decodeEntities(it.title) || 'Pin',
      url: it.link,
      // pin thumbnails live inside the description; upscale 236x → 564x for cards
      imageUrl: (await firstImage(it.description))?.replace('/236x/', '/564x/') ?? null,
      summary: '',
      author: user,
      date: toIso(it.pubDate),
      locked: false,
      tags: []
    })
  }
  return { label: rssTitle || `Pinterest: ${user}`, items }
}
