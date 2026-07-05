"use strict";
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
const DBPF_MAGIC$1 = Buffer.from("DBPF");
const STBL_TYPE = 570774746;
const STBL_MAGIC = Buffer.from("STBL");
const ENGLISH_INST_HIGH_MAX = 65536;
const STBL_READ_CAP = 1 << 20;
async function readBytes(fh, length, position) {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return buf.slice(0, bytesRead);
}
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
async function tryParseDbpf(filePath) {
  let fh = null;
  try {
    fh = await promises.open(filePath, "r");
    const header = await readBytes(fh, 96, 0);
    if (header.length < 96 || !header.slice(0, 4).equals(DBPF_MAGIC$1)) {
      return { ok: true, isDbpf: false };
    }
    const entryCount = header.readUInt32LE(24);
    const indexOffset = Number(header.readBigUInt64LE(32));
    const flags = header.readUInt32LE(28);
    const entrySize = flags & 1 ? 32 : 20;
    if (entryCount === 0 || entryCount > 5e6) {
      return { ok: true, isDbpf: true, name: null };
    }
    const indexLen = entryCount * entrySize;
    const index = await readBytes(fh, indexLen, indexOffset);
    if (index.length < indexLen) {
      return { ok: true, isDbpf: true, name: null };
    }
    let stblEntry = null;
    let stblFallback = null;
    for (let i = 0; i < entryCount; i++) {
      const base = i * entrySize;
      const type = index.readUInt32LE(base);
      if (type !== STBL_TYPE) continue;
      const instHigh = index.readUInt32LE(base + 8);
      const offset = index.readUInt32LE(base + 12);
      const size = index.readUInt32LE(base + 16);
      if (offset === 0 || size === 0) continue;
      const candidate = { offset, size };
      if (instHigh < ENGLISH_INST_HIGH_MAX) {
        stblEntry = candidate;
        break;
      }
      stblFallback ??= candidate;
    }
    stblEntry ??= stblFallback;
    if (!stblEntry) return { ok: true, isDbpf: true, name: null };
    const readLen = Math.min(stblEntry.size, STBL_READ_CAP);
    const stblBuf = await readBytes(fh, readLen, stblEntry.offset);
    const name = parseStbl(stblBuf);
    return { ok: true, isDbpf: true, name: name ?? null };
  } catch (err2) {
    return { ok: false, isDbpf: false, error: err2.message };
  } finally {
    if (fh) await fh.close().catch(() => {
    });
  }
}
const THUMB_TYPE = 1008398834;
const DBPF_MAGIC = Buffer.from("DBPF");
const COMP_NONE = 0;
const COMP_ZLIB = 23106;
const MAX_RESOURCE_BYTES = 4 * 1024 * 1024;
let CACHE_DIR = null;
function cacheDir() {
  if (!CACHE_DIR) CACHE_DIR = path.join(electron.app.getPath("userData"), "thumb-cache");
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
async function readAt(fh, len, pos) {
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
    const header = await readAt(fh, 96, 0);
    if (header.length < 96 || !header.slice(0, 4).equals(DBPF_MAGIC)) return null;
    const count = header.readUInt32LE(36);
    const indexSize = header.readUInt32LE(44);
    const indexPos = Number(header.readBigUInt64LE(64));
    if (count < 1 || count > 5e5 || indexPos < 96 || indexSize < 4 || indexSize > 64 * 1024 * 1024) {
      return null;
    }
    const idx = await readAt(fh, indexSize, indexPos);
    if (idx.length < indexSize) return null;
    let o = 0;
    const flags = idx.readUInt32LE(o);
    o += 4;
    let cType = 0;
    if (flags & 1) {
      cType = idx.readUInt32LE(o);
      o += 4;
    }
    if (flags & 2) {
      o += 4;
    }
    if (flags & 4) {
      o += 4;
    }
    const entries = [];
    for (let i = 0; i < count; i++) {
      let type = cType;
      if (!(flags & 1)) {
        type = idx.readUInt32LE(o);
        o += 4;
      }
      if (!(flags & 2)) {
        o += 4;
      }
      if (!(flags & 4)) {
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
      entries.push({ type, position, size, sizeDecompressed, compression });
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
        data = decompress(await readAt(fh, e.size, e.position), e.compression);
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
    const dir = cacheDir();
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
async function buildLocalModDto(filePath, modsFolder) {
  const fileName = path.basename(filePath);
  const relPath = path.relative(modsFolder, filePath);
  const id = makeId(relPath);
  const enabled = !fileName.endsWith(".disabled");
  const type = resolveType(fileName);
  let size = 0;
  let modifiedAt = (/* @__PURE__ */ new Date()).toISOString();
  let mtimeMs = 0;
  let parseStatus = "fallback";
  let error;
  try {
    const info = await promises.stat(filePath);
    size = info.size;
    modifiedAt = info.mtime.toISOString();
    mtimeMs = info.mtimeMs;
  } catch (err2) {
    error = `stat failed: ${err2.message}`;
    parseStatus = "error";
  }
  let realName = null;
  if (type === "package" && !error) {
    try {
      const dbpf = await tryParseDbpf(filePath);
      parseStatus = dbpf.isDbpf ? "parsed" : "unsupported";
      if (!dbpf.ok && dbpf.error) error = dbpf.error;
      realName = dbpf.name ?? null;
    } catch (err2) {
      parseStatus = "error";
      error = err2.message;
    }
  }
  let thumbnail = await detectThumbnail(filePath);
  if (thumbnail.source === "fallback" && type === "package" && !error) {
    const cached = await getCachedThumbnail(filePath, mtimeMs);
    if (cached) thumbnail = { source: "dbpf", path: cached };
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
    thumbnail,
    parseStatus,
    ...error ? { error } : {}
  };
}
let cachedMods = null;
async function scanMods(modsFolder) {
  const allFiles = await walkDir(modsFolder);
  const modFiles = allFiles.filter((f) => isModFile(path.basename(f)));
  const archiveFiles = allFiles.filter((f) => isArchiveFile(path.basename(f)));
  const mods = [];
  const errors = [];
  for (const filePath of modFiles) {
    try {
      const mod = await buildLocalModDto(filePath, modsFolder);
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
  cachedMods = mods;
  return { mods, errors };
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
const MOD_EXTS = /* @__PURE__ */ new Set([".package", ".ts4script"]);
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
async function extractModArchive(zipPath, modsFolder, nameHint) {
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
  const hasModFile = entries.some((e) => MOD_EXTS.has(path.extname(e.entryName).toLowerCase()));
  if (!hasModFile) {
    return { ok: false, error: "No Sims 4 mod files (.package / .ts4script) found in the archive." };
  }
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
  try {
    for (const entry of entries) {
      const target = path.join(folder, targetNameFor(entry.entryName));
      const data = entry.getData();
      await promises.writeFile(target, data);
      files.push(target);
    }
  } catch (err2) {
    for (const f of files) await promises.unlink(f).catch(() => {
    });
    await promises.rmdir(folder).catch(() => {
    });
    return { ok: false, error: `Extraction failed: ${err2.message}` };
  }
  console.log(`[archiveExtractor] Extracted ${files.length} file(s) from ${path.basename(zipPath)} → ${folder}`);
  return { ok: true, folder, files };
}
const __vite_import_meta_env__ = {};
const API_BASE = "https://api.curseforge.com/v1";
const SIMS4_GAME_ID = 78062;
async function searchMods(params = {}) {
  const { searchFilter = "", categoryId, index = 0, pageSize = 50 } = params;
  const apiKey = process.env.CURSEFORGE_API_KEY || __vite_import_meta_env__?.MAIN_VITE_CURSEFORGE_API_KEY || null;
  console.log(
    "DEBUG: API Key exists:",
    !!process.env.CURSEFORGE_API_KEY || !!__vite_import_meta_env__?.MAIN_VITE_CURSEFORGE_API_KEY
  );
  if (!apiKey) {
    console.error("DEBUG: CURSEFORGE_API_KEY is missing — check .env / electron-vite env.");
    return { data: [], pagination: null, error: "CURSEFORGE_API_KEY is not set. Check your .env file." };
  }
  const url2 = new URL(`${API_BASE}/mods/search`);
  url2.searchParams.set("gameId", SIMS4_GAME_ID);
  if (searchFilter) url2.searchParams.set("searchFilter", searchFilter);
  if (categoryId != null) url2.searchParams.set("categoryId", categoryId);
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
function getApiKey() {
  return process.env.CURSEFORGE_API_KEY || __vite_import_meta_env__?.MAIN_VITE_CURSEFORGE_API_KEY || null;
}
async function downloadMod(mod, destinationFolder) {
  if (!mod || !mod.id) return { ok: false, error: "Invalid mod object." };
  if (!destinationFolder) return { ok: false, error: "Destination folder not provided." };
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, error: "CURSEFORGE_API_KEY is not set. Check your .env file." };
  }
  const file = mod.latestFiles?.[0];
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
  const IDLE_TIMEOUT_MS = 3e4;
  const controller = new AbortController();
  let idleTimer;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => controller.abort(new Error(`Download stalled (no data for ${IDLE_TIMEOUT_MS / 1e3}s)`)),
      IDLE_TIMEOUT_MS
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
    const body = stream.Readable.fromWeb(res.body);
    body.on("data", (chunk) => {
      bytes += chunk.length;
      resetIdle();
    });
    await promises$1.pipeline(body, fs.createWriteStream(partPath));
    await promises.rename(partPath, destPath);
    console.log(`[curseForgeClient] Saved ${fileName} (${bytes} bytes) → ${destPath}`);
    if (/\.zip$/i.test(fileName)) {
      const extracted = await extractModArchive(destPath, destinationFolder, mod.name);
      if (!extracted.ok) {
        return { ok: false, error: `Downloaded, but not installed: ${extracted.error}` };
      }
      await promises.unlink(destPath).catch(() => {
      });
      return { ok: true, path: extracted.folder, files: extracted.files };
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
const STORE_PATH = path.join(electron.app.getPath("userData"), "downloads.json");
async function readStore() {
  try {
    return JSON.parse(await promises.readFile(STORE_PATH, "utf-8"));
  } catch {
    return {};
  }
}
async function writeStore(data) {
  await promises.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
}
async function recordDownload(mod, result) {
  if (!mod?.id) return;
  const store = await readStore();
  store[String(mod.id)] = {
    name: mod.name ?? null,
    path: result?.path ?? null,
    // extracted folder or the .package file on disk
    fileId: mod.latestFiles?.[0]?.id ?? null,
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
const EMPTY_CATALOG = { creators: [], items: [] };
async function fetchAndCacheCatalog() {
  console.log("[catalogStore] Fetching catalog from:", CATALOG_URL);
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15e3) });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = await res.json();
    if (!json || !Array.isArray(json.creators) || !Array.isArray(json.items)) {
      throw new Error("Invalid catalog schema");
    }
    await promises.writeFile(CACHE_PATH, JSON.stringify(json, null, 2), "utf-8");
    return json;
  } catch (err2) {
    console.error("CRITICAL: Failed to fetch catalog from GitHub:", err2);
    return await loadLocalCache();
  }
}
async function loadLocalCache() {
  try {
    const raw = await promises.readFile(CACHE_PATH, "utf-8");
    const cached = JSON.parse(raw);
    if (cached && Array.isArray(cached.creators) && Array.isArray(cached.items)) {
      console.log("[catalogStore] Using local cache as fallback");
      return cached;
    }
    throw new Error("bad cache");
  } catch (err2) {
    console.error("[catalogStore] No valid local cache available:", err2.message);
    return EMPTY_CATALOG;
  }
}
electron.protocol.registerSchemesAsPrivileged([
  { scheme: "modimg", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);
const CONFIG_PATH = path.join(electron.app.getPath("userData"), "config.json");
async function readConfig() {
  try {
    const raw = await promises.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { modsFolder: null };
  }
}
async function writeConfig(config) {
  await promises.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
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
    const { mods, errors } = await scanMods(config.modsFolder);
    return { ok: true, mods, scannedAt: now, count: mods.length, errors };
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
    const res = await extractModArchive(absFile, absFolder);
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
electron.ipcMain.handle("curseforge:download", async (_e, mod) => {
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
    const res = await downloadMod(mod, config.modsFolder);
    clearCachedLocalMods();
    if (res.ok) await recordDownload(mod, res);
    return res;
  } catch (err2) {
    return { ok: false, error: err2.message };
  }
});
electron.ipcMain.handle("curseforge:getDownloaded", () => getDownloaded());
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
    const cachePath = path.join(path.dirname(config.modsFolder), "localthumbcache.package");
    await promises.unlink(cachePath);
    return { success: true };
  } catch (err2) {
    if (err2.code === "ENOENT") return { success: true, alreadyGone: true };
    return { success: false, error: err2.message };
  }
});
electron.app.whenReady().then(() => {
  electron.protocol.handle("modimg", async (request) => {
    try {
      const u = new URL(request.url);
      const p = u.searchParams.get("p") ?? "";
      if (!/\.(png|jpe?g|webp|gif)$/i.test(p)) return new Response("forbidden", { status: 403 });
      const config = await readConfig();
      const absFile = path.resolve(p);
      const roots = [config.modsFolder, getThumbCacheDir()].filter(Boolean).map((r) => path.resolve(r));
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
