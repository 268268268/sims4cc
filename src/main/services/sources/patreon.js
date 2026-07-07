import { fetchJson, stripHtml, toIso } from './feedUtils.js'
import { httpFetch } from './http.js'

// campaign ids rarely change — cache per creator for the session
const campaignCache = new Map()

/** "CreatorName" | patreon.com URL → creator slug. */
export function normalizePatreonInput(input) {
  let s = String(input ?? '').trim()
  if (!s) return null
  s = s.replace(/^https?:\/\/(www\.)?patreon\.com\//i, '').replace(/^c\//i, '').replace(/[/?#].*$/, '')
  return /^[\w.-]+$/.test(s) ? s : null
}

async function resolveCampaign(slug) {
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
  return resolved
}

/**
 * PUBLIC posts of a Patreon creator via the unauthenticated JSON API.
 * Patron-only posts are listed with locked:true (title/teaser/thumbnail only,
 * exactly what Patreon shows logged-out visitors) — no paywall is bypassed;
 * clicking opens the post page on patreon.com.
 * @returns {Promise<{ label: string, items: Array }>}
 */
export async function fetchPatreon(input, sourceId) {
  const slug = normalizePatreonInput(input)
  if (!slug) throw new Error('Not a valid Patreon creator name or URL.')
  const campaign = await resolveCampaign(slug)

  const api =
    `https://www.patreon.com/api/posts?filter[campaign_id]=${campaign.id}` +
    '&filter[contains_exclusive_posts]=true&sort=-published_at' +
    '&json-api-version=1.0&json-api-use-default-includes=false' +
    '&include=attachments' +
    '&fields[post]=title,teaser_text,content,url,published_at,current_user_can_view,is_paid,image' +
    '&fields[attachment]=name,url' +
    '&page[count]=30'
  const json = await fetchJson(api)

  // attachments live in the `included` section, referenced by post relationships
  const attById = {}
  for (const inc of json.included ?? []) {
    if (inc.type === 'attachment') attById[inc.id] = inc.attributes
  }

  const items = []
  for (const post of json.data ?? []) {
    const a = post.attributes ?? {}
    const viewable = a.current_user_can_view !== false
    const rels = post.relationships?.attachments?.data ?? []
    const attachments = rels.map(r => attById[r.id]).filter(a => a?.url && a?.name)
    // only offer files we can actually install; the post always stays openable
    const downloads = viewable ? attachments.filter(a => isInstallable(a.name)).map(a => ({
      name: a.name,
      url: a.url,
      via: 'patreon-attachment'
    })) : []

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
  return { label: campaign.name, items }
}

/** Installable in-game files we know how to place. */
export function isInstallable(name) {
  return /\.(zip|package|ts4script)$/i.test(String(name ?? ''))
}
