// Shared helpers for external mod sources (RSS parsing, polite fetching).
import { httpFetch } from './http.js'

/** Polite GET (session-bound in-app) with a timeout. Throws on non-2xx. */
export async function fetchText(url, accept = '*/*') {
  const res = await httpFetch(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`)
  return res.text()
}

export async function fetchJson(url) {
  const res = await httpFetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`)
  return res.json()
}

/**
 * Minimal RSS 2.0 parser (cheerio in XML mode) — enough for Tumblr/Pinterest.
 * @returns {Promise<Array<{title,link,description,pubDate,categories}>>}
 */
export async function parseRss(xml) {
  const cheerio = await import('cheerio')
  const $ = cheerio.load(xml, { xmlMode: true })
  const items = []
  $('item').each((_, el) => {
    const $el = $(el)
    items.push({
      title: $el.find('title').first().text().trim(),
      link: $el.find('link').first().text().trim(),
      description: $el.find('description').first().text(), // escaped HTML already decoded by parser
      pubDate: $el.find('pubDate').first().text().trim() || null,
      categories: $el.find('category').map((_, c) => $(c).text().trim()).get()
    })
  })
  return items
}

/** First <img src> inside an HTML fragment (RSS descriptions carry images this way). */
export async function firstImage(html) {
  if (!html) return null
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m ? m[1] : null
}

/** Decode the common named/numeric HTML entities RSS titles carry. */
export function decodeEntities(s) {
  if (!s) return ''
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#0?39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n) } catch { return '' } })
}

/** Plain text of an HTML fragment, collapsed and capped. */
export async function stripHtml(html, cap = 220) {
  if (!html) return ''
  const text = decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return text.length > cap ? text.slice(0, cap - 1) + '…' : text
}

export function toIso(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
