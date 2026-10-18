package downloader

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"sims4cc-wails/backend/curseforge"
	"sims4cc-wails/backend/discover"
)

const MaxConcurrentDownloads = 4

type QueueJob struct {
	Id             string   `json:"id"`
	Kind           string   `json:"kind"`     // "curseforge" | "discover"
	ItemId         string   `json:"itemId"`   // modId (str) или discover item.id
	ModId          int      `json:"modId,omitempty"`
	SourceType     string   `json:"sourceType"`
	Title          string   `json:"title"`
	Author         string   `json:"author,omitempty"`
	ImageUrl       string   `json:"imageUrl,omitempty"`
	IsUpdate       bool     `json:"isUpdate,omitempty"`
	Status         string   `json:"status"` // "queued" | "downloading" | "installing" | "completed" | "error" | "canceled"
	Phase          string   `json:"phase"`
	Percent        float64  `json:"percent"`
	Received       int64    `json:"received"`
	Total          int64    `json:"total"`
	FileIndex      int      `json:"fileIndex,omitempty"`
	FileCount      int      `json:"fileCount,omitempty"`
	Error          string   `json:"error,omitempty"`
	InstalledPaths []string `json:"installedPaths,omitempty"`
	CreatedAt      string   `json:"createdAt"`
	UpdatedAt      string   `json:"updatedAt"`
	Payload        any      `json:"-"`
}

type Manager struct {
	mu         sync.RWMutex
	ctx        context.Context
	jobs       map[string]*QueueJob
	order      []string
	cancels    map[string]context.CancelFunc
	workCh     chan string
	lastBroadcast time.Time
}

var defaultManager = newManager()

func newManager() *Manager {
	m := &Manager{
		jobs:    make(map[string]*QueueJob),
		order:   make([]string, 0),
		cancels: make(map[string]context.CancelFunc),
		workCh:  make(chan string, 512),
	}

	curseforge.ProgressHook = m.onCurseForgeProgress
	discover.ProgressHook = m.onDiscoverProgress

	for i := 0; i < MaxConcurrentDownloads; i++ {
		go m.worker()
	}
	return m
}

func Init(ctx context.Context) {
	defaultManager.mu.Lock()
	defaultManager.ctx = ctx
	defaultManager.mu.Unlock()
}

func (m *Manager) emit(event string, data any) {
	m.mu.RLock()
	ctx := m.ctx
	m.mu.RUnlock()
	if ctx == nil || ctx.Value("events") == nil {
		return
	}
	defer func() { _ = recover() }()
	runtime.EventsEmit(ctx, event, data)
}

func (m *Manager) snapshotLocked() []QueueJob {
	res := make([]QueueJob, 0, len(m.order))
	// Свежие задачи сверху
	for i := len(m.order) - 1; i >= 0; i-- {
		id := m.order[i]
		if job, ok := m.jobs[id]; ok {
			cp := *job
			res = append(res, cp)
		}
	}
	return res
}

func (m *Manager) broadcastLocked(force bool) {
	now := time.Now()
	if !force && now.Sub(m.lastBroadcast) < 90*time.Millisecond {
		return
	}
	m.lastBroadcast = now
	snap := m.snapshotLocked()
	go m.emit("downloads:queue", snap)
}

func (m *Manager) onCurseForgeProgress(p curseforge.DownloadProgress) {
	jobId := fmt.Sprintf("cf:%d", p.ModId)
	m.mu.Lock()
	job, exists := m.jobs[jobId]
	if !exists {
		m.mu.Unlock()
		return
	}
	if job.Status == "canceled" {
		m.mu.Unlock()
		return
	}

	prevStatus := job.Status
	if p.Status == "extracting" || p.Phase == "installing" {
		job.Status = "installing"
		job.Phase = "installing"
		job.Percent = 100
	} else if p.Status == "completed" || p.Phase == "done" {
		job.Status = "completed"
		job.Phase = "done"
		job.Percent = 100
	} else {
		job.Status = "downloading"
		job.Phase = "downloading"
		if p.Percent > 0 {
			job.Percent = p.Percent
		}
	}
	if p.Received > 0 {
		job.Received = p.Received
	} else if p.Transferred > 0 {
		job.Received = p.Transferred
	}
	if p.Total > 0 {
		job.Total = p.Total
	}
	job.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	force := prevStatus != job.Status || job.Status == "completed" || job.Status == "installing"
	m.broadcastLocked(force)
	m.mu.Unlock()
}

