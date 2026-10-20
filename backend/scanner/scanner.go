package scanner

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/dbpf"
)

type ThumbnailDTO struct {
	Source string  `json:"source"` // "sidecar", "dbpf", "fallback"
	Path   *string `json:"path"`
}

type LocalModDTO struct {
	Id           string       `json:"id"`
	Name         string       `json:"name"`
	Author       *string      `json:"author"`
	FileName     string       `json:"fileName"`
	FilePath     string       `json:"filePath"`
	RelativePath string       `json:"relativePath"`
	FolderPath   string       `json:"folderPath"`
	Type         string       `json:"type"`
	Enabled      bool         `json:"enabled"`
	Size         int64        `json:"size"`
	ModifiedAt   string       `json:"modifiedAt"`
	DateAdded    *string      `json:"dateAdded"`
	Kinds        []string     `json:"kinds"`
	Has3D        bool         `json:"has3D"`
	Thumbnail    ThumbnailDTO `json:"thumbnail"`
	ParseStatus  string       `json:"parseStatus"`
	Error        string       `json:"error,omitempty"`
}

type ScanResult struct {
	Ok        bool          `json:"ok"`
	Count     int           `json:"count"`
	ScannedAt string        `json:"scannedAt"`
	Mods      []LocalModDTO `json:"mods"`
	Errors    []ScanError   `json:"errors"`
}

type ScanError struct {
	File    string `json:"file"`
	Message string `json:"message"`
}

var (
	cacheLock sync.RWMutex
	cachedMods []LocalModDTO
)

var sidecarSuffixes = []string{
	".png", ".jpg", ".jpeg", ".webp",
	".preview.png", ".preview.jpg",
	".thumbnail.png", ".thumbnail.jpg",
}

var fallbackNames = []string{
	"preview.png", "preview.jpg", "preview.webp", "thumbnail.png", "thumbnail.jpg", "cover.png", "cover.jpg", "cover.webp",
}

func getCachePath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "local-mods-cache.json")
}

func makeId(rel string) string {
	h := sha1.Sum([]byte(rel))
	return hex.EncodeToString(h[:8])
}

func cleanModName(name string) string {
	name = strings.ReplaceAll(name, "\\n", " ")
	name = strings.ReplaceAll(name, "\\r", " ")
	name = strings.ReplaceAll(name, "\\t", " ")
	name = strings.ReplaceAll(name, "_", " ")
	name = strings.ReplaceAll(name, "-", " ")
	return strings.TrimSpace(name)
}

func deriveName(fileName string) string {
	n := fileName
	if strings.HasSuffix(n, ".disabled") {
		n = strings.TrimSuffix(n, ".disabled")
	}
	if strings.HasSuffix(n, ".package") {
		n = strings.TrimSuffix(n, ".package")
	} else if strings.HasSuffix(n, ".ts4script") {
		n = strings.TrimSuffix(n, ".ts4script")
	} else if strings.HasSuffix(n, ".zip") {
		n = strings.TrimSuffix(n, ".zip")
	}
	cleaned := cleanModName(n)
	if cleaned == "" {
		return fileName
	}
	return cleaned
}

func deriveAuthor(rel string) *string {
	parts := strings.Split(rel, string(filepath.Separator))
	if len(parts) > 1 {
		a := parts[0]
		return &a
	}
	return nil
}

func detectSidecar(filePath string) (ThumbnailDTO, bool) {
	dir := filepath.Dir(filePath)
	base := filepath.Base(filePath)

	stem := base
	if strings.HasSuffix(stem, ".disabled") {
		stem = strings.TrimSuffix(stem, ".disabled")
	}
	if strings.HasSuffix(stem, ".package") {
		stem = strings.TrimSuffix(stem, ".package")
	} else if strings.HasSuffix(stem, ".ts4script") {
		stem = strings.TrimSuffix(stem, ".ts4script")
	}

	for _, sfx := range sidecarSuffixes {
		candidate := filepath.Join(dir, stem+sfx)
		if _, err := os.Stat(candidate); err == nil {
			return ThumbnailDTO{Source: "sidecar", Path: &candidate}, true
		}
	}

	for _, name := range fallbackNames {
		candidate := filepath.Join(dir, name)
		if _, err := os.Stat(candidate); err == nil {
			return ThumbnailDTO{Source: "sidecar", Path: &candidate}, true
		}
	}

	return ThumbnailDTO{Source: "fallback", Path: nil}, false
}

