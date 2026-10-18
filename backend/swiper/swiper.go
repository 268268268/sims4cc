package swiper

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	qrcode "github.com/skip2/go-qrcode"
	"sims4cc-wails/backend/actions"
	"sims4cc-wails/backend/scanner"
)

type SwiperHistoryItem struct {
	Card         scanner.LocalModDTO `json:"card"`
	Action       string              `json:"action"` // "keep", "trash", "disable", "skip"
	PreviousPath string              `json:"previousPath,omitempty"`
	NewPath      string              `json:"newPath,omitempty"`
	Timestamp    int64               `json:"timestamp"`
}

type SwiperStats struct {
	Total        int `json:"total"`
	Reviewed     int `json:"reviewed"`
	Remaining    int `json:"remaining"`
	HistoryCount int `json:"historyCount"`
}

type SwiperCardsResult struct {
	Cards []scanner.LocalModDTO `json:"cards"`
	Stats SwiperStats           `json:"stats"`
}

type MobileServerStatus struct {
	Running        bool   `json:"running"`
	Port           int    `json:"port"`
	Ip             string `json:"ip"`
	Url            string `json:"url"`
	QrCodeDataUrl  string `json:"qrCodeDataUrl"`
}

var (
	swiperLock   sync.Mutex
	reviewedMap  = make(map[string]bool)
	historyStack []SwiperHistoryItem
	cachedCards  []scanner.LocalModDTO
	serverInstance *http.Server
	currentStatus  = MobileServerStatus{Running: false, Port: 3456}
)

func getReviewedPath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager", "swiper")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "reviewed.json")
}

func loadReviewed() {
	data, err := os.ReadFile(getReviewedPath())
	if err == nil {
		var list []string
		if json.Unmarshal(data, &list) == nil {
			for _, id := range list {
				reviewedMap[id] = true
			}
		}
	}
}

func saveReviewed() {
	var list []string
	for id := range reviewedMap {
		list = append(list, id)
	}
	data, _ := json.MarshalIndent(list, "", "  ")
	_ = os.WriteFile(getReviewedPath(), data, 0644)
}

func getLocalIPv4() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	for _, a := range addrs {
		if ipnet, ok := a.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			ip := ipnet.IP.String()
			if strings.HasPrefix(ip, "192.168.") || strings.HasPrefix(ip, "10.") || strings.HasPrefix(ip, "172.") {
				return ip
			}
		}
	}
	return "127.0.0.1"
}

type SwiperQueryOpts struct {
	Filter         string `json:"filter"`
	Folder         string `json:"folder"`
	OnlyUnreviewed bool   `json:"onlyUnreviewed"`
	Shuffle        bool   `json:"shuffle"`
}

// Возвращает карточки модов для свайпера
func GetSwiperCards(opts SwiperQueryOpts) SwiperCardsResult {
	swiperLock.Lock()
	defer swiperLock.Unlock()

	loadReviewed()
	mods := scanner.GetCachedMods()
	if len(mods) == 0 {
		mods = scanner.ScanMods().Mods
	}

	var filtered []scanner.LocalModDTO
	for _, m := range mods {
		if m.Type != "package" {
			continue
		}

		if opts.Folder != "" {
			norm := strings.ToLower(strings.ReplaceAll(opts.Folder, "\\", "/"))
			rel := strings.ToLower(strings.ReplaceAll(m.RelativePath, "\\", "/"))
			if !strings.HasPrefix(rel, norm) {
				continue
			}
		}

		switch opts.Filter {
		case "cas":
			hasCas := false
			for _, k := range m.Kinds {
				if k == "CAS" {
					hasCas = true
					break
				}
			}
			if !hasCas {
				continue
			}
		case "objects":
			hasObj := false
			for _, k := range m.Kinds {
				if k == "Object" {
					hasObj = true
					break
				}
			}
			if !hasObj {
				continue
			}
		case "with-thumbs":
			if m.Thumbnail.Path == nil {
				continue
			}
		case "no-thumbs":
			if m.Thumbnail.Path != nil {
				continue
			}
		}

		if opts.OnlyUnreviewed && reviewedMap[m.Id] {
			continue
		}

		filtered = append(filtered, m)
	}

	if opts.Shuffle && len(filtered) > 1 {
		r := rand.New(rand.NewSource(time.Now().UnixNano()))
		r.Shuffle(len(filtered), func(i, j int) {
			filtered[i], filtered[j] = filtered[j], filtered[i]
		})
	}

	cachedCards = filtered

	return SwiperCardsResult{
		Cards: filtered,
		Stats: SwiperStats{
			Total:        len(mods),
			Reviewed:     len(reviewedMap),
			Remaining:    len(filtered),
			HistoryCount: len(historyStack),
		},
	}
}

type SwiperActionPayload struct {
	ModId    string `json:"modId"`
	FilePath string `json:"filePath"`
	Action   string `json:"action"` // "keep", "trash", "disable", "skip"
}

