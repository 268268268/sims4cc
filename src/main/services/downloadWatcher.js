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

// Only extensions importFiles can actually install: .zip is extracted, .package
// and .ts4script are copied. .rar/.7z are deliberately NOT here — the installer
// can't unpack them, so offering to "install" one would only ever fail.
const MOD_EXT = new Set(['.zip', '.package', '.ts4script'])
const WATCH_MS = 5 * 60 * 1000 // keep watching for 5 min after a page is opened
const STABLE_MS = 1500          // size must hold steady this long = download finished
const BIRTH_GRACE_MS = 3000     // tolerate small clock skew on the "created after start" check

let watcher = null
let watchUntil = 0
let startedAt = 0
let seen = new Set()     // paths already offered
let pending = new Set()  // paths currently being evaluated (dedupe concurrent events)
let stopTimer = null
let target = null        // webContents that started the watch (the main app window)

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

/** True once the file has stopped growing (download complete), false otherwise. */
async function isStable(path) {
  try {
    const a = (await stat(path)).size
    await new Promise(r => setTimeout(r, STABLE_MS))
    const b = (await stat(path)).size
    return a === b && b > 0
  } catch {
    return false
  }
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
    if (!(await isStable(path))) return
    if (seen.has(path)) return
    seen.add(path)
    emit({ path, name: basename(path) })
  } finally {
    pending.delete(path)
  }
}

/**
 * Begin (or extend) watching the Downloads folder. Auto-stops after WATCH_MS.
 * Safe to call repeatedly — the second call just pushes the deadline out.
 */
export function startDownloadWatch(webContents = null) {
  const dir = downloadsDir()
  if (!dir) return
  if (webContents) target = webContents
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
}
