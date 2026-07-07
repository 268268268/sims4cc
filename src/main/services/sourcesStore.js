import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { createHash } from 'crypto'

// Followed external sources, persisted in userData/sources.json:
// [{ id, type: 'patreon'|'pinterest'|'tumblr', input, label, addedAt }]
// ModTheSims is a built-in source and is not stored here.
let STORE_PATH = null
function storePath() {
  if (!STORE_PATH) STORE_PATH = join(app.getPath('userData'), 'sources.json')
  return STORE_PATH
}

export async function listSources() {
  try {
    const list = JSON.parse(await readFile(storePath(), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

async function save(list) {
  await writeFile(storePath(), JSON.stringify(list, null, 2), 'utf-8')
}

export async function addSource({ type, input, label }) {
  const list = await listSources()
  const id = createHash('sha1').update(`${type}|${input}`.toLowerCase()).digest('hex').slice(0, 10)
  if (list.some(s => s.id === id)) return { ok: false, error: 'This source is already added.' }
  const entry = { id, type, input, label, addedAt: new Date().toISOString() }
  list.push(entry)
  await save(list)
  return { ok: true, source: entry }
}

/** Add several pre-verified sources at once (no validation fetch). */
export async function addManySources(entries) {
  const list = await listSources()
  const have = new Set(list.map(s => s.id))
  let added = 0
  for (const e of entries ?? []) {
    if (!e?.type || !e?.input) continue
    const id = createHash('sha1').update(`${e.type}|${e.input}`.toLowerCase()).digest('hex').slice(0, 10)
    if (have.has(id)) continue
    have.add(id)
    list.push({ id, type: e.type, input: e.input, label: e.label ?? e.input, addedAt: new Date().toISOString() })
    added++
  }
  if (added) await save(list)
  return { ok: true, added }
}

export async function removeSource(id) {
  const list = await listSources()
  const next = list.filter(s => s.id !== id)
  if (next.length === list.length) return { ok: false, error: 'Source not found.' }
  await save(next)
  return { ok: true }
}
