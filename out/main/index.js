"use strict";
const electron = require("electron");
const path = require("path");
const promises = require("fs/promises");
const crypto = require("crypto");
const DBPF_MAGIC = Buffer.from("DBPF");
async function tryParseDbpf(filePath) {
  let fh = null;
  try {
    fh = await promises.open(filePath, "r");
    const buf = Buffer.alloc(96);
    const { bytesRead } = await fh.read(buf, 0, 96, 0);
    if (bytesRead < 4) return { ok: false, isDbpf: false, error: "file too small" };
    const isDbpf = buf.slice(0, 4).equals(DBPF_MAGIC);
    return { ok: true, isDbpf };
  } catch (err) {
    return { ok: false, isDbpf: false, error: err.message };
  } finally {
    if (fh) await fh.close().catch(() => {
    });
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
async function buildMod(filePath, modsFolder) {
  const fileName = path.basename(filePath);
  const relPath = path.relative(modsFolder, filePath);
  const id = makeId(relPath);
  const enabled = !fileName.endsWith(".disabled");
  const type = resolveType(fileName);
  let size = 0;
  let modifiedAt = (/* @__PURE__ */ new Date()).toISOString();
  let parseStatus = "fallback";
  let error;
  try {
    const info = await promises.stat(filePath);
    size = info.size;
    modifiedAt = info.mtime.toISOString();
  } catch (err) {
    error = `stat failed: ${err.message}`;
    parseStatus = "error";
  }
  if (type === "package" && !error) {
    try {
      const dbpf = await tryParseDbpf(filePath);
      parseStatus = dbpf.isDbpf ? "parsed" : "unsupported";
      if (!dbpf.ok && dbpf.error) error = dbpf.error;
    } catch (err) {
      parseStatus = "error";
      error = err.message;
    }
  }
  const thumbnail = await detectThumbnail(filePath);
  return {
    id,
    name: deriveName(fileName),
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
async function scanMods(modsFolder) {
  const allFiles = await walkDir(modsFolder);
  const modFiles = allFiles.filter((f) => isModFile(path.basename(f)));
  const mods = [];
  const errors = [];
  for (const filePath of modFiles) {
    try {
      const mod = await buildMod(filePath, modsFolder);
      mods.push(mod);
    } catch (err) {
      errors.push({ file: filePath, message: err.message });
    }
  }
  return { mods, errors };
}
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
  } catch (err) {
    return { ok: false, mods: [], scannedAt: now, count: 0, errors: [{ message: err.message }] };
  }
});
electron.ipcMain.handle("localMods:imageUrl", (_e, absPath) => {
  if (!absPath || typeof absPath !== "string") return null;
  if (!/\.(png|jpe?g|webp|gif)$/i.test(absPath)) return null;
  return `file://${absPath.replace(/\\/g, "/")}`;
});
electron.ipcMain.handle("clear-game-cache", async () => {
  try {
    const config = await readConfig();
    if (!config.modsFolder) {
      return { success: false, error: "Mods folder not configured." };
    }
    const cachePath = path.join(path.dirname(config.modsFolder), "localthumbcache.package");
    await promises.unlink(cachePath);
    return { success: true };
  } catch (err) {
    if (err.code === "ENOENT") return { success: true, alreadyGone: true };
    return { success: false, error: err.message };
  }
});
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
