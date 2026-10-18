package inspector

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"sims4cc-wails/backend/dbpf"
)

type SiblingFile struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	Ext    string `json:"ext"`
	IsSelf bool   `json:"isSelf"`
}

type ResourceTypeCount struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

type PackageContentsSummary struct {
	Total int                 `json:"total"`
	Types []ResourceTypeCount `json:"types"`
}

type InspectResult struct {
	Ok              bool                    `json:"ok"`
	Folder          string                  `json:"folder"`
	Files           []SiblingFile           `json:"files"`
	PackageContents *PackageContentsSummary `json:"packageContents,omitempty"`
	Error           string                  `json:"error,omitempty"`
}

var typeLabels = map[uint32]string{
	0x3c1af1f2: "Thumbnail",
	0x3453cf95: "Texture",
	0x2bc04edf: "Texture (DST)",
	0x00b2d882: "Texture (image)",
	0x034aeecb: "CAS part",
	0x319e4f1d: "Object definition",
	0x545ac67a: "Data (SimData)",
	0x220557da: "String table",
	0x6017e896: "Python/tuning",
	0x02d5df13: "Animation",
	0x01661233: "Model (geometry)",
	0x01d0e75d: "Model (material)",
}

// Анализирует отдельный мод, его папку и DBPF ресурсы
func InspectLocalMod(filePath string) InspectResult {
	if filePath == "" {
		return InspectResult{Ok: false, Error: "Путь к файлу не указан"}
	}

	folder := filepath.Dir(filePath)
	result := InspectResult{
		Ok:     true,
		Folder: folder,
		Files:  []SiblingFile{},
	}

	entries, err := os.ReadDir(folder)
	if err == nil {
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			full := filepath.Join(folder, e.Name())
			info, _ := e.Info()
			size := int64(0)
			if info != nil {
				size = info.Size()
			}
			result.Files = append(result.Files, SiblingFile{
				Name:   e.Name(),
				Size:   size,
				Ext:    strings.ToLower(filepath.Ext(e.Name())),
				IsSelf: strings.EqualFold(full, filePath),
			})
		}
		sort.Slice(result.Files, func(i, j int) bool {
			return result.Files[i].Name < result.Files[j].Name
		})
	}

	nameLower := strings.ToLower(filepath.Base(filePath))
	if strings.Contains(nameLower, ".package") {
		dbpfEntries, err := dbpf.ParseEntries(filePath)
		if err == nil {
			counts := make(map[string]int)
			for _, pe := range dbpfEntries {
				lbl := typeLabels[pe.Type]
				if lbl == "" {
					lbl = fmt.Sprintf("Other (0x%08x)", pe.Type)
				}
				counts[lbl]++
			}

			var typesList []ResourceTypeCount
			for lbl, c := range counts {
				typesList = append(typesList, ResourceTypeCount{Label: lbl, Count: c})
			}
			sort.Slice(typesList, func(i, j int) bool {
				return typesList[i].Count > typesList[j].Count
			})

			result.PackageContents = &PackageContentsSummary{
				Total: len(dbpfEntries),
				Types: typesList,
			}
		}
	}

	return result
}
