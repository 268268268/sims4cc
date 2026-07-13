// Self-check for the archive extractor. Run: node src/main/services/archiveExtractor.test.js
// Covers the security-critical bits: junk filtering, path-traversal flattening
// (a "../escape" entry must stay inside the mod folder), and Tray routing.
import { mkdtemp, rm, readdir, access, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, basename } from 'path'
import AdmZip from 'adm-zip'
import { extractModArchive, safeFolderName, safeFileName, uniqueFilePath } from './archiveExtractor.js'

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}

// --- pure helpers ---
check('safeFolderName strips extension', safeFolderName('Cool Mod.zip') === 'Cool Mod')
check('safeFolderName strips forbidden chars', !/[<>:"/\\|?*]/.test(safeFolderName('a:b/c\\d?e')))
check('safeFolderName falls back', safeFolderName('') === 'mod')
check('safeFolderName caps length', safeFolderName('x'.repeat(200)).length <= 80)
check('safeFileName keeps extension', safeFileName('hair.package') === 'hair.package')
check('safeFileName guards reserved device name', safeFileName('con.package') === '_con.package')

// --- extraction to a temp Mods folder ---
const root = await mkdtemp(join(tmpdir(), 's4mm-test-'))
const modsDir = join(root, 'Mods')
const trayDir = join(root, 'Tray')
await mkdir(modsDir, { recursive: true })
await mkdir(trayDir, { recursive: true })

const zip = new AdmZip()
zip.addFile('good.package', Buffer.from('DBPF-good'))
zip.addFile('nested/deep/inside.package', Buffer.from('DBPF-nested'))
zip.addFile('__MACOSX/._junk', Buffer.from('junk'))          // must be filtered
zip.addFile('.DS_Store', Buffer.from('junk'))                // must be filtered
zip.addFile('../escape.package', Buffer.from('DBPF-evil'))   // zip-slip attempt
zip.addFile('household.trayitem', Buffer.from('tray-bytes')) // must route to Tray
const zipPath = join(root, 'My Mod.zip')
zip.writeZip(zipPath)

const res = await extractModArchive(zipPath, modsDir, 'My Mod', { trayFolder: trayDir })
check('extract ok', res.ok === true, JSON.stringify(res).slice(0, 120))
check('mod folder is inside Mods', res.ok && res.folder.startsWith(modsDir))

const modFiles = res.ok ? (await readdir(res.folder)).sort() : []
check('junk excluded', !modFiles.some(f => /junk|DS_Store/i.test(f)), modFiles.join(','))
check('tray file NOT in mod folder', !modFiles.some(f => /trayitem/i.test(f)), modFiles.join(','))
check('good + nested + escaped-basename all present (flattened)',
  modFiles.includes('good.package') &&
  modFiles.includes('inside.package') &&
  modFiles.includes('escape.package'),
  modFiles.join(','))

// the traversal entry must NOT have escaped one level up, next to Mods/
let escaped = true
try { await access(join(root, 'escape.package')); escaped = false } catch { /* good: not there */ }
check('zip-slip contained (no file written outside Mods)', escaped)

check('tray file routed to Tray', res.ok && res.trayFiles?.length === 1 &&
  basename(res.trayFiles[0]) === 'household.trayitem')

// --- uniqueFilePath avoids clobbering ---
const u1 = await uniqueFilePath(res.folder, 'good.package') // already exists → " (2)"
check('uniqueFilePath suffixes existing', basename(u1) === 'good (2).package', basename(u1))

await rm(root, { recursive: true, force: true }).catch(() => {})

if (failures) process.exit(1)
console.log('ALL ARCHIVE-EXTRACTOR TESTS PASSED')
