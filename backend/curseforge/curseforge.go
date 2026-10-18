package curseforge

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/extractor"
	"sims4cc-wails/backend/scanner"
)

const (
	ApiBase     = "https://api.curseforge.com/v1"
	Sims4GameId = 78062
)

// MurmurHash2 (32-bit, seed=1) для CurseForge
func Murmur2(data []byte, seed uint32) uint32 {
	const m uint32 = 0x5bd1e995
	const r = 24
	length := len(data)
	h := seed ^ uint32(length)
	i := 0

	for length >= 4 {
		k := uint32(data[i]) | (uint32(data[i+1]) << 8) | (uint32(data[i+2]) << 16) | (uint32(data[i+3]) << 24)
		k *= m
		k ^= k >> r
		k *= m
		h *= m
		h ^= k
		i += 4
		length -= 4
	}

	switch length {
	case 3:
		h ^= uint32(data[i+2]) << 16
		fallthrough
	case 2:
		h ^= uint32(data[i+1]) << 8
		fallthrough
	case 1:
		h ^= uint32(data[i])
		h *= m
	}

	h ^= h >> 13
	h *= m
	h ^= h >> 15

	return h
}

// Вычисляет отпечаток файла для CurseForge, пропуская пробельные байты 9, 10, 13, 32
func ComputeFingerprint(data []byte) uint32 {
	filtered := make([]byte, 0, len(data))
	for _, b := range data {
		if b == 9 || b == 10 || b == 13 || b == 32 {
			continue
		}
		filtered = append(filtered, b)
	}
	return Murmur2(filtered, 1)
}

func getApiKey() string {
	cfg := config.ReadConfig()
	key := strings.Trim(strings.TrimSpace(cfg.CurseForgeApiKey), `"'`)
	if key != "" && !strings.HasPrefix(key, "enc:") {
		return key
	}
	key = strings.Trim(strings.TrimSpace(os.Getenv("CURSEFORGE_API_KEY")), `"'`)
	if key != "" && !strings.HasPrefix(key, "enc:") {
		return key
	}
	key = strings.Trim(strings.TrimSpace(os.Getenv("CF_API_KEY")), `"'`)
	if key != "" && !strings.HasPrefix(key, "enc:") {
		return key
	}
	return ""
}

func newRequest(method, endpoint string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequest(method, endpoint, body)
	if err != nil {
		return nil, err
	}
	apiKey := getApiKey()
	if apiKey != "" {
		req.Header.Set("x-api-key", apiKey)
	}
	req.Header.Set("User-Agent", "Sims 4 Mod Manager")
	req.Header.Set("Referer", "app://s4mm-electron-app-win")
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

type SearchParams struct {
	SearchFilter string  `json:"searchFilter"`
	ClassId      *int    `json:"classId"`
	CategoryId   *int    `json:"categoryId"`
	CategoryIds  []int   `json:"categoryIds"`
	Index        int     `json:"index"`
	PageSize     int     `json:"pageSize"`
	SortField    *int    `json:"sortField"`
	SortOrder    *string `json:"sortOrder"`
}

type ApiResponse struct {
	Data       any    `json:"data"`
	Pagination any    `json:"pagination,omitempty"`
	Error      string `json:"error,omitempty"`
}

// Поиск модов в каталоге CurseForge
func SearchMods(params SearchParams) ApiResponse {
	apiKey := getApiKey()
	if apiKey == "" {
		return ApiResponse{Data: []any{}, Error: "Ключ CurseForge API не задан. Укажите его в Настройках."}
	}

	u, _ := url.Parse(fmt.Sprintf("%s/mods/search", ApiBase))
	q := u.Query()
	q.Set("gameId", strconv.Itoa(Sims4GameId))
	if params.SearchFilter != "" {
		q.Set("searchFilter", params.SearchFilter)
	}
	if params.ClassId != nil {
		q.Set("classId", strconv.Itoa(*params.ClassId))
	}
	if params.CategoryId != nil {
		q.Set("categoryId", strconv.Itoa(*params.CategoryId))
	}
	if params.SortField != nil {
		q.Set("sortField", strconv.Itoa(*params.SortField))
		if params.SortOrder != nil && *params.SortOrder != "" {
			q.Set("sortOrder", *params.SortOrder)
		} else {
			q.Set("sortOrder", "desc")
		}
	}
	pageSize := params.PageSize
	if pageSize <= 0 {
		pageSize = 50
	}
	q.Set("index", strconv.Itoa(params.Index))
	q.Set("pageSize", strconv.Itoa(pageSize))
	u.RawQuery = q.Encode()

	req, err := newRequest("GET", u.String(), nil)
	if err != nil {
		return ApiResponse{Data: []any{}, Error: err.Error()}
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return ApiResponse{Data: []any{}, Error: err.Error()}
	}
	defer resp.Body.Close()

	var result ApiResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return ApiResponse{Data: []any{}, Error: err.Error()}
	}
	return result
}