func (m *Manager) onDiscoverProgress(p discover.DiscoverProgress) {
	if p.ItemId == "" {
		return
	}
	jobId := "disc:" + p.ItemId
	m.mu.Lock()
	job, exists := m.jobs[jobId]
	if !exists {
		m.mu.Unlock()
		return
	}
	if job.Status == "canceled" {
		m.mu.Unlock()
		return
	}

	prevStatus := job.Status
	if p.Status == "installing" || p.Phase == "installing" {
		job.Status = "installing"
		job.Phase = "installing"
		job.Percent = 100
	} else if p.Status == "completed" || p.Phase == "done" {
		job.Status = "completed"
		job.Phase = "done"
		job.Percent = 100
	} else {
		job.Status = "downloading"
		job.Phase = "downloading"
		job.Percent = float64(p.Percent)
	}
	if p.Received > 0 {
		job.Received = p.Received
	}
	if p.Total > 0 {
		job.Total = p.Total
	}
	if p.FileIndex > 0 {
		job.FileIndex = p.FileIndex
	}
	if p.FileCount > 0 {
		job.FileCount = p.FileCount
	}
	job.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	force := prevStatus != job.Status || job.Status == "completed" || job.Status == "installing"
	m.broadcastLocked(force)
	m.mu.Unlock()
}

func extractCfMeta(payload any) (modId int, title, author, imageUrl string) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return 0, "CurseForge Mod", "", ""
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return 0, "CurseForge Mod", "", ""
	}

	if idVal, ok := m["id"].(float64); ok {
		modId = int(idVal)
	} else if idVal, ok := m["modId"].(float64); ok {
		modId = int(idVal)
	}
	if n, ok := m["name"].(string); ok && n != "" {
		title = n
	} else if n, ok := m["title"].(string); ok && n != "" {
		title = n
	} else {
		title = fmt.Sprintf("CurseForge #%d", modId)
	}
	if a, ok := m["author"].(string); ok && a != "" {
		author = a
	} else if authors, ok := m["authors"].([]any); ok && len(authors) > 0 {
		if aMap, ok := authors[0].(map[string]any); ok {
			if an, ok := aMap["name"].(string); ok {
				author = an
			}
		}
	}
	if img, ok := m["imageUrl"].(string); ok && img != "" {
		imageUrl = img
	} else if logo, ok := m["logo"].(map[string]any); ok {
		if u, ok := logo["thumbnailUrl"].(string); ok && u != "" {
			imageUrl = u
		} else if u, ok := logo["url"].(string); ok && u != "" {
			imageUrl = u
		}
	}
	return
}

func extractDiscoverMeta(payload any) (itemId, title, author, imageUrl, sourceType string) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", "Discover Mod", "", "", "discover"
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return "", "Discover Mod", "", "", "discover"
	}
	if id, ok := m["id"].(string); ok {
		itemId = id
	}
	if t, ok := m["title"].(string); ok && t != "" {
		title = t
	} else {
		title = "Discover Mod"
	}
	if a, ok := m["author"].(string); ok {
		author = a
	}
	if img, ok := m["imageUrl"].(string); ok {
		imageUrl = img
	}
	if st, ok := m["sourceType"].(string); ok && st != "" {
		sourceType = st
	} else if strings.Contains(itemId, ":") {
		sourceType = strings.Split(itemId, ":")[0]
	} else {
		sourceType = "discover"
	}
	return
}

func EnqueueCurseForge(payload any, isUpdate bool) QueueJob {
	modId, title, author, imageUrl := extractCfMeta(payload)
	if modId <= 0 {
		return QueueJob{
			Id:     "cf:invalid",
			Status: "error",
			Error:  "Некорректный ID мода CurseForge",
		}
	}

	jobId := fmt.Sprintf("cf:%d", modId)
	now := time.Now().UTC().Format(time.RFC3339)

	defaultManager.mu.Lock()
	if existing, ok := defaultManager.jobs[jobId]; ok {
		if existing.Status == "queued" || existing.Status == "downloading" || existing.Status == "installing" {
			cp := *existing
			defaultManager.mu.Unlock()
			return cp
		}
	} else {
		defaultManager.order = append(defaultManager.order, jobId)
	}

	job := &QueueJob{
		Id:         jobId,
		Kind:       "curseforge",
		ItemId:     strconv.Itoa(modId),
		ModId:      modId,
		SourceType: "curseforge",
		Title:      title,
		Author:     author,
		ImageUrl:   imageUrl,
		IsUpdate:   isUpdate,
		Status:     "queued",
		Phase:      "queued",
		Percent:    0,
		CreatedAt:  now,
		UpdatedAt:  now,
		Payload:    payload,
	}
	defaultManager.jobs[jobId] = job
	cp := *job
	defaultManager.broadcastLocked(true)
	defaultManager.mu.Unlock()

	defaultManager.workCh <- jobId
	return cp
}

