package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Config struct {
	ModsFolder       string   `json:"modsFolder"`
	GamePath         string   `json:"gamePath"`
	GameLanguage     string   `json:"gameLanguage"`
	CurseForgeApiKey string   `json:"curseForgeApiKey"`
	TumblrApiKey     string   `json:"tumblrApiKey"`
	TumblrFeedTags   []string `json:"tumblrFeedTags,omitempty"`
	Theme                     string   `json:"theme"`
	Locale                    string   `json:"locale"`
	Language                  string   `json:"language"`
	AutoScan                  bool     `json:"autoScan"`
	BypassRestrictedDownloads bool     `json:"bypassRestrictedDownloads"`
}

type ValidationResult struct {
	Ok             bool   `json:"ok"`
	Exists         bool   `json:"exists"`
	Valid          bool   `json:"valid"`
	LooksValid     bool   `json:"looksValid"`
	IsMods         bool   `json:"isMods"`
	InSims4Path    bool   `json:"inSims4Path"`
	HasResourceCfg bool   `json:"hasResourceCfg"`
	HasPackages    bool   `json:"hasPackages"`
	PackageCount   int    `json:"packageCount"`
	Message        string `json:"message"`
}

type CacheResult struct {
	Success     bool     `json:"success"`
	AlreadyGone bool     `json:"alreadyGone,omitempty"`
	Cleared     []string `json:"cleared"`
	Error       string   `json:"error,omitempty"`
}

var (
	cfgLock sync.RWMutex
	cached  *Config
)

// Возвращает путь к файлу настроек в AppData
func GetConfigPath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "config.json")
}

// Загружает конфигурацию из файла или возвращает значения по умолчанию
func ReadConfig() *Config {
	cfgLock.Lock()
	defer cfgLock.Unlock()

	if cached != nil {
		return cached
	}

	p := GetConfigPath()
	data, err := os.ReadFile(p)
	cfg := &Config{
		Theme:    "dark",
		Locale:   "ru",
		Language: "auto",
		AutoScan: true,
	}

	if err == nil {
		_ = json.Unmarshal(data, cfg)
		if cfg.Language == "" && cfg.Locale != "" {
			cfg.Language = cfg.Locale
		}
	}

	// Проверяем валидность пути ModsFolder: если пуст, указывает на Temp или папка не существует
	isInvalidMods := cfg.ModsFolder == "" || strings.Contains(cfg.ModsFolder, "AppData\\Local\\Temp")
	if !isInvalidMods {
		if fi, statErr := os.Stat(cfg.ModsFolder); statErr != nil || !fi.IsDir() {
			isInvalidMods = true
		}
	}

	if isInvalidMods {
		home := os.Getenv("USERPROFILE")
		candidates := []string{
			filepath.Join(home, "Sims4User", "Mods"),
			filepath.Join(home, "Documents", "Electronic Arts", "The Sims 4", "Mods"),
			filepath.Join(home, "OneDrive", "Documents", "Electronic Arts", "The Sims 4", "Mods"),
		}
		for _, cand := range candidates {
			if fi, statErr := os.Stat(cand); statErr == nil && fi.IsDir() {
				cfg.ModsFolder = cand
				break
			}
		}
	}

	// Чтение переменных из .env (текущая папка, папка с exe, или D:\sims4cc)
	loadEnv := func(path string) {
		if content, err := os.ReadFile(path); err == nil {
			for _, line := range strings.Split(string(content), "\n") {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
					continue
				}
				parts := strings.SplitN(line, "=", 2)
				k := strings.TrimSpace(parts[0])
				v := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
				if os.Getenv(k) == "" {
					_ = os.Setenv(k, v)
				}
			}
		}
	}
	loadEnv(".env")
	loadEnv(`D:\sims4cc\.env`)
	if exe, err := os.Executable(); err == nil {
		loadEnv(filepath.Join(filepath.Dir(exe), ".env"))
	}

	if cfg.CurseForgeApiKey == "" {
		if envKey := os.Getenv("CURSEFORGE_API_KEY"); envKey != "" {
			cfg.CurseForgeApiKey = envKey
		} else if envKey := os.Getenv("CF_API_KEY"); envKey != "" {
			cfg.CurseForgeApiKey = envKey
		}
	}

	cached = cfg
	return cached
}