func imgExt(buf []byte) string {
	if len(buf) >= 3 && buf[0] == 0xff && buf[1] == 0xd8 && buf[2] == 0xff {
		return ".jpg"
	}
	if len(buf) >= 8 && buf[0] == 0x89 && buf[1] == 0x50 && buf[2] == 0x4e && buf[3] == 0x47 {
		return ".png"
	}
	if len(buf) >= 12 && string(buf[0:4]) == "RIFF" && string(buf[8:12]) == "WEBP" {
		return ".webp"
	}
	return ""
}

var (
	thumbCacheLock    sync.RWMutex
	thumbCachePath    string
	thumbCacheMtime   int64
	thumbCacheEntries map[uint64]dbpf.Entry
)

// Находит localthumbcache.package рядом с папкой Mods или в Documents
func getLocalThumbCachePath(modsFolder string) string {
	if modsFolder != "" {
		p := filepath.Join(filepath.Dir(modsFolder), "localthumbcache.package")
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			return p
		}
	}
	for _, c := range config.GetSims4CacheCandidates() {
		if fi, err := os.Stat(c); err == nil && !fi.IsDir() {
			return c
		}
	}
	return ""
}

// Загружает индекс localthumbcache в память один раз для быстрого поиска
func loadThumbCache(cachePath string) {
	if cachePath == "" {
		return
	}
	fi, err := os.Stat(cachePath)
	if err != nil {
		return
	}

	thumbCacheLock.Lock()
	defer thumbCacheLock.Unlock()

	if thumbCachePath == cachePath && thumbCacheMtime == fi.ModTime().Unix() && thumbCacheEntries != nil {
		return
	}

	entries, err := dbpf.ParseEntries(cachePath)
	if err != nil {
		return
	}

	m := make(map[uint64]dbpf.Entry, len(entries))
	for _, e := range entries {
		if e.Type == dbpf.TypeThumbnail || e.Type == dbpf.TypeObjectThumbnail {
			m[e.Instance] = e
		}
	}

	thumbCachePath = cachePath
	thumbCacheMtime = fi.ModTime().Unix()
	thumbCacheEntries = m
}

// Извлекает превью из localthumbcache по списку candidate instance IDs
func getThumbnailFromLocalCache(cachePath string, instances []uint64) ([]byte, string) {
	thumbCacheLock.RLock()
	entriesMap := thumbCacheEntries
	thumbCacheLock.RUnlock()

	if len(entriesMap) == 0 {
		return nil, ""
	}

	var match *dbpf.Entry
	for _, inst := range instances {
		if e, ok := entriesMap[inst]; ok {
			match = &e
			break
		}
	}
	if match == nil {
		return nil, ""
	}

	f, err := os.Open(cachePath)
	if err != nil {
		return nil, ""
	}
	defer f.Close()

	data, err := dbpf.ReadEntry(f, *match)
	if err != nil {
		return nil, ""
	}
	ext := imgExt(data)
	if ext == "" {
		return nil, ""
	}
	return data, ext
}

// Проверяет наличие уже сохраненной миниатюры в кэше thumbnails по пути файла
func checkCachedThumbnail(filePath string) (ThumbnailDTO, bool) {
	h := sha1.Sum([]byte(filePath))
	key := hex.EncodeToString(h[:8])
	cacheDir := GetThumbCacheDir()
	for _, ext := range []string{".jpg", ".png", ".webp"} {
		cand := filepath.Join(cacheDir, key+ext)
		if fi, err := os.Stat(cand); err == nil && fi.Size() > 0 {
			return ThumbnailDTO{Source: "dbpf", Path: &cand}, true
		}
	}
	return ThumbnailDTO{Source: "fallback", Path: nil}, false
}

