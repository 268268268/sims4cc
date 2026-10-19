package polycount

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/dbpf"
	"sims4cc-wails/backend/geom"
	"sims4cc-wails/backend/workers"
)

type PolyModItem struct {
	FilePath      string `json:"filePath"`
	FileName      string `json:"fileName"`
	RelativePath  string `json:"relativePath"`
	Size          int64  `json:"size"`
	Enabled       bool   `json:"enabled"`
	Polygons      int    `json:"polygons"`
	TotalPolygons int    `json:"totalPolygons"`
	Vertices      int    `json:"vertices"`
	GeomCount     int    `json:"geomCount"`
	Severity      string `json:"severity"` // "low", "medium", "heavy", "critical"
}

type PolySummary struct {
	TotalScannedWithGeom int `json:"totalScannedWithGeom"`
	CriticalCount        int `json:"criticalCount"`
	HeavyCount           int `json:"heavyCount"`
	MediumCount          int `json:"mediumCount"`
	LowCount             int `json:"lowCount"`
}

type PolyScanResult struct {
	Ok      bool          `json:"ok"`
	Mods    []PolyModItem `json:"mods"`
	Summary PolySummary   `json:"summary"`
	Error   string        `json:"error,omitempty"`
}

type polyDataCache struct {
	TotalVertices   int `json:"totalVertices"`
	TotalPolygons   int `json:"totalPolygons"`
	MaxLodPolygons  int `json:"maxLodPolygons"`
	GeomCount       int `json:"geomCount"`
}

func getCachePath() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "polycount-cache.json")
}

func inspectPackage(filePath string) *polyDataCache {
	entries, err := dbpf.ParseEntries(filePath)
	if err != nil {
		return nil
	}

	var geomEntries []dbpf.Entry
	for _, e := range entries {
		if (e.Type == dbpf.TypeGeomModel || e.Type == dbpf.TypeGeomModelAlt) && e.Size > 0 {
			geomEntries = append(geomEntries, e)
		}
	}

	if len(geomEntries) == 0 {
		return &polyDataCache{}
	}

	f, err := os.Open(filePath)
	if err != nil {
		return nil
	}
	defer f.Close()

	totalVerts := 0
	totalPolys := 0
	maxLodPolys := 0

	for _, ge := range geomEntries {
		data, err := dbpf.ReadEntry(f, ge)
		if err != nil {
			continue
		}

		gData := geom.ParseGeom(data)
		if gData == nil || len(gData.Chunks) == 0 {
			continue
		}

		filePolys := 0
		fileVerts := 0
		for _, c := range gData.Chunks {
			v := len(c.Positions) / 3
			p := len(c.Indices) / 3
			fileVerts += v
			filePolys += p
		}

		totalVerts += fileVerts
		totalPolys += filePolys
		if filePolys > maxLodPolys {
			maxLodPolys = filePolys
		}
	}

	return &polyDataCache{
		TotalVertices:  totalVerts,
		TotalPolygons:  totalPolys,
		MaxLodPolygons: maxLodPolys,
		GeomCount:      len(geomEntries),
	}
}

// Сканирует все пакеты модов на количество полигонов
func ScanPolycount() PolyScanResult {
	cfg := config.ReadConfig()
	modsFolder := cfg.ModsFolder
	if modsFolder == "" {
		return PolyScanResult{Ok: false, Error: "Папка Mods не указана"}
	}

	cache := make(map[string]polyDataCache)
	if raw, err := os.ReadFile(getCachePath()); err == nil {
		_ = json.Unmarshal(raw, &cache)
	}

	type fileCandidate struct {
		path  string
		name  string
		size  int64
		mtime int64
		key   string
	}

	var candidates []fileCandidate
	_ = filepath.Walk(modsFolder, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.Contains(strings.ToLower(info.Name()), ".package") {
			mtime := info.ModTime().UnixMilli()
			h := sha1.Sum([]byte(fmt.Sprintf("%s|%d", path, mtime)))
			key := hex.EncodeToString(h[:8])
			candidates = append(candidates, fileCandidate{
				path:  path,
				name:  info.Name(),
				size:  info.Size(),
				mtime: mtime,
				key:   key,
			})
		}
		return nil
	})

	var uncached []fileCandidate
	for _, c := range candidates {
		if _, ok := cache[c.key]; !ok {
			uncached = append(uncached, c)
		}
	}

	if len(uncached) > 0 {
		type inspectRes struct {
			key  string
			data polyDataCache
		}
		numWorkers := workers.Count()
		jobs := make(chan fileCandidate, len(uncached))
		resCh := make(chan inspectRes, len(uncached))
		var wg sync.WaitGroup
		for w := 0; w < numWorkers; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for c := range jobs {
					if inspected := inspectPackage(c.path); inspected != nil {
						resCh <- inspectRes{key: c.key, data: *inspected}
					}
				}
			}()
		}
		for _, c := range uncached {
			jobs <- c
		}
		close(jobs)
		wg.Wait()
		close(resCh)

		for r := range resCh {
			cache[r.key] = r.data
		}
		if data, err := json.Marshal(cache); err == nil {
			_ = os.WriteFile(getCachePath(), data, 0644)
		}
	}

	var results []PolyModItem
	for _, c := range candidates {
		polyData, ok := cache[c.key]
		if !ok || polyData.GeomCount == 0 {
			continue
		}
		polys := polyData.MaxLodPolygons
		if polys == 0 {
			polys = polyData.TotalPolygons
		}

		severity := "low"
		if polys > 50000 {
			severity = "critical"
		} else if polys > 25000 {
			severity = "heavy"
		} else if polys > 10000 {
			severity = "medium"
		}

		rel, _ := filepath.Rel(modsFolder, c.path)
		results = append(results, PolyModItem{
			FilePath:      c.path,
			FileName:      c.name,
			RelativePath:  rel,
			Size:          c.size,
			Enabled:       !strings.HasSuffix(strings.ToLower(c.name), ".disabled"),
			Polygons:      polys,
			TotalPolygons: polyData.TotalPolygons,
			Vertices:      polyData.TotalVertices,
			GeomCount:     polyData.GeomCount,
			Severity:      severity,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Polygons > results[j].Polygons
	})

	summary := PolySummary{
		TotalScannedWithGeom: len(results),
	}
	for _, r := range results {
		switch r.Severity {
		case "critical":
			summary.CriticalCount++
		case "heavy":
			summary.HeavyCount++
		case "medium":
			summary.MediumCount++
		case "low":
			summary.LowCount++
		}
	}

	return PolyScanResult{
		Ok:      true,
		Mods:    results,
		Summary: summary,
	}
}
