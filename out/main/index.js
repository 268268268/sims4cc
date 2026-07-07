"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
require("dotenv/config");
const electron = require("electron");
const path = require("path");
const promises = require("fs/promises");
const url = require("url");
const crypto = require("crypto");
const zlib = require("zlib");
const fs = require("fs");
const stream = require("stream");
const promises$1 = require("stream/promises");
const AdmZip = require("adm-zip");
const THUMB_TYPE = 1008398834;
const DBPF_MAGIC = Buffer.from("DBPF");
const COMP_NONE = 0;
const COMP_ZLIB = 23106;
const MAX_RESOURCE_BYTES = 4 * 1024 * 1024;
let CACHE_DIR = null;
async function cacheDir() {
  if (!CACHE_DIR) {
    const { app } = await import("electron");
    CACHE_DIR = path.join(app.getPath("userData"), "thumb-cache");
  }
  return CACHE_DIR;
}
function getThumbCacheDir() {
  return cacheDir();
}
function imgExt(buf) {
  if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return "jpg";
  if (buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) return "png";
  return null;
}
async function readAt$1(fh, len, pos) {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return buf.slice(0, bytesRead);
}
function decompress(buf, compression) {
  if (compression === COMP_NONE) return buf;
  if (compression === COMP_ZLIB) return zlib.inflateSync(buf);
  return null;
}
async function parseDbpfEntries(filePath) {
  let fh;
  try {
    fh = await promises.open(filePath, "r");
    const header = await readAt$1(fh, 96, 0);
    if (header.length < 96 || !header.slice(0, 4).equals(DBPF_MAGIC)) return null;
    const count = header.readUInt32LE(36);
    const indexSize = header.readUInt32LE(44);
    const indexPos = Number(header.readBigUInt64LE(64));
    if (count < 1 || count > 5e5 || indexPos < 96 || indexSize < 4 || indexSize > 64 * 1024 * 1024) {
      return null;
    }
    const idx = await readAt$1(fh, indexSize, indexPos);
    if (idx.length < indexSize) return null;
    let o = 0;
    const flags = idx.readUInt32LE(o);
    o += 4;
    let cType = 0, cGroup = 0, cInstHi = 0;
    if (flags & 1) {
      cType = idx.readUInt32LE(o);
      o += 4;
    }
    if (flags & 2) {
      cGroup = idx.readUInt32LE(o);
      o += 4;
    }
    if (flags & 4) {
      cInstHi = idx.readUInt32LE(o);
      o += 4;
    }
    const entries = [];
    for (let i = 0; i < count; i++) {
      let type = cType, group = cGroup, instanceHigh = cInstHi;
      if (!(flags & 1)) {
        type = idx.readUInt32LE(o);
        o += 4;
      }
      if (!(flags & 2)) {
        group = idx.readUInt32LE(o);
        o += 4;
      }
      if (!(flags & 4)) {
        instanceHigh = idx.readUInt32LE(o);
        o += 4;
      }
      o += 4;
      const position = idx.readUInt32LE(o);
      o += 4;
      const sizeField = idx.readUInt32LE(o);
      o += 4;
      const size = sizeField & 2147483647;
      const hasExt = (sizeField & 2147483648) !== 0;
      const sizeDecompressed = idx.readUInt32LE(o);
      o += 4;
      let compression = COMP_NONE;
      if (hasExt) {
        compression = idx.readUInt16LE(o);
        o += 4;
      }
      entries.push({ type, group, instanceHigh, position, size, sizeDecompressed, compression });
    }
    return entries;
  } catch {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {
    });
  }
}
async function extractThumbnailBuffer(filePath) {
  const entries = await parseDbpfEntries(filePath);
  if (!entries) return null;
  let fh;
  try {
    fh = await promises.open(filePath, "r");
    const ordered = [
      ...entries.filter((e) => e.type === THUMB_TYPE),
      ...entries.filter((e) => e.type !== THUMB_TYPE)
    ];
    let best = null;
    for (const e of ordered) {
      if (e.sizeDecompressed > MAX_RESOURCE_BYTES || e.size <= 0) continue;
      if (e.compression !== COMP_NONE && e.compression !== COMP_ZLIB) continue;
      let data;
      try {
        data = decompress(await readAt$1(fh, e.size, e.position), e.compression);
      } catch {
        continue;
      }
      const ext = data && imgExt(data);
      if (!ext) continue;
      if (e.type === THUMB_TYPE) return { buffer: data, ext };
      if (!best || data.length > best.buffer.length) best = { buffer: data, ext };
    }
    return best;
  } catch {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {
    });
  }
}
async function getCachedThumbnail(filePath, mtimeMs) {
  try {
    const dir = await cacheDir();
    const key = crypto.createHash("sha1").update(`${filePath}|${mtimeMs}`).digest("hex").slice(0, 16);
    const jpg = path.join(dir, `${key}.jpg`);
    const png = path.join(dir, `${key}.png`);
    const none = path.join(dir, `${key}.none`);
    if (await exists$1(jpg)) return jpg;
    if (await exists$1(png)) return png;
    if (await exists$1(none)) return null;
    const result = await extractThumbnailBuffer(filePath);
    await promises.mkdir(dir, { recursive: true });
    if (!result) {
      await promises.writeFile(none, "").catch(() => {
      });
      return null;
    }
    const out = path.join(dir, `${key}.${result.ext}`);
    await promises.writeFile(out, result.buffer);
    return out;
  } catch {
    return null;
  }
}
async function exists$1(p) {
  try {
    await promises.access(p);
    return true;
  } catch {
    return false;
  }
}
const STBL_MAGIC = Buffer.from("STBL");
function parseStbl(buf) {
  if (buf.length < 12 || !buf.slice(0, 4).equals(STBL_MAGIC)) return null;
  const count = buf.readUInt32LE(6);
  let off = 12;
  for (let i = 0; i < count && off + 10 <= buf.length; i++) {
    off += 8;
    const byteLen = buf.readUInt16LE(off);
    off += 2;
    if (off + byteLen > buf.length) break;
    const raw = buf.slice(off, off + byteLen);
    off += byteLen;
    let str = raw.toString("utf16le");
    str = str.replace(/\u0000+$/, "");
    const trimmed = str.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
const TYPE_LABELS = {
  1008398834: "Thumbnail",
  877907861: "Texture",
  734023391: "Texture (DST)",
  11720834: "Texture (image)",
  55242443: "CAS part",
  832458525: "Object definition",
  1415235194: "Data (SimData)",
  570775514: "String table",
  1612179606: "Python/tuning",
  47570707: "Animation",
  23466547: "Model (geometry)",
  30467933: "Model (material)"
};
const KIND_OF_TYPE = {
  55242443: "CAS",
  832458525: "Object",
  3235601127: "Object",
  // object catalog
  1612179606: "Tuning",
  53690476: "Tuning",
  // XML tuning
  1415235194: "Tuning",
  // SimData rides along with tuning
  47570707: "Animation"
};
const STBL_TYPE = 570775514;
function parseStblV5(buf) {
  if (buf.length < 21 || buf.slice(0, 4).toString("latin1") !== "STBL") return null;
  const version = buf.readUInt16LE(4);
  if (version !== 5) return null;
  let count;
  try {
    count = Number(buf.readBigUInt64LE(7));
  } catch {
    return null;
  }
  if (!count || count > 1e6) return null;
  let off = 21;
  for (let i = 0; i < count && off + 7 <= buf.length; i++) {
    off += 4;
    off += 1;
    const len = buf.readUInt16LE(off);
    off += 2;
    if (off + len > buf.length) break;
    const str = buf.slice(off, off + len).toString("utf8");
    off += len;
    const trimmed = str.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
function parseStblAny(buf) {
  return parseStblV5(buf) ?? parseStbl(buf);
}
let CACHE_PATH$1 = null;
async function cachePath() {
  if (!CACHE_PATH$1) {
    const { app } = await import("electron");
    CACHE_PATH$1 = path.join(app.getPath("userData"), "pkg-meta-cache.json");
  }
  return CACHE_PATH$1;
}
const STBL_READ_CAP = 1 << 20;
const MAX_NAME_LEN = 80;
async function loadMetaCache() {
  try {
    return JSON.parse(await promises.readFile(await cachePath(), "utf-8"));
  } catch {
    return {};
  }
}
async function saveMetaCache(cache2) {
  try {
    await promises.writeFile(await cachePath(), JSON.stringify(cache2), "utf-8");
  } catch {
  }
}
function metaKey(filePath, mtimeMs) {
  return crypto.createHash("sha1").update(`${filePath}|${mtimeMs}`).digest("hex").slice(0, 16);
}
async function readAt(fh, len, pos) {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return buf.slice(0, bytesRead);
}
async function extractName(filePath, entries) {
  const stbls = entries.filter((e) => e.type === STBL_TYPE && e.size > 0 && e.sizeDecompressed <= STBL_READ_CAP);
  if (!stbls.length) return null;
  const ordered = [
    ...stbls.filter((e) => (e.instanceHigh >>> 24 & 255) === 0),
    ...stbls.filter((e) => (e.instanceHigh >>> 24 & 255) !== 0)
  ];
  let fh;
  try {
    fh = await promises.open(filePath, "r");
    for (const e of ordered) {
      try {
        const data = decompress(await readAt(fh, e.size, e.position), e.compression);
        if (!data) continue;
        const name = parseStblAny(data);
        if (name) {
          const trimmed = name.trim();
          if (trimmed && trimmed.length <= MAX_NAME_LEN * 3) return trimmed.slice(0, MAX_NAME_LEN);
        }
      } catch {
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {
    });
  }
}
function extractKinds(entries) {
  const kinds = /* @__PURE__ */ new Set();
  for (const e of entries) {
    const kind = KIND_OF_TYPE[e.type >>> 0];
    if (kind) kinds.add(kind);
    if (kinds.size >= 3) break;
  }
  return [...kinds];
}
async function getPackageMeta(filePath, mtimeMs, cache2) {
  const key = metaKey(filePath, mtimeMs);
  if (cache2 && cache2[key]) return { ...cache2[key], parsed: true };
  const entries = await parseDbpfEntries(filePath);
  if (!entries) {
    const miss = { name: null, kinds: [] };
    if (cache2) cache2[key] = miss;
    return { ...miss, parsed: false };
  }
  const meta = {
    name: await extractName(filePath, entries),
    kinds: extractKinds(entries)
  };
  if (cache2) cache2[key] = meta;
  return { ...meta, parsed: true };
}
const MOD_EXTENSIONS = /* @__PURE__ */ new Set([".package", ".ts4script"]);
const SIDECAR_SUFFIXES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".preview.png",
  ".preview.jpg",
  ".thumbnail.png",
  ".thumbnail.jpg"
];
const FALLBACK_NAMES = ["preview.png", "preview.jpg", "thumbnail.png", "thumbnail.jpg", "cover.png", "cover.jpg"];
function makeId(relativePath) {
  return crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 16);
}
function deriveName(fileName) {
  let n = fileName;
  if (n.endsWith(".disabled")) n = n.slice(0, -9);
  if (n.endsWith(".package")) n = n.slice(0, -8);
  else if (n.endsWith(".ts4script")) n = n.slice(0, -10);
  n = n.replace(/[_-]+/g, " ").trim();
  return n || fileName;
}
function deriveAuthor(relativePath) {
  const parts = relativePath.split(path.sep);
  return parts.length > 1 ? parts[0] : null;
}
function resolveType(fileName) {
  const base = fileName.endsWith(".disabled") ? fileName.slice(0, -9) : fileName;
  if (base.endsWith(".package")) return "package";
  if (base.endsWith(".ts4script")) return "ts4script";
  return "unknown";
}
async function exists(p) {
  try {
    await promises.access(p);
    return true;
  } catch {
    return false;
  }
}
async function detectThumbnail(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  let stem = base;
  if (stem.endsWith(".disabled")) stem = stem.slice(0, -9);
  if (stem.endsWith(".package")) stem = stem.slice(0, -8);
  else if (stem.endsWith(".ts4script")) stem = stem.slice(0, -10);
  for (const suffix of SIDECAR_SUFFIXES) {
    const candidate = path.join(dir, stem + suffix);
    if (await exists(candidate)) return { source: "sidecar", path: candidate };
  }
  for (const name of FALLBACK_NAMES) {
    const candidate = path.join(dir, name);
    if (await exists(candidate)) return { source: "sidecar", path: candidate };
  }
  return { source: "fallback", path: null };
}
async function walkDir(dir, results = []) {
  let entries;
  try {
    entries = await promises.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(full, results);
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}
function isModFile(fileName) {
  if (MOD_EXTENSIONS.has(path.extname(fileName))) return true;
  if (fileName.endsWith(".package.disabled") || fileName.endsWith(".ts4script.disabled")) return true;
  return false;
}
function isArchiveFile(fileName) {
  return path.extname(fileName).toLowerCase() === ".zip";
}
async function buildArchiveDto(filePath, modsFolder) {
  const fileName = path.basename(filePath);
  const relPath = path.relative(modsFolder, filePath);
  let size = 0;
  let modifiedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const info = await promises.stat(filePath);
    size = info.size;
    modifiedAt = info.mtime.toISOString();
  } catch {
  }
  return {
    id: makeId(relPath),
    name: deriveName(fileName.replace(/\.zip$/i, "")),
    author: deriveAuthor(relPath),
    fileName,
    filePath,
    relativePath: relPath,
    folderPath: path.dirname(filePath),
    type: "archive",
    enabled: false,
    size,
    modifiedAt,
    thumbnail: { source: "fallback", path: null },
    parseStatus: "unsupported"
  };
}
async function buildLocalModDto(filePath, modsFolder, metaCache = null) {
  const fileName = path.basename(filePath);
  const relPath = path.relative(modsFolder, filePath);
  const id = makeId(relPath);
  const enabled = !fileName.endsWith(".disabled");
  const type = resolveType(fileName);
  let size = 0;
  let modifiedAt = (/* @__PURE__ */ new Date()).toISOString();
  let dateAdded = null;
  let mtimeMs = 0;
  let parseStatus = "fallback";
  let error;
  try {
    const info = await promises.stat(filePath);
    size = info.size;
    modifiedAt = info.mtime.toISOString();
    dateAdded = info.birthtime?.toISOString() ?? null;
    mtimeMs = info.mtimeMs;
  } catch (err2) {
    error = `stat failed: ${err2.message}`;
    parseStatus = "error";
  }
  let realName = null;
  let kinds = [];
  if (type === "package" && !error) {
    const meta = await getPackageMeta(filePath, mtimeMs, metaCache);
    parseStatus = meta.parsed ? "parsed" : "unsupported";
    realName = meta.name;
    kinds = meta.kinds;
  }
  let thumbnail = await detectThumbnail(filePath);
  if (thumbnail.source === "fallback" && type === "package" && !error) {
    const cached2 = await getCachedThumbnail(filePath, mtimeMs);
    if (cached2) thumbnail = { source: "dbpf", path: cached2 };
  }
  return {
    id,
    name: realName || deriveName(fileName),
    author: deriveAuthor(relPath),
    fileName,
    filePath,
    relativePath: relPath,
    folderPath: path.dirname(filePath),
    type,
    enabled,
    size,
    modifiedAt,
    dateAdded,
    kinds,
    thumbnail,
    parseStatus,
    ...error ? { error } : {}
  };
}
let cachedMods = null;
async function scanMods(modsFolder) {
  const t0 = Date.now();
  const allFiles = await walkDir(modsFolder);
  const modFiles = allFiles.filter((f) => isModFile(path.basename(f)));
  const archiveFiles = allFiles.filter((f) => isArchiveFile(path.basename(f)));
  const mods = [];
  const errors = [];
  const metaCache = await loadMetaCache();
  for (const filePath of modFiles) {
    try {
      const mod = await buildLocalModDto(filePath, modsFolder, metaCache);
      mods.push(mod);
    } catch (err2) {
      errors.push({ file: filePath, message: err2.message });
    }
  }
  for (const filePath of archiveFiles) {
    try {
      mods.push(await buildArchiveDto(filePath, modsFolder));
    } catch (err2) {
      errors.push({ file: filePath, message: err2.message });
    }
  }
  await saveMetaCache(metaCache);
  const folderSize = /* @__PURE__ */ new Map();
  const folderFiles = /* @__PURE__ */ new Map();
  for (const m of mods) {
    folderSize.set(m.folderPath, (folderSize.get(m.folderPath) || 0) + (m.size || 0));
    folderFiles.set(m.folderPath, (folderFiles.get(m.folderPath) || 0) + 1);
  }
  for (const m of mods) {
    m.folderSize = folderSize.get(m.folderPath) || m.size;
    m.folderFiles = folderFiles.get(m.folderPath) || 1;
  }
  cachedMods = mods;
  return { mods, errors, durationMs: Date.now() - t0 };
}
function getCachedLocalMods() {
  return cachedMods ?? [];
}
function clearCachedLocalMods() {
  cachedMods = null;
}
function updateCachedMod(oldPath, mod) {
  if (!cachedMods) return;
  const idx = cachedMods.findIndex((m) => m.filePath === oldPath);
  if (idx !== -1) cachedMods[idx] = mod;
}
const MOD_EXTS$1 = /* @__PURE__ */ new Set([".package", ".ts4script"]);
const TRAY_EXTS = /* @__PURE__ */ new Set([".trayitem", ".householdbinary", ".blueprint", ".room", ".bpi", ".hhi", ".sgi"]);
const JUNK_RE = /(^|[\\/])(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)/i;
const RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
function stripForbidden(s) {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
}
function safeFolderName(name) {
  const clean = stripForbidden(name.replace(/\.(zip|rar|7z)$/i, ""));
  return clean.slice(0, 80) || "mod";
}
function safeFileName(name) {
  const clean = stripForbidden(name);
  if (!clean) return "file";
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  return RESERVED_RE.test(stem) ? `_${clean}` : clean;
}
async function uniqueFilePath(dir, fileName) {
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  for (let i = 1; ; i++) {
    const candidate = path.join(dir, i === 1 ? fileName : `${stem} (${i})${ext}`);
    try {
      await promises.access(candidate);
    } catch {
      return candidate;
    }
  }
}
async function pickTargetFolder(modsFolder, baseName) {
  for (let i = 1; ; i++) {
    const name = i === 1 ? baseName : `${baseName} (${i})`;
    const p = path.join(modsFolder, name);
    try {
      const entries = await promises.readdir(p);
      if (entries.length === 0) return p;
    } catch {
      return p;
    }
  }
}
async function extractModArchive(zipPath, modsFolder, nameHint, opts = {}) {
  const trayFolder = opts.trayFolder ?? null;
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (err2) {
    return { ok: false, error: `Not a readable zip archive: ${err2.message}` };
  }
  let entries;
  try {
    entries = zip.getEntries().filter((e) => !e.isDirectory && !JUNK_RE.test(e.entryName));
  } catch (err2) {
    return { ok: false, error: `Corrupt zip index: ${err2.message}` };
  }
  const hasModFile = entries.some((e) => MOD_EXTS$1.has(path.extname(e.entryName).toLowerCase()));
  if (!hasModFile) {
    return { ok: false, error: "No Sims 4 mod files (.package / .ts4script) found in the archive." };
  }
  const trayEntries = trayFolder ? entries.filter((e) => TRAY_EXTS.has(path.extname(e.entryName).toLowerCase())) : [];
  const modEntries = trayFolder ? entries.filter((e) => !TRAY_EXTS.has(path.extname(e.entryName).toLowerCase())) : entries;
  const folder = await pickTargetFolder(modsFolder, safeFolderName(nameHint || path.basename(zipPath)));
  try {
    await promises.mkdir(folder, { recursive: true });
  } catch (err2) {
    return { ok: false, error: `Could not create mod folder: ${err2.message}` };
  }
  const used = /* @__PURE__ */ new Set();
  const targetNameFor = (entryName) => {
    const base = safeFileName(path.basename(entryName));
    if (!used.has(base.toLowerCase())) {
      used.add(base.toLowerCase());
      return base;
    }
    const parent = path.basename(path.dirname(entryName));
    const prefixed = parent && parent !== "." ? `${safeFolderName(parent)}_${base}` : base;
    let candidate = prefixed;
    let i = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${i++}_${prefixed}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };
  const files = [];
  const trayFiles = [];
  try {
    for (const entry of modEntries) {
      const target = path.join(folder, targetNameFor(entry.entryName));
      const data = entry.getData();
      await promises.writeFile(target, data);
      files.push(target);
    }
    for (const entry of trayEntries) {
      const target = await uniqueFilePath(trayFolder, safeFileName(path.basename(entry.entryName)));
      const data = entry.getData();
      await promises.writeFile(target, data);
      trayFiles.push(target);
    }
  } catch (err2) {
    for (const f of [...files, ...trayFiles]) await promises.unlink(f).catch(() => {
    });
    await promises.rmdir(folder).catch(() => {
    });
    return { ok: false, error: `Extraction failed: ${err2.message}` };
  }
  console.log(`[archiveExtractor] Extracted ${files.length} file(s) from ${path.basename(zipPath)} → ${folder}${trayFiles.length ? ` + ${trayFiles.length} tray file(s)` : ""}`);
  return { ok: true, folder, files, trayFiles };
}
const __vite_import_meta_env__ = {};
const API_BASE = "https://api.curseforge.com/v1";
const SIMS4_GAME_ID = 78062;
async function searchMods(params = {}) {
  const { searchFilter = "", categoryId, index = 0, pageSize = 50, sortField, sortOrder } = params;
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.error("DEBUG: CURSEFORGE_API_KEY is missing — check .env / Settings.");
    return { data: [], pagination: null, error: "CurseForge API key is not set. Add it in Settings or .env." };
  }
  const url2 = new URL(`${API_BASE}/mods/search`);
  url2.searchParams.set("gameId", SIMS4_GAME_ID);
  if (searchFilter) url2.searchParams.set("searchFilter", searchFilter);
  if (categoryId != null) url2.searchParams.set("categoryId", categoryId);
  if (sortField != null) {
    url2.searchParams.set("sortField", sortField);
    url2.searchParams.set("sortOrder", sortOrder === "asc" ? "asc" : "desc");
  }
  url2.searchParams.set("index", index);
  url2.searchParams.set("pageSize", pageSize);
  console.log("DEBUG: Fetching CurseForge URL:", url2.toString());
  try {
    const res = await fetch(url2, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("DEBUG: CurseForge API Error:", res.status, res.statusText, body);
      return {
        data: [],
        pagination: null,
        error: `CurseForge API error: ${res.status} ${res.statusText}`
      };
    }
    const json = await res.json();
    const data = json.data ?? [];
    console.log("DEBUG: Response keys:", Object.keys(json));
    console.log(
      "DEBUG: Parsed — totalCount:",
      json.pagination?.totalCount,
      "| returned:",
      data.length,
      "| sample:",
      data[0] ? `${data[0].id} ${data[0].name}` : "none"
    );
    return { data, pagination: json.pagination ?? null };
  } catch (err2) {
    console.error("[curseForgeClient] searchMods failed:", err2);
    return { data: [], pagination: null, error: err2.message };
  }
}
async function getApiKey() {
  if (process.env.CURSEFORGE_API_KEY) return process.env.CURSEFORGE_API_KEY;
  if (__vite_import_meta_env__?.MAIN_VITE_CURSEFORGE_API_KEY) return void 0;
  try {
    const { readConfig: readConfig2 } = await Promise.resolve().then(() => configStore);
    return (await readConfig2()).curseForgeApiKey || null;
  } catch {
    return null;
  }
}
function pickLatestFile(mod) {
  const files = mod?.latestFiles ?? [];
  if (!files.length) return null;
  return [...files].sort((a, b) => {
    const d = new Date(b.fileDate ?? 0) - new Date(a.fileDate ?? 0);
    return d !== 0 ? d : (b.id ?? 0) - (a.id ?? 0);
  })[0];
}
const modsByIdCache = /* @__PURE__ */ new Map();
async function getModsByIds(modIds, { force = false } = {}) {
  const ids = [...new Set((modIds ?? []).map(Number).filter(Boolean))];
  if (!ids.length) return { data: [] };
  const apiKey = await getApiKey();
  if (!apiKey) return { data: [], error: "CurseForge API key is not set." };
  const missing = force ? ids : ids.filter((id) => !modsByIdCache.has(id));
  let error;
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    try {
      const res = await fetch(`${API_BASE}/mods`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ modIds: chunk }),
        signal: AbortSignal.timeout(2e4)
      });
      if (!res.ok) {
        error = `CurseForge batch error: ${res.status} ${res.statusText}`;
        continue;
      }
      const json = await res.json();
      for (const mod of json.data ?? []) modsByIdCache.set(mod.id, mod);
    } catch (err2) {
      error = err2.message;
    }
  }
  return { data: ids.map((id) => modsByIdCache.get(id)).filter(Boolean), ...error ? { error } : {} };
}
const descriptionCache = /* @__PURE__ */ new Map();
const ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "p",
  "br",
  "a",
  "b",
  "i",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "code",
  "pre",
  "span",
  "div",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "hr"
]);
async function getModDescription(modId) {
  const id = Number(modId);
  if (!id) return { html: "", error: "Invalid mod id." };
  if (descriptionCache.has(id)) return { html: descriptionCache.get(id) };
  const apiKey = await getApiKey();
  if (!apiKey) return { html: "", error: "CurseForge API key is not set." };
  try {
    const res = await fetch(`${API_BASE}/mods/${id}/description`, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) return { html: "", error: `CurseForge description error: ${res.status}` };
    const json = await res.json();
    const raw = json.data ?? "";
    const cheerio = await import("cheerio");
    const $ = cheerio.load(raw);
    $("script, style, iframe, object, embed, form, link, meta").remove();
    $("body *").each((_, el) => {
      if (el.type !== "tag") return;
      if (!ALLOWED_TAGS.has(el.tagName?.toLowerCase())) {
        $(el).replaceWith($(el).contents());
        return;
      }
      const attribs = { ...el.attribs };
      for (const attr of Object.keys(attribs)) {
        const val = attribs[attr] ?? "";
        const keep = attr === "href" && /^https:/i.test(val) || attr === "src" && /^https:/i.test(val);
        if (!keep) $(el).removeAttr(attr);
      }
    });
    const html = $("body").html() ?? "";
    descriptionCache.set(id, html);
    return { html };
  } catch (err2) {
    return { html: "", error: err2.message };
  }
}
let categoriesCache = null;
async function getCategories() {
  if (categoriesCache) return categoriesCache;
  const apiKey = await getApiKey();
  if (!apiKey) return { data: [], error: "CurseForge API key is not set." };
  try {
    const url2 = new URL(`${API_BASE}/categories`);
    url2.searchParams.set("gameId", SIMS4_GAME_ID);
    const res = await fetch(url2, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { data: [], error: `CurseForge categories error: ${res.status} ${res.statusText} ${body}` };
    }
    const json = await res.json();
    const data = (json.data ?? []).filter((c) => c && c.name && !c.isClass).sort((a, b) => a.name.localeCompare(b.name));
    categoriesCache = { data };
    return categoriesCache;
  } catch (err2) {
    return { data: [], error: err2.message };
  }
}
async function downloadMod(mod, destinationFolder, opts = {}) {
  const { onProgress = null, trayFolder = null } = opts;
  if (!mod || !mod.id) return { ok: false, error: "Invalid mod object." };
  if (!destinationFolder) return { ok: false, error: "Destination folder not provided." };
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { ok: false, error: "CurseForge API key is not set. Add it in Settings or .env." };
  }
  const file = pickLatestFile(mod);
  if (!file || !file.id) {
    return { ok: false, error: "This mod has no downloadable file." };
  }
  let downloadUrl = file.downloadUrl;
  if (!downloadUrl) {
    try {
      const urlRes = await fetch(
        `${API_BASE}/mods/${mod.id}/files/${file.id}/download-url`,
        {
          headers: { Accept: "application/json", "x-api-key": apiKey },
          signal: AbortSignal.timeout(15e3)
        }
      );
      if (!urlRes.ok) {
        const body = await urlRes.text().catch(() => "");
        return { ok: false, error: `Failed to resolve download URL (${urlRes.status}): ${body}` };
      }
      const urlJson = await urlRes.json();
      downloadUrl = urlJson?.data;
      if (!downloadUrl) return { ok: false, error: "CurseForge returned no download URL." };
    } catch (err2) {
      return { ok: false, error: `download-url request failed: ${err2.message}` };
    }
  }
  const fileName = path.basename(file.fileName || `${mod.id}_${file.id}.zip`);
  const destPath = path.join(destinationFolder, fileName);
  const partPath = destPath + ".part";
  const IDLE_TIMEOUT_MS2 = 3e4;
  const controller = new AbortController();
  let idleTimer;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => controller.abort(new Error(`Download stalled (no data for ${IDLE_TIMEOUT_MS2 / 1e3}s)`)),
      IDLE_TIMEOUT_MS2
    );
  };
  try {
    resetIdle();
    const res = await fetch(downloadUrl, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `Download failed: HTTP ${res.status} ${res.statusText}` };
    }
    if (!res.body) {
      return { ok: false, error: "Download failed: empty response body." };
    }
    let bytes = 0;
    const total = Number(res.headers.get("content-length")) || file.fileLength || null;
    let lastTick = 0;
    const body = stream.Readable.fromWeb(res.body);
    body.on("data", (chunk) => {
      bytes += chunk.length;
      resetIdle();
      const now = Date.now();
      if (onProgress && (now - lastTick > 250 || bytes === total)) {
        lastTick = now;
        try {
          onProgress({ received: bytes, total, phase: "downloading" });
        } catch {
        }
      }
    });
    await promises$1.pipeline(body, fs.createWriteStream(partPath));
    await promises.rename(partPath, destPath);
    console.log(`[curseForgeClient] Saved ${fileName} (${bytes} bytes) → ${destPath}`);
    if (/\.zip$/i.test(fileName)) {
      if (onProgress) {
        try {
          onProgress({ received: bytes, total, phase: "installing" });
        } catch {
        }
      }
      const extracted = await extractModArchive(destPath, destinationFolder, mod.name, { trayFolder });
      if (!extracted.ok) {
        return { ok: false, error: `Downloaded, but not installed: ${extracted.error}` };
      }
      await promises.unlink(destPath).catch(() => {
      });
      return { ok: true, path: extracted.folder, files: extracted.files, trayFiles: extracted.trayFiles ?? [] };
    }
    return { ok: true, path: destPath };
  } catch (err2) {
    await promises.unlink(partPath).catch(() => {
    });
    return { ok: false, error: `Download/write failed: ${err2?.message ?? err2}` };
  } finally {
    clearTimeout(idleTimer);
  }
}
const STORE_PATH$1 = path.join(electron.app.getPath("userData"), "downloads.json");
async function readStore() {
  try {
    return JSON.parse(await promises.readFile(STORE_PATH$1, "utf-8"));
  } catch {
    return {};
  }
}
async function writeStore(data) {
  await promises.writeFile(STORE_PATH$1, JSON.stringify(data, null, 2), "utf-8");
}
async function recordDownload(mod, result) {
  if (!mod?.id) return;
  const store = await readStore();
  store[String(mod.id)] = {
    name: mod.name ?? null,
    path: result?.path ?? null,
    // extracted folder or the .package file on disk
    // must match what downloadMod actually installed (pickLatestFile, not [0])
    fileId: pickLatestFile(mod)?.id ?? null,
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeStore(store).catch(() => {
  });
}
async function getDownloaded() {
  const store = await readStore();
  const alive = {};
  let changed = false;
  for (const [id, rec] of Object.entries(store)) {
    if (rec?.path) {
      try {
        await promises.access(rec.path);
        alive[id] = rec;
      } catch {
        changed = true;
      }
    } else {
      alive[id] = rec;
    }
  }
  if (changed) await writeStore(alive).catch(() => {
  });
  return alive;
}
function labelFor(type) {
  return TYPE_LABELS[type >>> 0] || `Other (0x${(type >>> 0).toString(16)})`;
}
async function inspectLocalMod(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "No file path given." };
  }
  const folder = path.dirname(filePath);
  const result = { ok: true, folder, files: [], packageContents: null };
  try {
    const names = await promises.readdir(folder, { withFileTypes: true });
    for (const ent of names) {
      if (!ent.isFile()) continue;
      const full = path.join(folder, ent.name);
      let size = 0;
      try {
        size = (await promises.stat(full)).size;
      } catch {
      }
      result.files.push({
        name: ent.name,
        size,
        ext: path.extname(ent.name).toLowerCase(),
        isSelf: full.toLowerCase() === filePath.toLowerCase()
      });
    }
    result.files.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err2) {
    result.error = `Could not read folder: ${err2.message}`;
  }
  if (/\.package(\.disabled)?$/i.test(path.basename(filePath))) {
    try {
      const entries = await parseDbpfEntries(filePath);
      if (entries) {
        const counts = /* @__PURE__ */ new Map();
        for (const e of entries) {
          const label = labelFor(e.type);
          counts.set(label, (counts.get(label) || 0) + 1);
        }
        result.packageContents = {
          total: entries.length,
          types: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
        };
      }
    } catch {
    }
  }
  return result;
}
const err$1 = (message) => ({ ok: false, error: { message } });
function isStrictChild(absFile, absFolder) {
  if (absFile.toLowerCase() === absFolder.toLowerCase()) return false;
  const rel = absFile.slice(absFolder.length);
  return absFile.toLowerCase().startsWith(absFolder.toLowerCase()) && rel.startsWith(path.sep);
}
async function deleteLocalMod({ filePath, modsFolder }) {
  if (!filePath || typeof filePath !== "string") return err$1("filePath is required");
  if (!modsFolder || typeof modsFolder !== "string") return err$1("modsFolder is required");
  const absFile = path.resolve(filePath);
  const absFolder = path.resolve(modsFolder);
  if (!isStrictChild(absFile, absFolder)) {
    return err$1("File is outside the configured Mods folder");
  }
  const removed = [];
  try {
    await electron.shell.trashItem(absFile);
    removed.push(absFile);
  } catch (e) {
    return err$1(`Could not move to Recycle Bin: ${e.message}`);
  }
  let dir = path.dirname(absFile);
  while (dir.toLowerCase() !== absFolder.toLowerCase() && isStrictChild(dir, absFolder)) {
    let entries;
    try {
      entries = await promises.readdir(dir);
    } catch {
      break;
    }
    if (entries.length > 0) break;
    try {
      await electron.shell.trashItem(dir);
      removed.push(dir);
    } catch {
      break;
    }
    dir = path.dirname(dir);
  }
  return { ok: true, removed };
}
const MOD_EXTS = /* @__PURE__ */ new Set([".package", ".ts4script"]);
function isInside(absFile, absFolder) {
  const rel = absFile.slice(absFolder.length);
  return absFile.toLowerCase().startsWith(absFolder.toLowerCase()) && (rel === "" || rel.startsWith(path.sep));
}
async function importFiles({ paths, modsFolder, trayFolder }) {
  const absFolder = path.resolve(modsFolder);
  const results = [];
  for (const source of Array.isArray(paths) ? paths : []) {
    const name = path.basename(source);
    const ext = path.extname(source).toLowerCase();
    try {
      const info = await promises.stat(source);
      if (info.isDirectory()) {
        results.push({ source, kind: "rejected", ok: false, error: "Drop files, not folders." });
        continue;
      }
      if (ext === ".zip") {
        const res = await extractModArchive(source, absFolder, name, { trayFolder });
        results.push(res.ok ? { source, kind: "zip", ok: true, folder: res.folder, files: res.files, trayFiles: res.trayFiles } : { source, kind: "zip", ok: false, error: res.error });
        continue;
      }
      if (MOD_EXTS.has(ext)) {
        if (isInside(path.resolve(source), absFolder)) {
          results.push({ source, kind: "package", ok: true, dest: source, note: "Already in the Mods folder." });
          continue;
        }
        const dest = await uniqueFilePath(absFolder, safeFileName(name));
        await promises.copyFile(source, dest);
        results.push({ source, kind: ext === ".ts4script" ? "script" : "package", ok: true, dest });
        continue;
      }
      if (TRAY_EXTS.has(ext)) {
        const targetDir = trayFolder ?? absFolder;
        const dest = await uniqueFilePath(targetDir, safeFileName(name));
        await promises.copyFile(source, dest);
        results.push({ source, kind: "tray", ok: true, dest, note: trayFolder ? "Installed to Tray." : "No Tray folder found — placed in Mods." });
        continue;
      }
      results.push({ source, kind: "rejected", ok: false, error: `Not a Sims 4 mod file (${ext || "no extension"}).` });
    } catch (err2) {
      results.push({ source, kind: "rejected", ok: false, error: err2.message });
    }
  }
  return { ok: results.some((r) => r.ok), results };
}
let lastCheck = null;
function invalidateUpdateCache() {
  lastCheck = null;
}
async function checkUpdates({ force = false } = {}) {
  if (lastCheck && !force) return lastCheck;
  const downloaded = await getDownloaded();
  const ids = Object.keys(downloaded).map(Number);
  if (!ids.length) {
    lastCheck = { ok: true, checkedAt: (/* @__PURE__ */ new Date()).toISOString(), updates: [], mods: [] };
    return lastCheck;
  }
  const { data: mods, error } = await getModsByIds(ids, { force });
  if (error && !mods.length) return { ok: false, error };
  const byId = new Map(mods.map((m) => [m.id, m]));
  const updates = [];
  for (const [idStr, rec] of Object.entries(downloaded)) {
    const modId = Number(idStr);
    const mod = byId.get(modId);
    if (!mod) {
      updates.push({ modId, name: rec.name, found: false, updateAvailable: false });
      continue;
    }
    const latest = pickLatestFile(mod);
    updates.push({
      modId,
      name: mod.name ?? rec.name,
      found: true,
      installedFileId: rec.fileId ?? null,
      latestFileId: latest?.id ?? null,
      latestFileName: latest?.fileName ?? null,
      latestFileDate: latest?.fileDate ?? null,
      // fileId null on legacy records → unknown; re-download to start tracking
      updateAvailable: rec.fileId != null && latest?.id != null ? latest.id !== rec.fileId : null
    });
  }
  lastCheck = { ok: true, checkedAt: (/* @__PURE__ */ new Date()).toISOString(), updates, mods, ...error ? { error } : {} };
  return lastCheck;
}
async function updateInstalledMod(mod, modsFolder, opts = {}) {
  const downloaded = await getDownloaded();
  const rec = downloaded[String(mod?.id)];
  if (rec?.path) {
    const absOld = path.resolve(rec.path);
    const absFolder = path.resolve(modsFolder);
    const rel = absOld.slice(absFolder.length);
    const inside = absOld.toLowerCase().startsWith(absFolder.toLowerCase()) && rel !== "" && rel.startsWith(path.sep);
    if (!inside) {
      return { ok: false, error: "Recorded install path is outside the Mods folder — refusing to remove it." };
    }
    try {
      await electron.shell.trashItem(absOld);
    } catch (e) {
      if (!/no such file|not found|ENOENT/i.test(e.message ?? "")) {
        return { ok: false, error: `Could not remove the old version (is the game running?): ${e.message}` };
      }
    }
  }
  const res = await downloadMod(mod, modsFolder, opts);
  if (!res.ok) {
    return {
      ok: false,
      error: `${res.error} — the previous version was moved to the Recycle Bin and can be restored from there.`
    };
  }
  await recordDownload(mod, res);
  invalidateUpdateCache();
  return res;
}
let STORE_PATH = null;
function storePath() {
  if (!STORE_PATH) STORE_PATH = path.join(electron.app.getPath("userData"), "sources.json");
  return STORE_PATH;
}
async function listSources() {
  try {
    const list = JSON.parse(await promises.readFile(storePath(), "utf-8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
async function save(list) {
  await promises.writeFile(storePath(), JSON.stringify(list, null, 2), "utf-8");
}
async function addSource({ type, input, label }) {
  const list = await listSources();
  const id = crypto.createHash("sha1").update(`${type}|${input}`.toLowerCase()).digest("hex").slice(0, 10);
  if (list.some((s) => s.id === id)) return { ok: false, error: "This source is already added." };
  const entry = { id, type, input, label, addedAt: (/* @__PURE__ */ new Date()).toISOString() };
  list.push(entry);
  await save(list);
  return { ok: true, source: entry };
}
async function addManySources(entries) {
  const list = await listSources();
  const have = new Set(list.map((s) => s.id));
  let added = 0;
  for (const e of entries ?? []) {
    if (!e?.type || !e?.input) continue;
    const id = crypto.createHash("sha1").update(`${e.type}|${e.input}`.toLowerCase()).digest("hex").slice(0, 10);
    if (have.has(id)) continue;
    have.add(id);
    list.push({ id, type: e.type, input: e.input, label: e.label ?? e.input, addedAt: (/* @__PURE__ */ new Date()).toISOString() });
    added++;
  }
  if (added) await save(list);
  return { ok: true, added };
}
async function removeSource(id) {
  const list = await listSources();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return { ok: false, error: "Source not found." };
  await save(next);
  return { ok: true };
}
const SUGGESTED_SOURCES = [
  // ---- Patreon creators ----
  { type: "patreon", input: "okruee", label: "okruee", tag: "CAS · free files" },
  { type: "patreon", input: "littledica", label: "littledica", tag: "Build/Buy · free files" },
  { type: "patreon", input: "ravasheen", label: "RAVASHEEN", tag: "Build/Buy" },
  { type: "patreon", input: "simstrouble", label: "simstrouble", tag: "CAS" },
  { type: "patreon", input: "sixamcc", label: "sixamcc", tag: "Objects" },
  { type: "patreon", input: "aharris00britney", label: "aharris00britney", tag: "CAS" },
  { type: "patreon", input: "dreamteamsims", label: "dreamteamsims", tag: "Build/Buy" },
  { type: "patreon", input: "sentate", label: "Sentate", tag: "Clothing" },
  { type: "patreon", input: "joliebean", label: "joliebean", tag: "CAS" },
  { type: "patreon", input: "brazenlotus", label: "brazenlotus", tag: "Build/Buy" },
  { type: "patreon", input: "katverse", label: "katverse", tag: "CAS" },
  { type: "patreon", input: "myshunosun", label: "myshunosun", tag: "CAS" },
  { type: "patreon", input: "saruin", label: "Saruin", tag: "Clothing" },
  { type: "patreon", input: "pralinesims", label: "pralinesims", tag: "Hair · Makeup" },
  { type: "patreon", input: "harrie", label: "Captain Harrie", tag: "Build/Buy" },
  { type: "patreon", input: "arethabee", label: "arethabee", tag: "CAS" },
  { type: "patreon", input: "twistedcat", label: "twistedcat", tag: "CAS" },
  { type: "patreon", input: "llazyneiph", label: "llazyneiph", tag: "CAS" },
  { type: "patreon", input: "natalia-auditore", label: "Natalia-Auditore", tag: "CAS" },
  { type: "patreon", input: "wistfulcastle", label: "Wistful Castle", tag: "Build/Buy" },
  // ---- Tumblr CC hubs (huge variety of finds) ----
  { type: "tumblr", input: "maxismatchccworld", label: "Maxis Match CC World", tag: "Finds hub" },
  { type: "tumblr", input: "emilyccfinds", label: "Emily CC Finds", tag: "Finds hub" },
  { type: "tumblr", input: "mmfinds", label: "MMFINDS", tag: "Finds hub" },
  { type: "tumblr", input: "thesimscatalog", label: "The Sims Catalog", tag: "Finds hub" },
  { type: "tumblr", input: "citrontart", label: "CITRONTART", tag: "CAS" },
  { type: "tumblr", input: "peppermint-ginger", label: "peppermint & ginger", tag: "Finds hub" },
  { type: "tumblr", input: "zx-ta", label: "Zx-Ta", tag: "CAS" },
  { type: "tumblr", input: "ts4-maxis-match", label: "Sims 4 Maxis Match", tag: "Finds hub" }
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
let fetchImpl = (url2, init) => fetch(url2, init);
function setFetchImpl(fn) {
  fetchImpl = fn;
}
function httpFetch(url2, init = {}) {
  return fetchImpl(url2, {
    redirect: "follow",
    ...init,
    headers: { "User-Agent": UA, ...init.headers || {} }
  });
}
async function fetchText(url2, accept = "*/*") {
  const res = await httpFetch(url2, { headers: { Accept: accept }, signal: AbortSignal.timeout(2e4) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url2).hostname}`);
  return res.text();
}
async function fetchJson(url2) {
  const res = await httpFetch(url2, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(2e4) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url2).hostname}`);
  return res.json();
}
async function parseRss(xml) {
  const cheerio = await import("cheerio");
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];
  $("item").each((_, el) => {
    const $el = $(el);
    items.push({
      title: $el.find("title").first().text().trim(),
      link: $el.find("link").first().text().trim(),
      description: $el.find("description").first().text(),
      // escaped HTML already decoded by parser
      pubDate: $el.find("pubDate").first().text().trim() || null,
      categories: $el.find("category").map((_2, c) => $(c).text().trim()).get()
    });
  });
  return items;
}
async function firstImage(html) {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}
function decodeEntities(s) {
  if (!s) return "";
  return String(s).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#0?39;|&rsquo;|&lsquo;/g, "'").replace(/&rdquo;|&ldquo;/g, '"').replace(/&hellip;/g, "…").replace(/&#(\d+);/g, (_, n) => {
    try {
      return String.fromCodePoint(+n);
    } catch {
      return "";
    }
  });
}
async function stripHtml(html, cap = 220) {
  if (!html) return "";
  const text = decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return text.length > cap ? text.slice(0, cap - 1) + "…" : text;
}
function toIso(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function normalizeTumblrInput(input) {
  let s = String(input ?? "").trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!s.includes(".")) s = `${s}.tumblr.com`;
  return /^[\w-]+(\.[\w-]+)+$/.test(s) ? s : null;
}
async function fetchTumblr(input, sourceId) {
  const host = normalizeTumblrInput(input);
  if (!host) throw new Error("Not a valid Tumblr blog name or URL.");
  const xml = await fetchText(`https://${host}/rss`, "application/rss+xml, text/xml");
  const rssTitle = decodeEntities(xml.match(/<title>([^<]{1,80})<\/title>/)?.[1]?.trim());
  const items = [];
  for (const it of await parseRss(xml)) {
    items.push({
      id: `tumblr:${it.link || it.title}`,
      sourceId,
      sourceType: "tumblr",
      title: decodeEntities(it.title) || await stripHtml(it.description, 80) || "Untitled post",
      url: it.link,
      imageUrl: await firstImage(it.description),
      summary: await stripHtml(it.description),
      author: host.replace(".tumblr.com", ""),
      date: toIso(it.pubDate),
      locked: false,
      tags: it.categories?.slice(0, 6) ?? []
    });
  }
  return { label: rssTitle || host, items };
}
function pinterestFeedUrl(input) {
  let s = String(input ?? "").trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\/(www\.)?pinterest\.[a-z.]+\//i, "").replace(/^\/+|\/+$/g, "");
  const parts = s.split("/").filter(Boolean);
  if (!parts.length || parts.some((p) => !/^[\w.-]+$/.test(p))) return null;
  if (parts.length === 1) return `https://www.pinterest.com/${parts[0]}/feed.rss`;
  return `https://www.pinterest.com/${parts[0]}/${parts[1]}.rss`;
}
async function fetchPinterest(input, sourceId) {
  const feed = pinterestFeedUrl(input);
  if (!feed) throw new Error('Not a valid Pinterest user or board (use "user" or "user/board").');
  const xml = await fetchText(feed, "application/rss+xml, text/xml");
  const rssTitle = decodeEntities(xml.match(/<title>([^<]{1,80})<\/title>/)?.[1]?.trim());
  const user = feed.split("/")[3];
  const items = [];
  for (const it of await parseRss(xml)) {
    items.push({
      id: `pinterest:${it.link || it.title}`,
      sourceId,
      sourceType: "pinterest",
      title: decodeEntities(it.title) || "Pin",
      url: it.link,
      // pin thumbnails live inside the description; upscale 236x → 564x for cards
      imageUrl: (await firstImage(it.description))?.replace("/236x/", "/564x/") ?? null,
      summary: "",
      author: user,
      date: toIso(it.pubDate),
      locked: false,
      tags: []
    });
  }
  return { label: rssTitle || `Pinterest: ${user}`, items };
}
const campaignCache = /* @__PURE__ */ new Map();
function normalizePatreonInput(input) {
  let s = String(input ?? "").trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\/(www\.)?patreon\.com\//i, "").replace(/^c\//i, "").replace(/[/?#].*$/, "");
  return /^[\w.-]+$/.test(s) ? s : null;
}
async function resolveCampaign(slug) {
  if (campaignCache.has(slug)) return campaignCache.get(slug);
  const res = await httpFetch(`https://www.patreon.com/${slug}`, {
    headers: { Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(2e4)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for patreon.com`);
  const html = await res.text();
  const id = html.match(/patreon-media\/p\/campaign\/(\d+)/)?.[1] ?? html.match(/"campaign_id[\\"]*[:=][\\"]*(\d+)/)?.[1] ?? null;
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,90})/i)?.[1] ?? "";
  const rawName = og.match(/Get more from (.+?) on Patreon/i)?.[1] || slug;
  const name = rawName.replace(/&#x27;|&#0?39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim() || slug;
  if (!id) throw new Error(`Could not find the Patreon campaign for "${slug}".`);
  const resolved = { id, name };
  campaignCache.set(slug, resolved);
  return resolved;
}
async function fetchPatreon(input, sourceId) {
  const slug = normalizePatreonInput(input);
  if (!slug) throw new Error("Not a valid Patreon creator name or URL.");
  const campaign = await resolveCampaign(slug);
  const api = `https://www.patreon.com/api/posts?filter[campaign_id]=${campaign.id}&filter[contains_exclusive_posts]=true&sort=-published_at&json-api-version=1.0&json-api-use-default-includes=false&include=attachments&fields[post]=title,teaser_text,content,url,published_at,current_user_can_view,is_paid,image&fields[attachment]=name,url&page[count]=30`;
  const json = await fetchJson(api);
  const attById = {};
  for (const inc of json.included ?? []) {
    if (inc.type === "attachment") attById[inc.id] = inc.attributes;
  }
  const items = [];
  for (const post of json.data ?? []) {
    const a = post.attributes ?? {};
    const viewable = a.current_user_can_view !== false;
    const rels = post.relationships?.attachments?.data ?? [];
    const attachments = rels.map((r) => attById[r.id]).filter((a2) => a2?.url && a2?.name);
    const downloads = viewable ? attachments.filter((a2) => isInstallable(a2.name)).map((a2) => ({
      name: a2.name,
      url: a2.url,
      via: "patreon-attachment"
    })) : [];
    items.push({
      id: `patreon:${post.id}`,
      sourceId,
      sourceType: "patreon",
      title: a.title || "Untitled post",
      url: a.url,
      imageUrl: a.image?.thumb_url || a.image?.url || null,
      summary: await stripHtml(a.teaser_text ?? ""),
      author: campaign.name,
      date: toIso(a.published_at),
      locked: !viewable,
      downloads,
      tags: []
    });
  }
  return { label: campaign.name, items };
}
function isInstallable(name) {
  return /\.(zip|package|ts4script)$/i.test(String(name ?? ""));
}
const BASE = "https://modthesims.info";
async function fetchModTheSims(_input, sourceId) {
  const html = await fetchText(`${BASE}/downloads/ts4`, "text/html");
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  const items = [];
  $(".smol-card-component").each((_, el) => {
    const $el = $(el);
    const link = $el.find(".downloadtitle a").attr("href");
    const title = $el.find(".downloadtitle a").text().trim();
    if (!link || !title) return;
    let img = $el.find("img.featuredimage").attr("src") || $el.find(".thumbnailwrapper img").attr("src") || null;
    if (img?.startsWith("//")) img = "https:" + img;
    const author = $el.find(".downloadcreatorname a").first().text().trim() || null;
    const updatedText = $el.find(".downloadcreator").text().replace(/\s+/g, " ").trim();
    items.push({
      id: `mts:${link}`,
      sourceId,
      sourceType: "modthesims",
      title,
      url: link.startsWith("http") ? link : BASE + link,
      imageUrl: img,
      summary: updatedText.replace(/^by\s+\S+\s*/, ""),
      author,
      date: toIso(updatedText.match(/updated\s+(\d{1,2}\s+\w+\s+\d{4})/)?.[1]) ?? null,
      locked: false,
      tags: []
    });
  });
  if (!items.length) throw new Error("ModTheSims page layout changed — no items parsed.");
  return { label: "ModTheSims · Sims 4", items };
}
const ADAPTERS = {
  tumblr: fetchTumblr,
  pinterest: fetchPinterest,
  patreon: fetchPatreon,
  modthesims: fetchModTheSims
};
const SOURCE_TYPES = [
  { type: "patreon", label: "Patreon", hint: "creator name or patreon.com URL" },
  { type: "pinterest", label: "Pinterest", hint: '"user" or "user/board"' },
  { type: "tumblr", label: "Tumblr", hint: "blog name or URL" }
];
const BUILTINS = [{ id: "builtin-mts", type: "modthesims", input: null, label: "ModTheSims · Sims 4", builtin: true }];
const CACHE_TTL_MS = 10 * 60 * 1e3;
const cache = /* @__PURE__ */ new Map();
async function fetchSource(source, force) {
  const hit = cache.get(source.id);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;
  const adapter = ADAPTERS[source.type];
  let entry;
  try {
    const { label, items } = await adapter(source.input, source.id);
    entry = { at: Date.now(), label, items };
  } catch (err2) {
    entry = { at: Date.now(), error: err2.message, items: [] };
  }
  cache.set(source.id, entry);
  return entry;
}
async function getSources() {
  const user = await listSources();
  return [...BUILTINS, ...user].map((s) => ({
    ...s,
    error: cache.get(s.id)?.error ?? null
  }));
}
async function followSource({ type, input }) {
  if (!ADAPTERS[type] || type === "modthesims") return { ok: false, error: "Unknown source type." };
  const probeId = `probe-${type}-${Date.now()}`;
  const probe = await fetchSource({ id: probeId, type, input }, true);
  cache.delete(probeId);
  if (probe.error) return { ok: false, error: probe.error };
  const res = await addSource({ type, input, label: probe.label });
  if (!res.ok) return res;
  cache.set(res.source.id, { ...probe });
  return { ok: true, source: res.source, count: probe.items.length };
}
async function unfollowSource(id) {
  cache.delete(id);
  return removeSource(id);
}
async function getSuggested() {
  const followed = new Set((await listSources()).map((s) => `${s.type}|${String(s.input).toLowerCase()}`));
  return SUGGESTED_SOURCES.map((s) => ({
    ...s,
    followed: followed.has(`${s.type}|${String(s.input).toLowerCase()}`)
  }));
}
async function followSuggested(entries) {
  const pick = (entries?.length ? entries : SUGGESTED_SOURCES).map((e) => ({ type: e.type, input: e.input, label: e.label })).filter((e) => e.type && e.input);
  return addManySources(pick);
}
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
async function fetchDiscover({ force = false } = {}) {
  const sources = [...BUILTINS, ...await listSources()];
  const results = await mapPool(sources, 5, async (s) => ({ s, r: await fetchSource(s, force) }));
  const items = [];
  const seenIds = /* @__PURE__ */ new Set();
  const sourceMeta = [];
  for (const { s, r } of results) {
    for (const it of r.items ?? []) {
      if (seenIds.has(it.id)) continue;
      seenIds.add(it.id);
      items.push({ ...it, sourceId: s.id });
    }
    sourceMeta.push({
      id: s.id,
      type: s.type,
      label: r.label ?? s.label,
      builtin: !!s.builtin,
      count: r.items?.length ?? 0,
      error: r.error ?? null
    });
  }
  items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return { ok: true, items, sources: sourceMeta, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
const IDLE_TIMEOUT_MS = 3e4;
async function streamToFile(url2, destPath, onProgress) {
  const partPath = destPath + ".part";
  const controller = new AbortController();
  let idleTimer;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(new Error(`stalled (no data for ${IDLE_TIMEOUT_MS / 1e3}s)`)), IDLE_TIMEOUT_MS);
  };
  try {
    resetIdle();
    const res = await httpFetch(url2, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    if (!res.body) return { ok: false, error: "empty response body" };
    const total = Number(res.headers.get("content-length")) || null;
    let bytes = 0;
    let last = 0;
    const body = stream.Readable.fromWeb(res.body);
    body.on("data", (chunk) => {
      bytes += chunk.length;
      resetIdle();
      const now = Date.now();
      if (onProgress && (now - last > 250 || bytes === total)) {
        last = now;
        onProgress({ received: bytes, total });
      }
    });
    await promises$1.pipeline(body, fs.createWriteStream(partPath));
    await promises.rename(partPath, destPath);
    return { ok: true, bytes };
  } catch (err2) {
    await promises.unlink(partPath).catch(() => {
    });
    return { ok: false, error: err2?.message ?? String(err2) };
  } finally {
    clearTimeout(idleTimer);
  }
}
async function downloadRemoteItem(item, modsFolder, { onProgress, trayFolder } = {}) {
  const downloads = item?.downloads ?? [];
  if (!downloads.length) return { ok: false, installed: [], errors: ["Nothing downloadable in this item."] };
  const installed = [];
  const errors = [];
  const count = downloads.length;
  let idx = 0;
  for (const d of downloads) {
    idx++;
    const emit = (p) => onProgress?.({ ...p, fileIndex: idx, fileCount: count, phase: "downloading" });
    const isZip = /\.zip$/i.test(d.name);
    if (isZip) {
      const tmp = await uniqueFilePath(modsFolder, safeFileName(d.name));
      const r = await streamToFile(d.url, tmp, emit);
      if (!r.ok) {
        errors.push(`${d.name}: ${r.error}`);
        continue;
      }
      onProgress?.({ fileIndex: idx, fileCount: count, phase: "installing" });
      const ex = await extractModArchive(tmp, modsFolder, d.name.replace(/\.zip$/i, ""), { trayFolder });
      await promises.unlink(tmp).catch(() => {
      });
      if (!ex.ok) {
        errors.push(`${d.name}: ${ex.error}`);
        continue;
      }
      installed.push(...ex.files, ...ex.trayFiles ?? []);
    } else {
      const dest = await uniqueFilePath(modsFolder, safeFileName(d.name));
      const r = await streamToFile(d.url, dest, emit);
      if (!r.ok) {
        errors.push(`${d.name}: ${r.error}`);
        continue;
      }
      installed.push(dest);
    }
  }
  return { ok: installed.length > 0, installed, errors };
}
const PARTITION = "persist:sources";
const PROVIDERS = {
  patreon: {
    label: "Patreon",
    loginUrl: "https://www.patreon.com/login",
    cookieDomain: ".patreon.com",
    authCookie: "session_id"
  },
  pinterest: {
    label: "Pinterest",
    loginUrl: "https://www.pinterest.com/login/",
    cookieDomain: ".pinterest.com",
    authCookie: "_pinterest_sess"
  }
};
function sourceSession() {
  return electron.session.fromPartition(PARTITION);
}
function installSessionFetch() {
  setFetchImpl(
    (url2, init = {}) => electron.net.fetch(url2, { credentials: "include", ...init, session: sourceSession() })
  );
}
async function isConnected(provider) {
  const p = PROVIDERS[provider];
  if (!p) return false;
  try {
    const cookies = await sourceSession().cookies.get({ name: p.authCookie });
    return cookies.some((c) => c.value && c.value.length > 0);
  } catch {
    return false;
  }
}
async function authStatus() {
  const out = {};
  for (const [key, p] of Object.entries(PROVIDERS)) {
    out[key] = { label: p.label, connected: await isConnected(key) };
  }
  return out;
}
async function connect(provider) {
  const p = PROVIDERS[provider];
  if (!p) return { ok: false, error: "Unknown provider." };
  if (await isConnected(provider)) return { ok: true, connected: true };
  const win = new electron.BrowserWindow({
    width: 540,
    height: 760,
    title: `Sign in to ${p.label}`,
    autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, sandbox: true, nodeIntegration: false, contextIsolation: true }
  });
  win.loadURL(p.loginUrl).catch(() => {
  });
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (connected) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(safety);
      if (!win.isDestroyed()) win.close();
      resolve({ ok: connected, connected });
    };
    const timer = setInterval(async () => {
      if (await isConnected(provider)) finish(true);
    }, 1500);
    const safety = setTimeout(() => finish(false), 5 * 60 * 1e3);
    win.on("closed", () => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(safety);
      isConnected(provider).then((c) => resolve({ ok: c, connected: c }));
    });
  });
}
async function disconnect(provider) {
  const p = PROVIDERS[provider];
  if (!p) return { ok: false, error: "Unknown provider." };
  const s = sourceSession();
  try {
    const cookies = await s.cookies.get({ domain: p.cookieDomain });
    for (const c of cookies) {
      const host = c.domain.replace(/^\./, "");
      const url2 = `${c.secure ? "https" : "http"}://${host}${c.path || "/"}`;
      await s.cookies.remove(url2, c.name).catch(() => {
      });
    }
    return { ok: true, connected: false };
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
}
async function toggleLocalModEnabled({ filePath, enabled, modsFolder }) {
  if (!filePath || typeof filePath !== "string") return err("filePath is required");
  if (typeof enabled !== "boolean") return err("enabled must be a boolean");
  if (!modsFolder || typeof modsFolder !== "string") return err("modsFolder is required");
  const absFile = path.resolve(filePath);
  const absFolder = path.resolve(modsFolder);
  const rel = absFile.slice(absFolder.length);
  if (rel !== "" && !rel.startsWith(path.sep)) {
    return err("filePath is outside the configured Mods folder");
  }
  try {
    await promises.access(absFile);
  } catch {
    return err("File not found: " + absFile);
  }
  const name = path.basename(absFile);
  const isMod = name.endsWith(".package") || name.endsWith(".ts4script") || name.endsWith(".package.disabled") || name.endsWith(".ts4script.disabled");
  if (!isMod) return err("Not a recognized mod file: " + name);
  const isDisabled = name.endsWith(".disabled");
  const isEnabled = !isDisabled;
  if (enabled && isEnabled) {
    const mod2 = await buildLocalModDto(absFile, absFolder);
    return { ok: true, mod: mod2, oldPath: absFile, newPath: absFile };
  }
  if (!enabled && isDisabled) {
    const mod2 = await buildLocalModDto(absFile, absFolder);
    return { ok: true, mod: mod2, oldPath: absFile, newPath: absFile };
  }
  const newPath = enabled ? absFile.slice(0, -".disabled".length) : absFile + ".disabled";
  try {
    await promises.access(newPath);
    return err("Target file already exists: " + newPath);
  } catch {
  }
  try {
    await promises.rename(absFile, newPath);
  } catch (e) {
    return err("Rename failed: " + e.message);
  }
  const mod = await buildLocalModDto(newPath, absFolder);
  return { ok: true, mod, oldPath: absFile, newPath };
}
function err(message) {
  return { ok: false, error: { message } };
}
const CATALOG_URL = "https://raw.githubusercontent.com/PoZi268/sims4-cc-manager/refs/heads/main/catalog.json";
const CACHE_PATH = path.join(electron.app.getPath("userData"), "catalog_cache.json");
const EMPTY_CATALOG = { last_updated: null, creators: [], items: [] };
function normalize(json) {
  if (!json || !Array.isArray(json.creators)) return null;
  return {
    last_updated: json.last_updated ?? null,
    creators: json.creators,
    items: Array.isArray(json.items) ? json.items : []
  };
}
async function fetchAndCacheCatalog() {
  console.log("[catalogStore] Fetching catalog from:", CATALOG_URL);
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15e3) });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = normalize(await res.json());
    if (!json) throw new Error("Invalid catalog schema");
    await promises.writeFile(CACHE_PATH, JSON.stringify(json, null, 2), "utf-8");
    return json;
  } catch (err2) {
    console.error("[catalogStore] Failed to fetch catalog from GitHub:", err2.message);
    return await loadLocalCache();
  }
}
async function loadLocalCache() {
  try {
    const cached2 = normalize(JSON.parse(await promises.readFile(CACHE_PATH, "utf-8")));
    if (cached2) {
      console.log("[catalogStore] Using local cache as fallback");
      return cached2;
    }
    throw new Error("bad cache");
  } catch (err2) {
    console.error("[catalogStore] No valid local cache available:", err2.message);
    return EMPTY_CATALOG;
  }
}
let CONFIG_PATH = null;
function configPath() {
  if (!CONFIG_PATH) CONFIG_PATH = path.join(electron.app.getPath("userData"), "config.json");
  return CONFIG_PATH;
}
let cached = null;
async function readConfig() {
  if (cached) return cached;
  try {
    cached = JSON.parse(await promises.readFile(configPath(), "utf-8"));
  } catch {
    cached = { modsFolder: null };
  }
  return cached;
}
async function writeConfig(config) {
  cached = config;
  await promises.writeFile(configPath(), JSON.stringify(config, null, 2), "utf-8");
}
async function getConfigValue(key) {
  return (await readConfig())[key];
}
const configStore = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getConfigValue,
  readConfig,
  writeConfig
}, Symbol.toStringTag, { value: "Module" }));
async function findTrayFolder(modsFolder) {
  if (!modsFolder) return null;
  const tray = path.join(path.dirname(modsFolder), "Tray");
  try {
    await promises.access(tray);
    return tray;
  } catch {
    return null;
  }
}
function progressSender(e, modId) {
  const sender = e.sender;
  return (p) => {
    if (!sender.isDestroyed()) sender.send("curseforge:progress", { modId, ...p });
  };
}
electron.protocol.registerSchemesAsPrivileged([
  { scheme: "modimg", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.ipcMain.handle("get-config", async () => {
  return await readConfig();
});
electron.ipcMain.handle("set-config", async (_e, key, value) => {
  const config = await readConfig();
  config[key] = value;
  await writeConfig(config);
});
electron.ipcMain.handle("select-folder", async () => {
  const { canceled, filePaths } = await electron.dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Select your Sims 4 Mods folder"
  });
  return canceled ? null : filePaths[0];
});
electron.ipcMain.handle("localMods:getCached", () => {
  return getCachedLocalMods();
});
electron.ipcMain.handle("localMods:scan", async () => {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const config = await readConfig();
    if (!config.modsFolder) {
      return { ok: false, mods: [], scannedAt: now, count: 0, errors: [{ message: "Mods folder not configured." }] };
    }
    try {
      await promises.access(config.modsFolder);
    } catch {
      return { ok: false, mods: [], scannedAt: now, count: 0, errors: [{ message: `Mods folder not found: ${config.modsFolder}` }] };
    }
    const { mods, errors, durationMs } = await scanMods(config.modsFolder);
    return { ok: true, mods, scannedAt: now, count: mods.length, errors, durationMs };
  } catch (err2) {
    return { ok: false, mods: [], scannedAt: now, count: 0, errors: [{ message: err2.message }] };
  }
});
electron.ipcMain.handle("localMods:imageUrl", (_e, absPath) => {
  if (!absPath || typeof absPath !== "string") return null;
  if (!/\.(png|jpe?g|webp|gif)$/i.test(absPath)) return null;
  return `modimg://thumb/?p=${encodeURIComponent(absPath)}`;
});
electron.ipcMain.handle("localMods:extractArchive", async (_e, filePath) => {
  try {
    const config = await readConfig();
    if (!config.modsFolder) return { ok: false, error: "Mods folder not configured." };
    if (!filePath || typeof filePath !== "string" || !/\.zip$/i.test(filePath)) {
      return { ok: false, error: "Not a zip archive." };
    }
    const absFile = path.resolve(filePath);
    const absFolder = path.resolve(config.modsFolder);
    const rel = absFile.slice(absFolder.length);
    if (!absFile.startsWith(absFolder) || rel !== "" && !rel.startsWith(path.sep)) {
      return { ok: false, error: "Archive is outside the configured Mods folder." };
    }
    const trayFolder = await findTrayFolder(config.modsFolder);
    const res = await extractModArchive(absFile, absFolder, void 0, { trayFolder });
    if (!res.ok) return res;
    await promises.unlink(absFile).catch(() => {
    });
    clearCachedLocalMods();
    return res;
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("localMods:toggleEnabled", async (_e, filePath, enabled) => {
  try {
    const config = await readConfig();
    if (!config.modsFolder) {
      return { ok: false, error: { message: "Mods folder not configured." } };
    }
    try {
      await promises.access(config.modsFolder);
    } catch {
      return { ok: false, error: { message: `Mods folder not found: ${config.modsFolder}` } };
    }
    const res = await toggleLocalModEnabled({ filePath, enabled, modsFolder: config.modsFolder });
    if (res.ok) updateCachedMod(res.oldPath, res.mod);
    return res;
  } catch (err2) {
    return { ok: false, error: { message: err2.message } };
  }
});
electron.ipcMain.handle("catalog:get", async () => {
  console.log("Main: Fetching catalog...");
  const data = await fetchAndCacheCatalog();
  console.log("Main: Returning catalog:", data);
  return data;
});
electron.ipcMain.handle("curseforge:search", async (_e, params) => {
  return await searchMods(params);
});
electron.ipcMain.handle("curseforge:categories", async () => {
  return await getCategories();
});
electron.ipcMain.handle("curseforge:download", async (e, mod) => {
  try {
    const config = await readConfig();
    if (!config.modsFolder) {
      return { ok: false, error: "Mods folder not configured." };
    }
    try {
      await promises.access(config.modsFolder);
    } catch {
      return { ok: false, error: `Mods folder not found: ${config.modsFolder}` };
    }
    const trayFolder = await findTrayFolder(config.modsFolder);
    const res = await downloadMod(mod, config.modsFolder, {
      trayFolder,
      onProgress: progressSender(e, mod?.id)
    });
    clearCachedLocalMods();
    if (res.ok) await recordDownload(mod, res);
    return res;
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("curseforge:getDownloaded", () => getDownloaded());
electron.ipcMain.handle("curseforge:checkUpdates", async (_e, opts) => {
  try {
    return await checkUpdates(opts ?? {});
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("curseforge:update", async (e, mod) => {
  try {
    const config = await readConfig();
    if (!config.modsFolder) return { ok: false, error: "Mods folder not configured." };
    try {
      await promises.access(config.modsFolder);
    } catch {
      return { ok: false, error: `Mods folder not found: ${config.modsFolder}` };
    }
    const trayFolder = await findTrayFolder(config.modsFolder);
    const res = await updateInstalledMod(mod, config.modsFolder, {
      trayFolder,
      onProgress: progressSender(e, mod?.id)
    });
    clearCachedLocalMods();
    return res;
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("curseforge:getModsByIds", async (_e, ids) => {
  try {
    return await getModsByIds(ids);
  } catch (err2) {
    return { data: [], error: err2.message };
  }
});
electron.ipcMain.handle("curseforge:description", async (_e, modId) => {
  try {
    return await getModDescription(modId);
  } catch (err2) {
    return { html: "", error: err2.message };
  }
});
electron.ipcMain.handle("auth:status", () => authStatus());
electron.ipcMain.handle("auth:connect", async (_e, provider) => {
  try {
    return await connect(provider);
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("auth:disconnect", async (_e, provider) => {
  try {
    return await disconnect(provider);
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("localMods:delete", async (_e, filePath) => {
  try {
    const config = await readConfig();
    if (!config.modsFolder) return { ok: false, error: { message: "Mods folder not configured." } };
    const res = await deleteLocalMod({ filePath, modsFolder: config.modsFolder });
    if (res.ok) clearCachedLocalMods();
    return res;
  } catch (err2) {
    return { ok: false, error: { message: err2.message } };
  }
});
electron.ipcMain.handle("localMods:import", async (_e, paths) => {
  try {
    const config = await readConfig();
    if (!config.modsFolder) return { ok: false, results: [], error: "Mods folder not configured." };
    try {
      await promises.access(config.modsFolder);
    } catch {
      return { ok: false, results: [], error: `Mods folder not found: ${config.modsFolder}` };
    }
    const trayFolder = await findTrayFolder(config.modsFolder);
    const res = await importFiles({ paths, modsFolder: config.modsFolder, trayFolder });
    if (res.ok) clearCachedLocalMods();
    return res;
  } catch (err2) {
    return { ok: false, results: [], error: err2.message };
  }
});
electron.ipcMain.handle("discover:sourceTypes", () => SOURCE_TYPES);
electron.ipcMain.handle("discover:sources", () => getSources());
electron.ipcMain.handle("discover:follow", async (_e, payload) => {
  try {
    return await followSource(payload ?? {});
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("discover:unfollow", async (_e, id) => {
  try {
    return await unfollowSource(id);
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("discover:fetch", async (_e, opts) => {
  try {
    return await fetchDiscover(opts ?? {});
  } catch (err2) {
    return { ok: false, items: [], sources: [], error: err2.message };
  }
});
electron.ipcMain.handle("discover:suggested", () => getSuggested());
electron.ipcMain.handle("discover:followSuggested", async (_e, entries) => {
  try {
    return await followSuggested(entries);
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("discover:download", async (e, item) => {
  try {
    const config = await readConfig();
    if (!config.modsFolder) return { ok: false, error: "Mods folder not configured." };
    try {
      await promises.access(config.modsFolder);
    } catch {
      return { ok: false, error: `Mods folder not found: ${config.modsFolder}` };
    }
    const trayFolder = await findTrayFolder(config.modsFolder);
    const sender = e.sender;
    const res = await downloadRemoteItem(item, config.modsFolder, {
      trayFolder,
      onProgress: (p) => {
        if (!sender.isDestroyed()) sender.send("discover:progress", { itemId: item?.id, ...p });
      }
    });
    if (res.ok) clearCachedLocalMods();
    return res;
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("thumbCache:open", async () => {
  electron.shell.openPath(await getThumbCacheDir());
});
electron.ipcMain.handle("thumbCache:clear", async () => {
  try {
    const dir = await getThumbCacheDir();
    await promises.rm(dir, { recursive: true, force: true });
    await promises.mkdir(dir, { recursive: true });
    clearCachedLocalMods();
    return { ok: true };
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("localMods:inspect", (_e, filePath) => inspectLocalMod(filePath));
electron.ipcMain.handle("shell:showItemInFolder", (_e, p) => {
  if (typeof p === "string" && p) electron.shell.showItemInFolder(p);
});
electron.ipcMain.handle("shell:openExternal", (_e, url2) => electron.shell.openExternal(url2));
electron.ipcMain.handle("clear-game-cache", async () => {
  try {
    const config = await readConfig();
    if (!config.modsFolder) {
      return { success: false, error: "Mods folder not configured." };
    }
    const cachePath2 = path.join(path.dirname(config.modsFolder), "localthumbcache.package");
    await promises.unlink(cachePath2);
    return { success: true };
  } catch (err2) {
    if (err2.code === "ENOENT") return { success: true, alreadyGone: true };
    return { success: false, error: err2.message };
  }
});
electron.app.whenReady().then(() => {
  installSessionFetch();
  electron.protocol.handle("modimg", async (request) => {
    try {
      const u = new URL(request.url);
      const p = u.searchParams.get("p") ?? "";
      if (!/\.(png|jpe?g|webp|gif)$/i.test(p)) return new Response("forbidden", { status: 403 });
      const config = await readConfig();
      const absFile = path.resolve(p);
      const roots = [config.modsFolder, await getThumbCacheDir()].filter(Boolean).map((r) => path.resolve(r));
      const allowed = roots.some((root) => {
        const rel = absFile.slice(root.length);
        return absFile.startsWith(root) && (rel === "" || rel.startsWith(path.sep));
      });
      if (!allowed) return new Response("forbidden", { status: 403 });
      return electron.net.fetch(url.pathToFileURL(absFile).toString());
    } catch {
      return new Response("bad request", { status: 400 });
    }
  });
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
