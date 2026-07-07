import { fetchText, parseRss, firstImage, stripHtml, decodeEntities, toIso } from './feedUtils.js'

/** "blogname" | "blogname.tumblr.com" | full URL → canonical blog host. */
export function normalizeTumblrInput(input) {
  let s = String(input ?? '').trim()
  if (!s) return null
  s = s.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  if (!s.includes('.')) s = `${s}.tumblr.com`
  return /^[\w-]+(\.[\w-]+)+$/.test(s) ? s : null
}

/**
 * Public posts of a Tumblr blog via its built-in RSS feed.
 * @returns {Promise<{ label: string, items: Array }>}
 */
export async function fetchTumblr(input, sourceId) {
  const host = normalizeTumblrInput(input)
  if (!host) throw new Error('Not a valid Tumblr blog name or URL.')
  const xml = await fetchText(`https://${host}/rss`, 'application/rss+xml, text/xml')
  const rssTitle = decodeEntities(xml.match(/<title>([^<]{1,80})<\/title>/)?.[1]?.trim())
  const items = []
  for (const it of await parseRss(xml)) {
    items.push({
      id: `tumblr:${it.link || it.title}`,
      sourceId,
      sourceType: 'tumblr',
      title: decodeEntities(it.title) || (await stripHtml(it.description, 80)) || 'Untitled post',
      url: it.link,
      imageUrl: await firstImage(it.description),
      summary: await stripHtml(it.description),
      author: host.replace('.tumblr.com', ''),
      date: toIso(it.pubDate),
      locked: false,
      tags: it.categories?.slice(0, 6) ?? []
    })
  }
  return { label: rssTitle || host, items }
}
