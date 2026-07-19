// node src/main/services/linkResolver.test.js
import assert from 'assert'
import { findKnownLinks, isBoringHost } from './linkResolver.js'

// plain <a> links and JSON-escaped (Next.js/Linktree payload) links are both found
assert.deepEqual(
  findKnownLinks('<a href="https://simfileshare.net/download/99/">x</a> {"url":"https:\\/\\/www.patreon.com\\/SomeOne\\/posts\\/hair-123"}'),
  ['https://simfileshare.net/download/99/', 'https://www.patreon.com/SomeOne/posts/hair-123']
)
// curseforge mod pages + direct files; dedupe
assert.deepEqual(
  findKnownLinks('https://www.curseforge.com/sims4/build-buy/cozy-set https://cdn.x.y/mods/hair.package https://www.curseforge.com/sims4/build-buy/cozy-set'),
  ['https://www.curseforge.com/sims4/build-buy/cozy-set', 'https://cdn.x.y/mods/hair.package']
)
// boosty posts, mega files, drive folders
assert.deepEqual(
  findKnownLinks('see https://boosty.to/some-one/posts/abc-123 and https://mega.nz/file/AbC#key123 and https://drive.google.com/drive/folders/F0LD3R'),
  ['https://drive.google.com/drive/folders/F0LD3R', 'https://boosty.to/some-one/posts/abc-123', 'https://mega.nz/file/AbC#key123']
)

// nothing known → empty
assert.deepEqual(findKnownLinks('<p>no links here</p> https://example.com/about'), [])

assert.equal(isBoringHost('www.instagram.com'), true)
assert.equal(isBoringHost('ko-fi.com'), true)
assert.equal(isBoringHost('lutessasims.com'), false)

console.log('linkResolver.test.js: all assertions passed')
