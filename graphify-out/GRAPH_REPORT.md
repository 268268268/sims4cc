# Graph Report - .  (2026-07-24)

## Corpus Check
- 101 files · ~91,761 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 608 nodes · 1400 edges · 29 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.78)
- Token cost: 78,071 input · 0 output

## Community Hubs (Navigation)
- Electron Main Process
- DBPF Package Parsing
- Download Link Resolution
- Feed Fetching Utilities
- Runtime Dependencies
- Discover Sources & Feeds
- Mod Archive Extraction
- Dialogs & Detail Modals
- Electron Build Tooling
- App Shell & Layout
- Discover UI
- Design System Formatter
- Design System Generator
- Local Mods UI & Settings
- CurseForge Mod UI
- Agent Skill Docs
- Palette Sync Script
- Skill Search Core
- Project Plan & Docs
- Localization (i18n)
- Author History UI
- Encrypted Config Store
- Download Watcher
- BM25 Ranking
- Saved Links Store
- Page Override Generator
- Catalog Cache

## God Nodes (most connected - your core abstractions)
1. `useT()` - 52 edges
2. `httpFetch()` - 28 edges
3. `resolveLink()` - 22 edges
4. `msg()` - 22 edges
5. `extractModArchive()` - 16 edges
6. `fail()` - 15 edges
7. `listSources()` - 14 edges
8. `isInstallable()` - 13 edges
9. `buildLocalModDto()` - 12 edges
10. `scanMods()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `UI/UX Pro Max Skill (.agents copy)` --semantically_similar_to--> `UI/UX Pro Max Skill (.claude copy)`  [INFERRED] [semantically similar]
  .agents/skills/ui-ux-pro-max/SKILL.md → .claude/skills/ui-ux-pro-max/SKILL.md
- `Sims 4 Mod Manager Development Plan` --conceptually_related_to--> `Discover Feed (Patreon, Pinterest, Tumblr, ModTheSims aggregator)`  [INFERRED]
  PLAN.md → README.md
- `_generate_intelligent_overrides()` --calls--> `search()`  [EXTRACTED]
  .claude/skills/ui-ux-pro-max/scripts/design_system.py → .agents/skills/ui-ux-pro-max/scripts/core.py
- `Ponytail Skill (lazy senior developer mode)` --conceptually_related_to--> `Accessibility Guidelines (Priority 1, CRITICAL)`  [INFERRED]
  .cline/skills/ponytail/SKILL.md → .agents/skills/ui-ux-pro-max/SKILL.md
- `Mod Conflict Detector (TGI resource intersection)` --conceptually_related_to--> `Local Mods Library (DBPF scan, thumbnails, enable/disable)`  [INFERRED]
  PLAN.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Ponytail Plugin Skill Suite** — _cline_skills_ponytail_skill_ponytail, _cline_skills_ponytail_audit_skill_ponytail_audit, _cline_skills_ponytail_debt_skill_ponytail_debt, _cline_skills_ponytail_gain_skill_ponytail_gain, _cline_skills_ponytail_help_skill_ponytail_help, _cline_skills_ponytail_review_skill_ponytail_review [EXTRACTED 1.00]
- **Sims 4 Mod Manager Application** — readme_sims_4_mod_manager, plan_development_plan, electron_builder_build_config, src_renderer_index_renderer_entry [EXTRACTED 1.00]

## Communities (29 total, 0 thin omitted)

### Community 0 - "Electron Main Process"
Cohesion: 0.06
Nodes (65): CONTENT_SECURITY_POLICY, matchLocalCache, onLocalModsChanged(), ALLOWED_TAGS, dbg(), descriptionCache, downloadMod(), getApiKey() (+57 more)

### Community 1 - "DBPF Package Parsing"
Cohesion: 0.07
Nodes (51): parseStbl(), STBL_MAGIC, cacheDir(), DBPF_MAGIC, decompress(), exists(), extractThumbnailBuffer(), getCachedThumbnail() (+43 more)

### Community 2 - "Download Link Resolution"
Cohesion: 0.14
Nodes (40): BORING_HOSTS, decodeEntitiesLite(), fail(), findKnownLinks(), isBoringHost(), pinInfo(), probeFilename(), resolveBoosty() (+32 more)

### Community 3 - "Feed Fetching Utilities"
Cohesion: 0.13
Nodes (35): decodeEntities(), fetchJson(), fetchText(), firstImage(), parseRss(), stripHtml(), toIso(), fetchModTheSims() (+27 more)

### Community 4 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (31): 7zip-bin, adm-zip, axios, cheerio, dotenv, @fontsource-variable/outfit, megajs, node-unrar-js (+23 more)

### Community 5 - "Discover Sources & Feeds"
Cohesion: 0.14
Nodes (27): DEFAULT_SOURCES, ADAPTERS, BUILTINS, cache, fetchDiscover(), fetchMoreDiscover(), fetchSource(), fetchSourceFeed() (+19 more)

### Community 6 - "Mod Archive Extraction"
Cohesion: 0.19
Nodes (21): execFileAsync, extractModArchive(), extractViaTemp(), listFilesRecursive(), makeFlattener(), moveFile(), pickTargetFolder(), safeFileName() (+13 more)

### Community 7 - "Dialogs & Detail Modals"
Cohesion: 0.13
Nodes (17): ConfirmDialog(), LocalModDetail(), TYPE_LABEL, Modal(), ProfilesModal(), BRAND, SourceIcon(), Switch() (+9 more)

### Community 8 - "Electron Build Tooling"
Cohesion: 0.09
Nodes (23): electron, electron-builder, @electron-toolkit/preload, @electron-toolkit/utils, electron-vite, devDependencies, electron, electron-builder (+15 more)

### Community 9 - "App Shell & Layout"
Cohesion: 0.16
Nodes (16): PAGES, CatchToast(), DownloadCatcher(), DropZone(), CacheBanner(), Layout(), Plumbob(), DISCOVER_SOURCES (+8 more)

### Community 10 - "Discover UI"
Cohesion: 0.15
Nodes (15): DiscoverDetail(), TYPE_META, Lightbox(), isDownloadable(), formatRelative(), AddSourceForm(), Discover(), ItemCard() (+7 more)

### Community 11 - "Design System Formatter"
Cohesion: 0.15
Nodes (18): ansi_ljust(), format_ascii_box(), format_markdown(), format_master_md(), generate_design_system(), hex_to_ansi(), persist_design_system(), Convert hex color to ANSI True Color swatch (██) with fallback. (+10 more)

### Community 12 - "Design System Generator"
Cohesion: 0.14
Nodes (11): DesignSystemGenerator, Find matching reasoning rule for a category., Apply reasoning rules to search results., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation.          variance/motion/densi, Bucket a 1-10 dial value into its tier config. Returns None if value is None., Generates design system recommendations from aggregated searches. (+3 more)

### Community 13 - "Local Mods UI & Settings"
Cohesion: 0.18
Nodes (14): CategoryFilter(), DescriptionTab(), useT(), AuthorLine(), InstalledView(), SortChips(), ApiKeySection(), ConnectedAccountsSection() (+6 more)

### Community 14 - "CurseForge Mod UI"
Cohesion: 0.29
Nodes (10): CurseForgeModDetail(), DownloadButton(), ICON, pickLatestFile(), RELEASE_TYPE, formatBytes(), formatCount(), getThumbnail() (+2 more)

### Community 15 - "Agent Skill Docs"
Cohesion: 0.20
Nodes (14): Accessibility Guidelines (Priority 1, CRITICAL), Design System Generator (search.py --design-system), UI/UX Pro Max Skill (.agents copy), UI/UX Pro Max Skill (.claude copy), Ponytail Audit Skill (repo-wide over-engineering scan), Ponytail Debt Skill (shortcut ledger harvester), Ponytail Gain Skill (benchmark scoreboard), Ponytail Help Skill (reference card) (+6 more)

### Community 16 - "Palette Sync Script"
Cohesion: 0.29
Nodes (13): blend(), derive_row(), derive_ui_reasoning(), h2r(), is_dark(), lum(), on_color(), r2h() (+5 more)

### Community 17 - "Skill Search Core"
Cohesion: 0.25
Nodes (10): detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search stack-specific guidelines, search() (+2 more)

### Community 18 - "Project Plan & Docs"
Cohesion: 0.22
Nodes (11): Electron Builder Config (NSIS installer + portable exe), App Auto-Update (electron-updater + GitHub Releases), Mod Conflict Detector (TGI resource intersection), Sims 4 Mod Manager Development Plan, Mod Profiles (named mod sets), Stage 0 Security Hardening (sandbox, CSP, safeStorage), Built-in CurseForge Browser (search, install, update detection), Discover Feed (Patreon, Pinterest, Tumblr, ModTheSims aggregator) (+3 more)

### Community 19 - "Localization (i18n)"
Cohesion: 0.24
Nodes (7): App(), DICTS, I18nContext, I18nProvider(), interpolate(), LANG_OPTIONS, lookup()

### Community 20 - "Author History UI"
Cohesion: 0.35
Nodes (9): entryKey(), RecentAuthors(), TYPE_TINT, clearAuthorHistory(), getAuthorHistory(), keyOf(), onAuthorHistoryChange(), pushAuthor() (+1 more)

### Community 21 - "Encrypted Config Store"
Cohesion: 0.40
Nodes (9): canEncrypt(), configPath(), decryptField(), encryptField(), getConfigValue(), persist(), readConfig(), SECRET_KEYS (+1 more)

### Community 22 - "Download Watcher"
Cohesion: 0.33
Nodes (9): consider(), downloadsDir(), emit(), MOD_EXT, pending, seen, startDownloadWatch(), stopDownloadWatch() (+1 more)

### Community 23 - "BM25 Ranking"
Cohesion: 0.28
Nodes (5): BM25, BM25 ranking algorithm for text search, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query

### Community 24 - "Saved Links Store"
Cohesion: 0.47
Nodes (8): addSavedLink(), listSavedLinks(), queue, readStore(), removeSavedLink(), STORE_PATH(), withLock(), writeStore()

### Community 25 - "Page Override Generator"
Cohesion: 0.33
Nodes (6): _detect_page_type(), format_page_override_md(), _generate_intelligent_overrides(), Format a page-specific override file with intelligent AI-generated content., Generate intelligent overrides based on page type using layered search., Detect page type from context and search results.

### Community 26 - "Catalog Cache"
Cohesion: 0.53
Nodes (5): CACHE_PATH, EMPTY_CATALOG, fetchAndCacheCatalog(), loadLocalCache(), normalize()

## Knowledge Gaps
- **95 isolated node(s):** `name`, `version`, `description`, `author`, `main` (+90 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resolve()` connect `Download Link Resolution` to `Localization (i18n)`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `httpFetch()` connect `Download Link Resolution` to `Feed Fetching Utilities`, `Mod Archive Extraction`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _95 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Electron Main Process` be split into smaller, more focused modules?**
  _Cohesion score 0.05981012658227848 - nodes in this community are weakly interconnected._
- **Should `DBPF Package Parsing` be split into smaller, more focused modules?**
  _Cohesion score 0.06927551560021153 - nodes in this community are weakly interconnected._
- **Should `Download Link Resolution` be split into smaller, more focused modules?**
  _Cohesion score 0.13742071881606766 - nodes in this community are weakly interconnected._
- **Should `Feed Fetching Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.13008130081300814 - nodes in this community are weakly interconnected._