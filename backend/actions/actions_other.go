//go:build !windows

package actions

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// MoveToRecycleBin перемещает файл в корзину Linux (XDG Trash spec)
func MoveToRecycleBin(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}

	// 1. Попытка через стандартную утилиту десктопа 'gio trash'
	if err := exec.Command("gio", "trash", absPath).Run(); err == nil {
		return nil
	}

	// 2. Попытка через 'trash-put' (trash-cli)
	if err := exec.Command("trash-put", absPath).Run(); err == nil {
		return nil
	}

	// 3. Fallback: реализация спецификации FreeDesktop Trash в ~/.local/share/Trash
	home, hErr := os.UserHomeDir()
	if hErr == nil {
		trashBase := os.Getenv("XDG_DATA_HOME")
		if trashBase == "" {
			trashBase = filepath.Join(home, ".local", "share")
		}
		trashDir := filepath.Join(trashBase, "Trash")
		filesDir := filepath.Join(trashDir, "files")
		infoDir := filepath.Join(trashDir, "info")

		if err := os.MkdirAll(filesDir, 0700); err == nil {
			_ = os.MkdirAll(infoDir, 0700)
			baseName := filepath.Base(absPath)
			targetFile := filepath.Join(filesDir, baseName)

			// Обеспечиваем уникальность имени в корзине
			counter := 1
			for {
				if _, statErr := os.Stat(targetFile); os.IsNotExist(statErr) {
					break
				}
				targetFile = filepath.Join(filesDir, fmt.Sprintf("%s.%d", baseName, counter))
				counter++
			}

			// Создаем .trashinfo
			infoName := filepath.Base(targetFile) + ".trashinfo"
			infoPath := filepath.Join(infoDir, infoName)
			delTime := time.Now().Format("2006-01-02T15:04:05")
			infoContent := fmt.Sprintf("[Trash Info]\nPath=%s\nDeletionDate=%s\n", url.PathEscape(absPath), delTime)

			if rErr := os.Rename(absPath, targetFile); rErr == nil {
				_ = os.WriteFile(infoPath, []byte(infoContent), 0600)
				return nil
			}
		}
	}

	// 4. Крайний fallback — прямое удаление
	return os.Remove(absPath)
}

// ShowItemInFolder открывает файловый менеджер Linux и пытается выделить файл
func ShowItemInFolder(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}

	fileURI := "file://" + absPath

	// 1. Попытка выделить через DBus FileManager1 (поддерживается Nautilus, Dolphin, Thunar, Nemo)
	dbusCmd := exec.Command("dbus-send",
		"--session",
		"--print-reply",
		"--dest=org.freedesktop.FileManager1",
		"/org/freedesktop/FileManager1",
		"org.freedesktop.FileManager1.ShowItems",
		"array:string:"+fileURI,
		"string:",
	)
	if err := dbusCmd.Run(); err == nil {
		return nil
	}

	// 2. Fallback: открыть родительскую папку через xdg-open
	parentDir := filepath.Dir(absPath)
	return exec.Command("xdg-open", parentDir).Start()
}

// OpenDirectory открывает директорию в файловом менеджере Linux
func OpenDirectory(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	return exec.Command("xdg-open", absPath).Start()
}

// OpenExternal открывает URL в браузере Linux по умолчанию
func OpenExternal(url string) error {
	return exec.Command("xdg-open", url).Start()
}
