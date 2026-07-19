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

/**
 * Pinterest pin → { out, image }: its single outbound destination URL (or null)
 * and the pin's own image (og:image), so the resolved card gets a real preview
 * instead of the placeholder diamond.
 */
async function pinInfo(url) {
  const html = await httpFetch(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(20000) }).then(r => r.text())
  const links = [...html.matchAll(/["']link["']\s*:\s*["'](https?:[^"']+)/g)]
    .map(m => m[1].replace(/\\u0026.*$/, '').replace(/\\u002F/g, '/'))
    .filter(u => !/pinterest|pinimg/.test(u))
  // http(s) only — a pin page is attacker-controllable and the image is persisted
  // + auto-rendered as <img src> later, so never accept data:/relative/other schemes.
  const image =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["'](https?:[^"']+)["']/i)?.[1] ||
    html.match(/["']image_url["']\s*:\s*["'](https?:[^"']+)["']/)?.[1]?.replace(/\\u002F/g, '/') ||
    null
  return { out: links[0] ?? null, image }
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

/** Real filename from a download URL's Content-Disposition (headers only, body cancelled). */
async function probeFilename(dlUrl) {
  try {
    const res = await httpFetch(dlUrl, { signal: AbortSignal.timeout(20000) })
    const cd = res.headers.get('content-disposition') || ''
    const fn = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i)?.[1]
    try { res.body?.cancel?.() } catch { /* ignore */ }
    return fn ? decodeURIComponent(fn.trim()) : null
  } catch {
    return null
  }
}

/** SimFileShare page → deterministic direct-download URL + real filename. */
async function resolveSimFileShare(url) {
  const id = url.match(/\/download\/(\d+)/)?.[1]
  if (!id) return fail(url, 'Could not read the SimFileShare id.')
  // /download/<id>/?dl serves the file directly (octet-stream) — no scraping needed
  const dl = `https://simfileshare.net/download/${id}/?dl`
  const name = (await probeFilename(dl)) ?? `simfileshare-${id}.zip`
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

/** SimFileShare folder page → all its files, each resolved to a real name. */
async function resolveSimFileShareFolder(url) {
  const folderId = url.match(/\/folder\/(\d+)/)?.[1]
  const html = await httpFetch(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(20000) }).then(r => r.text())
  // ponytail: cap at 10 files — huge CC folders are a "pick what you want" case, open in browser instead
  const ids = [...new Set([...html.matchAll(/\/download\/(\d+)/g)].map(m => m[1]))]
  if (!ids.length) return fail(url, 'This SimFileShare folder has no files (or is private).')
  if (ids.length > 10) return fail(url, `This SimFileShare folder has ${ids.length} files — pick the ones you want in the browser.`)
  const downloads = []
  for (const id of ids) {
    const r = await resolveSimFileShare(`https://simfileshare.net/download/${id}/`)
    if (r.ok) downloads.push(...r.downloads)
  }
  if (!downloads.length) return fail(url, 'Could not resolve any files in this SimFileShare folder.')
  return {
    ok: true,
    id: `resolved:sfsfolder:${folderId ?? url}`,
    title: `SimFileShare folder ${folderId ?? ''}`.trim(),
    sourceType: 'simfileshare',
    url,
    via: 'simfileshare',
    downloads
  }
}

/**
 * Dropbox share link → direct download by forcing ?dl=1 (folder links serve a
 * zip of the folder the same way). Real filename via Content-Disposition.
 */
async function resolveDropbox(url) {
  const u = new URL(url)
  u.searchParams.set('dl', '1')
  const dl = u.href
  const name = await probeFilename(dl)
  if (!name) return fail(url, 'Could not reach this Dropbox file (deleted or access-restricted).')
  if (!isInstallable(name)) return fail(url, `Dropbox link points to "${name}" — not an installable mod file.`)
  return {
    ok: true,
    id: `resolved:dropbox:${u.pathname}`,
    title: name.replace(/\.[^.]+$/, ''),
    sourceType: 'dropbox',
    url,
    via: 'dropbox',
    downloads: [{ name, url: dl }]
  }
}

/**
 * Google Drive file link → direct download via the usercontent endpoint
 * (confirm=t skips the "can't scan for viruses" page on big files).
 */
async function resolveGoogleDrive(url) {
  const id = url.match(/\/file\/d\/([\w-]+)/)?.[1] || new URL(url).searchParams.get('id')
  if (!id) return fail(url, 'Google Drive folders need picking by hand — opening in your browser.')
  const dl = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`
  // no Content-Disposition = Drive answered with an HTML page (private / removed file)
  const name = await probeFilename(dl)
  if (!name) return fail(url, 'This Google Drive file is not shared publicly — opening in your browser.')
  if (!isInstallable(name)) return fail(url, `Google Drive link points to "${name}" — not an installable mod file.`)
  return {
    ok: true,
    id: `resolved:gdrive:${id}`,
    title: name.replace(/\.[^.]+$/, ''),
    sourceType: 'gdrive',
    url,
    via: 'gdrive',
    downloads: [{ name, url: dl }]
  }
}

/** MediaFire file page → the download button's direct URL (plain or scrambled). */
async function resolveMediaFire(url) {
  if (/\/folder\//.test(new URL(url).pathname)) return fail(url, 'MediaFire folders need picking by hand — opening in your browser.')
  const html = await httpFetch(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(20000) }).then(r => r.text())
  let dl = html.match(/href=["'](https:\/\/download[^"']+\.mediafire\.com\/[^"']+)["']/)?.[1] ?? null
  if (!dl) {
    // newer pages hide the URL base64-encoded in data-scrambled-url
    const scrambled = html.match(/data-scrambled-url=["']([A-Za-z0-9+/=]+)["']/)?.[1]
    if (scrambled) try { dl = Buffer.from(scrambled, 'base64').toString('utf8') } catch { /* fall through */ }
  }
  if (!dl || !/^https:\/\//.test(dl)) return fail(url, 'Could not find the MediaFire download link (file removed?).')
  const name = decodeURIComponent(dl.split(/[?#]/)[0].split('/').pop() || '')
  if (!isInstallable(name)) return fail(url, `MediaFire link points to "${name}" — not an installable mod file.`)
  return {
    ok: true,
    id: `resolved:mediafire:${url}`,
    title: name.replace(/\.[^.]+$/, ''),
    sourceType: 'mediafire',
    url,
    via: 'mediafire',
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
      const { out, image } = await pinInfo(u.href)
      if (!out) return fail(u.href, 'This pin has no outbound link (image only).')
      const sub = await resolveLink(out, hop + 1)
      // carry the pin's own image down so the card/modal shows a real preview
      if (sub?.ok && !sub.imageUrl && image) sub.imageUrl = image
      return sub
    }

    if (host.endsWith('patreon.com') && /\/posts\//.test(u.pathname)) return resolvePatreonPost(u.href)

    if (host.endsWith('simfileshare.net')) {
      return /\/folder\/\d+/.test(u.pathname) ? resolveSimFileShareFolder(u.href) : resolveSimFileShare(u.href)
    }

    if (host.endsWith('dropbox.com')) return resolveDropbox(u.href)
    if (host === 'drive.google.com') return resolveGoogleDrive(u.href)
    if (host.endsWith('mediafire.com')) return resolveMediaFire(u.href)

    // known-gated or aggregator hosts → send the user to the browser
    if (host.endsWith('thesimsresource.com')) return fail(u.href, 'The Sims Resource gates downloads behind its own site — opening there.')
    if (host.endsWith('mega.nz')) return fail(u.href, 'MEGA downloads need their own client-side decryption — opening in your browser.')
    return fail(u.href, `${host} is not a directly-downloadable host — opening in your browser.`)
  } catch (err) {
    return fail(url, err.message)
  }
}
