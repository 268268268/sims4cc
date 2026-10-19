package conflicts

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"sims4cc-wails/backend/actions"
	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/dbpf"
	"sims4cc-wails/backend/workers"
)

type FileItem struct {
	FilePath     string `json:"filePath"`
	FileName     string `json:"fileName"`
	RelativePath string `json:"relativePath"`
	Size         int64  `json:"size"`
	ModifiedAt   int64  `json:"modifiedAt"`
}

type DuplicateGroup struct {
	Hash        string     `json:"hash"`
	Size        int64      `json:"size"`
	WastedBytes int64      `json:"wastedBytes"`
	Files       []FileItem `json:"files"`
}

type ConflictResource struct {
	Key      string `json:"key"`
	TypeHex  string `json:"typeHex"`
	TypeName string `json:"typeName"`
}

type ConflictPair struct {
	Id        string             `json:"id"`
	FileA     FileItem           `json:"fileA"`
	FileB     FileItem           `json:"fileB"`
	Resources []ConflictResource `json:"resources"`
}

type ConflictStats struct {
	TotalFilesScanned    int   `json:"totalFilesScanned"`
	DuplicateGroupsCount int   `json:"duplicateGroupsCount"`
	DuplicateFilesCount  int   `json:"duplicateFilesCount"`
	TotalWastedBytes     int64 `json:"totalWastedBytes"`
	TgiConflictsCount    int   `json:"tgiConflictsCount"`
}

type ConflictScanResult struct {
	Ok         bool             `json:"ok"`
	Duplicates []DuplicateGroup `json:"duplicates"`
	Conflicts  []ConflictPair   `json:"conflicts"`
	Stats      ConflictStats    `json:"stats"`
	Error      string           `json:"error,omitempty"`
}

var typeLabels = map[uint32]string{
	0x034aeecb: "CAS part",
	0x319e4f1d: "Object definition",
	0xc0db5ae7: "Object catalog",
	0x545ac67a: "Data (SimData)",
	0x6017e896: "Python/tuning",
	0x0333406c: "XML tuning",
	0x015a1849: "Model (geometry)",
	0x01661233: "Model",
}

var criticalTypes = map[uint32]bool{
	0x034aeecb: true,
	0x319e4f1d: true,
	0xc0db5ae7: true,
	0x545ac67a: true,
	0x6017e896: true,
	0x0333406c: true,
	0x015a1849: true,
	0x01661233: true,
}

