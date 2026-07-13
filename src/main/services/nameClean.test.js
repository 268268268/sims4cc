// Self-check for mod-name cleaning. Run: node src/main/services/nameClean.test.js
import { cleanModName } from './localModScanner.js'

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}

// the bug from the screenshot: a name ending in a real newline rendered as "…\n"
check('strips a trailing real newline', cleanModName('壁挂置物架\n') === '壁挂置物架', JSON.stringify(cleanModName('壁挂置物架\n')))
check('strips a literal backslash-n', cleanModName('My Mod\\n') === 'My Mod', JSON.stringify(cleanModName('My Mod\\n')))
check('collapses inner control chars to a space', cleanModName('a\t\r\nb') === 'a b', JSON.stringify(cleanModName('a\t\r\nb')))
check('collapses repeated whitespace', cleanModName('a    b') === 'a b')
check('leaves clean names untouched', cleanModName('Aurum Denim Shorts') === 'Aurum Denim Shorts')
check('handles null/empty gracefully', cleanModName(null) === null && cleanModName('') === '')
check('trims surrounding whitespace', cleanModName('  spaced  ') === 'spaced')

if (failures) process.exit(1)
console.log('ALL NAME-CLEAN TESTS PASSED')
