package extractor

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"sims4cc-wails/backend/actions"
	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/scanner"
)

var trayExtensions = map[string]bool{
	".trayitem":        true,
	".householdbinary": true,
	".blueprint":       true,
	".room":            true,
	".bpi":             true,
	".hhi":             true,
	".sgi":             true,
}

func IsArchiveExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".zip", ".rar", ".7z":
		return true
	default:
		return false
	}
}

type ExtractResult struct {
	Ok        bool     `json:"ok"`
	Folder    string   `json:"folder,omitempty"`
	Files     []string `json:"files,omitempty"`
	TrayFiles []string `json:"trayFiles,omitempty"`
	Error     string   `json:"error,omitempty"`
}

type ExtractFailure struct {
	Name  string `json:"name"`
	Error string `json:"error"`
}

type ExtractAllResult struct {
	Ok        bool             `json:"ok"`
	Extracted int              `json:"extracted"`
	Failed    []ExtractFailure `json:"failed"`
	Error     string           `json:"error,omitempty"`
}

// Распаковка .rar / .7z (и нестандартных .zip) через системную утилиту распаковки
func extractViaSystemTar(archivePath, targetDir, trayFolder string, hasTray, deleteSource bool) ExtractResult {
	tmpDir, err := os.MkdirTemp("", "sims4cc-extract-*")
	if err != nil {
		return ExtractResult{Ok: false, Error: err.Error()}
	}
	defer os.RemoveAll(tmpDir)

	if out, err := runExtractionTool(archivePath, tmpDir); err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return ExtractResult{Ok: false, Error: msg}
	}

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return ExtractResult{Ok: false, Error: err.Error()}
	}

	var files []string
	var trayFiles []string

	_ = filepath.Walk(tmpDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.Contains(path, "__MACOSX") || strings.HasSuffix(info.Name(), ".DS_Store") {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(info.Name()))
		baseName := info.Name()
		var destPath string
		isTray := false

		if hasTray && trayExtensions[ext] {
			destPath = filepath.Join(trayFolder, baseName)
			isTray = true
		} else {
			destPath = filepath.Join(targetDir, baseName)
		}

		if copied, err := actions.CopyFileUnique(path, filepath.Dir(destPath)); err == nil {
			if isTray {
				trayFiles = append(trayFiles, copied)
			} else {
				files = append(files, copied)
			}
		}
		return nil
	})

	if deleteSource {
		_ = os.Remove(archivePath)
		scanner.RemoveCachedMod(archivePath)
	}

	return ExtractResult{
		Ok:        true,
		Folder:    targetDir,
		Files:     files,
		TrayFiles: trayFiles,
	}
}

// Внутренняя функция распаковки архива (.zip, .rar, .7z) в целевую папку Mods (с опцией удаления исходника)
func extractArchiveInternal(archivePath string, targetParentDir string, deleteSource bool) ExtractResult {
	cfg := config.ReadConfig()
	modsFolder := cfg.ModsFolder
	if modsFolder == "" {
		modsFolder = targetParentDir
	}
	if targetParentDir == "" {
		targetParentDir = filepath.Dir(archivePath)
	}

	gameFolder := filepath.Dir(modsFolder)
	trayFolder := filepath.Join(gameFolder, "Tray")
	hasTray := false
	if info, err := os.Stat(trayFolder); err == nil && info.IsDir() {
		hasTray = true
	}

	extArch := strings.ToLower(filepath.Ext(archivePath))
	archiveStem := strings.TrimSuffix(filepath.Base(archivePath), filepath.Ext(archivePath))
	targetDir := filepath.Join(targetParentDir, archiveStem)

	if extArch == ".rar" || extArch == ".7z" {
		return extractViaSystemTar(archivePath, targetDir, trayFolder, hasTray, deleteSource)
	}

	r, err := zip.OpenReader(archivePath)
	if err != nil {
		// Фолбэк на системный tar.exe, если архив назван .zip, но внутри RAR/7z/Deflate64
		return extractViaSystemTar(archivePath, targetDir, trayFolder, hasTray, deleteSource)
	}
	defer r.Close()

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return ExtractResult{Ok: false, Error: err.Error()}
	}

	var files []string
	var trayFiles []string

	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}

		name := f.Name
		if strings.Contains(name, "__MACOSX") || strings.HasSuffix(name, ".DS_Store") {
			continue
		}

		ext := strings.ToLower(filepath.Ext(name))
		baseName := filepath.Base(name)
		var destPath string
		isTray := false

		if hasTray && trayExtensions[ext] {
			destPath = filepath.Join(trayFolder, baseName)
			isTray = true
		} else {
			destPath = filepath.Join(targetDir, baseName)
		}

		rc, err := f.Open()
		if err != nil {
			continue
		}

		out, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			rc.Close()
			continue
		}

		_, _ = io.Copy(out, rc)
		out.Close()
		rc.Close()

		if isTray {
			trayFiles = append(trayFiles, destPath)
		} else {
			files = append(files, destPath)
		}
	}

	if deleteSource {
		r.Close()
		_ = os.Remove(archivePath)
		scanner.RemoveCachedMod(archivePath)
	}

	return ExtractResult{
		Ok:        true,
		Folder:    targetDir,
		Files:     files,
		TrayFiles: trayFiles,
	}
}

