package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"sims4cc-wails/backend/actions"
	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/conflicts"
	"sims4cc-wails/backend/curseforge"
	"sims4cc-wails/backend/discover"
	"sims4cc-wails/backend/downloader"
	"sims4cc-wails/backend/extractor"
	"sims4cc-wails/backend/inspector"
	"sims4cc-wails/backend/model3d"
	"sims4cc-wails/backend/polycount"
	"sims4cc-wails/backend/profiles"
	"sims4cc-wails/backend/resolver"
	"sims4cc-wails/backend/saves"
	"sims4cc-wails/backend/scanner"
	"sims4cc-wails/backend/swiper"
	"sims4cc-wails/backend/updater"
	"sims4cc-wails/backend/watcher"
)

// App struct
type App struct {
	ctx     context.Context
	updater *updater.Updater
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		updater: updater.NewUpdater(),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	downloader.Init(ctx)
	a.updater.Init(ctx)
}

// --- Config & System ---

func (a *App) GetConfig() *config.Config {
	return config.ReadConfig()
}

func (a *App) SetConfig(key string, val any) error {
	return config.SetConfig(key, val)
}

func (a *App) SelectFolder() string {
	res, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Выберите папку Mods The Sims 4",
	})
	if err != nil {
		return ""
	}
	return res
}

func (a *App) ValidateModsFolder(folder string) config.ValidationResult {
	return config.ValidateModsFolder(folder)
}

func (a *App) ClearGameCache() config.CacheResult {
	return config.ClearGameCache()
}

func (a *App) ShowItemInFolder(p string) error {
	return actions.ShowItemInFolder(p)
}

func (a *App) OpenExternal(url string) error {
	return actions.OpenExternal(url)
}

// --- App Updater ---

func (a *App) CheckForAppUpdate() (*updater.UpdateInfo, error) {
	return a.updater.CheckForUpdate()
}

func (a *App) DownloadAndInstallUpdate() error {
	return a.updater.DownloadAndInstall()
}

func (a *App) RestartApp() error {
	return a.updater.Restart()
}

func (a *App) GetAppVersion() string {
	return updater.AppVersion
}

// --- Local Mods ---

func (a *App) ScanLocalMods() scanner.ScanResult {
	return scanner.ScanMods()
}

func (a *App) GetCachedLocalMods() []scanner.LocalModDTO {
	return scanner.GetCachedMods()
}

func (a *App) MatchLocalCurseForge(opts map[string]any) map[string]any {
	return curseforge.MatchLocalCurseForge(opts)
}

// Возвращает URL локального изображения через быстрый встроенный /modimg обработчик
func (a *App) GetImageUrl(absPath string) string {
	if absPath == "" {
		return ""
	}
	ext := strings.ToLower(filepath.Ext(absPath))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif":
		return "/modimg?p=" + url.QueryEscape(absPath)
	default:
		return ""
	}
}

func (a *App) ToggleLocalModEnabled(filePath string, enabled bool) actions.ToggleResult {
	return actions.ToggleLocalModEnabled(filePath, enabled)
}

func (a *App) ExtractLocalArchive(filePath string) extractor.ExtractResult {
	return extractor.ExtractLocalArchive(filePath)
}

func (a *App) ExtractAllArchives() extractor.ExtractAllResult {
	return extractor.ExtractAllArchives()
}

func (a *App) InspectLocalMod(filePath string) inspector.InspectResult {
	return inspector.InspectLocalMod(filePath)
}

func (a *App) Get3DModel(filePath string, swatchIndex int) model3d.Model3DResult {
	return model3d.GetModel3DData(filePath, swatchIndex)
}

func (a *App) DeleteLocalMod(filePath string) actions.DeleteResult {
	return actions.DeleteLocalMod(filePath)
}

func (a *App) BatchToggleLocalMods(filePaths []string, enabled bool) actions.BatchToggleResult {
	return actions.BatchToggleLocalMods(filePaths, enabled)
}

func (a *App) BatchDeleteLocalMods(filePaths []string) actions.DeleteResult {
	return actions.BatchDeleteLocalMods(filePaths)
}

func (a *App) ImportFiles(paths []string) extractor.ImportFilesResult {
	return extractor.ImportFiles(paths)
}

// --- Conflicts & Duplicates ---