// Извлекает встроенную миниатюру из .package или localthumbcache и сохраняет в кэш
func extractThumbnail(filePath string, entries []dbpf.Entry, cachePath string) (ThumbnailDTO, bool) {
	if cached, ok := checkCachedThumbnail(filePath); ok {
		return cached, true
	}
	h := sha1.Sum([]byte(filePath))
	key := hex.EncodeToString(h[:8])
	cacheDir := GetThumbCacheDir()

	var bestData []byte
	var bestExt string

	// 1. Поиск ТОЛЬКО в выделенных ресурсах миниатюр пакета (CAS / Object Thumbs)
	var thumbEntries []dbpf.Entry
	for _, e := range entries {
		if (e.Type == dbpf.TypeThumbnail || e.Type == dbpf.TypeObjectThumbnail) && e.Size > 0 && e.DecompressedSize <= 2*1024*1024 {
			thumbEntries = append(thumbEntries, e)
		}
	}

	if len(thumbEntries) > 0 {
		f, err := os.Open(filePath)
		if err == nil {
			for _, e := range thumbEntries {
				raw, err := dbpf.ReadEntry(f, e)
				if err == nil && len(raw) > len(bestData) {
					ext := imgExt(raw)
					if ext != "" {
						bestData = raw
						bestExt = ext
					}
				}
			}
			_ = f.Close()
		}
	}

	// 2. Запасной вариант: поиск в localthumbcache.package игры (по всем CAS/Object/Thumb инстансам в памяти за O(1))
	if len(bestData) == 0 && cachePath != "" {
		var candidates []uint64
		for _, e := range entries {
			if e.Type == dbpf.TypeCasPart || e.Type == dbpf.TypeObjectDef || e.Type == dbpf.TypeObjectCatalog || e.Type == dbpf.TypeThumbnail || e.Type == dbpf.TypeObjectThumbnail {
				candidates = append(candidates, e.Instance)
			}
		}
		if len(candidates) == 0 {
			for _, e := range entries {
				candidates = append(candidates, e.Instance)
			}
		}
		if len(candidates) > 0 {
			data, ext := getThumbnailFromLocalCache(cachePath, candidates)
			if len(data) > 0 {
				bestData = data
				bestExt = ext
			}
		}
	}

	if len(bestData) > 0 {
		outPath := filepath.Join(cacheDir, key+bestExt)
		if err := os.WriteFile(outPath, bestData, 0644); err == nil {
			return ThumbnailDTO{Source: "dbpf", Path: &outPath}, true
		}
	}

	return ThumbnailDTO{Source: "fallback", Path: nil}, false
}

// Загружает закэшированный список модов для мгновенного старта UI
func GetCachedMods() []LocalModDTO {
	cacheLock.RLock()
	if cachedMods != nil {
		res := make([]LocalModDTO, len(cachedMods))
		copy(res, cachedMods)
		cacheLock.RUnlock()
		return res
	}
	cacheLock.RUnlock()

	data, err := os.ReadFile(getCachePath())
	if err == nil {
		var list []LocalModDTO
		if json.Unmarshal(data, &list) == nil {
			cacheLock.Lock()
			cachedMods = list
			cacheLock.Unlock()
			return list
		}
	}
	return []LocalModDTO{}
}

// Сохраняет список модов в файл кэша
func saveModsCache(mods []LocalModDTO) {
	data, err := json.Marshal(mods)
	if err == nil {
		_ = os.WriteFile(getCachePath(), data, 0644)
	}
}

