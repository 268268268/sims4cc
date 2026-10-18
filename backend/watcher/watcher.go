package watcher

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"sims4cc-wails/backend/curseforge"
	"sims4cc-wails/backend/extractor"
)

type DetectedPayload struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	FilePath string `json:"filePath"`
	FileName string `json:"fileName"`
	Size     int64  `json:"size"`
	Mod      any    `json:"mod,omitempty"`
}

var (
	watchLock   sync.Mutex
	isWatching  bool
	stopWatcher chan struct{}
)

func getDownloadsDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	dl := filepath.Join(home, "Downloads")
	if info, err := os.Stat(dl); err == nil && info.IsDir() {
		return dl
	}
	return ""
}

// Запускает слежение за папкой Загрузки после перехода на страницу мода в браузере
func StartDownloadWatch(ctx context.Context, mod any) bool {
	watchLock.Lock()
	defer watchLock.Unlock()

	dlDir := getDownloadsDir()
	if dlDir == "" {
		return false
	}

	if isWatching {
		close(stopWatcher)
	}

	isWatching = true
	stopWatcher = make(chan struct{})

	startTime := time.Now().Add(-2 * time.Second)

	go func(stop chan struct{}) {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		seenFiles := make(map[string]int64)

		timeout := time.After(15 * time.Minute)

		for {
			select {
			case <-stop:
				return
			case <-timeout:
				watchLock.Lock()
				isWatching = false
				watchLock.Unlock()
				return
			case <-ticker.C:
				entries, err := os.ReadDir(dlDir)
				if err != nil {
					continue
				}

				for _, entry := range entries {
					if entry.IsDir() {
						continue
					}

					name := entry.Name()
					lower := strings.ToLower(name)
					if strings.HasSuffix(lower, ".crdownload") || strings.HasSuffix(lower, ".tmp") || strings.HasSuffix(lower, ".part") {
						continue
					}

					if strings.HasSuffix(lower, ".package") || strings.HasSuffix(lower, ".zip") || strings.HasSuffix(lower, ".rar") || strings.HasSuffix(lower, ".7z") || strings.HasSuffix(lower, ".ts4script") {
						fullPath := filepath.Join(dlDir, name)
						info, err := entry.Info()
						if err != nil {
							continue
						}

						if info.ModTime().Before(startTime) {
							continue
						}

						prevSize, exists := seenFiles[fullPath]
						curSize := info.Size()

						// Проверяем, что файл закончил скачиваться (размер не меняется)
						if exists && prevSize == curSize && curSize > 0 {
							if ctx != nil {
								runtime.EventsEmit(ctx, "cfHelper:detected", DetectedPayload{
									Path:     fullPath,
									Name:     name,
									FilePath: fullPath,
									FileName: name,
									Size:     curSize,
									Mod:      mod,
								})
							}
							delete(seenFiles, fullPath)
							return
						}

						seenFiles[fullPath] = curSize
					}
				}
			}
		}
	}(stopWatcher)

	return true
}

type InstallPayload struct {
	Path     string `json:"path"`
	FilePath string `json:"filePath"`
	Mod      any    `json:"mod,omitempty"`
}

type InstallCaughtResult struct {
	Ok            bool                         `json:"ok"`
	Results       []extractor.ImportItemResult `json:"results"`
	RecordedModId *int                         `json:"recordedModId,omitempty"`
	Error         string                       `json:"error,omitempty"`
}

// Устанавливает обнаруженный файл из Загрузок в папку Mods и регистрирует скачивание CurseForge
func InstallCaughtFile(p InstallPayload) InstallCaughtResult {
	targetPath := p.Path
	if targetPath == "" {
		targetPath = p.FilePath
	}
	if targetPath == "" {
		return InstallCaughtResult{Ok: false, Results: []extractor.ImportItemResult{}, Error: "No file to install."}
	}

	importRes := extractor.ImportFiles([]string{targetPath})
	var recordedId *int

	if importRes.Ok && p.Mod != nil {
		if m, ok := p.Mod.(map[string]any); ok {
			var modId int
			if idFloat, ok := m["id"].(float64); ok {
				modId = int(idFloat)
			} else if idInt, ok := m["id"].(int); ok {
				modId = idInt
			}
			modName, _ := m["name"].(string)
			var fileId int
			if lfArr, ok := m["latestFiles"].([]any); ok && len(lfArr) > 0 {
				if first, ok := lfArr[0].(map[string]any); ok {
					if fid, ok := first["id"].(float64); ok {
						fileId = int(fid)
					}
				}
			}
			var installedPath string
			for _, r := range importRes.Results {
				if r.Ok {
					if r.Folder != "" {
						installedPath = r.Folder
					} else {
						installedPath = r.Dest
					}
					break
				}
			}
			if modId > 0 && installedPath != "" {
				curseforge.RecordDownload(modId, modName, installedPath, fileId)
				recordedId = &modId
			}
		}
	}

	return InstallCaughtResult{
		Ok:            importRes.Ok,
		Results:       importRes.Results,
		RecordedModId: recordedId,
		Error:         importRes.Error,
	}
}