func (a *App) ScanConflicts() conflicts.ConflictScanResult {
	return conflicts.ScanDuplicatesAndConflicts()
}

func (a *App) DeleteDuplicateMod(filePath string) actions.DeleteResult {
	return conflicts.DeleteDuplicateMod(filePath)
}

// --- Polycount Scanner ---

func (a *App) ScanPolycount() polycount.PolyScanResult {
	return polycount.ScanPolycount()
}

// --- Save File Inspector ---

func (a *App) ListSaveFiles(customFolder string) saves.ListSavesResult {
	return saves.ListSaveFiles(customFolder)
}

func (a *App) AnalyzeSaveFile(savePath string) saves.SaveAnalysisResult {
	return saves.AnalyzeSaveFile(savePath)
}

// --- CC Swiper ---

func (a *App) SwiperGetCards(opts swiper.SwiperQueryOpts) swiper.SwiperCardsResult {
	return swiper.GetSwiperCards(opts)
}

func (a *App) SwiperAction(opts swiper.SwiperActionPayload) swiper.SwiperActionResult {
	return swiper.ProcessSwiperAction(opts)
}

func (a *App) SwiperUndo() swiper.SwiperActionResult {
	return swiper.UndoLastAction()
}

func (a *App) SwiperResetReviewed() bool {
	return swiper.ResetReviewed()
}

func (a *App) SwiperStartServer(port int) swiper.MobileServerStatus {
	return swiper.StartServer(port)
}

func (a *App) SwiperStopServer() swiper.MobileServerStatus {
	return swiper.StopServer()
}

func (a *App) SwiperGetServerStatus() swiper.MobileServerStatus {
	return swiper.GetServerStatus()
}

// --- Profiles ---

func (a *App) ListProfiles() profiles.ProfileStoreData {
	return profiles.ListProfiles()
}

func (a *App) SaveProfile(payload profiles.SaveProfilePayload) profiles.Profile {
	return profiles.SaveProfile(payload)
}

func (a *App) ApplyProfile(id string) profiles.ApplyProfileResult {
	return profiles.ApplyProfile(id)
}

func (a *App) RenameProfile(id, name string) profiles.ProfileStoreData {
	return profiles.RenameProfile(id, name)
}

func (a *App) DeleteProfile(id string) profiles.ProfileStoreData {
	return profiles.DeleteProfile(id)
}

var nonWordRe = regexp.MustCompile(`[^\w.-]+`)