func computeSha1(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha1.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// Сканирует папку Mods на дубликаты и конфликты
func ScanDuplicatesAndConflicts() ConflictScanResult {
	cfg := config.ReadConfig()
	modsFolder := cfg.ModsFolder
	if modsFolder == "" {
		return ConflictScanResult{Ok: false, Error: "Папка Mods не указана"}
	}

	var files []FileItem
	_ = filepath.Walk(modsFolder, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			name := strings.ToLower(info.Name())
			if strings.HasSuffix(name, ".package") || strings.HasSuffix(name, ".ts4script") ||
				strings.HasSuffix(name, ".package.disabled") || strings.HasSuffix(name, ".ts4script.disabled") {
				rel, _ := filepath.Rel(modsFolder, path)
				files = append(files, FileItem{
					FilePath:     path,
					FileName:     info.Name(),
					RelativePath: rel,
					Size:         info.Size(),
					ModifiedAt:   info.ModTime().UnixMilli(),
				})
			}
		}
		return nil
	})

	// 1. Поиск дубликатов по размеру и SHA-1
	sizeMap := make(map[int64][]FileItem)
	for _, f := range files {
		if f.Size > 0 {
			sizeMap[f.Size] = append(sizeMap[f.Size], f)
		}
	}

	var duplicateGroups []DuplicateGroup
	var totalWastedBytes int64

	for size, group := range sizeMap {
		if len(group) <= 1 {
			continue
		}

		hashMap := make(map[string][]FileItem)
		for _, f := range group {
			if h, err := computeSha1(f.FilePath); err == nil {
				hashMap[h] = append(hashMap[h], f)
			}
		}

		for h, dupFiles := range hashMap {
			if len(dupFiles) > 1 {
				wasted := size * int64(len(dupFiles)-1)
				totalWastedBytes += wasted
				duplicateGroups = append(duplicateGroups, DuplicateGroup{
					Hash:        h,
					Size:        size,
					WastedBytes: wasted,
					Files:       dupFiles,
				})
			}
		}
	}

	// 2. TGI-конфликты (параллельный парсинг + бинарный ключ без лишних аллокаций строк)
	type tgiKey struct {
		t uint32
		g uint32
		i uint64
	}
	type fileEntries struct {
		file FileItem
		keys []tgiKey
	}

	numWorkers := workers.Count()
	jobs := make(chan FileItem, len(files))
	resultsCh := make(chan fileEntries, len(files))

	var wg sync.WaitGroup
	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for f := range jobs {
				entries, err := dbpf.ParseEntries(f.FilePath)
				if err != nil {
					continue
				}
				var keys []tgiKey
				for _, e := range entries {
					if criticalTypes[e.Type] && e.Instance != 0 {
						keys = append(keys, tgiKey{t: e.Type, g: e.Group, i: e.Instance})
					}
				}
				if len(keys) > 0 {
					resultsCh <- fileEntries{file: f, keys: keys}
				}
			}
		}()
	}

	for _, f := range files {
		if strings.Contains(strings.ToLower(f.FileName), ".package") {
			jobs <- f
		}
	}
	close(jobs)
	wg.Wait()
	close(resultsCh)

	tgiRegistry := make(map[tgiKey][]FileItem)
	for res := range resultsCh {
		for _, k := range res.keys {
			tgiRegistry[k] = append(tgiRegistry[k], res.file)
		}
	}

	pairMap := make(map[string]*ConflictPair)
	for k, owners := range tgiRegistry {
		if len(owners) <= 1 {
			continue
		}

		keyStr := fmt.Sprintf("%08x-%08x-%016x", k.t, k.g, k.i)
		typeHex := fmt.Sprintf("0x%x", k.t)
		typeName := typeLabels[k.t]
		if typeName == "" {
			typeName = "Ресурс"
		}

		for i := 0; i < len(owners); i++ {
			for j := i + 1; j < len(owners); j++ {
				a := owners[i]
				b := owners[j]
				if a.FilePath == b.FilePath {
					continue
				}

				pairKey := a.FilePath + "|" + b.FilePath
				fileA, fileB := a, b
				if a.FilePath > b.FilePath {
					pairKey = b.FilePath + "|" + a.FilePath
					fileA, fileB = b, a
				}

				pair, exists := pairMap[pairKey]
				if !exists {
					pair = &ConflictPair{
						Id:        pairKey,
						FileA:     fileA,
						FileB:     fileB,
						Resources: []ConflictResource{},
					}
					pairMap[pairKey] = pair
				}

				pair.Resources = append(pair.Resources, ConflictResource{
					Key:      keyStr,
					TypeHex:  typeHex,
					TypeName: typeName,
				})
			}
		}
	}

	var conflicts []ConflictPair
	for _, p := range pairMap {
		conflicts = append(conflicts, *p)
	}

	dupFilesCount := 0
	for _, g := range duplicateGroups {
		dupFilesCount += len(g.Files) - 1
	}

	return ConflictScanResult{
		Ok:         true,
		Duplicates: duplicateGroups,
		Conflicts:  conflicts,
		Stats: ConflictStats{
			TotalFilesScanned:    len(files),
			DuplicateGroupsCount: len(duplicateGroups),
			DuplicateFilesCount:  dupFilesCount,
			TotalWastedBytes:     totalWastedBytes,
			TgiConflictsCount:    len(conflicts),
		},
	}
}

// Удаляет один дубликат мода в корзину
func DeleteDuplicateMod(filePath string) actions.DeleteResult {
	return actions.DeleteLocalMod(filePath)
}
