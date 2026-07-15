import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, rename } from 'fs/promises'

// Links the user pasted into "Download from a link" are remembered here so they
// keep showing up in Discover (on the tab matching where they were pasted from —
// e.g. a Pinterest pin lands on the Pinterest tab) instead of vanishing with the
// one-off preview modal. One small JSON file in userData, newest first.
const STORE_PATH = () => join(app.getPath('userData'), 'saved-links.json')
const MAX_ENTRIES = 300

async function readStore() {
  try {
    const arr = JSON.parse(await readFile(STORE_PATH(), 'utf-8'))
    return Array.isArray(arr) ? arr : []
  } catch (err) {
    if (err && err.code === 'ENOENT') return [] // first run — no file yet
    // A transient read error or a momentarily-corrupt/locked file must NOT read
    // as "empty" — otherwise the next write would clobber every saved link.
    throw err
  }
}

async function writeStore(list) {
  // temp-file + rename = atomic; a crash mid-write can't truncate the real file
  const tmp = STORE_PATH() + '.tmp'
  await writeFile(tmp, JSON.stringify(list, null, 2), 'utf-8')
  await rename(tmp, STORE_PATH())
}

// Serialize the read-modify-write critical section so two concurrent add/remove
// calls can't both read the same list and clobber each other's change.
let queue = Promise.resolve()
function withLock(fn) {
  const run = queue.then(fn, fn)
  queue = run.then(() => {}, () => {}) // keep the chain alive regardless of outcome
  return run
}

/** All saved links, newest first. Best-effort: a read error yields [] (never writes). */
export async function listSavedLinks() {
  try {
    return await readStore()
  } catch {
    return []
  }
}

/**
 * Remember a saved link. Deduped by id (re-pasting the same pin/post just moves
 * it back to the top rather than duplicating). Returns the stored entry, or
 * throws if the store can't be read safely (caller keeps the existing file).
 */
export async function addSavedLink(entry) {
  if (!entry?.id) return null
  return withLock(async () => {
    const list = await readStore()
    const without = list.filter(e => e.id !== entry.id)
    const stored = { ...entry, savedAt: entry.savedAt ?? new Date().toISOString() }
    const next = [stored, ...without].slice(0, MAX_ENTRIES)
    await writeStore(next)
    return stored
  })
}

/** Forget a saved link by id. Returns { ok, removed }. */
export async function removeSavedLink(id) {
  return withLock(async () => {
    const list = await readStore()
    const next = list.filter(e => e.id !== id)
    await writeStore(next)
    return { ok: true, removed: list.length - next.length }
  })
}
