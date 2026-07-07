import { session, BrowserWindow, net } from 'electron'
import { setFetchImpl } from './sources/http.js'

// A persistent, isolated session partition holds the user's login cookies for
// external sources. We NEVER see passwords — the user logs in on the real site
// inside a normal browser window, and we reuse the resulting session cookie.
const PARTITION = 'persist:sources'

const PROVIDERS = {
  patreon: {
    label: 'Patreon',
    loginUrl: 'https://www.patreon.com/login',
    cookieDomain: '.patreon.com',
    authCookie: 'session_id'
  },
  pinterest: {
    label: 'Pinterest',
    loginUrl: 'https://www.pinterest.com/login/',
    cookieDomain: '.pinterest.com',
    authCookie: '_pinterest_sess'
  }
}

export function sourceSession() {
  return session.fromPartition(PARTITION)
}

/** Route all external-source HTTP through net.fetch on the logged-in session. */
export function installSessionFetch() {
  setFetchImpl((url, init = {}) =>
    net.fetch(url, { credentials: 'include', ...init, session: sourceSession() })
  )
}

export async function isConnected(provider) {
  const p = PROVIDERS[provider]
  if (!p) return false
  try {
    const cookies = await sourceSession().cookies.get({ name: p.authCookie })
    return cookies.some(c => c.value && c.value.length > 0)
  } catch {
    return false
  }
}

export async function authStatus() {
  const out = {}
  for (const [key, p] of Object.entries(PROVIDERS)) {
    out[key] = { label: p.label, connected: await isConnected(key) }
  }
  return out
}

/**
 * Open the provider's real login page; resolve once its auth cookie appears
 * (or the user closes the window). No credentials pass through this app.
 */
export async function connect(provider) {
  const p = PROVIDERS[provider]
  if (!p) return { ok: false, error: 'Unknown provider.' }
  if (await isConnected(provider)) return { ok: true, connected: true }

  const win = new BrowserWindow({
    width: 540,
    height: 760,
    title: `Sign in to ${p.label}`,
    autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, sandbox: true, nodeIntegration: false, contextIsolation: true }
  })
  win.loadURL(p.loginUrl).catch(() => {})

  return await new Promise((resolve) => {
    let settled = false
    const finish = (connected) => {
      if (settled) return
      settled = true
      clearInterval(timer)
      clearTimeout(safety)
      if (!win.isDestroyed()) win.close()
      resolve({ ok: connected, connected })
    }
    const timer = setInterval(async () => {
      if (await isConnected(provider)) finish(true)
    }, 1500)
    const safety = setTimeout(() => finish(false), 5 * 60 * 1000)
    win.on('closed', () => {
      if (settled) return
      settled = true
      clearInterval(timer)
      clearTimeout(safety)
      isConnected(provider).then(c => resolve({ ok: c, connected: c }))
    })
  })
}

export async function disconnect(provider) {
  const p = PROVIDERS[provider]
  if (!p) return { ok: false, error: 'Unknown provider.' }
  const s = sourceSession()
  try {
    const cookies = await s.cookies.get({ domain: p.cookieDomain })
    for (const c of cookies) {
      const host = c.domain.replace(/^\./, '')
      const url = `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`
      await s.cookies.remove(url, c.name).catch(() => {})
    }
    return { ok: true, connected: false }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
