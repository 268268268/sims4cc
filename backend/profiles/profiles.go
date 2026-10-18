package profiles

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"sims4cc-wails/backend/actions"
	"sims4cc-wails/backend/scanner"
)

type Profile struct {
	Id        string          `json:"id"`
	Name      string          `json:"name"`
	CreatedAt string          `json:"createdAt"`
	States    map[string]bool `json:"states"` // stableKey -> enabled
}

type ProfileStoreData struct {
	Profiles []Profile `json:"profiles"`
	ActiveId *string   `json:"activeId"`
}

var (
	profLock sync.Mutex
)

func getStorePath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "profiles.json")
}

func readStore() ProfileStoreData {
	data, err := os.ReadFile(getStorePath())
	if err != nil {
		return ProfileStoreData{Profiles: []Profile{}}
	}
	var res ProfileStoreData
	if json.Unmarshal(data, &res) != nil {
		return ProfileStoreData{Profiles: []Profile{}}
	}
	return res
}

func writeStore(data ProfileStoreData) {
	raw, err := json.MarshalIndent(data, "", "  ")
	if err == nil {
		_ = os.WriteFile(getStorePath(), raw, 0644)
	}
}

func modStableKey(m scanner.LocalModDTO) string {
	p := m.RelativePath
	if p == "" {
		p = m.FilePath
	}
	p = strings.ToLower(p)
	if strings.HasSuffix(p, ".disabled") {
		p = strings.TrimSuffix(p, ".disabled")
	}
	return p
}

func generateId() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "p_" + hex.EncodeToString(b)
}

// Список всех профилей
func ListProfiles() ProfileStoreData {
	profLock.Lock()
	defer profLock.Unlock()
	return readStore()
}

type SaveProfilePayload struct {
	Id   string                `json:"id,omitempty"`
	Name string                `json:"name"`
	Mods []scanner.LocalModDTO `json:"mods"`
}

// Создает или обновляет профиль
func SaveProfile(payload SaveProfilePayload) Profile {
	profLock.Lock()
	defer profLock.Unlock()

	store := readStore()
	states := make(map[string]bool)

	mods := payload.Mods
	if len(mods) == 0 {
		mods = scanner.GetCachedMods()
	}
	for _, m := range mods {
		if m.Type != "archive" {
			states[modStableKey(m)] = m.Enabled
		}
	}

	id := payload.Id
	if id == "" {
		id = generateId()
	}

	now := time.Now().UTC().Format(time.RFC3339)
	profile := Profile{
		Id:        id,
		Name:      payload.Name,
		CreatedAt: now,
		States:    states,
	}

	found := false
	for i := range store.Profiles {
		if store.Profiles[i].Id == id {
			store.Profiles[i] = profile
			found = true
			break
		}
	}
	if !found {
		store.Profiles = append(store.Profiles, profile)
	}
	store.ActiveId = &id

	writeStore(store)
	return profile
}

type ProfileToggleError struct {
	File  string `json:"file"`
	Error string `json:"error"`
}

type ApplyProfileResult struct {
	Ok      bool                 `json:"ok"`
	Changed int                  `json:"changed"`
	Errors  []ProfileToggleError `json:"errors,omitempty"`
	Error   string               `json:"error,omitempty"`
}

// Возвращает профиль по ID
func GetProfile(id string) *Profile {
	profLock.Lock()
	defer profLock.Unlock()
	store := readStore()
	for i := range store.Profiles {
		if store.Profiles[i].Id == id {
			p := store.Profiles[i]
			return &p
		}
	}
	return nil
}

// Применяет профиль к текущим модам в папке
func ApplyProfile(id string) ApplyProfileResult {
	profLock.Lock()
	store := readStore()
	var target *Profile
	for i := range store.Profiles {
		if store.Profiles[i].Id == id {
			p := store.Profiles[i]
			target = &p
			break
		}
	}
	if target == nil {
		profLock.Unlock()
		return ApplyProfileResult{Ok: false, Error: "Profile not found."}
	}
	store.ActiveId = &id
	writeStore(store)
	profLock.Unlock()

	mods := scanner.GetCachedMods()
	if len(mods) == 0 {
		mods = scanner.ScanMods().Mods
	}

	changed := 0
	var errs []ProfileToggleError
	for _, m := range mods {
		if m.Type == "archive" {
			continue
		}
		key := modStableKey(m)
		shouldEnable, exists := target.States[key]
		if !exists || shouldEnable == m.Enabled {
			continue
		}
		res := actions.ToggleLocalModEnabled(m.FilePath, shouldEnable)
		if res.Ok {
			changed++
		} else {
			errs = append(errs, ProfileToggleError{File: m.FilePath, Error: res.Error})
		}
	}

	return ApplyProfileResult{
		Ok:      true,
		Changed: changed,
		Errors:  errs,
	}
}

// Импортирует профиль из JSON-структуры
func AddImportedProfile(name string, states map[string]bool) (ProfileStoreData, string) {
	profLock.Lock()
	defer profLock.Unlock()

	store := readStore()
	if strings.TrimSpace(name) == "" {
		name = "Imported profile"
	}
	id := generateId()
	now := time.Now().UTC().Format(time.RFC3339)
	if states == nil {
		states = make(map[string]bool)
	}
	p := Profile{
		Id:        id,
		Name:      strings.TrimSpace(name),
		CreatedAt: now,
		States:    states,
	}
	store.Profiles = append(store.Profiles, p)
	writeStore(store)
	return store, id
}

// Переименовывает профиль
func RenameProfile(id, newName string) ProfileStoreData {
	profLock.Lock()
	defer profLock.Unlock()

	store := readStore()
	for i := range store.Profiles {
		if store.Profiles[i].Id == id {
			store.Profiles[i].Name = newName
			writeStore(store)
			break
		}
	}
	return store
}

// Удаляет профиль
func DeleteProfile(id string) ProfileStoreData {
	profLock.Lock()
	defer profLock.Unlock()

	store := readStore()
	var updated []Profile
	for _, p := range store.Profiles {
		if p.Id != id {
			updated = append(updated, p)
		}
	}
	store.Profiles = updated
	if store.ActiveId != nil && *store.ActiveId == id {
		store.ActiveId = nil
	}
	writeStore(store)
	return store
}
