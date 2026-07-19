import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

// One JSON file in userData for all app settings. Lazily resolved so importing
// this module never touches Electron internals at load time.
let CONFIG_PATH = null
function configPath() {
  if (!CONFIG_PATH) CONFIG_PATH = join(app.getPath('userData'), 'config.json')
  return CONFIG_PATH
}

// Fields encrypted at rest with the OS keychain (DPAPI on Windows) so config.json
// never carries a readable CurseForge key. In memory we keep the plaintext, so
// every caller — and the Settings UI — stays unchanged.
const SECRET_KEYS = ['curseForgeApiKey', 'tumblrApiKey']
const ENC_PREFIX = 'enc:v1:'

function canEncrypt() {
  try { return safeStorage.isEncryptionAvailable() } catch { return false }
}

/** Plaintext → "enc:v1:<base64>". No-op if already encrypted or encryption is unavailable. */
function encryptField(value) {
  if (typeof value !== 'string' || !value || value.startsWith(ENC_PREFIX)) return value
  if (!canEncrypt()) return value // fall back to plaintext rather than lose the key
  try {
    return ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
  } catch {
    return value
  }
}

/** "enc:v1:<base64>" → plaintext. Returns null if the ciphertext can't be read. */
function decryptField(value) {
  if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) return value
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'))
  } catch {
    return null
  }
}

// In-memory copy (plaintext) so hot paths (per-keystroke search) don't hit disk.
let cached = null

/** Write the config to disk with secret fields encrypted. */
async function persist(config) {
  const onDisk = { ...config }
  for (const k of SECRET_KEYS) onDisk[k] = encryptField(config[k])
  await writeFile(configPath(), JSON.stringify(onDisk, null, 2), 'utf-8')
}

export async function readConfig() {
  if (cached) return cached
  let raw
  try {
    raw = JSON.parse(await readFile(configPath(), 'utf-8'))
  } catch {
    raw = { modsFolder: null }
  }
  // decrypt secrets into the in-memory copy; note any that were still plaintext
  const plain = { ...raw }
  let needsMigration = false
  for (const k of SECRET_KEYS) {
    if (typeof raw[k] === 'string' && raw[k]) {
      plain[k] = decryptField(raw[k])
      if (!raw[k].startsWith(ENC_PREFIX) && canEncrypt()) needsMigration = true
    }
  }
  cached = plain
  // migrate a legacy plaintext key to ciphertext on disk, once
  if (needsMigration) await persist(plain).catch(() => {})
  return cached
}

export async function writeConfig(config) {
  cached = config
  await persist(config)
}

export async function getConfigValue(key) {
  return (await readConfig())[key]
}
