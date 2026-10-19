package saves

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/binary"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/dbpf"
	"sims4cc-wails/backend/workers"
)

// Декомпрессия RefPack (QFS), используемого EA в файлах сохранений
func DecompressRefPack(src []byte, expectedSize int) []byte {
	if len(src) < 5 {
		return src
	}
	inPos := 0
	firstByte := src[inPos]
	inPos++
	secondByte := src[inPos]
	inPos++

	isLarge := (firstByte & 0x01) != 0
	hasCompSize := (firstByte & 0x02) != 0

	if secondByte != 0xfb {
		return src
	}

	if hasCompSize {
		inPos += 3
	}

	uncompressedSize := 0
	if isLarge {
		if inPos+4 <= len(src) {
			uncompressedSize = int(src[inPos])<<24 | int(src[inPos+1])<<16 | int(src[inPos+2])<<8 | int(src[inPos+3])
			inPos += 4
		}
	} else {
		if inPos+3 <= len(src) {
			uncompressedSize = int(src[inPos])<<16 | int(src[inPos+1])<<8 | int(src[inPos+2])
			inPos += 3
		}
	}

	allocSize := expectedSize
	if allocSize <= 0 {
		allocSize = uncompressedSize
	}
	if allocSize <= 0 {
		allocSize = 1024 * 1024
	}

	out := make([]byte, allocSize)
	outPos := 0

	for inPos < len(src) && outPos < len(out) {
		b0 := src[inPos]
		inPos++

		if b0 >= 0xfc {
			count := int(b0 & 0x03)
			for i := 0; i < count && inPos < len(src) && outPos < len(out); i++ {
				out[outPos] = src[inPos]
				outPos++
				inPos++
			}
			if count == 0 {
				break
			}
		} else if b0 >= 0xe0 {
			count := int((b0&0x1f)<<2) + 4
			for i := 0; i < count && inPos < len(src) && outPos < len(out); i++ {
				out[outPos] = src[inPos]
				outPos++
				inPos++
			}
		} else if b0 >= 0xc0 {
			if inPos+3 > len(src) {
				break
			}
			b1 := src[inPos]
			inPos++
			b2 := src[inPos]
			inPos++
			b3 := src[inPos]
			inPos++

			litCount := int(b0 & 0x03)
			for i := 0; i < litCount && inPos < len(src) && outPos < len(out); i++ {
				out[outPos] = src[inPos]
				outPos++
				inPos++
			}
			copyCount := (int((b0>>2)&0x03) << 8) + int(b3) + 5
			offset := int(b1)<<8 + int(b2) + 1
			copyFrom := outPos - offset
			for i := 0; i < copyCount && copyFrom >= 0 && copyFrom < outPos && outPos < len(out); i++ {
				out[outPos] = out[copyFrom]
				outPos++
				copyFrom++
			}
		} else if b0 >= 0x80 {
			if inPos+2 > len(src) {
				break
			}
			b1 := src[inPos]
			inPos++
			b2 := src[inPos]
			inPos++

			litCount := int((b1 >> 6) & 0x03)
			for i := 0; i < litCount && inPos < len(src) && outPos < len(out); i++ {
				out[outPos] = src[inPos]
				outPos++
				inPos++
			}
			copyCount := int(b0&0x3f) + 4
			offset := int(b1&0x3f)<<8 + int(b2) + 1
			copyFrom := outPos - offset
			for i := 0; i < copyCount && copyFrom >= 0 && copyFrom < outPos && outPos < len(out); i++ {
				out[outPos] = out[copyFrom]
				outPos++
				copyFrom++
			}
		} else {
			if inPos >= len(src) {
				break
			}
			b1 := src[inPos]
			inPos++

			litCount := int(b0 & 0x03)
			for i := 0; i < litCount && inPos < len(src) && outPos < len(out); i++ {
				out[outPos] = src[inPos]
				outPos++
				inPos++
			}
			copyCount := int((b0>>2)&0x07) + 3
			offset := int((b0>>5)&0x03)<<8 + int(b1) + 1
			copyFrom := outPos - offset
			for i := 0; i < copyCount && copyFrom >= 0 && copyFrom < outPos && outPos < len(out); i++ {
				out[outPos] = out[copyFrom]
				outPos++
				copyFrom++
			}
		}
	}

	return out[:outPos]
}