// Сканирует папку Mods с параллельной обработкой
func ScanMods() ScanResult {
	cfg := config.ReadConfig()
	modsFolder := cfg.ModsFolder
	if modsFolder == "" {
		return ScanResult{Ok: false, Count: 0, Mods: []LocalModDTO{}, Errors: []ScanError{{File: "", Message: "Mods folder not configured"}}}
	}

	var files []string
	_ = filepath.Walk(modsFolder, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		name := strings.ToLower(info.Name())
		if strings.HasSuffix(name, ".package") ||
			strings.HasSuffix(name, ".ts4script") ||
			strings.HasSuffix(name, ".package.disabled") ||
			strings.HasSuffix(name, ".ts4script.disabled") ||
			strings.HasSuffix(name, ".zip") ||
			strings.HasSuffix(name, ".rar") ||
			strings.HasSuffix(name, ".7z") {
			files = append(files, path)
		}
		return nil
	})

	cachePath := getLocalThumbCachePath(modsFolder)
	if cachePath != "" {
		loadThumbCache(cachePath)
	}

	// Собираем старый кэш по путям для мгновенной сверки неизмененных файлов
	prev := GetCachedMods()
	prevMap := make(map[string]LocalModDTO, len(prev))
	for _, m := range prev {
		prevMap[m.FilePath] = m
	}

	results := make([]LocalModDTO, len(files))
	errorsList := make([]ScanError, 0)
	var errLock sync.Mutex

	// Пул горутин (до 4 воркеров для щадящего I/O и низкого потребления RAM)
	workerCount := runtime.NumCPU() / 2
	if workerCount < 2 {
		workerCount = 2
	} else if workerCount > 4 {
		workerCount = 4
	}
	jobs := make(chan int, len(files))
	var wg sync.WaitGroup

	for w := 0; w < workerCount; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range jobs {
				p := files[idx]
				info, err := os.Stat(p)
				if err != nil {
					errLock.Lock()
					errorsList = append(errorsList, ScanError{File: p, Message: err.Error()})
					errLock.Unlock()
					continue
				}

				size := info.Size()
				mtime := info.ModTime().UTC().Format(time.RFC3339)
				fileName := info.Name()
				rel, _ := filepath.Rel(modsFolder, p)
				id := makeId(rel)
				author := deriveAuthor(rel)

				lowerName := strings.ToLower(fileName)
				enabled := !strings.HasSuffix(lowerName, ".disabled")

				// Проверка предыдущего кэша: мгновенное повторное использование если размер и дата не менялись
				if old, ok := prevMap[p]; ok && old.ModifiedAt == mtime && old.Size == size && old.Error == "" {
					if old.Thumbnail.Path == nil {
						if sc, ok := detectSidecar(p); ok {
							old.Thumbnail = sc
						} else if cached, ok := checkCachedThumbnail(p); ok {
							old.Thumbnail = cached
						}
					}
					results[idx] = old
					continue
				}

				if strings.HasSuffix(lowerName, ".zip") || strings.HasSuffix(lowerName, ".rar") || strings.HasSuffix(lowerName, ".7z") {
					results[idx] = LocalModDTO{
						Id:           id,
						Name:         deriveName(fileName),
						Author:       author,
						FileName:     fileName,
						FilePath:     p,
						RelativePath: rel,
						FolderPath:   filepath.Dir(p),
						Type:         "archive",
						Enabled:      false,
						Size:         size,
						ModifiedAt:   mtime,
						Thumbnail:    ThumbnailDTO{Source: "fallback", Path: nil},
						ParseStatus:  "unsupported",
					}
					continue
				}

				modType := "package"
				if strings.Contains(lowerName, ".ts4script") {
					modType = "ts4script"
				}

				thumb, hasSidecar := detectSidecar(p)
				name := deriveName(fileName)
				var kinds []string
				parseStatus := "fallback"
				has3D := false

				if modType == "package" {
					entries, err := dbpf.ParseEntries(p)
					if err == nil {
						parseStatus = "parsed"
						stblName, extKinds := dbpf.ExtractPackageMeta(p, entries)
						if stblName != "" {
							name = stblName
						}
						kinds = extKinds

						// Определяем 3D строго по наличию мешей GEOM
						for _, e := range entries {
							if e.Type == dbpf.TypeGeomModel || e.Type == dbpf.TypeGeomModelAlt {
								has3D = true
								break
							}
						}

						if !hasSidecar {
							if embThumb, ok := extractThumbnail(p, entries, cachePath); ok {
								thumb = embThumb
							}
						}
					}
				} else if !hasSidecar {
					if cached, ok := checkCachedThumbnail(p); ok {
						thumb = cached
					}
				}

				results[idx] = LocalModDTO{
					Id:           id,
					Name:         name,
					Author:       author,
					FileName:     fileName,
					FilePath:     p,
					RelativePath: rel,
					FolderPath:   filepath.Dir(p),
					Type:         modType,
					Enabled:      enabled,
					Size:         size,
					ModifiedAt:   mtime,
					Kinds:        kinds,
					Has3D:        has3D,
					Thumbnail:    thumb,
					ParseStatus:  parseStatus,
				}
			}
		}()
	}

	for i := 0; i < len(files); i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()

	var finalMods []LocalModDTO
	for _, m := range results {
		if m.Id != "" {
			finalMods = append(finalMods, m)
		}
	}

	cacheLock.Lock()
	cachedMods = finalMods
	cacheLock.Unlock()

	saveModsCache(finalMods)

	return ScanResult{
		Ok:        true,
		Count:     len(finalMods),
		ScannedAt: time.Now().UTC().Format(time.RFC3339),
		Mods:      finalMods,
		Errors:    errorsList,
	}
}

// Возвращает путь к папке кэша миниатюр приложения
func GetThumbCacheDir() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager", "thumbnails")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

