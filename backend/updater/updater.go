package updater

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	APP_VERSION       = "2.0.1"
	AppVersion        = APP_VERSION
	GithubRepoOwner   = "268268268"
	GithubRepoName    = "sims4cc"
	LatestReleaseURL  = "https://api.github.com/repos/268268268/sims4cc/releases/latest"
	DefaultBinaryName = "sims4-cc-manager.exe"
)

type GitHubAsset struct {
	ID                 int64  `json:"id"`
	Name               string `json:"name"`
	Size               int64  `json:"size"`
	ContentType        string `json:"content_type"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type GitHubRelease struct {
	TagName     string        `json:"tag_name"`
	Name        string        `json:"name"`
	Body        string        `json:"body"`
	Draft       bool          `json:"draft"`
	Prerelease  bool          `json:"prerelease"`
	PublishedAt time.Time     `json:"published_at"`
	HTMLURL     string        `json:"html_url"`
	Assets      []GitHubAsset `json:"assets"`
}

type UpdateInfo struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	HasUpdate      bool   `json:"hasUpdate"`
	ReleaseName    string `json:"releaseName"`
	ReleaseNotes   string `json:"releaseNotes"`
	PublishedAt    string `json:"publishedAt"`
	DownloadURL    string `json:"downloadUrl"`
	AssetSize      int64  `json:"assetSize"`
	AssetName      string `json:"assetName"`
	IsZip          bool   `json:"isZip"`
}

type ProgressInfo struct {
	Status     string  `json:"status"` // "checking" | "downloading" | "extracting" | "installing" | "ready" | "error"
	Percent    float64 `json:"percent"`
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Error      string  `json:"error,omitempty"`
}

type Updater struct {
	ctx           context.Context
	mu            sync.Mutex
	cachedUpdate  *UpdateInfo
	isDownloading bool
	httpClient    *http.Client
}

func NewUpdater() *Updater {
	return &Updater{
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

func (u *Updater) Init(ctx context.Context) {
	u.ctx = ctx
}

type Version struct {
	Major int
	Minor int
	Patch int
	Pre   string
}

func parseVersion(v string) Version {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	v = strings.TrimPrefix(v, "V")

	var ver Version
	parts := strings.SplitN(v, "-", 2)
	mainPart := parts[0]
	if len(parts) > 1 {
		ver.Pre = parts[1]
	}

	nums := strings.Split(mainPart, ".")
	if len(nums) > 0 {
		ver.Major, _ = strconv.Atoi(nums[0])
	}
	if len(nums) > 1 {
		ver.Minor, _ = strconv.Atoi(nums[1])
	}
	if len(nums) > 2 {
		ver.Patch, _ = strconv.Atoi(nums[2])
	}
	return ver
}

// CompareVersions returns:
//  1 if v1 > v2
// -1 if v1 < v2
//  0 if v1 == v2
func CompareVersions(v1, v2 string) int {
	ver1 := parseVersion(v1)
	ver2 := parseVersion(v2)

	if ver1.Major != ver2.Major {
		if ver1.Major > ver2.Major {
			return 1
		}
		return -1
	}
	if ver1.Minor != ver2.Minor {
		if ver1.Minor > ver2.Minor {
			return 1
		}
		return -1
	}
	if ver1.Patch != ver2.Patch {
		if ver1.Patch > ver2.Patch {
			return 1
		}
		return -1
	}

	if ver1.Pre == "" && ver2.Pre == "" {
		return 0
	}
	if ver1.Pre == "" && ver2.Pre != "" {
		return 1
	}
	if ver1.Pre != "" && ver2.Pre == "" {
		return -1
	}
	if ver1.Pre > ver2.Pre {
		return 1
	} else if ver1.Pre < ver2.Pre {
		return -1
	}
	return 0
}

func pickBestAsset(assets []GitHubAsset) (*GitHubAsset, bool, error) {
	if len(assets) == 0 {
		return nil, false, errors.New("no assets found in release")
	}

	// 1. Direct sims4-cc-manager.exe or similar .exe
	for i := range assets {
		name := strings.ToLower(assets[i].Name)
		if name == "sims4-cc-manager.exe" || name == "sims4-mod-manager.exe" {
			return &assets[i], false, nil
		}
	}
	for i := range assets {
		name := strings.ToLower(assets[i].Name)
		if strings.HasSuffix(name, ".exe") && (strings.Contains(name, "sims4") || strings.Contains(name, "cc-manager") || strings.Contains(name, "mod-manager")) {
			return &assets[i], false, nil
		}
	}

	// 2. Zip archive containing windows build
	for i := range assets {
		name := strings.ToLower(assets[i].Name)
		if strings.HasSuffix(name, ".zip") && (strings.Contains(name, "win") || strings.Contains(name, "sims4")) {
			return &assets[i], true, nil
		}
	}

	// 3. Any .exe
	for i := range assets {
		if strings.HasSuffix(strings.ToLower(assets[i].Name), ".exe") {
			return &assets[i], false, nil
		}
	}

	// 4. Any .zip
	for i := range assets {
		if strings.HasSuffix(strings.ToLower(assets[i].Name), ".zip") {
			return &assets[i], true, nil
		}
	}

	return nil, false, errors.New("no suitable Windows executable or zip found in release assets")
}

func (u *Updater) CheckForUpdate() (*UpdateInfo, error) {
	req, err := http.NewRequest("GET", LatestReleaseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create update request: %w", err)
	}
	req.Header.Set("User-Agent", "Sims4CCManager-Updater/"+APP_VERSION)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to check for updates: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var rel GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, fmt.Errorf("failed to decode release info: %w", err)
	}

	asset, isZip, err := pickBestAsset(rel.Assets)
	if err != nil {
		return nil, err
	}

	hasUpdate := CompareVersions(rel.TagName, APP_VERSION) > 0

	published := ""
	if !rel.PublishedAt.IsZero() {
		published = rel.PublishedAt.Format(time.RFC3339)
	}

	info := &UpdateInfo{
		CurrentVersion: APP_VERSION,
		LatestVersion:  strings.TrimPrefix(rel.TagName, "v"),
		HasUpdate:      hasUpdate,
		ReleaseName:    rel.Name,
		ReleaseNotes:   rel.Body,
		PublishedAt:    published,
		DownloadURL:    asset.BrowserDownloadURL,
		AssetSize:      asset.Size,
		AssetName:      asset.Name,
		IsZip:          isZip,
	}

	u.mu.Lock()
	u.cachedUpdate = info
	u.mu.Unlock()

	return info, nil
}

func (u *Updater) emitProgress(info ProgressInfo) {
	if u.ctx != nil {
		runtime.EventsEmit(u.ctx, "app_update_progress", info)
	}
}

func (u *Updater) copyTracked(dst io.Writer, src io.Reader, total int64) error {
	buf := make([]byte, 64*1024)
	var downloaded int64
	lastEmit := time.Now()

	for {
		n, err := src.Read(buf)
		if n > 0 {
			if _, wErr := dst.Write(buf[:n]); wErr != nil {
				return wErr
			}
			downloaded += int64(n)

			if time.Since(lastEmit) >= 120*time.Millisecond || (total > 0 && downloaded >= total) {
				percent := float64(0)
				if total > 0 {
					percent = float64(downloaded) / float64(total) * 100.0
					if percent > 100.0 {
						percent = 100.0
					}
				}
				u.emitProgress(ProgressInfo{
					Status:     "downloading",
					Percent:    percent,
					Downloaded: downloaded,
					Total:      total,
				})
				lastEmit = time.Now()
			}
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
	}
	return nil
}

func extractExeFromZip(zipPath string, destExePath string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	var targetFile *zip.File
	for _, f := range r.File {
		name := strings.ToLower(filepath.Base(f.Name))
		if name == "sims4-cc-manager.exe" || name == "sims4-mod-manager.exe" {
			targetFile = f
			break
		}
		if strings.HasSuffix(name, ".exe") && targetFile == nil {
			targetFile = f
		}
	}
	if targetFile == nil {
		return errors.New("no executable found in update archive")
	}

	rc, err := targetFile.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	out, err := os.OpenFile(destExePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, rc)
	return err
}

func (u *Updater) DownloadAndInstall() error {
	u.mu.Lock()
	if u.isDownloading {
		u.mu.Unlock()
		return errors.New("update download already in progress")
	}
	u.isDownloading = true
	info := u.cachedUpdate
	u.mu.Unlock()

	defer func() {
		u.mu.Lock()
		u.isDownloading = false
		u.mu.Unlock()
	}()

	var err error
	if info == nil || info.DownloadURL == "" {
		info, err = u.CheckForUpdate()
		if err != nil {
			u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
			return err
		}
	}

	exePath, err := os.Executable()
	if err != nil {
		u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
		return fmt.Errorf("failed to resolve executable symlinks: %w", err)
	}

	dir := filepath.Dir(exePath)
	u.emitProgress(ProgressInfo{
		Status:     "downloading",
		Percent:    0,
		Downloaded: 0,
		Total:      info.AssetSize,
	})

	client := &http.Client{
		Timeout: 30 * time.Minute,
	}

	req, err := http.NewRequest("GET", info.DownloadURL, nil)
	if err != nil {
		u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
		return err
	}
	req.Header.Set("User-Agent", "Sims4ModManager-Updater/"+APP_VERSION)

	resp, err := client.Do(req)
	if err != nil {
		u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
		return fmt.Errorf("failed to download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err = fmt.Errorf("download failed with HTTP %d", resp.StatusCode)
		u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
		return err
	}

	contentLength := resp.ContentLength
	if contentLength <= 0 && info.AssetSize > 0 {
		contentLength = info.AssetSize
	}

	updateNewPath := exePath + ".update"
	_ = os.Remove(updateNewPath)

	if info.IsZip {
		zipTempPath := filepath.Join(dir, "sims4-update-temp.zip")
		_ = os.Remove(zipTempPath)
		defer os.Remove(zipTempPath)

		outFile, err := os.OpenFile(zipTempPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
		if err != nil {
			u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
			return err
		}

		err = u.copyTracked(outFile, resp.Body, contentLength)
		outFile.Close()
		if err != nil {
			u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
			return err
		}

		u.emitProgress(ProgressInfo{
			Status:  "extracting",
			Percent: 100,
			Total:   contentLength,
		})

		if err := extractExeFromZip(zipTempPath, updateNewPath); err != nil {
			u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
			return fmt.Errorf("failed to extract update executable: %w", err)
		}
	} else {
		outFile, err := os.OpenFile(updateNewPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
			return err
		}

		err = u.copyTracked(outFile, resp.Body, contentLength)
		outFile.Close()
		if err != nil {
			_ = os.Remove(updateNewPath)
			u.emitProgress(ProgressInfo{Status: "error", Error: err.Error()})
			return err
		}
	}

	u.emitProgress(ProgressInfo{
		Status:  "installing",
		Percent: 100,
	})

	oldPath := exePath + ".old"
	_ = os.Remove(oldPath)

	// Attempt atomic in-place rename if Windows permits
	if rErr := os.Rename(exePath, oldPath); rErr == nil {
		if mErr := os.Rename(updateNewPath, exePath); mErr != nil {
			// Rollback
			_ = os.Rename(oldPath, exePath)
			u.emitProgress(ProgressInfo{Status: "error", Error: mErr.Error()})
			return fmt.Errorf("failed to move updated binary: %w", mErr)
		}
	}
	// Note: If renaming running exe fails, updateNewPath stays on disk and Restart will swap it.

	u.emitProgress(ProgressInfo{
		Status:     "ready",
		Percent:    100,
		Downloaded: contentLength,
		Total:      contentLength,
	})

	return nil
}

func (u *Updater) Restart() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to determine executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return fmt.Errorf("failed to resolve symlink: %w", err)
	}

	dir := filepath.Dir(exePath)
	oldPath := exePath + ".old"
	updatePath := exePath + ".update"

	// Deferred restart command via cmd.exe:
	// 1. Wait 1-2 seconds with ping
	// 2. If updatePath exists, overwrite exePath with move /Y
	// 3. Clean up .old if exists
	// 4. Start the updated executable
	cmdStr := fmt.Sprintf(`ping 127.0.0.1 -n 2 > nul & if exist "%s" move /Y "%s" "%s" & if exist "%s" del /F /Q "%s" 2>nul & start "" "%s"`,
		updatePath, updatePath, exePath,
		oldPath, oldPath,
		exePath,
	)

	cmd := exec.Command("cmd.exe", "/C", cmdStr)
	cmd.Dir = dir
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to launch restart process: %w", err)
	}

	go func() {
		time.Sleep(300 * time.Millisecond)
		if u.ctx != nil {
			runtime.Quit(u.ctx)
		}
		os.Exit(0)
	}()

	return nil
}
