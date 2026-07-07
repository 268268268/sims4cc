// Single choke-point for all external-source HTTP. In the app this is bound to
// Electron's net.fetch on a persistent session (so the user's Patreon/Pinterest
// login cookies attach automatically). Under plain node (tests) it falls back to
// the global fetch with no cookies.

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

let fetchImpl = (url, init) => fetch(url, init)

/** Main process installs a session-bound net.fetch here at startup. */
export function setFetchImpl(fn) {
  fetchImpl = fn
}

/** Fetch with a browser UA (and, in-app, the logged-in source session cookies). */
export function httpFetch(url, init = {}) {
  return fetchImpl(url, {
    redirect: 'follow',
    ...init,
    headers: { 'User-Agent': UA, ...(init.headers || {}) }
  })
}