func decompressEntry(raw []byte, comp uint16, decompSize uint32) []byte {
	if comp == 0xffff {
		return DecompressRefPack(raw, int(decompSize))
	}
	if comp == dbpf.CompZlib {
		zr, err := zlib.NewReader(bytes.NewReader(raw))
		if err == nil {
			defer zr.Close()
			dec, _ := io.ReadAll(zr)
			return dec
		}
	}
	return raw
}

type SaveFileDTO struct {
	FileName     string  `json:"fileName"`
	FilePath     string  `json:"filePath"`
	Size         int64   `json:"size"`
	ModifiedAt   int64   `json:"modifiedAt"`
	ThumbnailUrl *string `json:"thumbnailUrl"`
}

type ListSavesResult struct {
	Ok          bool          `json:"ok"`
	SavesFolder string        `json:"savesFolder"`
	Saves       []SaveFileDTO `json:"saves"`
	Error       string        `json:"error,omitempty"`
}

// Находит папку saves
func resolveSavesFolder(modsFolder string) string {
	candidates := []string{
		filepath.Join(filepath.Dir(modsFolder), "saves"),
	}
	home, _ := os.UserHomeDir()
	if home != "" {
		candidates = append(candidates,
			filepath.Join(home, "Documents", "Electronic Arts", "The Sims 4", "saves"),
			filepath.Join(home, "OneDrive", "Documents", "Electronic Arts", "The Sims 4", "saves"),
		)
	}

	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			return c
		}
	}
	return ""
}

// Получает список всех сохранений
func ListSaveFiles(customFolder string) ListSavesResult {
	cfg := config.ReadConfig()
	folder := customFolder
	if folder == "" {
		folder = resolveSavesFolder(cfg.ModsFolder)
	}
	if folder == "" {
		return ListSavesResult{Ok: false, Error: "Папка сохранений не найдена"}
	}

	entries, err := os.ReadDir(folder)
	if err != nil {
		return ListSavesResult{Ok: false, Error: err.Error()}
	}

	var saves []SaveFileDTO
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasPrefix(strings.ToLower(name), "slot_") || !strings.HasSuffix(strings.ToLower(name), ".save") {
			continue
		}

		p := filepath.Join(folder, name)
		st, err := entry.Info()
		if err != nil {
			continue
		}

		var thumbUrl *string
		dbpfEntries, err := dbpf.ParseEntries(p)
		if err == nil {
			for _, e := range dbpfEntries {
				if (e.Type == 0x14 || e.Type == 0xf || e.Type == 0x10) && e.Size > 0 {
					f, err := os.Open(p)
					if err == nil {
						raw := make([]byte, e.Size)
						_, _ = f.Seek(int64(e.Position), io.SeekStart)
						_, _ = io.ReadFull(f, raw)
						f.Close()

						dec := decompressEntry(raw, e.Compression, e.DecompressedSize)
						if len(dec) > 4 && dec[0] == 0xff && dec[1] == 0xd8 {
							b64 := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(dec)
							thumbUrl = &b64
							break
						}
					}
				}
			}
		}

		saves = append(saves, SaveFileDTO{
			FileName:     name,
			FilePath:     p,
			Size:         st.Size(),
			ModifiedAt:   st.ModTime().UnixMilli(),
			ThumbnailUrl: thumbUrl,
		})
	}

	sort.Slice(saves, func(i, j int) bool {
		return saves[i].ModifiedAt > saves[j].ModifiedAt
	})

	return ListSavesResult{
		Ok:          true,
		SavesFolder: folder,
		Saves:       saves,
	}
}

type SaveModInfo struct {
	FileName     string `json:"fileName"`
	FilePath     string `json:"filePath"`
	RelativePath string `json:"relativePath"`
	Size         int64  `json:"size"`
	Enabled      bool   `json:"enabled"`
	ModifiedAt   int64  `json:"modifiedAt"`
}

type SaveAnalysisStats struct {
	TotalModsCount  int   `json:"totalModsCount"`
	UsedCount       int   `json:"usedCount"`
	UnusedCount     int   `json:"unusedCount"`
	UsedSizeBytes   int64 `json:"usedSizeBytes"`
	UnusedSizeBytes int64 `json:"unusedSizeBytes"`
	TotalSizeBytes  int64 `json:"totalSizeBytes"`
}

