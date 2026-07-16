# Sims 4 Mod Manager

A desktop app for browsing, installing, and organizing **The Sims 4** custom content — with a
built‑in CurseForge browser, a local mod library, and a *Discover* feed that aggregates public
posts from Patreon, Pinterest, Tumblr and ModTheSims.

> Unofficial fan tool. Not affiliated with or endorsed by Electronic Arts, Maxis, Overwolf/CurseForge,
> Patreon, or any content creator. Windows‑first (Electron).

## Features

**Local Mods**
- Scans your Mods folder, reads real mod names from the `.package` (DBPF STBL) and shows the
  in‑game thumbnail extracted straight from the file.
- Enable/disable (extension rename), delete to the Recycle Bin, drag‑and‑drop install of
  `.zip` / `.package` / `.ts4script`, automatic Tray‑file routing.
- Detail view: package resource breakdown, folder size, files list, "installed from CurseForge" link.
- Search, filter (type / enabled / archives) and sort.

**CurseForge**
- Browse & search Sims 4 mods, filter by category, sort, infinite scroll.
- One‑click install (zips auto‑extract into the Mods folder).
- "Installed" view with **update detection** and one‑click update (no duplicate folders).
- Live download progress; detail modal with a sanitized description and a screenshot lightbox.

**Discover**
- Aggregates public content from **Patreon** (free posts install directly), **Pinterest** boards,
  **Tumblr** blogs and **ModTheSims**.
- A curated starter pack of popular creators — one click to follow.
- **Connect your own accounts** (Patreon / Pinterest): you log in on the real site in a normal
  window; the app reuses the session cookie and **never sees your password**. Paywalled posts stay
  locked unless *you* have access.
- **Download from a link:** paste a Pinterest pin, a Patreon post, a SimFileShare or a direct file
  URL and the app resolves it to the actual mod and installs it.

**General**
- English & Russian UI, dark theme, per‑host rate‑limiting so following many creators won't get
  you throttled, and a "clear the game cache" reminder after installs.

## Install

Grab the latest **`sims4-mod-manager-x.y.z-setup.exe`** (installer) or
**`sims4-mod-manager-x.y.z-portable.exe`** from the
[Releases](https://github.com/PoZi268/sims4cc/releases) page and run it.

## Build from source

Requirements: **Node.js 18+** and Windows.

```bash
git clone https://github.com/PoZi268/sims4cc.git
cd sims4cc
npm install
npm run dev          # run in development
npm run dist         # build the Windows installer + portable exe into dist/
```

### CurseForge API key (optional)

Browsing/downloading from CurseForge needs a free API key.

- **Easiest:** run the app → **Settings → CurseForge API Key** → paste it.
- Or create a `.env` file in the project root (a `.env` takes precedence over the Settings key):

  ```
  CURSEFORGE_API_KEY=your-key-here
  ```

Get a free key at <https://console.curseforge.com/>. The *Discover* tab works without a key.

## Tech

Electron 43 · electron‑vite · React 18 · Tailwind CSS 4 · Phosphor Icons.
App data (settings, caches, followed sources) lives in `%APPDATA%\sims4-mod-manager` — never in the repo.

## Support

The app is free and MIT‑licensed — nothing is locked behind a payment. If it saves you time and
you'd like to chip in for its development:

- **Ko‑fi:** <https://ko-fi.com/sims4ccmanager>
- **PayPal:** `feliks.pochta@gmail.com`

Entirely optional — and please keep supporting the CC creators themselves first.

## Disclaimer

This tool only accesses **publicly available** content and honors paywalls: patron‑only Patreon
posts are shown as locked and are never bypassed. Please respect each platform's Terms of Service
and, above all, **support the creators** whose work you enjoy. Provided "as is", without warranty —
see [LICENSE](LICENSE).

## License

[MIT](LICENSE)
