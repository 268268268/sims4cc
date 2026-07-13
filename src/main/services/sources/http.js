// Single choke-point for all external-source HTTP. In the app this is bound to
// Electron's net.fetch on a persistent session (so the user's Patreon/Pinterest
// login cookies attach automatically). Under plain node (tests) it falls back to
// the global fetch with no cookies.
//
// Every request passes through a per-host politeness gate (bounded concurrency +
// minimum spacing) and a 429/5xx retry with backoff that honors Retry-After.
// This is what lets someone follow hundreds of creators without Patreon 429-ing
// or the app melting down — the gate throttles www.patreon.com to a trickle
// while unrelated hosts (each Tumblr blog, ModTheSims, CDNs) stay fast.

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

let fetchImpl = (url, init) => fetch(url, init)

/** Main process installs a session-bound net.fetch here at startup. */
export function setFetchImpl(fn) {
  fetchImpl = fn
}

// Abortable sleep: resolves early if the caller's signal fires, so a request
// that blew its deadline (or a download whose stall-watchdog tripped) releases
// its host slot immediately instead of holding it for the whole backoff.
const sleep = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve()
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
})

// --- per-host politeness config ---------------------------------------------
// Patreon rate-limits hard on a shared host (www.patreon.com), so keep it to a
// trickle. Everything else gets a generous default; distinct Tumblr blogs are
// separate hosts and so never throttle each other.
const HOST_CONFIG = {
  patreon: { concurrency: 2, minGapMs: 350, maxRetries: 4 },
  pinterest: { concurrency: 3, minGapMs: 200, maxRetries: 3 },
  default: { concurrency: 6, minGapMs: 0, maxRetries: 2 }
}

function hostKey(url) {
  let host
  try { host = new URL(url).hostname.toLowerCase() } catch { return 'default' }
  if (host.endsWith('patreon.com')) return 'patreon' // page + api share the limit
  if (host.endsWith('pinterest.com')) return 'pinterest'
  return host // one bucket per exact host otherwise
}

function configFor(key) {
  return HOST_CONFIG[key] ?? HOST_CONFIG.default
}

// --- per-host gate: bounded concurrency + minimum spacing between starts ------
const gates = new Map() // key -> { active, waiters: [], lastStart }

function gateFor(key) {
  let g = gates.get(key)
  if (!g) { g = { active: 0, waiters: [], lastStart: 0 }; gates.set(key, g) }
  return g
}

async function acquire(key) {
  const cfg = configFor(key)
  const g = gateFor(key)
  if (g.active < cfg.concurrency) {
    // slot free — take it synchronously (no await between check and ++, so no
    // two callers can both pass the check)
    g.active++
  } else {
    // full — queue. release() hands us a slot directly WITHOUT touching `active`,
    // so a new arrival racing the wake-up still sees `active` at the cap and queues.
    await new Promise(res => g.waiters.push(res))
  }
  const wait = g.lastStart + cfg.minGapMs - Date.now()
  if (wait > 0) await sleep(wait)
  g.lastStart = Date.now()
}

function release(key) {
  const g = gateFor(key)
  const next = g.waiters.shift()
  if (next) next() // transfer the slot — `active` stays at the cap
  else g.active-- // nobody waiting — actually free the slot
}

// --- retry on 429 / 5xx with Retry-After + jittered exponential backoff -------
function retryAfterMs(res) {
  const h = res.headers.get('retry-after')
  if (!h) return null
  const secs = Number(h)
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 60000)
  const at = Date.parse(h) // HTTP-date form
  if (!Number.isNaN(at)) return Math.min(Math.max(0, at - Date.now()), 60000)
  return null
}

/** Fetch with a browser UA, per-host politeness, and 429/5xx backoff retry. */
export async function httpFetch(url, init = {}) {
  const key = hostKey(url)
  const cfg = configFor(key)
  const merged = {
    redirect: 'follow',
    ...init,
    headers: { 'User-Agent': UA, ...(init.headers || {}) }
  }

  await acquire(key)
  try {
    let attempt = 0
    for (;;) {
      const res = await fetchImpl(url, merged)
      const retryable = res.status === 429 || (res.status >= 500 && res.status <= 599)
      if (!retryable || attempt >= cfg.maxRetries || merged.signal?.aborted) return res
      const backoff = retryAfterMs(res) ?? Math.min(800 * 2 ** attempt, 20000)
      const jitter = Math.floor(Math.random() * 300)
      // consume the body so the socket can be reused, then wait (abortable)
      try { await res.arrayBuffer() } catch { /* ignore */ }
      await sleep(backoff + jitter, merged.signal)
      // caller's deadline (or download stall-watchdog) fired during the wait —
      // stop now and free the slot rather than issue another doomed fetch
      if (merged.signal?.aborted) return res
      attempt++
    }
  } finally {
    release(key)
  }
}
