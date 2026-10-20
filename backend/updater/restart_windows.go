//go:build windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Restart перезапускает приложение на Windows через отложенную замену бинарника в cmd.exe
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
			wailsRuntime.Quit(u.ctx)
		}
		os.Exit(0)
	}()

	return nil
}
