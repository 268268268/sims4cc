import { httpFetch } from './sources/http.js'
import { isInstallable } from './sources/patreon.js'

// Resolve an arbitrary URL (a Pinterest pin, a Patreon post, a SimFileShare
// page, or a direct file) down to installable mod files — WITHOUT crawling a
// whole link tree. Bounded to a couple of hops through known hosts only.
// Never throws; returns a resolved item or an { ok:false, openUrl } fallback.

const MAX_HOPS = 3

function fail(url, reason) {
  return { ok: false, openUrl: url, reason }
}

/** Pinterest pin → its single outbound destination URL (or null). */
async function pinOutbound(url) {
  const html = await httpFetch(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(20000) }).then(r => r.text())
  const links = [...html.matchAll(/["']link["']\s*:\s*["'](https?:[^"']+)/g)]
    .map(m => m[1].replace(/\\u0026.*$/, '').replace(/\\u002F/g, '/'))
    .filter(u => !/pinterest|pinimg/.test(u))
  return links[0] ?? null
}

/** Patreon post URL → free-post installable files (media + attachments). */
async function resolvePatreonPost(url) {
  const id = url.match(/posts\/[^/?#]*-(\d+)/)?.[1] || url.match(/posts\/(\d+)/)?.[1]
  if (!id) return fail(url, 'Could not read the Patreon post id.')
  const api =
    `https://www.patreon.com/api/posts/${id}` +
    '?json-api-version=1.0&json-api-use-default-includes=false&include=attachments,media,campaign' +
    '&fields[post]=title,current_user_can_view,is_paid,url' +
    '&fields[attachment]=name,url&fields[media]=file_name,download_url&fields[campaign]=name'
  const j = await httpFetch(api, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }).then(r => r.json())
  const a = j.data?.attributes ?? {}
  if (a.current_user_can_view === false) {
    return { ok: false, openUrl: a.url || url, reason: 'This Patreon post is patron-only. Connect your Patreon account (Settings) if you back this creator.', locked: true }
  }
  const inc = j.included ?? []
  const creator = inc.find(x => x.type === 'campaign')?.attributes?.name ?? null
  const downloads = [
    ...inc.filter(x => x.type === 'media' && x.attributes?.download_url && isInstallable(x.attributes.file_name))
      .map(x => ({ name: x.attributes.file_name, url: x.attributes.download_url })),
    ...inc.filter(x => x.type === 'attachment' && x.attributes?.url && isInstallable(x.attributes.name))
      .map(x => ({ name: x.attributes.name, url: x.attributes.url }))
  ]
  if (!downloads.length) return fail(a.url || url, 'This post has no directly-installable files (it may link out to another host).')
  return {
    ok: true,
    id: `resolved:patreon:${id}`,
    title: a.title || 'Patreon post',
    author: creator,
    sourceType: 'patreon',
    url: a.url || url,
    via: 'patreon-post',
    downloads
  }
}

/** SimFileShare page → deterministic direct-download URL + real filename. */
async function resolveSimFileShare(url) {
  const id = url.match(/\/download\/(\d+)/)?.[1]
  if (!id) return fail(url, 'Could not read the SimFileShare id.')
  // /download/<id>/?dl serves the file directly (octet-stream) — no scraping needed
  const dl = `https://simfileshare.net/download/${id}/?dl`
  // read the real filename from Content-Disposition (headers only, body cancelled)
  let name = `simfileshare-${id}.zip`
  try {
    const res = await httpFetch(dl, { signal: AbortSignal.timeout(20000) })
    const cd = res.headers.get('content-disposition') || ''
    const fn = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i)?.[1]
    if (fn) name = decodeURIComponent(fn.trim())
    try { res.body?.cancel?.() } catch { /* ignore */ }
  } catch { /* keep the fallback name */ }
  return {
    ok: true,
    id: `resolved:sfs:${id}`,
    title: name.replace(/\.[^.]+$/, ''),
    sourceType: 'simfileshare',
    url,
    via: 'simfileshare',
    downloads: [{ name, url: dl }]
  }
}

/** Direct file URL → download as-is. */
function resolveDirectFile(url) {
  const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'download')
  return {
    ok: true,
    id: `resolved:file:${url}`,
    title: name.replace(/\.[^.]+$/, ''),
    sourceType: 'direct',
    url,
    via: 'direct-file',
    downloads: [{ name, url }]
  }
}

/**
 * Resolve any URL to installable files, following at most one hop through
 * Pinterest. Returns { ok:true, ...item(downloads[]) } or { ok:false, openUrl }.
 */
export async function resolveLink(url, hop = 0) {
  let u
  try { u = new URL(url.trim()) } catch { return fail(url, 'That does not look like a URL.') }
  // only follow web links — never file://, and never internal/loopback hosts
  // (net.fetch would otherwise read local files or SSRF through the login session)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return fail(url, 'Only http(s) links are supported.')
  const host = u.hostname.toLowerCase()
  if (/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|10\.|192\.168\.|169\.254\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return fail(url, 'Local/private addresses are not allowed.')
  }

  try {
    // direct file — trivial
    if (/\.(zip|package|ts4script)(\?|#|$)/i.test(u.pathname)) return resolveDirectFile(u.href)

    if (host.endsWith('pinterest.com') || host === 'pin.it') {
      if (hop >= MAX_HOPS) return fail(u.href, 'Too many redirects to follow.')
      const out = await pinOutbound(u.href)
      if (!out) return fail(u.href, 'This pin has no outbound link (image only).')
      return resolveLink(out, hop + 1)
    }

    if (host.endsWith('patreon.com') && /\/posts\//.test(u.pathname)) return resolvePatreonPost(u.href)

    if (host.endsWith('simfileshare.net')) return resolveSimFileShare(u.href)

    // known-gated or aggregator hosts → send the user to the browser
    if (host.endsWith('thesimsresource.com')) return fail(u.href, 'The Sims Resource gates downloads behind its own site — opening there.')
    return fail(u.href, `${host} is not a directly-downloadable host — opening in your browser.`)
  } catch (err) {
    return fail(url, err.message)
  }
}
