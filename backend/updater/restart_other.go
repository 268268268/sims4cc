//go:build !windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Restart перезапускает приложение на Linux: заменяет исполняемый файл и перезапускает процесс
func (u *Updater) Restart() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to determine executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return fmt.Errorf("failed to resolve symlink: %w", err)
	}

	updatePath := exePath + ".update"
	oldPath := exePath + ".old"

	// Если есть скачанный .update файл, заменяем им текущий бинарник
	if _, err := os.Stat(updatePath); err == nil {
		_ = os.Remove(oldPath)
		_ = os.Rename(exePath, oldPath)
		if err := os.Rename(updatePath, exePath); err != nil {
			// Восстановление
			_ = os.Rename(oldPath, exePath)
			return fmt.Errorf("failed to replace executable: %w", err)
		}
		_ = os.Chmod(exePath, 0755)
		_ = os.Remove(oldPath)
	}

	cmd := exec.Command(exePath, os.Args[1:]...)
	cmd.Dir = filepath.Dir(exePath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to launch restarted application: %w", err)
	}

	go func() {
		time.Sleep(300 * time.Millisecond)
		if u.ctx != nil {
			wailsRuntime.Quit(u.ctx)
		}
		os.Exit(0)
	}()

	return nil
}
