import { app, BrowserWindow } from 'electron'
import { watch } from 'fs'
import { stat } from 'fs/promises'
import { join, extname, basename } from 'path'

// "Download helper": many CurseForge Sims 4 mods forbid API downloads
// (allowModDistribution:false), so the app can only send the user to the mod's
// page to download it in their browser. To still make install one-click, we
// briefly watch the OS Downloads folder after the user opens such a page and,
// when a fresh mod file lands, offer to install it. We only WATCH + PROMPT — the
// download itself is the user's own browser action, and nothing installs without
// their confirmation. This respects the author's opt-out (no API/site scraping).

// Only extensions importFiles can actually install: archives (.zip/.rar/.7z)
// are extracted, .package and .ts4script are copied.
const MOD_EXT = new Set(['.zip', '.rar', '.7z', '.package', '.ts4script'])
// Generous: the user still has to find the download button on the CurseForge page,
// clear its ad/Cloudflare gate and wait for a possibly large file. 5 min was too
// tight for a real visit; the watch is still bounded and extension-filtered.
const WATCH_MS = 15 * 60 * 1000
const POLL_MS = 1000            // how often to re-check a growing file
const MAX_POLLS = 600           // give a download up to ~10 min to finish
const BIRTH_GRACE_MS = 3000     // tolerate small clock skew on the "created after start" check

let watcher = null
let watchUntil = 0
let startedAt = 0
let seen = new Set()     // paths already offered
let pending = new Set()  // paths currently being evaluated (dedupe concurrent events)
let stopTimer = null
let target = null        // webContents that started the watch (the main app window)
let expectedMod = null   // the CurseForge mod whose page the user opened, if any

function downloadsDir() {
  try { return app.getPath('downloads') } catch { return null }
}

function emit(payload) {
  // Send only to the window that started the watch — never to the external
  // Patreon/Pinterest sign-in windows. Fall back to the main windows if it's gone.
  if (target && !target.isDestroyed()) {
    target.send('cfHelper:detected', payload)
    return
  }
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !w.webContents.getURL().startsWith('http')) {
      w.webContents.send('cfHelper:detected', payload)
    }
  }
}

/**
 * Wait until the file stops growing = the download finished.
 *
 * A real browser download is noticed the moment the file is CREATED and then
 * grows for seconds/minutes. A single "size unchanged?" probe would just answer
 * "not yet" — and since every fs event during the probe is swallowed by the
 * `pending` guard, and no further event arrives once the write completes, the
 * file would be dropped forever. So poll until it settles instead.
 */
async function waitUntilStable(path) {
  let last = -1
  for (let i = 0; i < MAX_POLLS; i++) {
    let size
    try {
      size = (await stat(path)).size
    } catch {
      return false // vanished (e.g. a temp file renamed to its final name)
    }
    if (size > 0 && size === last) return true
    last = size
    await new Promise(r => setTimeout(r, POLL_MS))
    if (!watcher) return false // watch stopped while we waited
  }
  return false
}

async function consider(path) {
  if (!MOD_EXT.has(extname(path).toLowerCase())) return // ignore .crdownload/.part/etc.
  if (seen.has(path) || pending.has(path)) return
  pending.add(path)
  try {
    let st
    try { st = await stat(path) } catch { return }       // renamed/removed mid-check
    if (!st.isFile()) return
    // only react to files created after the user opened the page — never to old
    // downloads already sitting in the folder
    if (st.birthtimeMs && st.birthtimeMs < startedAt - BIRTH_GRACE_MS) return
    if (!(await waitUntilStable(path))) return
    if (seen.has(path)) return
    seen.add(path)
    // carry the mod whose page was opened, so installing it can also be recorded
    // as that CurseForge mod (otherwise the browser would never show "Installed")
    emit({ path, name: basename(path), mod: expectedMod })
  } finally {
    pending.delete(path)
  }
}

/**
 * Begin (or extend) watching the Downloads folder. Auto-stops after WATCH_MS.
 * Safe to call repeatedly — the second call just pushes the deadline out.
 */
export function startDownloadWatch(webContents = null, mod = null) {
  const dir = downloadsDir()
  if (!dir) return
  if (webContents) target = webContents
  if (mod?.id) expectedMod = mod // latest opened page wins
  const now = Date.now()
  watchUntil = now + WATCH_MS
  clearTimeout(stopTimer)
  stopTimer = setTimeout(stopDownloadWatch, WATCH_MS)
  if (watcher) return // already watching — we only extended the window
  startedAt = now
  seen = new Set()
  pending = new Set()
  try {
    watcher = watch(dir, { persistent: false }, (_evt, filename) => {
      if (!filename || Date.now() > watchUntil) return
      consider(join(dir, filename))
    })
    watcher.on('error', stopDownloadWatch)
  } catch {
    watcher = null // downloads dir unavailable — silently give up
  }
}

export function stopDownloadWatch() {
  clearTimeout(stopTimer)
  stopTimer = null
  if (watcher) {
    try { watcher.close() } catch { /* ignore */ }
    watcher = null
  }
  seen = new Set()
  pending = new Set()
  expectedMod = null
}
