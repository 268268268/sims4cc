//go:build !windows

package extractor

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// runExtractionTool распаковывает архив на Linux/Unix через доступные системные утилиты
func runExtractionTool(archivePath, tmpDir string) ([]byte, error) {
	ext := strings.ToLower(filepath.Ext(archivePath))

	// 1. Попытка через 7z / 7za / 7zr (наиболее надежно для .7z, .rar, .zip на Linux)
	for _, bin := range []string{"7z", "7za", "7zr"} {
		if path, err := exec.LookPath(bin); err == nil {
			cmd := exec.Command(path, "x", "-y", "-o"+tmpDir, archivePath)
			return cmd.CombinedOutput()
		}
	}

	// 2. Попытка через bsdtar (аналог Windows tar.exe на базе libarchive)
	if path, err := exec.LookPath("bsdtar"); err == nil {
		cmd := exec.Command(path, "-xf", archivePath, "-C", tmpDir)
		return cmd.CombinedOutput()
	}

	// 3. Для .rar отдельная проверка unrar
	if ext == ".rar" {
		if path, err := exec.LookPath("unrar"); err == nil {
			cmd := exec.Command(path, "x", "-y", archivePath, tmpDir+"/")
			return cmd.CombinedOutput()
		}
	}

	// 4. Попытка через стандартный tar
	if path, err := exec.LookPath("tar"); err == nil {
		cmd := exec.Command(path, "-xf", archivePath, "-C", tmpDir)
		return cmd.CombinedOutput()
	}

	return nil, fmt.Errorf("no extraction tool found on Linux (please install p7zip, bsdtar, or unrar)")
}