func (a *App) ExportProfile(id string) map[string]any {
	p := profiles.GetProfile(id)
	if p == nil {
		return map[string]any{"ok": false, "error": "Profile not found."}
	}
	safeName := nonWordRe.ReplaceAllString(p.Name, "_")
	if safeName == "" {
		safeName = "profile"
	}
	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Экспорт профиля модов",
		DefaultFilename: safeName + ".s4profile.json",
		Filters: []runtime.FileFilter{
			{DisplayName: "Sims 4 Mod Profile (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if filePath == "" {
		return map[string]any{"ok": false, "canceled": true}
	}
	payload := map[string]any{
		"app":    "sims4-mod-manager",
		"kind":   "profile",
		"name":   p.Name,
		"states": p.States,
	}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := os.WriteFile(filePath, raw, 0644); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return map[string]any{"ok": true, "path": filePath}
}

func (a *App) ImportProfile() map[string]any {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Импорт профиля модов",
		Filters: []runtime.FileFilter{
			{DisplayName: "Sims 4 Mod Profile (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if filePath == "" {
		return map[string]any{"ok": false, "canceled": true}
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	var parsed struct {
		Name   string          `json:"name"`
		States map[string]bool `json:"states"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil || parsed.States == nil {
		return map[string]any{"ok": false, "error": "Not a valid profile file."}
	}
	store, id := profiles.AddImportedProfile(parsed.Name, parsed.States)
	return map[string]any{"ok": true, "data": store, "id": id}
}

// --- Creator Catalog & CurseForge ---

type CatalogResult struct {
	LastUpdated *string `json:"last_updated"`
	Creators    []any   `json:"creators"`
	Items       []any   `json:"items"`
}

func getCatalogCachePath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "catalog_cache.json")
}

func (a *App) GetCatalog() CatalogResult {
	const catalogURL = "https://raw.githubusercontent.com/PoZi268/sims4-cc-manager/refs/heads/main/catalog.json"
	cachePath := getCatalogCachePath()

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(catalogURL)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			var res CatalogResult
			if json.NewDecoder(resp.Body).Decode(&res) == nil && res.Creators != nil {
				if res.Items == nil {
					res.Items = []any{}
				}
				if raw, err := json.MarshalIndent(res, "", "  "); err == nil {
					_ = os.WriteFile(cachePath, raw, 0644)
				}
				return res
			}
		}
	}

	if data, err := os.ReadFile(cachePath); err == nil {
		var cached CatalogResult
		if json.Unmarshal(data, &cached) == nil && cached.Creators != nil {
			if cached.Items == nil {
				cached.Items = []any{}
			}
			return cached
		}
	}

	return CatalogResult{
		Creators: []any{},
		Items:    []any{},
	}
}

func (a *App) SearchCurseForge(params curseforge.SearchParams) curseforge.ApiResponse {
	return curseforge.SearchMods(params)
}

func (a *App) GetCurseForgeCategories() curseforge.ApiResponse {
	return curseforge.GetCategories()
}

func (a *App) DownloadCurseForgeMod(mod any) curseforge.DownloadResult {
	return curseforge.DownloadModStream(a.ctx, mod)
}

func (a *App) GetDownloadedCurseForge() map[string]curseforge.DownloadRecord {
	return curseforge.GetDownloaded()
}

func (a *App) CheckCurseForgeUpdates(opts any) curseforge.CheckUpdatesResult {
	return curseforge.CheckUpdates(opts)
}

func (a *App) UpdateCurseForgeMod(mod any) curseforge.DownloadResult {
	return curseforge.UpdateMod(a.ctx, mod)
}

func (a *App) GetCurseForgeModsByIds(ids []int) curseforge.ApiResponse {
	return curseforge.GetModsByIds(ids)
}

func (a *App) GetCurseForgeDescription(modId int) curseforge.DescriptionResult {
	return curseforge.GetModDescription(modId)
}

// --- Accounts & Discover ---

func (a *App) GetAuthStatus() map[string]any {
	return map[string]any{
		"patreon": map[string]any{
			"label":     "Patreon",
			"connected": false,
		},
		"pinterest": map[string]any{
			"label":     "Pinterest",
			"connected": false,
		},
	}
}

func (a *App) ConnectAccount(provider string) map[string]any {
	switch strings.ToLower(provider) {
	case "patreon":
		_ = actions.OpenExternal("https://www.patreon.com/login")
	case "pinterest":
		_ = actions.OpenExternal("https://www.pinterest.com/login/")
	}
	return map[string]any{"ok": true}
}

func (a *App) DisconnectAccount(provider string) map[string]any {
	return map[string]any{"ok": true}
}

func (a *App) GetSourceTypes() []discover.SourceTypeInfo {
	return discover.GetSourceTypes()
}

func (a *App) GetSources() []discover.Source {
	return discover.GetSources()
}

func (a *App) FollowSource(payload discover.FollowPayload) bool {
	return discover.FollowSource(payload)
}

func (a *App) FollowSourcesBatch(payload any) any {
	return discover.FollowSourcesBatch(payload)
}

func (a *App) UnfollowSource(id string) bool {
	return discover.UnfollowSource(id)
}

func (a *App) GetCachedDiscover() discover.DiscoverFeedResult {
	return discover.GetCachedDiscover()
}

func (a *App) FetchDiscover(opts any) discover.DiscoverFeedResult {
	return discover.FetchDiscover(opts)
}

func (a *App) FetchMoreDiscover() discover.DiscoverFeedResult {
	return discover.FetchMoreDiscover()
}

func (a *App) FetchSourceDiscover(payload any) discover.SourceFeedResult {
	return discover.FetchSourceFeed(payload)
}

func (a *App) GetMtsDetail(url string) discover.MtsDetailResult {
	return discover.GetMtsDetail(url)
}

func (a *App) GetTumblrDetail(links any) discover.TumblrDetailResult {
	return discover.GetTumblrDetail(links)
}

func (a *App) FetchTumblrFeed(payload any) discover.TumblrTagFeedResult {
	return discover.FetchTumblrTagFeed(payload)
}

func (a *App) FetchPinterestFeed(payload any) discover.PinterestTagFeedResult {
	return discover.FetchPinterestTagFeed(payload)
}

func (a *App) GetDownloadedDiscover() discover.DownloadedDiscoverResult {
	return discover.GetDownloadedDiscover()
}

func (a *App) GetSuggestedSources() []discover.SuggestedSource {
	return discover.GetSuggestedSources()
}

func (a *App) FollowSuggestedSources(entries any) any {
	return discover.FollowSuggestedSources(entries)
}

func (a *App) DownloadDiscoverItem(item any) discover.DownloadResult {
	return discover.DownloadDiscoverItem(a.ctx, item)
}

// --- Background Download Queue Manager ---

func (a *App) EnqueueCurseForgeDownload(mod any, isUpdate bool) downloader.QueueJob {
	return downloader.EnqueueCurseForge(mod, isUpdate)
}

func (a *App) EnqueueDiscoverDownload(item any) downloader.QueueJob {
	return downloader.EnqueueDiscover(item)
}

func (a *App) GetDownloadQueue() []downloader.QueueJob {
	return downloader.GetQueue()
}

func (a *App) CancelDownloadJob(jobId string) bool {
	return downloader.CancelJob(jobId)
}

func (a *App) RetryDownloadJob(jobId string) downloader.QueueJob {
	return downloader.RetryJob(jobId)
}

func (a *App) ClearCompletedDownloads() []downloader.QueueJob {
	return downloader.ClearCompleted()
}

func tabTypeForUrl(pastedUrl string, resolved resolver.ResolvedLink) string {
	low := strings.ToLower(pastedUrl)
	if strings.Contains(low, "pinterest.") || strings.Contains(low, "pin.it/") {
		return "pinterest"
	}
	if strings.Contains(low, "patreon.com") {
		return "patreon"
	}
	if strings.Contains(low, "tumblr.com") {
		return "tumblr"
	}
	if strings.Contains(low, "boosty.to") {
		return "boosty"
	}
	if strings.Contains(low, "thesimsresource.com") {
		return "tsr"
	}
	if strings.Contains(low, "itch.io") {
		return "itch"
	}
	if strings.Contains(low, "github.com") {
		return "github"
	}
	if strings.Contains(low, "modthesims.info") {
		return "modthesims"
	}
	if resolved.SourceType != "" {
		return resolved.SourceType
	}
	return "patreon"
}

func (a *App) ResolveDiscoverLink(rawUrl string) resolver.ResolvedLink {
	res := resolver.ResolveLink(rawUrl)
	if res.Ok && res.Id != "" {
		title := res.Title
		if title == "" {
			title = "Saved link"
		}
		targetUrl := res.Url
		if targetUrl == "" {
			targetUrl = rawUrl
		}
		downloads := res.Downloads
		if downloads == nil {
			downloads = []resolver.DownloadFile{}
		}
		discover.AddSavedLink(map[string]any{
			"id":         res.Id,
			"pinUrl":     rawUrl,
			"title":      title,
			"author":     res.Author,
			"imageUrl":   res.ImageUrl,
			"sourceType": tabTypeForUrl(rawUrl, res),
			"url":        targetUrl,
			"downloads":  downloads,
			"locked":     res.Locked,
			"saved":      true,
		})
	}
	return res
}

func (a *App) GetSavedLinks() []any {
	return discover.GetSavedLinks()
}

func (a *App) RemoveSavedLink(id string) bool {
	return discover.RemoveSavedLink(id)
}

// --- Download watcher & Helpers ---

func (a *App) StartDownloadWatch(mod any) bool {
	return watcher.StartDownloadWatch(a.ctx, mod)
}

func (a *App) InstallCaughtFile(payload watcher.InstallPayload) watcher.InstallCaughtResult {
	return watcher.InstallCaughtFile(payload)
}

func (a *App) OpenThumbCache() map[string]any {
	dir := scanner.GetThumbCacheDir()
	_ = actions.OpenDirectory(dir)
	return map[string]any{"ok": true}
}

func (a *App) ClearThumbCache() map[string]any {
	if err := scanner.ClearThumbCache(); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return map[string]any{"ok": true}
}
