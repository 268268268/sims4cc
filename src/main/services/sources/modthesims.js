import { fetchText, toIso } from './feedUtils.js'

const BASE = 'https://modthesims.info'

/**
 * Latest Sims 4 uploads on ModTheSims (public browse page, static HTML).
 * Built-in source — no user input needed.
 * @returns {Promise<{ label: string, items: Array }>}
 */
export async function fetchModTheSims(_input, sourceId) {
  const html = await fetchText(`${BASE}/downloads/ts4`, 'text/html')
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
  if (!items.length) throw new Error('ModTheSims page layout changed — no items parsed.')
  return { label: 'ModTheSims · Sims 4', items }
}
