// Recently-viewed authors, shared across CurseForge and Discover. Persisted in
// localStorage (survives restarts), capped, most-recent-first. Any change fires a
// window event so open dropdowns on either page refresh live.
const KEY = 'authorHistory.v1'
const CAP = 15
const EVT = 'author-history-changed'

/** Stable identity of an entry, so revisits move to the front instead of duplicating. */
function keyOf(e) {
  return e.type === 'curseforge' ? `cf:${e.id}` : `dc:${e.sourceId}`
}

export function getAuthorHistory() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/**
 * Record a visit. Entry:
 *  CF       → { type:'curseforge', id, name, avatarUrl? }
 *  Discover → { type:'discover', sourceId, sourceType, name }
 */
export function pushAuthor(entry) {
  if (!entry) return
  const hasId = entry.type === 'curseforge' ? entry.id != null : !!entry.sourceId
  if (!hasId) return
  const e = { ...entry, at: Date.now() }
  const k = keyOf(e)
  const next = [e, ...getAuthorHistory().filter(x => keyOf(x) !== k)].slice(0, CAP)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* quota — ignore */ }
  window.dispatchEvent(new Event(EVT))
}

export function clearAuthorHistory() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT))
}

/** Subscribe to history changes; returns an unsubscribe fn. */
export function onAuthorHistoryChange(cb) {
  window.addEventListener(EVT, cb)
  return () => window.removeEventListener(EVT, cb)
}
