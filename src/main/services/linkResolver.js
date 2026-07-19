import { httpFetch } from './sources/http.js'
import { isInstallable } from './sources/patreon.js'

// Resolve an arbitrary URL (a Pinterest pin, a Patreon post, a SimFileShare
// page, or a direct file) down to installable mod files — WITHOUT crawling a
// whole link tree. Bounded to a couple of hops through known hosts only.
// Never throws; returns a resolved item or an { ok:false, openUrl } fallback.

const MAX_HOPS = 3

// Hosts where a download can never come from: socials, donations, streaming.
// Shared with the Tumblr link extractor so cards don't grow dead download buttons.
const BORING_HOSTS = [
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'youtube.com', 'youtu.be',
  'tiktok.com', 'discord.gg', 'discord.com', 'twitch.tv', 'spotify.com', 'reddit.com',
  'ko-fi.com', 'paypal.com', 'paypal.me', 'buymeacoffee.com', 'throne.com'
]
export function isBoringHost(host) {
  host = String(host ?? '').toLowerCase()
  return BORING_HOSTS.some(b => host === b || host.endsWith('.' + b))
}

/**
 * Mine raw HTML/JSON text for links on hosts we know how to resolve. Regex over
 * the raw text (not just <a href>) so JSON-embedded links (Next.js/Linktree
 * payloads) are found too. Deduped, capped.
 */