// Скачивает внешнюю обложку мода (с Patreon, Tumblr, Pinterest, Boosty, TSR, CurseForge, MTS) и привязывает к установленным файлам
func SaveExternalThumbnail(installedPath, imageUrl string) {
	imageUrl = strings.TrimSpace(imageUrl)
	if installedPath == "" || imageUrl == "" || !strings.HasPrefix(imageUrl, "http") {
		return
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", imageUrl, nil)
	if err != nil {
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return
	}

	imgBytes, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil || len(imgBytes) < 64 {
		return
	}

	ext := imgExt(imgBytes)
	if ext == "" {
		ext = ".jpg"
	}

	info, err := os.Stat(installedPath)
	if err != nil {
		return
	}

	var targetFiles []string
	if info.IsDir() {
		// Сохраняем preview.(jpg|png|webp) прямо в папку распакованного архива (подхватывается detectSidecar)
		sidecarPath := filepath.Join(installedPath, "preview"+ext)
		_ = os.WriteFile(sidecarPath, imgBytes, 0644)

		_ = filepath.Walk(installedPath, func(p string, fi os.FileInfo, err error) error {
			if err == nil && !fi.IsDir() {
				low := strings.ToLower(fi.Name())
				if strings.HasSuffix(low, ".package") || strings.HasSuffix(low, ".ts4script") {
					targetFiles = append(targetFiles, p)
				}
			}
			return nil
		})
	} else {
		targetFiles = append(targetFiles, installedPath)
	}

	cacheDir := GetThumbCacheDir()
	for _, tf := range targetFiles {
		h := sha1.Sum([]byte(tf))
		key := hex.EncodeToString(h[:8])
		outPath := filepath.Join(cacheDir, key+ext)
		if _, err := os.Stat(outPath); os.IsNotExist(err) {
			_ = os.WriteFile(outPath, imgBytes, 0644)
		}
	}
}

// Очищает кэш миниатюр приложения и сбрасывает кэш модов
func ClearThumbCache() error {
	dir := GetThumbCacheDir()
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	_ = os.MkdirAll(dir, 0755)
	cacheLock.Lock()
	cachedMods = nil
	cacheLock.Unlock()
	_ = os.Remove(getCachePath())
	return nil
}

// Мгновенно обновляет путь и статус мода при переключении (.disabled) без полного пересканирования папки
func ReplaceCachedMod(oldPath, newPath string, enabled bool) *LocalModDTO {
	if len(cachedMods) == 0 {
		_ = GetCachedMods()
	}

	cacheLock.Lock()
	defer cacheLock.Unlock()

	cfg := config.ReadConfig()
	modsFolder := cfg.ModsFolder

	for i := range cachedMods {
		if strings.EqualFold(cachedMods[i].FilePath, oldPath) {
			m := cachedMods[i]
			m.FilePath = newPath
			m.FileName = filepath.Base(newPath)
			if modsFolder != "" {
				if rel, err := filepath.Rel(modsFolder, newPath); err == nil {
					m.RelativePath = rel
					m.Id = makeId(rel)
				}
			}
			m.Enabled = enabled
			if info, err := os.Stat(newPath); err == nil {
				m.ModifiedAt = info.ModTime().UTC().Format(time.RFC3339)
			}
			cachedMods[i] = m
			saveModsCache(cachedMods)
			res := m
			return &res
		}
	}

	// Если мода не было в кэше — создаем запись по файлу
	info, err := os.Stat(newPath)
	if err != nil {
		return nil
	}
	rel := filepath.Base(newPath)
	if modsFolder != "" {
		if r, err := filepath.Rel(modsFolder, newPath); err == nil {
			rel = r
		}
	}
	modType := "package"
	if strings.Contains(strings.ToLower(info.Name()), ".ts4script") {
		modType = "ts4script"
	}
	m := LocalModDTO{
		Id:           makeId(rel),
		Name:         deriveName(info.Name()),
		Author:       deriveAuthor(rel),
		FileName:     info.Name(),
		FilePath:     newPath,
		RelativePath: rel,
		FolderPath:   filepath.Dir(newPath),
		Type:         modType,
		Enabled:      enabled,
		Size:         info.Size(),
		ModifiedAt:   info.ModTime().UTC().Format(time.RFC3339),
		Thumbnail:    ThumbnailDTO{Source: "fallback", Path: nil},
		ParseStatus:  "fallback",
	}
	cachedMods = append(cachedMods, m)
	saveModsCache(cachedMods)
	return &m
}

// Обновляет кэш одного мода в памяти и на диске
func UpdateCachedMod(mod LocalModDTO) {
	cacheLock.Lock()
	defer cacheLock.Unlock()

	found := false
	for i := range cachedMods {
		if cachedMods[i].FilePath == mod.FilePath || cachedMods[i].Id == mod.Id {
			cachedMods[i] = mod
			found = true
			break
		}
	}
	if !found {
		cachedMods = append(cachedMods, mod)
	}
	saveModsCache(cachedMods)
}

// Удаляет мод из кэша
func RemoveCachedMod(filePath string) {
	cacheLock.Lock()
	defer cacheLock.Unlock()

	var updated []LocalModDTO
	for _, m := range cachedMods {
		if !strings.EqualFold(m.FilePath, filePath) {
			updated = append(updated, m)
		}
	}
	cachedMods = updated
	saveModsCache(cachedMods)
}
