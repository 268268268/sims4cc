package actions

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/scanner"
)

type ToggleResult struct {
	Ok      bool                 `json:"ok"`
	Mod     *scanner.LocalModDTO `json:"mod,omitempty"`
	OldPath string               `json:"oldPath,omitempty"`
	NewPath string               `json:"newPath,omitempty"`
	Error   string               `json:"error,omitempty"`
}

// Переключает активность мода (.disabled)
func ToggleLocalModEnabled(filePath string, enabled bool) ToggleResult {
	cfg := config.ReadConfig()
	if cfg.ModsFolder == "" {
		return ToggleResult{Ok: false, Error: "Mods folder not configured"}
	}

	absFile, err := filepath.Abs(filePath)
	if err != nil {
		return ToggleResult{Ok: false, Error: err.Error()}
	}

	name := filepath.Base(absFile)
	isDisabled := strings.HasSuffix(strings.ToLower(name), ".disabled")
	isEnabled := !isDisabled

	if (enabled && isEnabled) || (!enabled && isDisabled) {
		// Уже в нужном состоянии
		mod := scanner.ReplaceCachedMod(absFile, absFile, enabled)
		return ToggleResult{Ok: true, Mod: mod, OldPath: absFile, NewPath: absFile}
	}

	var newPath string
	if enabled {
		newPath = strings.TrimSuffix(absFile, ".disabled")
		if newPath == absFile {
			// case-insensitive fallback for .DISABLED
			newPath = absFile[:len(absFile)-len(".disabled")]
		}
	} else {
		newPath = absFile + ".disabled"
	}

	if err := os.Rename(absFile, newPath); err != nil {
		return ToggleResult{Ok: false, Error: err.Error()}
	}

	// Мгновенно обновляем запись в кэше без полного пересканирования папки Mods
	updatedMod := scanner.ReplaceCachedMod(absFile, newPath, enabled)

	return ToggleResult{
		Ok:      true,
		Mod:     updatedMod,
		OldPath: absFile,
		NewPath: newPath,
	}
}

type BatchToggleResult struct {
	Ok      bool           `json:"ok"`
	Count   int            `json:"count"`
	Results []ToggleResult `json:"results"`
	Error   string         `json:"error,omitempty"`
}

// Массовое переключение списка модов
func BatchToggleLocalMods(filePaths []string, enabled bool) BatchToggleResult {
	cfg := config.ReadConfig()
	if cfg.ModsFolder == "" {
		return BatchToggleResult{Ok: false, Error: "Mods folder not configured"}
	}
	results := make([]ToggleResult, 0, len(filePaths))
	for _, p := range filePaths {
		res := ToggleLocalModEnabled(p, enabled)
		if res.Ok && res.Mod != nil {
			results = append(results, res)
		}
	}
	return BatchToggleResult{
		Ok:      true,
		Count:   len(results),
		Results: results,
	}
}

type DeleteResult struct {
	Ok      bool     `json:"ok"`
	Count   int      `json:"count"`
	Removed []string `json:"removed"`
	Deleted []string `json:"deleted"`
	Error   string   `json:"error,omitempty"`
}

// Удаляет мод в корзину
func DeleteLocalMod(filePath string) DeleteResult {
	if err := MoveToRecycleBin(filePath); err != nil {
		return DeleteResult{Ok: false, Error: err.Error()}
	}
	scanner.RemoveCachedMod(filePath)
	list := []string{filePath}
	return DeleteResult{Ok: true, Count: 1, Removed: list, Deleted: list}
}

// Массовое удаление модов в корзину
func BatchDeleteLocalMods(filePaths []string) DeleteResult {
	var removed []string
	for _, p := range filePaths {
		if err := MoveToRecycleBin(p); err == nil {
			removed = append(removed, p)
			scanner.RemoveCachedMod(p)
		}
	}
	return DeleteResult{Ok: true, Count: len(removed), Removed: removed, Deleted: removed}
}

// Копирует файл в папку назначения с уникальным именем
func CopyFileUnique(src, destDir string) (string, error) {
	base := filepath.Base(src)
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)

	dest := filepath.Join(destDir, base)
	for i := 1; ; i++ {
		if _, err := os.Stat(dest); os.IsNotExist(err) {
			break
		}
		dest = filepath.Join(destDir, fmt.Sprintf("%s (%d)%s", stem, i, ext))
	}

	in, err := os.Open(src)
	if err != nil {
		return "", err
	}
	defer in.Close()

	out, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return dest, err
}