// Получает список категорий The Sims 4
func GetCategories() ApiResponse {
	req, err := newRequest("GET", fmt.Sprintf("%s/categories?gameId=%d", ApiBase, Sims4GameId), nil)
	if err != nil {
		return ApiResponse{Data: []any{}, Error: err.Error()}
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return ApiResponse{Data: []any{}, Error: err.Error()}
	}
	defer resp.Body.Close()

	var result ApiResponse
	_ = json.NewDecoder(resp.Body).Decode(&result)
	return result
}

type DescriptionResult struct {
	Html  string `json:"html"`
	Error string `json:"error,omitempty"`
}

// Получает описание мода (HTML)
func GetModDescription(modId int) DescriptionResult {
	req, err := newRequest("GET", fmt.Sprintf("%s/mods/%d/description", ApiBase, modId), nil)
	if err != nil {
		return DescriptionResult{Html: "", Error: err.Error()}
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return DescriptionResult{Html: "", Error: err.Error()}
	}
	defer resp.Body.Close()

	var res struct {
		Data string `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return DescriptionResult{Html: "", Error: err.Error()}
	}
	return DescriptionResult{Html: res.Data}
}

// Получает список модов по массиву ID (пачками до 200 штук)
func GetModsByIds(ids []int) ApiResponse {
	if len(ids) == 0 {
		return ApiResponse{Data: []any{}}
	}
	var allMods []any
	client := &http.Client{Timeout: 20 * time.Second}

	chunkSize := 200
	for i := 0; i < len(ids); i += chunkSize {
		end := i + chunkSize
		if end > len(ids) {
			end = len(ids)
		}
		chunk := ids[i:end]

		payload, _ := json.Marshal(map[string][]int{"modIds": chunk})
		req, err := newRequest("POST", fmt.Sprintf("%s/mods", ApiBase), bytes.NewReader(payload))
		if err != nil {
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			continue
		}

		var result ApiResponse
		_ = json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()

		if list, ok := result.Data.([]any); ok {
			allMods = append(allMods, list...)
		}
	}

	return ApiResponse{Data: allMods}
}

// --- Downloads store ---

type DownloadRecord struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	FileId int    `json:"fileId"`
	At     string `json:"at"`
}

var (
	dlLock sync.Mutex
)

func getDownloadsStorePath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "downloads.json")
}

func readDownloads() map[string]DownloadRecord {
	dlLock.Lock()
	defer dlLock.Unlock()

	data, err := os.ReadFile(getDownloadsStorePath())
	if err != nil {
		return make(map[string]DownloadRecord)
	}
	var res map[string]DownloadRecord
	if json.Unmarshal(data, &res) != nil {
		return make(map[string]DownloadRecord)
	}
	return res
}

func RecordDownload(modId int, name, filePath string, fileId int) {
	recordDownload(modId, name, filePath, fileId)
}

func recordDownload(modId int, name, filePath string, fileId int) {
	dlLock.Lock()
	defer dlLock.Unlock()

	res := make(map[string]DownloadRecord)
	data, err := os.ReadFile(getDownloadsStorePath())
	if err == nil {
		_ = json.Unmarshal(data, &res)
	}

	res[strconv.Itoa(modId)] = DownloadRecord{
		Name:   name,
		Path:   filePath,
		FileId: fileId,
		At:     time.Now().UTC().Format(time.RFC3339),
	}

	raw, _ := json.MarshalIndent(res, "", "  ")
	_ = os.WriteFile(getDownloadsStorePath(), raw, 0644)
}

func GetDownloaded() map[string]DownloadRecord {
	m := readDownloads()
	alive := make(map[string]DownloadRecord)
	for id, rec := range m {
		if rec.Path != "" {
			if _, err := os.Stat(rec.Path); err == nil {
				alive[id] = rec
			}
		} else {
			alive[id] = rec
		}
	}

	// Подмешиваем локально распознанные моды из CurseForge
	matches := MatchLocalCurseForge(map[string]any{"cached": true})
	for p, val := range matches {
		if mVal, ok := val.(map[string]any); ok {
			var modId int
			if f, ok := mVal["modId"].(float64); ok {
				modId = int(f)
			} else if i, ok := mVal["modId"].(int); ok {
				modId = i
			}
			if modId > 0 {
				idStr := strconv.Itoa(modId)
				if _, exists := alive[idStr]; !exists {
					name, _ := mVal["name"].(string)
					alive[idStr] = DownloadRecord{
						Name:   name,
						Path:   p,
						FileId: 0,
						At:     time.Now().UTC().Format(time.RFC3339),
					}
				}
			}
		}
	}
	return alive
}

// --- Match Local Mods via Fingerprints ---

type MatchedModResult struct {
	FilePath        string `json:"filePath"`
	ModId           int    `json:"modId"`
	InstalledFileId int    `json:"installedFileId"`
	LatestFileId    int    `json:"latestFileId"`
	HasUpdate       bool   `json:"hasUpdate"`
}

type cfFileItem struct {
	Id              int    `json:"id"`
	ModId           int    `json:"modId"`
	FileFingerprint uint32 `json:"fileFingerprint"`
	FileName        string `json:"fileName"`
	FileDate        string `json:"fileDate"`
	DownloadUrl     string `json:"downloadUrl"`
}

func pickLatestCfFile(files []cfFileItem) *cfFileItem {
	if len(files) == 0 {
		return nil
	}
	best := &files[0]
	for i := 1; i < len(files); i++ {
		cur := &files[i]
		if cur.FileDate > best.FileDate || (cur.FileDate == best.FileDate && cur.Id > best.Id) {
			best = cur
		}
	}
	return best
}

func pickLatestFileFromMod(mod map[string]any) map[string]any {
	lfArr, ok := mod["latestFiles"].([]any)
	if !ok || len(lfArr) == 0 {
		return nil
	}
	var best map[string]any
	var bestDate string
	var bestId float64

	for _, item := range lfArr {
		fMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		curDate, _ := fMap["fileDate"].(string)
		curId, _ := fMap["id"].(float64)

		if best == nil {
			best = fMap
			bestDate = curDate
			bestId = curId
		} else {
			if curDate > bestDate || (curDate == bestDate && curId > bestId) {
				best = fMap
				bestDate = curDate
				bestId = curId
			}
		}
	}
	return best
}

type cfFingerprintResponse struct {
	Data struct {
		ExactMatches []struct {
			Id          int          `json:"id"`
			File        cfFileItem   `json:"file"`
			LatestFiles []cfFileItem `json:"latestFiles"`
		} `json:"exactMatches"`
		ExactFingerprints []uint32 `json:"exactFingerprints"`
	} `json:"data"`
}

func getFpCachePath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "cf-fp-cache.json")
}

// Сопоставляет установленные моды с каталогом CurseForge по Murmur2 отпечаткам
func MatchLocalMods() []MatchedModResult {
	mods := scanner.GetCachedMods()
	if len(mods) == 0 {
		mods = scanner.ScanMods().Mods
	}

	fpCachePath := getFpCachePath()
	fpCache := make(map[string]uint32)
	if raw, err := os.ReadFile(fpCachePath); err == nil {
		_ = json.Unmarshal(raw, &fpCache)
	}

	fpByPaths := make(map[uint32][]string)
	var fps []uint32
	seenFps := make(map[uint32]bool)

	var uncached []scanner.LocalModDTO
	for _, m := range mods {
		if (m.Type != "package" && m.Type != "ts4script") || m.FilePath == "" {
			continue
		}
		cacheKey := fmt.Sprintf("%s|%s|%d", m.FilePath, m.ModifiedAt, m.Size)
		if fp, ok := fpCache[cacheKey]; ok && fp != 0 {
			fpByPaths[fp] = append(fpByPaths[fp], m.FilePath)
			if !seenFps[fp] {
				seenFps[fp] = true
				fps = append(fps, fp)
			}
		} else {
			uncached = append(uncached, m)
		}
	}

	if len(uncached) > 0 {
		type fpRes struct {
			cacheKey string
			filePath string
			fp       uint32
		}
		jobs := make(chan scanner.LocalModDTO, len(uncached))
		resCh := make(chan fpRes, len(uncached))
		var wg sync.WaitGroup
		workers := 8
		if len(uncached) < workers {
			workers = len(uncached)
		}
		for w := 0; w < workers; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for m := range jobs {
					data, err := os.ReadFile(m.FilePath)
					if err != nil || len(data) == 0 {
						continue
					}
					fp := ComputeFingerprint(data)
					resCh <- fpRes{
						cacheKey: fmt.Sprintf("%s|%s|%d", m.FilePath, m.ModifiedAt, m.Size),
						filePath: m.FilePath,
						fp:       fp,
					}
				}
			}()
		}
		for _, m := range uncached {
			jobs <- m
		}
		close(jobs)
		wg.Wait()
		close(resCh)

		for r := range resCh {
			fpCache[r.cacheKey] = r.fp
			fpByPaths[r.fp] = append(fpByPaths[r.fp], r.filePath)
			if !seenFps[r.fp] {
				seenFps[r.fp] = true
				fps = append(fps, r.fp)
			}
		}
		if raw, err := json.Marshal(fpCache); err == nil {
			_ = os.WriteFile(fpCachePath, raw, 0644)
		}
	}

	if len(fps) == 0 {
		return []MatchedModResult{}
	}

	var results []MatchedModResult

	// Отправляем пачками по 1000 отпечатков (лимит CurseForge API)
	chunkSize := 1000
	client := &http.Client{Timeout: 20 * time.Second}
	for i := 0; i < len(fps); i += chunkSize {
		end := i + chunkSize
		if end > len(fps) {
			end = len(fps)
		}
		batch := fps[i:end]

		payload, _ := json.Marshal(map[string][]uint32{"fingerprints": batch})
		req, err := newRequest("POST", fmt.Sprintf("%s/fingerprints", ApiBase), bytes.NewReader(payload))
		if err != nil {
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			continue
		}

		var cfResp cfFingerprintResponse
		_ = json.NewDecoder(resp.Body).Decode(&cfResp)
		resp.Body.Close()

		matches := cfResp.Data.ExactMatches
		exFp := cfResp.Data.ExactFingerprints

		for idx, m := range matches {
			var sentFp uint32
			if idx < len(exFp) {
				sentFp = exFp[idx]
			} else {
				sentFp = m.File.FileFingerprint
			}

			filePaths, ok := fpByPaths[sentFp]
			if !ok || len(filePaths) == 0 {
				continue
			}

			latest := pickLatestCfFile(m.LatestFiles)
			latestId := m.File.Id
			if latest != nil {
				latestId = latest.Id
			}

			for _, filePath := range filePaths {
				results = append(results, MatchedModResult{
					FilePath:        filePath,
					ModId:           m.File.ModId,
					InstalledFileId: m.File.Id,
					LatestFileId:    latestId,
					HasUpdate:       latestId != m.File.Id,
				})
			}
		}
	}

	return results
}

func getMatchCachePath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "cf-match-cache.json")
}

// Сопоставляет установленные моды с каталогом CurseForge, используя кэш и отпечатки
func MatchLocalCurseForge(opts any) map[string]any {
	cachePath := getMatchCachePath()
	var cachedMap map[string]any
	if data, err := os.ReadFile(cachePath); err == nil {
		_ = json.Unmarshal(data, &cachedMap)
	}
	if cachedMap == nil {
		cachedMap = make(map[string]any)
	}

	isCachedOnly := false
	if m, ok := opts.(map[string]any); ok {
		if val, exists := m["cached"]; exists {
			if b, ok := val.(bool); ok && b {
				isCachedOnly = true
			}
		}
	}

	if isCachedOnly && len(cachedMap) > 0 {
		return cachedMap
	}

	found := MatchLocalMods()
	if len(found) == 0 {
		return cachedMap
	}

	var modIds []int
	seenIds := make(map[int]bool)
	for _, f := range found {
		if !seenIds[f.ModId] {
			seenIds[f.ModId] = true
			modIds = append(modIds, f.ModId)
		}
	}
	resp := GetModsByIds(modIds)
	nameById := make(map[int]string)
	if list, ok := resp.Data.([]any); ok {
		for _, item := range list {
			if mItem, ok := item.(map[string]any); ok {
				if fId, ok := mItem["id"].(float64); ok {
					id := int(fId)
					if name, ok := mItem["name"].(string); ok {
						nameById[id] = name
					}
				}
			}
		}
	}

	result := make(map[string]any)
	for k, v := range cachedMap {
		result[k] = v
	}
	for _, f := range found {
		name := nameById[f.ModId]
		result[strings.ToLower(f.FilePath)] = map[string]any{
			"modId":     f.ModId,
			"name":      name,
			"hasUpdate": f.HasUpdate,
		}
	}

	raw, _ := json.MarshalIndent(result, "", "  ")
	_ = os.WriteFile(cachePath, raw, 0644)
	return result
}

func getUpdateCachePath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "cf-update-cache.json")
}

func InvalidateUpdateCache() {
	_ = os.Remove(getUpdateCachePath())
}

type CheckUpdatesResult struct {
	Ok        bool   `json:"ok"`
	FromCache bool   `json:"fromCache,omitempty"`
	CheckedAt string `json:"checkedAt"`
	Updates   []any  `json:"updates"`
	Mods      []any  `json:"mods"`
	Error     string `json:"error,omitempty"`
}

// Проверяет обновления для всех установленных модов CurseForge
func CheckUpdates(opts any) CheckUpdatesResult {
	force := false
	if m, ok := opts.(map[string]any); ok {
		if f, ok := m["force"].(bool); ok && f {
			force = true
		}
	}

	updateCachePath := getUpdateCachePath()

	// 1. Мгновенная выдача из дискового кэша при обычном переходе
	if !force {
		if raw, err := os.ReadFile(updateCachePath); err == nil {
			var cached CheckUpdatesResult
			if json.Unmarshal(raw, &cached) == nil && cached.Ok {
				cached.FromCache = true
				return cached
			}
		}
	}

	downloaded := GetDownloaded()
	fpMatches := MatchLocalMods()

	downloadedSet := make(map[int]bool)
	for idStr := range downloaded {
		if id, err := strconv.Atoi(idStr); err == nil && id > 0 {
			downloadedSet[id] = true
		}
	}

	fpByModId := make(map[int]MatchedModResult)
	for _, fm := range fpMatches {
		if fm.ModId > 0 && !downloadedSet[fm.ModId] {
			if _, exists := fpByModId[fm.ModId]; !exists {
				fpByModId[fm.ModId] = fm
			}
		}
	}

	allIdsSet := make(map[int]bool)
	for id := range downloadedSet {
		allIdsSet[id] = true
	}
	for id := range fpByModId {
		allIdsSet[id] = true
	}

	var allIds []int
	for id := range allIdsSet {
		allIds = append(allIds, id)
	}

	nowIso := time.Now().UTC().Format(time.RFC3339)

	if len(allIds) == 0 {
		res := CheckUpdatesResult{
			Ok:        true,
			CheckedAt: nowIso,
			Updates:   []any{},
			Mods:      []any{},
		}
		raw, _ := json.MarshalIndent(res, "", "  ")
		_ = os.WriteFile(updateCachePath, raw, 0644)
		return res
	}

	resp := GetModsByIds(allIds)
	modsList, _ := resp.Data.([]any)
	byId := make(map[int]map[string]any)
	for _, item := range modsList {
		if mItem, ok := item.(map[string]any); ok {
			if fId, ok := mItem["id"].(float64); ok {
				byId[int(fId)] = mItem
			}
		}
	}

	var updates []any
	for idStr, rec := range downloaded {
		modId, err := strconv.Atoi(idStr)
		if err != nil || modId <= 0 {
			continue
		}
		mod, found := byId[modId]
		if !found {
			updates = append(updates, map[string]any{
				"modId":           modId,
				"name":            rec.Name,
				"found":           false,
				"updateAvailable": false,
			})
			continue
		}
		latest := pickLatestFileFromMod(mod)
		var latestId any = nil
		var latestFileName any = nil
		var latestFileDate any = nil
		var updateAvailable any = nil
		if latest != nil {
			latestId = latest["id"]
			latestFileName = latest["fileName"]
			latestFileDate = latest["fileDate"]
			if rec.FileId > 0 && latestId != nil {
				if lidFloat, ok := latestId.(float64); ok {
					updateAvailable = (int(lidFloat) != rec.FileId)
				}
			}
		}
		modName := rec.Name
		if n, ok := mod["name"].(string); ok && n != "" {
			modName = n
		}
		updates = append(updates, map[string]any{
			"modId":           modId,
			"name":            modName,
			"found":           true,
			"installedFileId": rec.FileId,
			"latestFileId":    latestId,
			"latestFileName":  latestFileName,
			"latestFileDate":  latestFileDate,
			"updateAvailable": updateAvailable,
			"localPath":       rec.Path,
		})
	}

	for modId, fm := range fpByModId {
		mod, found := byId[modId]
		if !found {
			continue
		}
		latest := pickLatestFileFromMod(mod)
		var latestId any = nil
		var latestFileName any = nil
		var latestFileDate any = nil
		if latest != nil {
			latestId = latest["id"]
			latestFileName = latest["fileName"]
			latestFileDate = latest["fileDate"]
		}
		modName := ""
		if n, ok := mod["name"].(string); ok {
			modName = n
		}
		updates = append(updates, map[string]any{
			"modId":           modId,
			"name":            modName,
			"found":           true,
			"installedFileId": fm.InstalledFileId,
			"latestFileId":    latestId,
			"latestFileName":  latestFileName,
			"latestFileDate":  latestFileDate,
			"updateAvailable": fm.HasUpdate,
			"localPath":       fm.FilePath,
		})
	}

	result := CheckUpdatesResult{
		Ok:        true,
		CheckedAt: nowIso,
		Updates:   updates,
		Mods:      modsList,
	}

	raw, _ := json.MarshalIndent(result, "", "  ")
	_ = os.WriteFile(updateCachePath, raw, 0644)
	return result
}

// --- Streaming Downloader ---

type DownloadResult struct {
	Ok    bool   `json:"ok"`
	Path  string `json:"path,omitempty"`
	Error string `json:"error,omitempty"`
}

type DownloadProgress struct {
	ModId       int     `json:"modId"`
	Transferred int64   `json:"transferred"`
	Received    int64   `json:"received"`
	Total       int64   `json:"total"`
	Percent     float64 `json:"percent"`
	Status      string  `json:"status"`
	Phase       string  `json:"phase"`
}

var ProgressHook func(p DownloadProgress)

func emitCfProgress(ctx context.Context, p DownloadProgress) {
	if p.Received == 0 && p.Transferred > 0 {
		p.Received = p.Transferred
	}
	if p.Phase == "" {
		if p.Status == "extracting" {
			p.Phase = "installing"
		} else {
			p.Phase = p.Status
		}
	}
	if ProgressHook != nil {
		ProgressHook(p)
	}
	if ctx != nil && ctx.Value("events") != nil {
		defer func() { _ = recover() }()
		runtime.EventsEmit(ctx, "curseforge:progress", p)
	}
}

type countingWriter struct {
	writer      io.Writer
	modId       int
	total       int64
	transferred int64
	ctx         context.Context
	lastEmit    time.Time
}

func (cw *countingWriter) Write(p []byte) (int, error) {
	n, err := cw.writer.Write(p)
	cw.transferred += int64(n)

	now := time.Now()
	if now.Sub(cw.lastEmit) > 80*time.Millisecond || cw.transferred == cw.total {
		cw.lastEmit = now
		pct := 0.0
		if cw.total > 0 {
			pct = float64(cw.transferred) / float64(cw.total) * 100.0
		}
		emitCfProgress(cw.ctx, DownloadProgress{
			ModId:       cw.modId,
			Transferred: cw.transferred,
			Received:    cw.transferred,
			Total:       cw.total,
			Percent:     pct,
			Status:      "downloading",
			Phase:       "downloading",
		})
	}
	return n, err
}

// Получает ссылку на скачивание файла мода через отдельный эндпоинт CurseForge
func GetFileDownloadUrl(modId, fileId int) (string, error) {
	urlStr := fmt.Sprintf("%s/mods/%d/files/%d/download-url", ApiBase, modId, fileId)
	req, err := newRequest("GET", urlStr, nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var res struct {
		Data string `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	if res.Data == "" {
		return "", fmt.Errorf("ссылка для скачивания не получена")
	}
	return res.Data, nil
}

// Получает метаданные файла (имя файла) через API CurseForge (работает даже если allowModDistribution: false)
func GetFileMetadata(modId, fileId int) (string, error) {
	urlStr := fmt.Sprintf("%s/mods/%d/files/%d", ApiBase, modId, fileId)
	req, err := newRequest("GET", urlStr, nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var res struct {
		Data struct {
			FileName string `json:"fileName"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	return res.Data.FileName, nil
}

// Потоковое скачивание мода с дисковой буферизацией (0 RAM bloat) и отправкой событий прогресса
func DownloadModStream(ctx context.Context, payload any) DownloadResult {
	cfg := config.ReadConfig()
	modsFolder := cfg.ModsFolder
	if modsFolder == "" {
		return DownloadResult{Ok: false, Error: "Папка Mods не задана в настройках"}
	}

	var modId int
	var fileId int
	var fileName string
	var downloadUrl string
	var targetFolder string
	var logoUrl string

	if m, ok := payload.(map[string]any); ok {
		if idVal, ok := m["id"].(float64); ok {
			modId = int(idVal)
		} else if idVal, ok := m["modId"].(float64); ok {
			modId = int(idVal)
		} else if idVal, ok := m["id"].(int); ok {
			modId = idVal
		} else if idVal, ok := m["modId"].(int); ok {
			modId = idVal
		}

		if fidVal, ok := m["fileId"].(float64); ok {
			fileId = int(fidVal)
		} else if fidVal, ok := m["latestFileId"].(float64); ok {
			fileId = int(fidVal)
		} else if fidVal, ok := m["fileId"].(int); ok {
			fileId = fidVal
		} else if fidVal, ok := m["latestFileId"].(int); ok {
			fileId = fidVal
		}

		if urlVal, ok := m["downloadUrl"].(string); ok {
			downloadUrl = urlVal
		}
		if fnVal, ok := m["fileName"].(string); ok {
			fileName = fnVal
		} else if fnVal, ok := m["latestFileName"].(string); ok {
			fileName = fnVal
		}
		if tfVal, ok := m["targetFolder"].(string); ok && tfVal != "" {
			targetFolder = tfVal
		}
		if imgVal, ok := m["imageUrl"].(string); ok && imgVal != "" {
			logoUrl = imgVal
		}
		if logoMap, ok := m["logo"].(map[string]any); ok {
			if u, ok := logoMap["url"].(string); ok && u != "" {
				logoUrl = u
			} else if tu, ok := logoMap["thumbnailUrl"].(string); ok && tu != "" {
				logoUrl = tu
			}
		}

		if lfArr, ok := m["latestFiles"].([]any); ok && len(lfArr) > 0 {
			bestFile := pickLatestFileFromMod(m)
			if bestFile != nil {
				if fIdVal, ok := bestFile["id"].(float64); ok && fileId == 0 {
					fileId = int(fIdVal)
				}
				if fnVal, ok := bestFile["fileName"].(string); ok && fileName == "" {
					fileName = fnVal
				}
				if urlVal, ok := bestFile["downloadUrl"].(string); ok && urlVal != "" && downloadUrl == "" {
					downloadUrl = urlVal
				}
			}
		}
	}

	if targetFolder != "" {
		modsFolder = targetFolder
	}

	if modId == 0 {
		return DownloadResult{Ok: false, Error: "Некорректный ID мода"}
	}

	// Если downloadUrl не получен напрямую, запрашиваем его у CurseForge
	if downloadUrl == "" {
		if fileId == 0 {
			resp := GetModsByIds([]int{modId})
			if list, ok := resp.Data.([]any); ok && len(list) > 0 {
				if modObj, ok := list[0].(map[string]any); ok {
					if logoUrl == "" {
						if logoMap, ok := modObj["logo"].(map[string]any); ok {
							if u, ok := logoMap["url"].(string); ok && u != "" {
								logoUrl = u
							}
						}
					}
					bestFile := pickLatestFileFromMod(modObj)
					if bestFile != nil {
						if fIdVal, ok := bestFile["id"].(float64); ok {
							fileId = int(fIdVal)
						}
						if fnVal, ok := bestFile["fileName"].(string); ok && fileName == "" {
							fileName = fnVal
						}
						if uVal, ok := bestFile["downloadUrl"].(string); ok {
							downloadUrl = uVal
						}
					}
				}
			}
		}

		if downloadUrl == "" && fileId > 0 {
			resolvedUrl, err := GetFileDownloadUrl(modId, fileId)
			if err == nil && resolvedUrl != "" {
				downloadUrl = resolvedUrl
			} else {
				// Прямой обход ограничения API через Edge CDN
				if fileName == "" {
					if fn, err := GetFileMetadata(modId, fileId); err == nil && fn != "" {
						fileName = fn
					}
				}
				part1 := fileId / 1000
				part2 := fileId % 1000
				if fileName != "" {
					downloadUrl = fmt.Sprintf("https://edge.forgecdn.net/files/%d/%d/%s", part1, part2, url.PathEscape(fileName))
				} else {
					downloadUrl = fmt.Sprintf("https://edge.forgecdn.net/files/%d/%d/download", part1, part2)
				}
			}
		}
	}

	if downloadUrl == "" {
		return DownloadResult{Ok: false, Error: "Ссылка на скачивание отсутствует у данного мода"}
	}

	if fileName == "" {
		fileName = filepath.Base(downloadUrl)
		if strings.Contains(fileName, "?") {
			fileName = strings.Split(fileName, "?")[0]
		}
	}
	if fileName == "" || fileName == "/" || fileName == "." {
		fileName = fmt.Sprintf("curseforge_%d.package", modId)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", downloadUrl, nil)
	if err != nil {
		return DownloadResult{Ok: false, Error: err.Error()}
	}
	apiKey := getApiKey()
	if apiKey != "" {
		req.Header.Set("x-api-key", apiKey)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	req.Header.Set("Referer", "https://www.curseforge.com/")

	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return DownloadResult{Ok: false, Error: err.Error()}
	}

	if resp.StatusCode != http.StatusOK && strings.Contains(downloadUrl, "edge.forgecdn.net") {
		resp.Body.Close()
		altUrl := strings.Replace(downloadUrl, "edge.forgecdn.net", "media.forgecdn.net", 1)
		reqAlt, errAlt := http.NewRequestWithContext(ctx, "GET", altUrl, nil)
		if errAlt == nil {
			reqAlt.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
			reqAlt.Header.Set("Referer", "https://www.curseforge.com/")
			if respAlt, errAlt2 := client.Do(reqAlt); errAlt2 == nil && respAlt.StatusCode == http.StatusOK {
				resp = respAlt
			}
		}
	}

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return DownloadResult{Ok: false, Error: fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}

	totalSize := resp.ContentLength
	tempPath := filepath.Join(modsFolder, fileName+".download")
	finalPath := filepath.Join(modsFolder, fileName)

	outFile, err := os.OpenFile(tempPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return DownloadResult{Ok: false, Error: err.Error()}
	}
	defer outFile.Close()

	bufWriter := bufio.NewWriterSize(outFile, 256*1024)
	progressWriter := &countingWriter{
		writer: bufWriter,
		modId:  modId,
		total:  totalSize,
		ctx:    ctx,
	}

	bufReader := bufio.NewReaderSize(resp.Body, 256*1024)
	if _, err := io.Copy(progressWriter, bufReader); err != nil {
		_ = os.Remove(tempPath)
		return DownloadResult{Ok: false, Error: err.Error()}
	}

	_ = bufWriter.Flush()
	_ = outFile.Close()
	_ = os.Remove(finalPath)

	if err := os.Rename(tempPath, finalPath); err != nil {
		_ = os.Remove(tempPath)
		return DownloadResult{Ok: false, Error: err.Error()}
	}

	recordDownload(modId, fileName, finalPath, fileId)
	installedTarget := finalPath

	if extractor.IsArchiveExt(filepath.Ext(finalPath)) {
		emitCfProgress(ctx, DownloadProgress{
			ModId:   modId,
			Status:  "extracting",
			Phase:   "installing",
			Percent: 100,
		})
		extRes := extractor.ExtractLocalArchive(finalPath)
		if extRes.Ok && extRes.Folder != "" {
			installedTarget = extRes.Folder
		}
	}

	if logoUrl != "" {
		scanner.SaveExternalThumbnail(installedTarget, logoUrl)
	}

	emitCfProgress(ctx, DownloadProgress{
		ModId:       modId,
		Transferred: totalSize,
		Received:    totalSize,
		Total:       totalSize,
		Percent:     100,
		Status:      "completed",
		Phase:       "done",
	})

	go func() {
		scanner.ScanMods()
	}()

	return DownloadResult{Ok: true, Path: installedTarget}
}

// UpdateMod обновляет мод с безопасным удалением предыдущей версии (без дублирования файлов)
func UpdateMod(ctx context.Context, payload any) DownloadResult {
	cfg := config.ReadConfig()
	modsFolder := cfg.ModsFolder
	if modsFolder == "" {
		return DownloadResult{Ok: false, Error: "Папка Mods не задана в настройках"}
	}

	var modId int
	if m, ok := payload.(map[string]any); ok {
		if idVal, ok := m["id"].(float64); ok {
			modId = int(idVal)
		} else if idVal, ok := m["modId"].(float64); ok {
			modId = int(idVal)
		} else if idVal, ok := m["id"].(int); ok {
			modId = idVal
		} else if idVal, ok := m["modId"].(int); ok {
			modId = idVal
		}
	}

	if modId > 0 {
		downloaded := readDownloads()
		var oldPath string
		if rec, exists := downloaded[strconv.Itoa(modId)]; exists && rec.Path != "" {
			oldPath = rec.Path
		} else {
			matches := MatchLocalCurseForge(map[string]any{"cached": true})
			for p, v := range matches {
				if vm, ok := v.(map[string]any); ok {
					var mid int
					if f, ok := vm["modId"].(float64); ok {
						mid = int(f)
					} else if i, ok := vm["modId"].(int); ok {
						mid = i
					}
					if mid == modId {
						oldPath = p
						break
					}
				}
			}
		}

		if oldPath != "" {
			absOld, err1 := filepath.Abs(oldPath)
			absFolder, err2 := filepath.Abs(modsFolder)
			if err1 == nil && err2 == nil {
				rel, errRel := filepath.Rel(absFolder, absOld)
				if errRel == nil && !strings.HasPrefix(rel, "..") && rel != "." && rel != "" {
					_ = os.RemoveAll(absOld)
				}
			}
		}
	}

	res := DownloadModStream(ctx, payload)
	if res.Ok {
		InvalidateUpdateCache()
	}
	return res
}
