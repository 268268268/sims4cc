import { shell } from 'electron'
import { readdir } from 'fs/promises'
import { resolve, dirname, sep } from 'path'

const err = (message) => ({ ok: false, error: { message } })

/** filePath must live strictly INSIDE modsFolder (never equal to it). */
function isStrictChild(absFile, absFolder) {
  if (absFile.toLowerCase() === absFolder.toLowerCase()) return false
  const rel = absFile.slice(absFolder.length)
  return absFile.toLowerCase().startsWith(absFolder.toLowerCase()) && rel.startsWith(sep)
}

/**
 * Move a mod file to the Recycle Bin; ascend and trash parent folders that
 * become empty (up to, but never including, the Mods folder itself).
 * @returns {Promise<{ ok:true, removed:string[] } | { ok:false, error:{message} }>}
 */
export async function deleteLocalMod({ filePath, modsFolder }) {
  if (!filePath || typeof filePath !== 'string') return err('filePath is required')
  if (!modsFolder || typeof modsFolder !== 'string') return err('modsFolder is required')

  const absFile = resolve(filePath)
  const absFolder = resolve(modsFolder)
  if (!isStrictChild(absFile, absFolder)) {
    return err('File is outside the configured Mods folder')
  }

  const removed = []
  try {
    await shell.trashItem(absFile) // rejects if locked (e.g. game running)
    removed.push(absFile)
  } catch (e) {
    return err(`Could not move to Recycle Bin: ${e.message}`)
  }

  // clean up now-empty parent folders
  let dir = dirname(absFile)
  while (dir.toLowerCase() !== absFolder.toLowerCase() && isStrictChild(dir, absFolder)) {
    let entries
    try {
      entries = await readdir(dir)
    } catch {
      break // already gone or unreadable — stop ascending
    }
    if (entries.length > 0) break
    try {
      await shell.trashItem(dir)
      removed.push(dir)
    } catch {
      break // couldn't trash the empty dir — not fatal
    }
    dir = dirname(dir)
  }

  return { ok: true, removed }
}