func EnqueueDiscover(payload any) QueueJob {
	itemId, title, author, imageUrl, sourceType := extractDiscoverMeta(payload)
	if itemId == "" {
		itemId = fmt.Sprintf("item-%d", time.Now().UnixNano())
	}

	jobId := "disc:" + itemId
	now := time.Now().UTC().Format(time.RFC3339)

	defaultManager.mu.Lock()
	if existing, ok := defaultManager.jobs[jobId]; ok {
		if existing.Status == "queued" || existing.Status == "downloading" || existing.Status == "installing" {
			cp := *existing
			defaultManager.mu.Unlock()
			return cp
		}
	} else {
		defaultManager.order = append(defaultManager.order, jobId)
	}

	job := &QueueJob{
		Id:         jobId,
		Kind:       "discover",
		ItemId:     itemId,
		SourceType: sourceType,
		Title:      title,
		Author:     author,
		ImageUrl:   imageUrl,
		Status:     "queued",
		Phase:      "queued",
		Percent:    0,
		CreatedAt:  now,
		UpdatedAt:  now,
		Payload:    payload,
	}
	defaultManager.jobs[jobId] = job
	cp := *job
	defaultManager.broadcastLocked(true)
	defaultManager.mu.Unlock()

	defaultManager.workCh <- jobId
	return cp
}

func (m *Manager) worker() {
	for jobId := range m.workCh {
		m.mu.Lock()
		job, exists := m.jobs[jobId]
		if !exists || job.Status != "queued" {
			m.mu.Unlock()
			continue
		}

		baseCtx := m.ctx
		if baseCtx == nil {
			baseCtx = context.Background()
		}
		jobCtx, cancel := context.WithCancel(baseCtx)
		m.cancels[jobId] = cancel

		job.Status = "downloading"
		job.Phase = "downloading"
		job.Error = ""
		job.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		payload := job.Payload
		kind := job.Kind
		isUpdate := job.IsUpdate
		m.broadcastLocked(true)
		m.mu.Unlock()

		if kind == "curseforge" {
			var res curseforge.DownloadResult
			if isUpdate {
				res = curseforge.UpdateMod(jobCtx, payload)
			} else {
				res = curseforge.DownloadModStream(jobCtx, payload)
			}

			m.mu.Lock()
			delete(m.cancels, jobId)
			if j, ok := m.jobs[jobId]; ok && j.Status != "canceled" {
				if res.Ok {
					j.Status = "completed"
					j.Phase = "done"
					j.Percent = 100
					if res.Path != "" {
						j.InstalledPaths = []string{res.Path}
					}
				} else {
					j.Status = "error"
					j.Phase = "error"
					j.Error = res.Error
				}
				j.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
				m.broadcastLocked(true)
			}
			m.mu.Unlock()
		} else {
			res := discover.DownloadDiscoverItem(jobCtx, payload)

			m.mu.Lock()
			delete(m.cancels, jobId)
			if j, ok := m.jobs[jobId]; ok && j.Status != "canceled" {
				if res.Ok {
					j.Status = "completed"
					j.Phase = "done"
					j.Percent = 100
					j.InstalledPaths = res.Installed
				} else {
					j.Status = "error"
					j.Phase = "error"
					if len(res.Errors) > 0 {
						j.Error = strings.Join(res.Errors, "; ")
					} else {
						j.Error = "Ошибка скачивания"
					}
				}
				j.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
				m.broadcastLocked(true)
			}
			m.mu.Unlock()
		}
	}
}

func GetQueue() []QueueJob {
	defaultManager.mu.RLock()
	defer defaultManager.mu.RUnlock()
	return defaultManager.snapshotLocked()
}

func CancelJob(jobId string) bool {
	defaultManager.mu.Lock()
	job, exists := defaultManager.jobs[jobId]
	if !exists {
		defaultManager.mu.Unlock()
		return false
	}
	if cancel, ok := defaultManager.cancels[jobId]; ok {
		cancel()
		delete(defaultManager.cancels, jobId)
	}
	job.Status = "canceled"
	job.Phase = "canceled"
	job.Error = "Отменено пользователем"
	job.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	defaultManager.broadcastLocked(true)
	defaultManager.mu.Unlock()
	return true
}

func RetryJob(jobId string) QueueJob {
	defaultManager.mu.Lock()
	job, exists := defaultManager.jobs[jobId]
	if !exists {
		defaultManager.mu.Unlock()
		return QueueJob{Id: jobId, Status: "error", Error: "Задача не найдена"}
	}
	payload := job.Payload
	kind := job.Kind
	isUpdate := job.IsUpdate
	defaultManager.mu.Unlock()

	if kind == "curseforge" {
		return EnqueueCurseForge(payload, isUpdate)
	}
	return EnqueueDiscover(payload)
}

func ClearCompleted() []QueueJob {
	defaultManager.mu.Lock()
	defer defaultManager.mu.Unlock()

	newOrder := make([]string, 0, len(defaultManager.order))
	for _, id := range defaultManager.order {
		job, ok := defaultManager.jobs[id]
		if !ok {
			continue
		}
		if job.Status == "completed" || job.Status == "canceled" || job.Status == "error" {
			delete(defaultManager.jobs, id)
			continue
		}
		newOrder = append(newOrder, id)
	}
	defaultManager.order = newOrder
	defaultManager.broadcastLocked(true)
	return defaultManager.snapshotLocked()
}
