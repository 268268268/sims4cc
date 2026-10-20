//go:build windows

package extractor

import (
	"os/exec"
	"syscall"
)

// runExtractionTool распаковывает архив через встроенный в Windows tar.exe (libarchive)
func runExtractionTool(archivePath, tmpDir string) ([]byte, error) {
	cmd := exec.Command("tar.exe", "-xf", archivePath, "-C", tmpDir)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.CombinedOutput()
}
