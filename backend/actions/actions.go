package actions

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/scanner"
)

var (
	shell32           = syscall.NewLazyDLL("shell32.dll")
	shFileOperationW  = shell32.NewProc("SHFileOperationW")
)

const (
	foDelete         = 0x0003
	fofAllowUndo     = 0x0040
	fofNoConfirmation = 0x0010
	fofSilent        = 0x0004
)

type shFileOpStructW struct {
	hwnd                  uintptr
	wFunc                 uint32
	pFrom                 *uint16
	pTo                   *uint16
	fFlags                uint16
	fAnyOperationsAborted int32
	hNameMappings         uintptr
	lpszProgressTitle     *uint16
}

// Перемещает файл в Корзину Windows
func MoveToRecycleBin(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}

	// SHFileOperation требует double-null terminated строку
	utf16Path, err := syscall.UTF16FromString(absPath)
	if err != nil {
		return err
	}
	buf := append(utf16Path, 0)

	op := shFileOpStructW{
		wFunc:  foDelete,
		pFrom:  &buf[0],
		fFlags: fofAllowUndo | fofNoConfirmation | fofSilent,
	}

	ret, _, _ := shFileOperationW.Call(uintptr(unsafe.Pointer(&op)))
	if ret != 0 {
		// Резервное удаление
		return os.Remove(absPath)
	}
	return nil
}

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

// Открывает проводник и выделяет файл
func ShowItemInFolder(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	return exec.Command("explorer.exe", fmt.Sprintf("/select,%s", absPath)).Start()
}

// Открывает URL в браузере по умолчанию
func OpenExternal(url string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
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