type SaveAnalysisResult struct {
	Ok         bool              `json:"ok"`
	SavePath   string            `json:"savePath"`
	SaveName   string            `json:"saveName"`
	UsedMods   []SaveModInfo     `json:"usedMods"`
	UnusedMods []SaveModInfo     `json:"unusedMods"`
	Stats      SaveAnalysisStats `json:"stats"`
	Error      string            `json:"error,omitempty"`
}

// Анализирует сохранение и находит используемые моды
func AnalyzeSaveFile(savePath string) SaveAnalysisResult {
	cfg := config.ReadConfig()
	modsFolder := cfg.ModsFolder
	if modsFolder == "" {
		return SaveAnalysisResult{Ok: false, Error: "Папка Mods не указана"}
	}

	saveEntries, err := dbpf.ParseEntries(savePath)
	if err != nil {
		return SaveAnalysisResult{Ok: false, Error: "Не удалось прочитать файл сохранения"}
	}

	sf, err := os.Open(savePath)
	if err != nil {
		return SaveAnalysisResult{Ok: false, Error: err.Error()}
	}
	defer sf.Close()

	type rawModFile struct {
		info SaveModInfo
	}
	var rawFiles []rawModFile
	var totalBytes int64

	_ = filepath.Walk(modsFolder, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.Contains(strings.ToLower(info.Name()), ".package") {
			totalBytes += info.Size()
			rel, _ := filepath.Rel(modsFolder, path)
			rawFiles = append(rawFiles, rawModFile{
				info: SaveModInfo{
					FileName:     info.Name(),
					FilePath:     path,
					RelativePath: rel,
					Size:         info.Size(),
					Enabled:      !strings.HasSuffix(strings.ToLower(info.Name()), ".disabled"),
					ModifiedAt:   info.ModTime().UnixMilli(),
				},
			})
		}
		return nil
	})

	type modEntry struct {
		info      SaveModInfo
		instances []uint64
	}

	numWorkers := workers.Count()

	jobs := make(chan rawModFile, len(rawFiles))
	results := make(chan modEntry, len(rawFiles))

	var wg sync.WaitGroup
	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for rf := range jobs {
				entries, err := dbpf.ParseEntries(rf.info.FilePath)
				var insts []uint64
				if err == nil {
					for _, pe := range entries {
						if pe.Instance > 0x1000 {
							insts = append(insts, pe.Instance)
						}
					}
				}
				results <- modEntry{
					info:      rf.info,
					instances: insts,
				}
			}
		}()
	}

	for _, rf := range rawFiles {
		jobs <- rf
	}
	close(jobs)

	go func() {
		wg.Wait()
		close(results)
	}()

	var modList []modEntry
	modInstances := make(map[uint64]bool)
	for m := range results {
		modList = append(modList, m)
		for _, inst := range m.instances {
			modInstances[inst] = true
		}
	}

	usedInstances := make(map[uint64]bool)

	for _, e := range saveEntries {
		if e.Size == 0 {
			continue
		}
		raw := make([]byte, e.Size)
		_, _ = sf.Seek(int64(e.Position), io.SeekStart)
		_, _ = io.ReadFull(sf, raw)

		dec := decompressEntry(raw, e.Compression, e.DecompressedSize)
		if len(dec) < 8 {
			continue
		}

		for o := 0; o <= len(dec)-8; o++ {
			val := binary.LittleEndian.Uint64(dec[o : o+8])
			if val > 0x1000 && modInstances[val] {
				usedInstances[val] = true
			}
		}
	}

	usedMods := make([]SaveModInfo, 0)
	unusedMods := make([]SaveModInfo, 0)
	var usedBytes, unusedBytes int64

	for _, m := range modList {
		isUsed := false
		for _, inst := range m.instances {
			if usedInstances[inst] {
				isUsed = true
				break
			}
		}
		if isUsed {
			usedMods = append(usedMods, m.info)
			usedBytes += m.info.Size
		} else {
			unusedMods = append(unusedMods, m.info)
			unusedBytes += m.info.Size
		}
	}

	return SaveAnalysisResult{
		Ok:         true,
		SavePath:   savePath,
		SaveName:   filepath.Base(savePath),
		UsedMods:   usedMods,
		UnusedMods: unusedMods,
		Stats: SaveAnalysisStats{
			TotalModsCount:  len(usedMods) + len(unusedMods),
			UsedCount:       len(usedMods),
			UnusedCount:     len(unusedMods),
			UsedSizeBytes:   usedBytes,
			UnusedSizeBytes: unusedBytes,
			TotalSizeBytes:  totalBytes,
		},
	}
}
