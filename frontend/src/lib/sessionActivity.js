import { useSyncExternalStore, useCallback } from 'react'

// Tiny module-level store: counts installs/updates/deletes this session so the
// Layout can suggest clearing the game cache before playing.
let count = 0
let dismissed = false
const listeners = new Set()

function emit() {
  for (const l of listeners) l()
}

/** Call after any action that changes mod files on disk. */
export function markChanged() {
  count++
  dismissed = false
  emit()
}

export function useSessionActivity() {
  const subscribe = useCallback((cb) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }, [])
  const snapshot = useSyncExternalStore(subscribe, () => (dismissed ? 0 : count))
  const dismiss = useCallback(() => {
    dismissed = true
    emit()
  }, [])
  return { count: snapshot, dismiss }
}
