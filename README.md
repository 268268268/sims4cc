# Sims 4 Mod Manager 2.0

A modern desktop application for browsing, installing, organizing, and cleaning custom content and mods for **The Sims 4**.

Version 2.0 is a complete rewrite from the ground up using **Go, Wails v2, React 18, and Tailwind CSS**. It replaces the legacy Electron runtime with a high-performance native Go core, providing instant cold startups, an ultra-low memory footprint (~60 MB RAM), and multi-threaded DBPF package parsing.

---

## Features

### 1. Local Mods Management
Fast directory scanning, direct DBPF STBL string localization reading, package thumbnail extraction, and one-click enabling/disabling without deleting files.

![Local Mods Manager](docs/screenshots/01-local-mods.png)

- **Categorization**: Automatic grouping into Packages, Scripts, Archives, CAS Parts, Build/Buy Objects, and Tuning mods.
- **Enable / Disable Toggle**: Instantly enable or disable mods via extension renaming to isolate broken content.
- **Archive Extraction**: Drag-and-drop `.zip`, `.rar`, and `.7z` archives with automatic extraction and Tray item routing.
- **Package Details**: Inspect internal resources (CASP, GEOM 3D mesh, RLE2 textures, STBL strings) and launch the integrated 3D mesh viewer.

---

### 2. Discover Feed: Pinterest, Patreon, Tumblr
An integrated content aggregator with an intelligent link resolver that extracts direct package download URLs, bypassing external ad redirects and link shorteners.

![Discover Feed](docs/screenshots/02-discover-pinterest.png)

- **One-Click Direct Downloads**: Automatically resolves SimFileShare, Google Drive, Patreon, and CurseForge links directly to `.package` files.
- **Smart Feed Filtering**: Background validation workers filter out teaser photos and broken links, displaying only verified downloadable custom content.
- **Creator Blog Support**: Deep link resolution for creator websites and portfolios (such as `seoul-soul.com`, Blogspot, Wix, and custom creator domains).
- **Early Access Detection**: Clearly marks paid early access posts with lock indicators, keeping public free content easily accessible.
- **Edge CDN Fallback**: Downloads CurseForge mods directly via CDN even when third-party API distribution is restricted by the creator.

---

### 3. CC Swiper — Fast Mod Cleaner
A card-swiping interface designed for cleaning bloated custom content collections.

![CC Swiper](docs/screenshots/03-cc-swiper.png)

- **Keyboard Controls**: Press `A` (or Left Arrow) to delete, and `D` (or Right Arrow) to keep.
- **Recycle Bin Safety**: Deleted items are safely moved to the system Recycle Bin with instant undo (`Z`).
- **Mobile Wi-Fi Companion**: Run the embedded local server to swipe and clean mods directly from your mobile phone or tablet on your local network.
- **Resource Stats**: Real-time display of 3D polygon counts, texture memory, swatches, and total storage cleaned during the session.

---

### 4. CurseForge Catalog Browser
A full-featured client for the official CurseForge mod platform with search, category filtering, and automated updates.

![CurseForge Catalog](docs/screenshots/04-curseforge.png)

- Browse and search popular gameplay mods, traits, careers, and custom content.
- **Update Checker**: Automatically detects new releases for installed script mods (e.g., MC Command Center, UI Cheats Extension, WonderfulWhims).
- Background downloading with automated extraction into the `Mods` directory.

---

### 5. Diagnostics, Conflicts & Save Inspector
A comprehensive diagnostic suite for game stability and performance optimization.

![Diagnostics & Conflicts](docs/screenshots/05-diagnostics.png)

- **Conflict Detection**: Scans for conflicting Tuning IDs, instance overlaps, and duplicated GUIDs between packages.
- **Duplicate Scanner**: Identifies exact file duplicates across subfolders using SHA-256 hash comparisons.
- **Polycount Analyzer**: Flags high-poly meshes that can cause frame rate drops and simulation lag.
- **Save File Inspector**: Analyzes `.save` files to verify that all custom content used by your Sims is installed, preventing missing mesh glitches.

---

## Architecture & Technology Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend Core** | Go 1.22+ | High-throughput DBPF parser, HTTP link resolver, multi-threaded worker pools |
| **Desktop Shell** | Wails v2 | Native Windows WebView2 runtime, replacing Electron |
| **Frontend UI** | React 18, Vite | Component architecture, responsive dark theme |
| **Styling** | Tailwind CSS v4 | Hardware-accelerated UI rendering, modern Sims Plumbob mineral theme |
| **3D Rendering** | Three.js | Real-time interactive inspection of CAS and Object GEOM meshes |
| **Localization** | Custom i18n | Multi-language support (English and Russian) |

---

## System Requirements

- **Operating System**: Windows 10 or Windows 11 (64-bit).
- **Game**: The Sims 4 (EA App, Steam, or custom installation path).
- **Runtime**: Microsoft Edge WebView2 (preinstalled on modern Windows installations).

---

## Installation

1. Download the latest release from the [Releases](https://github.com/268268268/sims4cc/releases) page:
   - `sims4-mod-manager.exe` — Standalone portable executable (no installer required).
   - `sims4-mod-manager-v2.0.0-windows-x64.zip` — Compressed release archive.
2. Launch the application. On first startup, select your `Electronic Arts\The Sims 4\Mods` directory (auto-detected if in standard location).

---

## Building from Source

### Prerequisites
- **Go** (version 1.22 or higher)
- **Node.js** (version 18 or higher) and **npm**
- **Wails CLI v2**:
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

### Build Steps

```bash
# Clone the repository
git clone https://github.com/268268268/sims4cc.git
cd sims4cc

# Install frontend dependencies
cd frontend
npm install
cd ..

# Build release executable
wails build
```

The resulting binary will be placed at `build/bin/sims4-mod-manager.exe`.

---

## Supported Content Sources

- **Platforms**: Pinterest, Patreon, Tumblr, Boosty, CurseForge, ModTheSims, The Sims Resource, GitHub Releases, itch.io.
- **File Hosts**: SimFileShare, Google Drive, MediaFire, MEGA, Dropbox.
- **Creator Portals**: SeoulSoul, Blogspot, Wix, SimsFinds, and custom author domains.

---

## License

Distributed under the MIT License. This is an independent fan project not affiliated with or endorsed by Electronic Arts or Maxis. All trademarks belong to their respective owners.