func stringOrEmpty(val any) string {
	if val == nil {
		return ""
	}
	if s, ok := val.(string); ok {
		return s
	}
	return ""
}

// Записывает отдельное поле в конфигурацию
func SetConfig(key string, val any) error {
	cfg := ReadConfig()

	cfgLock.Lock()
	defer cfgLock.Unlock()

	switch key {
	case "modsFolder":
		cfg.ModsFolder = stringOrEmpty(val)
	case "gamePath":
		cfg.GamePath = stringOrEmpty(val)
	case "gameLanguage":
		cfg.GameLanguage = stringOrEmpty(val)
	case "curseForgeApiKey", "curseforgeApiKey":
		cfg.CurseForgeApiKey = stringOrEmpty(val)
	case "tumblrApiKey":
		cfg.TumblrApiKey = stringOrEmpty(val)
	case "tumblrFeedTags":
		if arr, ok := val.([]any); ok {
			var tags []string
			for _, item := range arr {
				if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
					tags = append(tags, strings.TrimSpace(s))
				}
			}
			cfg.TumblrFeedTags = tags
		} else if arr, ok := val.([]string); ok {
			cfg.TumblrFeedTags = arr
		}
	case "theme":
		cfg.Theme = stringOrEmpty(val)
	case "locale", "language":
		s := stringOrEmpty(val)
		if s == "" {
			s = "auto"
		}
		cfg.Locale = s
		cfg.Language = s
	case "autoScan":
		if b, ok := val.(bool); ok {
			cfg.AutoScan = b
		}
	case "bypassRestrictedDownloads":
		if b, ok := val.(bool); ok {
			cfg.BypassRestrictedDownloads = b
		}
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(GetConfigPath(), data, 0644)
}

// Проверяет валидность папки Mods
func ValidateModsFolder(folder string) ValidationResult {
	if folder == "" {
		return ValidationResult{Ok: false, Exists: false, Valid: false, LooksValid: false, Message: "Путь не указан"}
	}
	info, err := os.Stat(folder)
	if err != nil || !info.IsDir() {
		return ValidationResult{Ok: false, Exists: false, Valid: false, LooksValid: false, Message: "Папка не существует"}
	}

	lower := strings.ToLower(folder)
	isMods := strings.ToLower(filepath.Base(folder)) == "mods"
	inSims4Path := strings.Contains(lower, "the sims 4") || strings.Contains(lower, "sims4")
	hasResourceCfg := false
	if _, err := os.Stat(filepath.Join(folder, "Resource.cfg")); err == nil {
		hasResourceCfg = true
	}

	count := 0
	_ = filepath.Walk(folder, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			ext := strings.ToLower(filepath.Ext(path))
			if ext == ".package" || strings.HasSuffix(strings.ToLower(path), ".package.disabled") {
				count++
			}
		}
		return nil
	})

	hasPackages := count > 0
	looksValid := isMods || hasResourceCfg || hasPackages

	return ValidationResult{
		Ok:             true,
		Exists:         true,
		Valid:          true,
		LooksValid:     looksValid,
		IsMods:         isMods,
		InSims4Path:    inSims4Path,
		HasResourceCfg: hasResourceCfg,
		HasPackages:    hasPackages,
		PackageCount:   count,
		Message:        "Папка проверена",
	}
}

// Очищает кэш игры (localthumbcache.package, avatarcache, cachestr)
func ClearGameCache() CacheResult {
	cfg := ReadConfig()
	if cfg.ModsFolder == "" {
		return CacheResult{Success: false, Error: "Папка Mods не задана"}
	}

	gameDir := filepath.Dir(cfg.ModsFolder)
	candidates := []string{
		filepath.Join(gameDir, "localthumbcache.package"),
		filepath.Join(gameDir, "avatarcache.package"),
		filepath.Join(gameDir, "cache"),
		filepath.Join(gameDir, "cachestr"),
		filepath.Join(gameDir, "onlinestorage"),
	}

	var cleared []string
	for _, p := range candidates {
		info, err := os.Stat(p)
		if err == nil {
			if info.IsDir() {
				_ = os.RemoveAll(p)
				_ = os.Mkdir(p, 0755)
			} else {
				_ = os.Remove(p)
			}
			cleared = append(cleared, filepath.Base(p))
		}
	}

	return CacheResult{
		Success:     true,
		AlreadyGone: len(cleared) == 0,
		Cleared:     cleared,
	}
}