type SwiperActionResult struct {
	Ok     bool                 `json:"ok"`
	Action string               `json:"action"`
	Card   *scanner.LocalModDTO `json:"card,omitempty"`
	Error  string               `json:"error,omitempty"`
}

// Обрабатывает свайп
func ProcessSwiperAction(p SwiperActionPayload) SwiperActionResult {
	swiperLock.Lock()
	defer swiperLock.Unlock()

	var card *scanner.LocalModDTO
	for i := range cachedCards {
		if cachedCards[i].Id == p.ModId {
			card = &cachedCards[i]
			break
		}
	}
	if card == nil {
		card = &scanner.LocalModDTO{Id: p.ModId, FilePath: p.FilePath}
	}

	switch p.Action {
	case "keep":
		reviewedMap[p.ModId] = true
		saveReviewed()
		historyStack = append(historyStack, SwiperHistoryItem{
			Card:      *card,
			Action:    "keep",
			Timestamp: time.Now().UnixMilli(),
		})
		removeFromCachedCards(p.ModId)
		return SwiperActionResult{Ok: true, Action: "keep", Card: card}

	case "trash":
		res := actions.DeleteLocalMod(p.FilePath)
		if res.Ok {
			reviewedMap[p.ModId] = true
			saveReviewed()
			historyStack = append(historyStack, SwiperHistoryItem{
				Card:      *card,
				Action:    "trash",
				Timestamp: time.Now().UnixMilli(),
			})
			removeFromCachedCards(p.ModId)
			return SwiperActionResult{Ok: true, Action: "trash", Card: card}
		}
		return SwiperActionResult{Ok: false, Error: res.Error}

	case "disable":
		tRes := actions.ToggleLocalModEnabled(p.FilePath, false)
		if tRes.Ok {
			reviewedMap[p.ModId] = true
			saveReviewed()
			historyStack = append(historyStack, SwiperHistoryItem{
				Card:         *card,
				Action:       "disable",
				PreviousPath: p.FilePath,
				NewPath:      tRes.NewPath,
				Timestamp:    time.Now().UnixMilli(),
			})
			removeFromCachedCards(p.ModId)
			return SwiperActionResult{Ok: true, Action: "disable", Card: card}
		}
		return SwiperActionResult{Ok: false, Error: tRes.Error}

	case "skip":
		removeFromCachedCards(p.ModId)
		cachedCards = append(cachedCards, *card)
		historyStack = append(historyStack, SwiperHistoryItem{
			Card:      *card,
			Action:    "skip",
			Timestamp: time.Now().UnixMilli(),
		})
		return SwiperActionResult{Ok: true, Action: "skip", Card: card}
	}

	return SwiperActionResult{Ok: false, Error: "Unknown action"}
}

func removeFromCachedCards(id string) {
	var updated []scanner.LocalModDTO
	for _, c := range cachedCards {
		if c.Id != id {
			updated = append(updated, c)
		}
	}
	cachedCards = updated
}

// Отменяет последнее действие свайпа
func UndoLastAction() SwiperActionResult {
	swiperLock.Lock()
	defer swiperLock.Unlock()

	if len(historyStack) == 0 {
		return SwiperActionResult{Ok: false, Error: "История пуста"}
	}

	last := historyStack[len(historyStack)-1]
	historyStack = historyStack[:len(historyStack)-1]

	delete(reviewedMap, last.Card.Id)
	saveReviewed()

	if last.Action == "disable" && last.NewPath != "" && last.PreviousPath != "" {
		if err := os.Rename(last.NewPath, last.PreviousPath); err == nil {
			scanner.ReplaceCachedMod(last.NewPath, last.PreviousPath, true)
		}
	}

	// Возвращаем карточку в начало очереди
	cachedCards = append([]scanner.LocalModDTO{last.Card}, cachedCards...)

	return SwiperActionResult{Ok: true, Action: last.Action, Card: &last.Card}
}

// Сбрасывает историю просмотренных карточек
func ResetReviewed() bool {
	swiperLock.Lock()
	defer swiperLock.Unlock()

	reviewedMap = make(map[string]bool)
	historyStack = nil
	_ = os.Remove(getReviewedPath())
	return true
}