export function findKnownLinks(html) {
  const text = String(html ?? '').replace(/\\\//g, '/').replace(/&amp;/g, '&')
  const RES = [
    /https?:\/\/(?:[\w.-]+\.)?simfileshare\.net\/(?:download|folder)\/\d+[^\s"'<>\\)]*/gi,
    /https?:\/\/simfil\.es\/\w+[^\s"'<>\\)]*/gi,
    /https?:\/\/(?:[\w.-]+\.)?mediafire\.com\/[^\s"'<>\\)]+/gi,
    /https?:\/\/(?:[\w.-]+\.)?dropbox\.com\/[^\s"'<>\\)]+/gi,
    /https?:\/\/drive\.google\.com\/(?:file\/d\/|drive\/folders\/)[\w-]+[^\s"'<>\\)]*/gi,
    /https?:\/\/(?:www\.)?patreon\.com\/(?:[\w-]+\/)?posts\/[\w-]+[^\s"'<>\\)]*/gi,
    /https?:\/\/boosty\.to\/[\w.-]+\/posts\/[\w-]+[^\s"'<>\\)]*/gi,
    /https?:\/\/mega\.nz\/(?:file|folder)\/[^\s"'<>\\)]+/gi,
    /https?:\/\/(?:www\.|legacy\.)?curseforge\.com\/sims4\/[\w-]+\/[\w-]+[^\s"'<>\\)]*/gi,
    /https?:\/\/[^\s"'<>\\)]+\.(?:zip|package|ts4script)(?:\?[^\s"'<>\\)]*)?/gi
  ]
  const out = []
  for (const re of RES) {
    for (const m of text.matchAll(re)) {
      const link = m[0].replace(/[.,)]+$/, '')
      if (!out.includes(link)) out.push(link)
      if (out.length >= 6) return out
    }
  }
  return out
}

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

/**
 * CurseForge mod page URL → newest file via the CF API (slug lookup). Reuses the
 * app's CF key; distribution-blocked mods fall back to the browser like the CF tab.
 */
async function resolveCurseForge(url) {
  const slug = url.match(/curseforge\.com\/sims4\/[\w-]+\/([\w-]+)/i)?.[1]
  if (!slug) return fail(url, 'Could not read the CurseForge mod slug.')
  const { searchMods, pickLatestFile } = await import('./curseForgeClient.js')
  const { data, error } = await searchMods({ slug, pageSize: 5 })
  if (error) return fail(url, error)
  const mod = data.find(m => m.slug === slug) ?? data[0]
  if (!mod) return fail(url, 'Mod not found on CurseForge.')
  const file = pickLatestFile(mod)
  if (!file?.downloadUrl) return fail(url, 'This creator disabled downloads outside CurseForge — opening there.')
  return {
    ok: true,
    id: `cf:${mod.id}`, // matches the CF feed/browser id space
    title: mod.name,
    author: mod.authors?.[0]?.name ?? null,
    sourceType: 'curseforge',
    url,
    via: 'curseforge',
    imageUrl: mod.logo?.thumbnailUrl ?? null,
    // enough mod context for the CF store, so the CF tab shows "Installed"
    // and tracks updates for mods downloaded through links
    cfMod: { id: mod.id, name: mod.name, latestFiles: [file] },
    downloads: [{ name: file.fileName, url: file.downloadUrl }]
  }
}

/** simfil.es serves the file at the page URL itself — sniff the type for a name. */
async function resolveSimfiles(url) {
  const id = url.match(/simfil\.es\/(\w+)/)?.[1] ?? 'file'
  let ext = null
  let name = null
  try {
    const res = await httpFetch(url, { signal: AbortSignal.timeout(20000) })
    const cd = res.headers.get('content-disposition') || ''
    const fn = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i)?.[1]
    if (fn) name = decodeURIComponent(fn.trim())
    const reader = res.body.getReader()
    const { value } = await reader.read()
    reader.cancel().catch(() => {}) // stream is locked to the reader — cancel via it
    const head = Buffer.from(value ?? []).subarray(0, 4).toString('latin1')
    ext = head.startsWith('DBPF') ? 'package' : head.startsWith('PK') ? 'zip' : null
  } catch { /* fall through */ }
  if (!name && !ext) return fail(url, 'This simfil.es link does not serve a mod file.')
  name ??= `simfiles-${id}.${ext}`
  return {
    ok: true,
    id: `resolved:simfiles:${id}`,
    title: name.replace(/\.[^.]+$/, ''),
    sourceType: 'simfileshare',
    url,
    via: 'simfiles',
    downloads: [{ name, url }]
  }
}

/** Boosty post → files of a FREE post via their public API (paid = lock, like Patreon). */
async function resolveBoosty(url) {
  const m = url.match(/boosty\.to\/([\w.-]+)\/posts\/([\w-]+)/i)
  if (!m) return fail(url, 'This is a Boosty profile, not a post — opening in your browser.')
  const j = await httpFetch(`https://api.boosty.to/v1/blog/${m[1]}/post/${m[2]}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }).then(r => r.json())
  if (!j?.hasAccess) {
    return { ok: false, openUrl: url, reason: 'This Boosty post is for subscribers only — opening in your browser.', locked: true }
  }
  // Boosty's CDN only serves files with a signed query, and anonymous sessions
  // get an empty one — the post is readable but its files are login-gated.
  if (!j.signedQuery) {
    return { ok: false, openUrl: url, reason: 'Boosty serves files to signed-in users only — opening in your browser.', locked: true }
  }
  const downloads = (j.data ?? [])
    .filter(d => d.type === 'file' && d.url && isInstallable(d.title))
    .slice(0, 10)
    .map(d => ({ name: d.title, url: d.url + j.signedQuery }))
  if (!downloads.length) return fail(url, 'This Boosty post has no installable files.')
  return {
    ok: true,
    id: `resolved:boosty:${m[2]}`,
    title: j.title || 'Boosty post',
    author: m[1],
    sourceType: 'boosty',
    url,
    via: 'boosty',
    downloads
  }
}

/**
 * MEGA public file link → name via megajs (the AES key rides in the URL).
 * The download itself needs on-the-fly decryption, so the entry is flagged
 * `mega: true` and remoteDownload streams it through megajs instead of fetch.
 */
async function resolveMega(url) {
  // ponytail: file links only — folder links need per-child key derivation, browser for now
  if (/\/folder\/|#F!/.test(url)) return fail(url, 'MEGA folders need picking by hand — opening in your browser.')
  try {
    const { File } = await import('megajs')
    const file = File.fromURL(url)
    await Promise.race([
      file.loadAttributes(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 20000))
    ])
    const name = file.name
    if (!isInstallable(name)) return fail(url, `MEGA link points to "${name}" — not an installable mod file.`)
    return {
      ok: true,
      id: `resolved:mega:${file.downloadId ?? url}`,
      title: name.replace(/\.[^.]+$/, ''),
      sourceType: 'mega',
      url,
      via: 'mega',
      downloads: [{ name, url, mega: true }]
    }
  } catch (err) {
    return fail(url, `Could not read this MEGA link (${err.message}).`)
  }
}

/** Public MediaFire folder → its installable files via MediaFire's open folder API. */
async function resolveMediaFireFolder(url) {
  const key = url.match(/\/folder\/([a-z0-9]+)/i)?.[1]
  if (!key) return fail(url, 'Could not read the MediaFire folder key.')
  const api = `https://www.mediafire.com/api/1.4/folder/get_content.php?folder_key=${key}&content_type=files&chunk=1&response_format=json`
  const j = await httpFetch(api, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }).then(r => r.json())
  const files = (j?.response?.folder_content?.files ?? []).filter(f => isInstallable(f.filename)).slice(0, 10)
  if (!files.length) return fail(url, 'No installable files in this MediaFire folder (or it is private).')
  const downloads = []
  for (const f of files) {
    const page = f.links?.normal_download
    if (!page) continue
    const r = await resolveMediaFire(page)
    if (r.ok) downloads.push(...r.downloads)
  }
  if (!downloads.length) return fail(url, 'Could not resolve any files in this MediaFire folder.')
  return {
    ok: true,
    id: `resolved:mffolder:${key}`,
    title: `MediaFire folder ${j?.response?.folder_content?.name ?? key}`.trim(),
    sourceType: 'mediafire',
    url,
    via: 'mediafire',
    downloads
  }
}

/**
 * Public Google Drive folder → installable files via the keyless embedded
 * folder view (names come from the listing, so no per-file probing needed).
 */
async function resolveGoogleDriveFolder(url) {
  const id = url.match(/\/folders\/([\w-]+)/)?.[1]
  if (!id) return fail(url, 'Could not read the Google Drive folder id.')
  const html = await httpFetch(`https://drive.google.com/embeddedfolderview?id=${id}`, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(20000) }).then(r => r.text())
  const entries = [...html.matchAll(/id="entry-([\w-]+)"[\s\S]*?flip-entry-title">([^<]+)</g)]
    .map(m => ({ id: m[1], name: decodeEntitiesLite(m[2].trim()) }))
  const files = entries.filter(e => isInstallable(e.name)).slice(0, 10)
  if (!files.length) return fail(url, 'No installable files in this Google Drive folder (or it is not shared publicly).')
  return {
    ok: true,
    id: `resolved:gdrivefolder:${id}`,
    title: `Google Drive folder`,
    sourceType: 'gdrive',
    url,
    via: 'gdrive',
    downloads: files.map(f => ({
      name: f.name,
      url: `https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`
    }))
  }
}

/**
 * Unknown host → ONE bounded hop: fetch the page and mine it for known CC hosts
 * (the classic "post → landing page → Patreon/SFS link" chain, incl. tmblr.co
 * short links and Linktree-style JSON payloads).
 */
async function resolveGenericPage(url, hop) {
  const res = await httpFetch(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(15000) })
  const finalUrl = res.url || url
  if (!res.ok) return fail(finalUrl, `Page returned HTTP ${res.status}.`)
  const html = (await res.text()).slice(0, 1_500_000)
  const title = decodeEntitiesLite(html.match(/<title[^>]*>([^<]{1,90})/i)?.[1]?.trim())
  const downloads = []
  const seen = new Set()
  for (const link of findKnownLinks(html).filter(l => l !== url && l !== finalUrl).slice(0, 3)) {
    const r = await resolveLink(link, hop + 1)
    for (const d of r?.ok ? r.downloads : []) {
      if (seen.has(d.url)) continue
      seen.add(d.url)
      downloads.push(r.cfMod ? { ...d, cfMod: r.cfMod } : d)
    }
    if (downloads.length >= 10) break
  }
  if (!downloads.length) return fail(finalUrl, 'No downloadable files found behind this link — opening in your browser.')
  return {
    ok: true,
    id: `resolved:page:${finalUrl}`,
    title: title || finalUrl,
    sourceType: 'web',
    url: finalUrl,
    via: 'page',
    downloads
  }
}

function decodeEntitiesLite(s) {
  return s?.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
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
    if (host === 'drive.google.com') {
      return /\/folders\//.test(u.pathname) ? resolveGoogleDriveFolder(u.href) : resolveGoogleDrive(u.href)
    }
    if (host.endsWith('mediafire.com')) {
      return /\/folder\//.test(u.pathname) ? resolveMediaFireFolder(u.href) : resolveMediaFire(u.href)
    }
    if (host.endsWith('curseforge.com')) return resolveCurseForge(u.href)
    if (host === 'simfil.es') return resolveSimfiles(u.href)
    if (host.endsWith('boosty.to')) return resolveBoosty(u.href)
    if (host.endsWith('mega.nz')) return resolveMega(u.href)

    // known-gated or aggregator hosts → send the user to the browser
    if (host.endsWith('thesimsresource.com')) return fail(u.href, 'The Sims Resource gates downloads behind its own site — opening there.')
    if (host.endsWith('modcollective.gg')) return fail(u.href, 'Mod Collective requires signing in on their site — opening there.')
    if (host.endsWith('patreon.com')) return fail(u.href, 'This is a Patreon profile, not a post — opening in your browser.')
    if (isBoringHost(host)) return fail(u.href, `${host} is not a downloadable host — opening in your browser.`)

    // anything else: one bounded hop through the page (landing sites, tmblr.co
    // short links, blogs that host the real download link)
    if (hop < 2) return resolveGenericPage(u.href, hop)
    return fail(u.href, `${host} is not a directly-downloadable host — opening in your browser.`)
  } catch (err) {
    return fail(url, err.message)
  }
}
