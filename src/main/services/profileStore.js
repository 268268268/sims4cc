import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

// Named mod sets. A profile is a snapshot of which mods are enabled/disabled,
// keyed by a path that survives the enable/disable rename (…package ⇄ …package.disabled).
// Applying a profile toggles known mods back to their recorded state; mods the
// profile has never seen are left untouched (additive, non-destructive).
let STORE_PATH = null
async function storePath() {
  if (!STORE_PATH) {
    const { app } = await import('electron')
    STORE_PATH = join(app.getPath('userData'), 'profiles.json')
  }
  return STORE_PATH
}

async function read() {
  try {
    const data = JSON.parse(await readFile(await storePath(), 'utf-8'))
    return { profiles: Array.isArray(data.profiles) ? data.profiles : [], activeId: data.activeId ?? null }
  } catch {
    return { profiles: [], activeId: null }
  }
}

async function write(data) {
  await writeFile(await storePath(), JSON.stringify(data, null, 2), 'utf-8')
}

/** Identity of a mod that is stable across enable/disable (the .disabled suffix). */
export function modStableKey(mod) {
  let p = mod.relativePath || mod.filePath || ''
  if (p.toLowerCase().endsWith('.disabled')) p = p.slice(0, -9)
  return p.toLowerCase()
}

function makeId() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function snapshot(mods) {
  const states = {}
  for (const m of mods ?? []) {
    if (m.type === 'archive') continue
    states[modStableKey(m)] = !!m.enabled
  }
  return states
}

export async function listProfiles() {
  return await read()
}

export async function getProfile(id) {
  return (await read()).profiles.find(p => p.id === id) ?? null
}

/** Create a profile from the current mod states, or overwrite an existing one. */
export async function saveProfile({ name, mods, id } = {}) {
  const data = await read()
  const states = snapshot(mods)
  const now = new Date().toISOString()
  if (id) {
    const p = data.profiles.find(x => x.id === id)
    if (p) { p.name = name ?? p.name; p.states = states; p.updatedAt = now }
  } else {
    data.profiles.push({ id: makeId(), name: (name || 'Profile').slice(0, 60), states, createdAt: now })
  }
  await write(data)
  return data
}

export async function renameProfile(id, name) {
  const data = await read()
  const p = data.profiles.find(x => x.id === id)
  if (p) { p.name = (name || p.name).slice(0, 60); await write(data) }
  return data
}

export async function deleteProfile(id) {
  const data = await read()
  data.profiles = data.profiles.filter(x => x.id !== id)
  if (data.activeId === id) data.activeId = null
  await write(data)
  return data
}

export async function setActiveProfile(id) {
  const data = await read()
  data.activeId = id
  await write(data)
  return data
}

/** Add a profile parsed from an imported file, sanitising its shape. */
export async function addImportedProfile(raw) {
  const data = await read()
  const clean = {
    id: makeId(),
    name: (typeof raw?.name === 'string' && raw.name.trim() ? raw.name : 'Imported profile').slice(0, 60),
    states: raw?.states && typeof raw.states === 'object' ? raw.states : {},
    createdAt: new Date().toISOString()
  }
  data.profiles.push(clean)
  await write(data)
  return { data, id: clean.id }
}