// Запускает локальный HTTP-сервер для мобильного свайпера
func StartServer(port int) MobileServerStatus {
	swiperLock.Lock()
	defer swiperLock.Unlock()

	if serverInstance != nil {
		_ = serverInstance.Close()
	}

	if port <= 0 {
		port = 3456
	}

	ip := getLocalIPv4()
	url := fmt.Sprintf("http://%s:%d", ip, port)

	qrBytes, err := qrcode.Encode(url, qrcode.Medium, 280)
	qrDataUrl := ""
	if err == nil {
		qrDataUrl = "data:image/png;base64," + base64.StdEncoding.EncodeToString(qrBytes)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/thumb", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("p")
		if p == "" {
			http.NotFound(w, r)
			return
		}
		data, err := os.ReadFile(p)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		ext := "image/png"
		if strings.HasSuffix(strings.ToLower(p), ".jpg") || strings.HasSuffix(strings.ToLower(p), ".jpeg") {
			ext = "image/jpeg"
		}
		w.Header().Set("Content-Type", ext)
		w.Header().Set("Cache-Control", "max-age=86400")
		_, _ = w.Write(data)
	})

	mux.HandleFunc("/api/cards", func(w http.ResponseWriter, r *http.Request) {
		res := GetSwiperCards(SwiperQueryOpts{Filter: "all", OnlyUnreviewed: true})
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	})

	mux.HandleFunc("/api/action", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var p SwiperActionPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		res := ProcessSwiperAction(p)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	})

	mux.HandleFunc("/api/undo", func(w http.ResponseWriter, r *http.Request) {
		res := UndoLastAction()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, mobileHtmlTemplate)
	})

	serverInstance = &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", port),
		Handler: mux,
	}

	go func() {
		_ = serverInstance.ListenAndServe()
	}()

	currentStatus = MobileServerStatus{
		Running:       true,
		Port:          port,
		Ip:            ip,
		Url:           url,
		QrCodeDataUrl: qrDataUrl,
	}

	return currentStatus
}

// Останавливает сервер мобильного свайпера
func StopServer() MobileServerStatus {
	swiperLock.Lock()
	defer swiperLock.Unlock()

	if serverInstance != nil {
		_ = serverInstance.Close()
		serverInstance = nil
	}
	currentStatus = MobileServerStatus{
		Running: false,
		Port:    currentStatus.Port,
	}
	return currentStatus
}

// Возвращает текущий статус сервера
func GetServerStatus() MobileServerStatus {
	swiperLock.Lock()
	defer swiperLock.Unlock()
	return currentStatus
}

const mobileHtmlTemplate = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Sims 4 CC Swiper</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body { background: #090d16; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; user-select: none; }
    header { padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(15,23,42,0.8); backdrop-filter: blur(12px); }
    .brand { font-weight: 700; font-size: 1.1rem; color: #10b981; }
    .counter { font-size: 0.85rem; color: #94a3b8; font-weight: 500; }
    main { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card-container { position: relative; width: 100%; max-width: 380px; height: 520px; }
    .card { position: absolute; inset: 0; background: #111827; border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .img-wrap { flex: 1; background: #030712; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
    .img-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .info { padding: 16px; background: #111827; border-top: 1px solid rgba(255,255,255,0.06); }
    .title { font-size: 1.05rem; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .author { font-size: 0.85rem; color: #34d399; margin-top: 2px; }
    .meta { font-size: 0.75rem; color: #64748b; margin-top: 6px; }
    footer { padding: 16px; display: flex; gap: 12px; justify-content: center; background: rgba(15,23,42,0.6); }
    .btn { flex: 1; max-width: 110px; height: 48px; border-radius: 12px; border: none; font-weight: 600; font-size: 0.95rem; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .btn-trash { background: #ef4444; color: #fff; }
    .btn-skip { background: #334155; color: #cbd5e1; }
    .btn-keep { background: #10b981; color: #fff; }
  </style>
</head>
<body>
  <header>
    <div class="brand">CC Swiper</div>
    <div class="counter" id="counter">Загрузка...</div>
  </header>
  <main>
    <div class="card-container" id="container"></div>
  </main>
  <footer>
    <button class="btn btn-trash" onclick="swipe('trash')">Удалить</button>
    <button class="btn btn-skip" onclick="swipe('skip')">Пропуск</button>
    <button class="btn btn-keep" onclick="swipe('keep')">Оставить</button>
  </footer>
  <script>
    let cards = [];
    async function load() {
      const res = await fetch('/api/cards');
      const data = await res.json();
      cards = data.cards || [];
      render();
    }
    function render() {
      const el = document.getElementById('container');
      const cnt = document.getElementById('counter');
      cnt.innerText = 'Осталось: ' + cards.length;
      if (!cards.length) {
        el.innerHTML = '<div style="text-align:center;margin-top:100px;font-size:1.2rem;color:#94a3b8">Все карточки просмотрены! 🎉</div>';
        return;
      }
      const c = cards[0];
      const img = c.thumbnail && c.thumbnail.path ? '<img src="/thumb?p=' + encodeURIComponent(c.thumbnail.path) + '">' : '<div style="font-size:3rem;opacity:0.3">📦</div>';
      el.innerHTML = '<div class="card"><div class="img-wrap">' + img + '</div><div class="info"><div class="title">' + (c.name || c.fileName) + '</div><div class="author">' + (c.author || '') + '</div><div class="meta">' + (c.relativePath || '') + '</div></div></div>';
    }
    async function swipe(action) {
      if (!cards.length) return;
      const c = cards[0];
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modId: c.id, filePath: c.filePath, action: action })
      });
      cards.shift();
      render();
    }
    load();
  </script>
</body>
</html>`