// Распаковывает один архив (.zip, .rar, .7z), лежащий внутри папки Mods, и удаляет исходный архив
func ExtractLocalArchive(archivePath string) ExtractResult {
	return extractArchiveInternal(archivePath, filepath.Dir(archivePath), true)
}

// Распаковывает все найденные архивы (.zip, .rar, .7z) в папке Mods
func ExtractAllArchives() ExtractAllResult {
	cfg := config.ReadConfig()
	if cfg.ModsFolder == "" {
		return ExtractAllResult{Ok: false, Failed: []ExtractFailure{}, Error: "Mods folder not configured"}
	}

	var archives []string
	_ = filepath.Walk(cfg.ModsFolder, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && IsArchiveExt(filepath.Ext(path)) {
			archives = append(archives, path)
		}
		return nil
	})

	extracted := 0
	failed := make([]ExtractFailure, 0)
	for _, a := range archives {
		res := ExtractLocalArchive(a)
		if res.Ok {
			extracted++
		} else {
			failed = append(failed, ExtractFailure{Name: filepath.Base(a), Error: res.Error})
		}
	}

	return ExtractAllResult{
		Ok:        true,
		Extracted: extracted,
		Failed:    failed,
	}
}

type ImportItemResult struct {
	Source    string   `json:"source"`
	Kind      string   `json:"kind"`
	Ok        bool     `json:"ok"`
	Dest      string   `json:"dest,omitempty"`
	Folder    string   `json:"folder,omitempty"`
	Files     []string `json:"files,omitempty"`
	TrayFiles []string `json:"trayFiles,omitempty"`
	Note      string   `json:"note,omitempty"`
	Error     string   `json:"error,omitempty"`
}

type ImportFilesResult struct {
	Ok      bool               `json:"ok"`
	Results []ImportItemResult `json:"results"`
	Error   string             `json:"error,omitempty"`
}

