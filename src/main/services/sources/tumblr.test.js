// node src/main/services/sources/tumblr.test.js
import assert from 'assert'
import { extractCcLinks, normalizeTumblrInput, tumblrPostKey } from './tumblr.js'

// --- tumblrPostKey -----------------------------------------------------------
// API url (no slug) and RSS url (with slug) must key to the SAME id,
// or the persisted "already downloaded" marker breaks between fetch paths
assert.equal(
  tumblrPostKey('cc.tumblr.com', 'https://cc.tumblr.com/post/123'),
  tumblrPostKey('cc.tumblr.com', 'https://cc.tumblr.com/post/123/cute-hair')
)
assert.equal(tumblrPostKey('cc.tumblr.com', 'https://cc.tumblr.com/post/123'), 'tumblr:cc.tumblr.com:123')
// no post id in the url → fall back to the url itself
assert.equal(tumblrPostKey('cc.tumblr.com', 'https://cc.tumblr.com/whatever'), 'tumblr:https://cc.tumblr.com/whatever')

// --- normalizeTumblrInput ----------------------------------------------------
assert.equal(normalizeTumblrInput('coolsims'), 'coolsims.tumblr.com')
assert.equal(normalizeTumblrInput('https://coolsims.tumblr.com/post/1'), 'coolsims.tumblr.com')
assert.equal(normalizeTumblrInput('cc.example.com'), 'cc.example.com')
assert.equal(normalizeTumblrInput('not a blog!!'), null)

// --- extractCcLinks ----------------------------------------------------------
// resolvable hosts pass; random hosts don't
assert.deepEqual(
  extractCcLinks('<a href="https://simfileshare.net/download/12345/">DL</a> <a href="https://example.com/page">credit</a>'),
  ['https://simfileshare.net/download/12345/']
)
// direct file links by extension, any host
assert.deepEqual(
  extractCcLinks('<a href="https://cdn.example.com/mods/hair.package">get</a>'),
  ['https://cdn.example.com/mods/hair.package']
)
// patreon post links pass, patreon profile links don't
assert.deepEqual(
  extractCcLinks('<a href="https://www.patreon.com/posts/hair-123">post</a> <a href="https://www.patreon.com/somecreator">profile</a>'),
  ['https://www.patreon.com/posts/hair-123']
)
// t.umblr.com redirect unwrapped (entity-encoded &amp; in RSS HTML)
assert.deepEqual(
  extractCcLinks('<a href="https://t.umblr.com/redirect?z=https%3A%2F%2Fsimfileshare.net%2Fdownload%2F99%2F&amp;t=abc">DL</a>'),
  ['https://simfileshare.net/download/99/']
)
// href.li redirect unwrapped
assert.deepEqual(
  extractCcLinks('<a href="https://href.li/?https://simfileshare.net/download/7/">DL</a>'),
  ['https://simfileshare.net/download/7/']
)
// one-click hosts: mediafire / dropbox / google drive files pass, their folder links don't
assert.deepEqual(
  extractCcLinks(
    '<a href="https://www.mediafire.com/file/abc/hair.zip/file">a</a>' +
    '<a href="https://www.mediafire.com/folder/xyz/stuff">b</a>' +
    '<a href="https://www.dropbox.com/scl/fi/abc/hair.zip?rlkey=k&dl=0">c</a>' +
    '<a href="https://drive.google.com/file/d/FILE_ID/view?usp=sharing">d</a>' +
    '<a href="https://drive.google.com/drive/folders/FOLDER_ID">e</a>'
  ),
  [
    'https://www.mediafire.com/file/abc/hair.zip/file',
    'https://www.dropbox.com/scl/fi/abc/hair.zip?rlkey=k&dl=0',
    'https://drive.google.com/file/d/FILE_ID/view?usp=sharing'
  ]
)

// dedupe + cap at 4
const many = Array.from({ length: 8 }, (_, i) => `<a href="https://simfileshare.net/download/${i % 5}/">x</a>`).join('')
const links = extractCcLinks(many)
assert.equal(links.length, 4)
assert.equal(new Set(links).size, 4)
// junk in, nothing out
assert.deepEqual(extractCcLinks('<a href="mailto:x@y.z">m</a> plain text'), [])
assert.deepEqual(extractCcLinks(''), [])

console.log('tumblr.test.js: all assertions passed')
