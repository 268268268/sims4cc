import { fetchText, toIso } from './feedUtils.js'
import { isInstallable } from './patreon.js'

const BASE = 'https://modthesims.info'

// site sort tabs (`t` param). "popular" is a fixed top list — one page only.
export const MTS_SORTS = ['new', 'featured', 'picked', 'popular']
// top-level browse forums (`f` param), ids from the site's category tree
export const MTS_CATEGORIES = [
  { id: 145, label: 'Sims' },
  { id: 485, label: 'Pets' },
  { id: 143, label: 'Lots & Housing' },
  { id: 342, label: 'Body Shop' },
  { id: 385, label: 'Buy Mode' },
  { id: 380, label: 'Build Mode' },
  { id: 414, label: 'Game Mods' },
  { id: 229, label: 'Careers' },
  { id: 747, label: 'Traits' },
  { id: 519, label: 'Miscellaneous' }
]

/**
 * Sims 4 uploads on ModTheSims (public browse pages, static HTML).
 * Built-in source — no user input needed. cursor = page number (infinite feed);
 * opts.sort / opts.cat map to the site's own sort tabs and category forums.
 * @returns {Promise<{ label: string, items: Array, nextCursor: number|null }>}
 */
export async function fetchModTheSims(_input, sourceId, opts = {}) {
  const page = Number(opts.cursor) || 1
  const sort = MTS_SORTS.includes(opts.sort) && opts.sort !== 'new' ? `&t=${opts.sort}` : ''
  const cat = Number(opts.cat) ? `&f=${Number(opts.cat)}` : ''
  const html = await fetchText(`${BASE}/downloads.php?showType=1&gs=4&p=${page}${sort}${cat}`, 'text/html')
  const cheerio = await import('cheerio')
  const $ = cheerio.load(html)

  const items = []
  $('.smol-card-component').each((_, el) => {
    const $el = $(el)
    const link = $el.find('.downloadtitle a').attr('href')
    const title = $el.find('.downloadtitle a').text().trim()
    if (!link || !title) return
    let img = $el.find('img.featuredimage').attr('src') || $el.find('.thumbnailwrapper img').attr('src') || null
    if (img?.startsWith('//')) img = 'https:' + img
    const author = $el.find('.downloadcreatorname a').first().text().trim() || null
    // "by NAME updated Yesterday at 5:50pm" — the absolute date is not in the card
    const updatedText = $el.find('.downloadcreator').text().replace(/\s+/g, ' ').trim()
    items.push({
      id: `mts:${link}`,
      sourceId,
      sourceType: 'modthesims',
      title,
      url: link.startsWith('http') ? link : BASE + link,
      imageUrl: img,
      summary: updatedText.replace(/^by\s+\S+\s*/, ''),
      author,
      date: toIso(updatedText.match(/updated\s+(\d{1,2}\s+\w+\s+\d{4})/)?.[1]) ?? null,
      locked: false,
      tags: []
    })
  })
  if (!items.length && page === 1) throw new Error('ModTheSims page layout changed — no items parsed.')
  // "popular" is a one-page top list — its page 2 renders empty
  const nextCursor = items.length && opts.sort !== 'popular' ? page + 1 : null
  return { label: 'ModTheSims · Sims 4', items, nextCursor }
}

/**
 * Files + screenshots of one MTS mod page, resolved lazily on demand (the browse
 * feed never touches mod pages — 50 extra fetches per refresh would be rude).
 * getfile.php 302s to a direct CDN zip — no auth, streams fine as-is.
 * @returns {Promise<{ downloads: Array<{name, url, via}>, images: string[] }>}
 */
export async function resolveMtsDetail(pageUrl) {
  const html = await fetchText(pageUrl, 'text/html')
  const cheerio = await import('cheerio')
  const $ = cheerio.load(html)
  const seen = new Set()
  const downloads = []
  $('a.downloadlink').each((_, el) => {
    const url = $(el).attr('href')
    const name = $(el).text().trim()
    // each file renders two identical links — keep the one whose text is the filename
    if (!url || !isInstallable(name) || seen.has(url)) return
    seen.add(url)
    downloads.push({ name, url, via: 'mts' })
  })
  const imgSeen = new Set()
  const images = []
  $('a[rel="carouselimages"]').each((_, el) => {
    let href = $(el).attr('href')
    if (!href) return
    if (href.startsWith('//')) href = 'https:' + href
    if (!/^https:\/\//.test(href) || imgSeen.has(href)) return
    imgSeen.add(href)
    images.push(href)
  })
  return { downloads, images }
}