// Импортирует перетащенные (Drag & Drop) или пойманные файлы (.zip, .rar, .7z, .package, .ts4script, Tray) в игру
func ImportFiles(paths []string) ImportFilesResult {
	cfg := config.ReadConfig()
	if cfg.ModsFolder == "" {
		return ImportFilesResult{Ok: false, Results: []ImportItemResult{}, Error: "Mods folder not configured."}
	}

	absMods, err := filepath.Abs(cfg.ModsFolder)
	if err != nil {
		return ImportFilesResult{Ok: false, Results: []ImportItemResult{}, Error: err.Error()}
	}
	if info, err := os.Stat(absMods); err != nil || !info.IsDir() {
		return ImportFilesResult{Ok: false, Results: []ImportItemResult{}, Error: fmt.Sprintf("Mods folder not found: %s", cfg.ModsFolder)}
	}

	trayFolder := filepath.Join(filepath.Dir(absMods), "Tray")
	hasTray := false
	if info, err := os.Stat(trayFolder); err == nil && info.IsDir() {
		hasTray = true
	}

	results := make([]ImportItemResult, 0, len(paths))
	anyOk := false

	for _, source := range paths {
		if source == "" {
			continue
		}
		info, err := os.Stat(source)
		if err != nil {
			results = append(results, ImportItemResult{Source: source, Kind: "rejected", Ok: false, Error: err.Error()})
			continue
		}
		if info.IsDir() {
			folderName := filepath.Base(source)
			destSubdir := filepath.Join(absMods, folderName)
			_ = os.MkdirAll(destSubdir, 0755)
			var folderFiles []string
			var folderTray []string
			_ = filepath.Walk(source, func(p string, fi os.FileInfo, wErr error) error {
				if wErr != nil || fi.IsDir() {
					return nil
				}
				fExt := strings.ToLower(filepath.Ext(fi.Name()))
				if IsArchiveExt(fExt) {
					subRes := extractArchiveInternal(p, destSubdir, false)
					if subRes.Ok {
						folderFiles = append(folderFiles, subRes.Files...)
						folderTray = append(folderTray, subRes.TrayFiles...)
					}
				} else if fExt == ".package" || fExt == ".ts4script" {
					if copied, err := actions.CopyFileUnique(p, destSubdir); err == nil {
						folderFiles = append(folderFiles, copied)
					}
				} else if trayExtensions[fExt] {
					tDir := destSubdir
					if hasTray {
						tDir = trayFolder
					}
					if copied, err := actions.CopyFileUnique(p, tDir); err == nil {
						folderTray = append(folderTray, copied)
					}
				}
				return nil
			})
			if len(folderFiles) > 0 || len(folderTray) > 0 {
				anyOk = true
				results = append(results, ImportItemResult{
					Source:    source,
					Kind:      "folder",
					Ok:        true,
					Folder:    destSubdir,
					Files:     folderFiles,
					TrayFiles: folderTray,
				})
			} else {
				results = append(results, ImportItemResult{
					Source: source,
					Kind:   "rejected",
					Ok:     false,
					Error:  "No Sims 4 mod files found in folder.",
				})
			}
			continue
		}

		ext := strings.ToLower(filepath.Ext(source))
		if IsArchiveExt(ext) {
			res := extractArchiveInternal(source, absMods, false)
			if res.Ok {
				anyOk = true
				results = append(results, ImportItemResult{
					Source:    source,
					Kind:      "zip",
					Ok:        true,
					Folder:    res.Folder,
					Files:     res.Files,
					TrayFiles: res.TrayFiles,
				})
			} else {
				results = append(results, ImportItemResult{Source: source, Kind: "zip", Ok: false, Error: res.Error})
			}
			continue
		}

		if ext == ".package" || ext == ".ts4script" {
			absSrc, _ := filepath.Abs(source)
			if strings.HasPrefix(strings.ToLower(absSrc), strings.ToLower(absMods)+string(filepath.Separator)) {
				anyOk = true
				results = append(results, ImportItemResult{
					Source: source,
					Kind:   "package",
					Ok:     true,
					Dest:   absSrc,
					Note:   "Already in the Mods folder.",
				})
				continue
			}
			dest, err := actions.CopyFileUnique(source, absMods)
			if err != nil {
				results = append(results, ImportItemResult{Source: source, Kind: "package", Ok: false, Error: err.Error()})
			} else {
				anyOk = true
				kind := "package"
				if ext == ".ts4script" {
					kind = "script"
				}
				results = append(results, ImportItemResult{Source: source, Kind: kind, Ok: true, Dest: dest})
			}
			continue
		}

		if trayExtensions[ext] {
			targetDir := absMods
			note := "No Tray folder found — placed in Mods."
			if hasTray {
				targetDir = trayFolder
				note = "Installed to Tray."
			}
			dest, err := actions.CopyFileUnique(source, targetDir)
			if err != nil {
				results = append(results, ImportItemResult{Source: source, Kind: "tray", Ok: false, Error: err.Error()})
			} else {
				anyOk = true
				results = append(results, ImportItemResult{Source: source, Kind: "tray", Ok: true, Dest: dest, Note: note})
			}
			continue
		}

		results = append(results, ImportItemResult{
			Source: source,
			Kind:   "rejected",
			Ok:     false,
			Error:  fmt.Sprintf("Not a Sims 4 mod file (%s).", ext),
		})
	}

	if anyOk {
		scanner.ScanMods()
	}

	return ImportFilesResult{
		Ok:      anyOk,
		Results: results,
	}
}
