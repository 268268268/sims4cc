package config

import (
	"os"
	"path/filepath"
	"runtime"
)

// GetSims4BaseCandidates возвращает список вероятных путей к корневой папке данных The Sims 4
// с учетом особенностей Windows, macOS и Linux (Steam Proton, Wine, Lutris, Bottles).
func GetSims4BaseCandidates() []string {
	var candidates []string

	home := os.Getenv("USERPROFILE")
	if home == "" {
		home, _ = os.UserHomeDir()
	}

	if home == "" {
		return candidates
	}

	if runtime.GOOS == "windows" {
		candidates = append(candidates,
			filepath.Join(home, "Documents", "Electronic Arts", "The Sims 4"),
			filepath.Join(home, "OneDrive", "Documents", "Electronic Arts", "The Sims 4"),
			filepath.Join(home, "Sims4User"),
		)
	} else if runtime.GOOS == "darwin" {
		candidates = append(candidates,
			filepath.Join(home, "Documents", "Electronic Arts", "The Sims 4"),
		)
	} else {
		// Linux & Unix: Steam Proton (AppID 1222670), Flatpak Steam, Lutris, Bottles, Wine
		candidates = append(candidates,
			// Стандартный путь (если сделан симлинк в Documents)
			filepath.Join(home, "Documents", "Electronic Arts", "The Sims 4"),
			// Steam Native Proton (The Sims 4 Steam App ID: 1222670)
			filepath.Join(home, ".local", "share", "Steam", "steamapps", "compatdata", "1222670", "pfx", "drive_c", "users", "steamuser", "Documents", "Electronic Arts", "The Sims 4"),
			filepath.Join(home, ".steam", "steam", "steamapps", "compatdata", "1222670", "pfx", "drive_c", "users", "steamuser", "Documents", "Electronic Arts", "The Sims 4"),
			filepath.Join(home, ".steam", "root", "steamapps", "compatdata", "1222670", "pfx", "drive_c", "users", "steamuser", "Documents", "Electronic Arts", "The Sims 4"),
			// Steam Flatpak (Steam Deck / Fedora Silverblue / Ubuntu Flatpak)
			filepath.Join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam", "steamapps", "compatdata", "1222670", "pfx", "drive_c", "users", "steamuser", "Documents", "Electronic Arts", "The Sims 4"),
			filepath.Join(home, ".var", "app", "com.valvesoftware.Steam", ".steam", "steam", "steamapps", "compatdata", "1222670", "pfx", "drive_c", "users", "steamuser", "Documents", "Electronic Arts", "The Sims 4"),
			// Lutris
			filepath.Join(home, "Games", "the-sims-4", "drive_c", "users", "steamuser", "Documents", "Electronic Arts", "The Sims 4"),
			// Wine default prefix
			filepath.Join(home, ".wine", "drive_c", "users", "steamuser", "Documents", "Electronic Arts", "The Sims 4"),
		)
	}

	return candidates
}

// GetSims4ModsCandidates возвращает список возможных путей к папке Mods
func GetSims4ModsCandidates() []string {
	bases := GetSims4BaseCandidates()
	mods := make([]string, 0, len(bases))
	for _, base := range bases {
		mods = append(mods, filepath.Join(base, "Mods"))
	}
	return mods
}

// GetSims4SavesCandidates возвращает список возможных путей к папке saves
func GetSims4SavesCandidates() []string {
	bases := GetSims4BaseCandidates()
	saves := make([]string, 0, len(bases))
	for _, base := range bases {
		saves = append(saves, filepath.Join(base, "saves"))
	}
	return saves
}

// GetSims4CacheCandidates возвращает список возможных путей к localthumbcache.package
func GetSims4CacheCandidates() []string {
	bases := GetSims4BaseCandidates()
	caches := make([]string, 0, len(bases))
	for _, base := range bases {
		caches = append(caches, filepath.Join(base, "localthumbcache.package"))
	}
	return caches
}
