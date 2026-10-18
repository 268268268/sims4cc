package model3d

import (
	"crypto/sha1"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"

	"sims4cc-wails/backend/casp"
	"sims4cc-wails/backend/dbpf"
	"sims4cc-wails/backend/geom"
	"sims4cc-wails/backend/texture"
)

//go:embed assets/mannequin.json
var mannequinJson []byte

// Элемент расцветки для панели выбора в UI
type SwatchItem struct {
	Index  int      `json:"index"`
	Colors []string `json:"colors"`
}

type Model3DResult struct {
	Has3D              bool         `json:"has3D"`
	Type               string       `json:"type,omitempty"`
	BodyType           int          `json:"bodyType,omitempty"`
	Swatches           []SwatchItem `json:"swatches,omitempty"`
	CurrentSwatchIndex int          `json:"currentSwatchIndex"`
	Meshes             []geom.Chunk `json:"meshes,omitempty"`
	MannequinMeshes    []any        `json:"mannequinMeshes,omitempty"`
	TextureUrl         string       `json:"textureUrl,omitempty"`
	TextureDdsBase64   string       `json:"textureDdsBase64,omitempty"`
	Error              string       `json:"error,omitempty"`
}

type cachedSwatchTex struct {
	ddsBase64  string
	textureUrl string
}

type cachedModelEntry struct {
	mtimeMs         int64
	entries         []dbpf.Entry
	modelType       string
	bodyType        int
	caspList        []*casp.CaspData
	swatches        []SwatchItem
	meshes          []geom.Chunk
	mannequinMeshes []any
	textures        map[int]cachedSwatchTex
}

var (
	mannequinData map[string]any
	modelCacheMu  sync.Mutex
	modelCache    = make(map[string]*cachedModelEntry)
	modelCacheOrd []string
)

const maxCachedModels = 30

func getMannequinParts(bodyType int) []any {
	if mannequinData == nil && len(mannequinJson) > 0 {
		_ = json.Unmarshal(mannequinJson, &mannequinData)
	}
	if mannequinData == nil {
		return []any{}
	}

	prefix := "woman_"
	var needed []string
	switch bodyType {
	case 6: // Верхняя одежда
		needed = []string{prefix + "head", prefix + "lower", prefix + "feet"}
	case 7: // Брюки / юбки
		needed = []string{prefix + "head", prefix + "upper", prefix + "feet"}
	case 5: // Полный наряд
		needed = []string{prefix + "head", prefix + "feet"}
	case 2, 1, 3: // Волосы / шляпы
		needed = []string{prefix + "head", prefix + "upper"}
	case 8: // Обувь
		needed = []string{prefix + "head", prefix + "upper", prefix + "lower"}
	default:
		needed = []string{prefix + "head", prefix + "upper", prefix + "lower", prefix + "feet"}
	}

	var parts []any
	for _, id := range needed {
		if part, ok := mannequinData[id]; ok {
			parts = append(parts, part)
		}
	}
	return parts
}

func extractSwatchTexture(f *os.File, filePath string, entries []dbpf.Entry, activeCasp *casp.CaspData, clampedIndex int) cachedSwatchTex {
	var targetTexEntry *dbpf.Entry

	if activeCasp != nil && activeCasp.DiffuseKey != "" {
		for i := range entries {
			e := &entries[i]
			if (e.Type == dbpf.TypeTextureRLE2 || e.Type == dbpf.TypeTextureImage || e.Type == dbpf.TypeTextureDST) && e.Size > 0 {
				key := fmt.Sprintf("%08x-%08x-%016x", e.Type, e.Group, e.Instance)
				if key == activeCasp.DiffuseKey {
					targetTexEntry = e
					break
				}
			}
		}
	}

	// Запасной поиск: совпадение по instance ID
	if targetTexEntry == nil && activeCasp != nil && activeCasp.DiffuseKey != "" {
		var diffInst uint64
		_, _ = fmt.Sscanf(activeCasp.DiffuseKey, "%*x-%*x-%016x", &diffInst)
		if diffInst != 0 {
			for i := range entries {
				e := &entries[i]
				if (e.Type == dbpf.TypeTextureRLE2 || e.Type == dbpf.TypeTextureImage || e.Type == dbpf.TypeTextureDST) && e.Size > 0 && e.Instance == diffInst {
					targetTexEntry = e
					break
				}
			}
		}
	}

	// Запасной поиск: первая текстура любого поддерживаемого формата
	if targetTexEntry == nil {
		for i := range entries {
			e := &entries[i]
			if (e.Type == dbpf.TypeTextureRLE2 || e.Type == dbpf.TypeTextureImage || e.Type == dbpf.TypeTextureDST) && e.Size > 0 {
				targetTexEntry = e
				break
			}
		}
	}

	var textureDdsBase64 string
	var textureUrl string

	h := sha1.Sum([]byte(filePath))
	fileKey := hex.EncodeToString(h[:8])
	cacheDir := filepath.Join(os.Getenv("APPDATA"), "sims4-mod-manager", "thumbnails", "textures")
	_ = os.MkdirAll(cacheDir, 0755)
	texFilePath := filepath.Join(cacheDir, fmt.Sprintf("%s_sw%d.png", fileKey, clampedIndex))
	altJpg := filepath.Join(cacheDir, fmt.Sprintf("%s_sw%d.jpg", fileKey, clampedIndex))

	// Проверяем существующий дисковый кэш PNG
	if fi, err := os.Stat(texFilePath); err == nil && fi.Size() > 0 {
		return cachedSwatchTex{
			textureUrl: fmt.Sprintf("/modimg?p=%s", url.QueryEscape(texFilePath)),
		}
	}
	if fi, err := os.Stat(altJpg); err == nil && fi.Size() > 0 {
		return cachedSwatchTex{
			textureUrl: fmt.Sprintf("/modimg?p=%s", url.QueryEscape(altJpg)),
		}
	}

	if targetTexEntry != nil {
		raw, err := dbpf.ReadEntry(f, *targetTexEntry)
		if err == nil && len(raw) >= 4 {
			if targetTexEntry.Type == dbpf.TypeTextureRLE2 {
				// Прямая распаковка RLE2 в RGBA PNG по алгоритму S4MM
				pngBytes, err := texture.Rle2ToPng(raw)
				if err == nil && len(pngBytes) > 0 {
					_ = os.WriteFile(texFilePath, pngBytes, 0644)
				}
			} else if targetTexEntry.Type == dbpf.TypeTextureImage || string(raw[:4]) == "DDS " {
				ddsBytes := texture.DstToDds(raw)
				if len(ddsBytes) > 0 {
					pngBytes, err := texture.DdsToPng(ddsBytes)
					if err == nil && len(pngBytes) > 0 {
						_ = os.WriteFile(texFilePath, pngBytes, 0644)
					}
				}
			} else if len(raw) >= 8 && raw[0] == 0x89 && raw[1] == 'P' && raw[2] == 'N' && raw[3] == 'G' {
				_ = os.WriteFile(texFilePath, raw, 0644)
			} else if len(raw) >= 3 && raw[0] == 0xff && raw[1] == 0xd8 && raw[2] == 0xff {
				_ = os.WriteFile(altJpg, raw, 0644)
			}
		}
	}

	if fi, err := os.Stat(texFilePath); err == nil && fi.Size() > 0 {
		textureUrl = fmt.Sprintf("/modimg?p=%s", url.QueryEscape(texFilePath))
	} else if fi, err := os.Stat(altJpg); err == nil && fi.Size() > 0 {
		textureUrl = fmt.Sprintf("/modimg?p=%s", url.QueryEscape(altJpg))
	}

	return cachedSwatchTex{
		ddsBase64:  textureDdsBase64,
		textureUrl: textureUrl,
	}
}

// Извлекает данные 3D-модели: меш уровня LOD0, текстуру и все расцветки
func GetModel3DData(filePath string, swatchIndex int) Model3DResult {
	if filePath == "" {
		return Model3DResult{Has3D: false, Error: "invalid_filepath"}
	}

	st, err := os.Stat(filePath)
	if err != nil {
		return Model3DResult{Has3D: false, Error: "file_not_found"}
	}
	mtimeMs := st.ModTime().UnixMilli()

	// 1. Проверяем in-memory кэш модели (мгновенное переключение расцветок)
	modelCacheMu.Lock()
	cached, hasCached := modelCache[filePath]
	if hasCached && cached.mtimeMs != mtimeMs {
		delete(modelCache, filePath)
		hasCached = false
	}
	modelCacheMu.Unlock()

	if hasCached {
		clampedIndex := 0
		if len(cached.swatches) > 0 {
			if swatchIndex < 0 {
				clampedIndex = 0
			} else if swatchIndex >= len(cached.swatches) {
				clampedIndex = len(cached.swatches) - 1
			} else {
				clampedIndex = swatchIndex
			}
		}

		modelCacheMu.Lock()
		tex, hasTex := cached.textures[clampedIndex]
		modelCacheMu.Unlock()

		if !hasTex {
			f, err := os.Open(filePath)
			if err == nil {
				var activeCasp *casp.CaspData
				if clampedIndex < len(cached.caspList) {
					activeCasp = cached.caspList[clampedIndex]
				}
				tex = extractSwatchTexture(f, filePath, cached.entries, activeCasp, clampedIndex)
				_ = f.Close()

				modelCacheMu.Lock()
				cached.textures[clampedIndex] = tex
				modelCacheMu.Unlock()
			}
		}

		return Model3DResult{
			Has3D:              true,
			Type:               cached.modelType,
			BodyType:           cached.bodyType,
			Swatches:           cached.swatches,
			CurrentSwatchIndex: clampedIndex,
			Meshes:             cached.meshes,
			MannequinMeshes:    cached.mannequinMeshes,
			TextureUrl:         tex.textureUrl,
			TextureDdsBase64:   tex.ddsBase64,
		}
	}

	entries, err := dbpf.ParseEntries(filePath)
	if err != nil {
		return Model3DResult{Has3D: false, Error: err.Error()}
	}

	f, err := os.Open(filePath)
	if err != nil {
		return Model3DResult{Has3D: false, Error: err.Error()}
	}
	defer f.Close()

	// 2. Считываем все расцветки CASP пакета
	var caspList []*casp.CaspData
	var swatches []SwatchItem

	for _, e := range entries {
		if e.Type == dbpf.TypeCasPart && e.Size > 0 {
			raw, err := dbpf.ReadEntry(f, e)
			if err == nil {
				cd := casp.ParseCasp(raw)
				if cd != nil {
					swatches = append(swatches, SwatchItem{
						Index:  len(caspList),
						Colors: cd.Swatches,
					})
					caspList = append(caspList, cd)
				}
			}
		}
	}

	isCas := len(caspList) > 0
	clampedIndex := 0
	var activeCasp *casp.CaspData
	if isCas {
		if swatchIndex < 0 {
			clampedIndex = 0
		} else if swatchIndex >= len(caspList) {
			clampedIndex = len(caspList) - 1
		} else {
			clampedIndex = swatchIndex
		}
		activeCasp = caspList[clampedIndex]
	}

	bodyType := 0
	if activeCasp != nil {
		bodyType = activeCasp.BodyType
	}

	// 3. Выбираем меши GEOM только нужного LOD0 (исключаем LOD1-3 и тени)
	var targetGeoms []dbpf.Entry
	if activeCasp != nil && len(activeCasp.GeomKeys) > 0 {
		for _, gk := range activeCasp.GeomKeys {
			for _, e := range entries {
				if (e.Type == dbpf.TypeGeomModel || e.Type == dbpf.TypeGeomModelAlt) && e.Size > 0 {
					key := fmt.Sprintf("%08x-%08x-%016x", e.Type, e.Group, e.Instance)
					if key == gk {
						targetGeoms = append(targetGeoms, e)
						break
					}
				}
			}
		}
	}

	// Если по ключам CASP не нашлось или это объект — берем только первый GEOM (LOD0)
	if len(targetGeoms) == 0 {
		for _, e := range entries {
			if (e.Type == dbpf.TypeGeomModel || e.Type == dbpf.TypeGeomModelAlt) && e.Size > 0 {
				targetGeoms = append(targetGeoms, e)
				break
			}
		}
	}

	var meshes []geom.Chunk
	for _, ge := range targetGeoms {
		raw, err := dbpf.ReadEntry(f, ge)
		if err == nil {
			gData := geom.ParseGeom(raw)
			if gData != nil && len(gData.Chunks) > 0 {
				meshes = append(meshes, gData.Chunks...)
			}
		}
	}

	if len(meshes) == 0 {
		return Model3DResult{Has3D: false, Error: "no_meshes_found"}
	}

	tex := extractSwatchTexture(f, filePath, entries, activeCasp, clampedIndex)

	if len(swatches) == 0 {
		swatches = []SwatchItem{{Index: 0, Colors: []string{"#888888"}}}
	}

	modelType := "object"
	var mannequinMeshes []any
	if isCas {
		modelType = "cas"
		mannequinMeshes = getMannequinParts(bodyType)
	} else {
		mannequinMeshes = []any{}
	}

	modelCacheMu.Lock()
	if len(modelCacheOrd) >= maxCachedModels {
		oldest := modelCacheOrd[0]
		modelCacheOrd = modelCacheOrd[1:]
		delete(modelCache, oldest)
	}
	modelCacheOrd = append(modelCacheOrd, filePath)
	modelCache[filePath] = &cachedModelEntry{
		mtimeMs:         mtimeMs,
		entries:         entries,
		modelType:       modelType,
		bodyType:        bodyType,
		caspList:        caspList,
		swatches:        swatches,
		meshes:          meshes,
		mannequinMeshes: mannequinMeshes,
		textures:        map[int]cachedSwatchTex{clampedIndex: tex},
	}
	modelCacheMu.Unlock()

	return Model3DResult{
		Has3D:              true,
		Type:               modelType,
		BodyType:           bodyType,
		Swatches:           swatches,
		CurrentSwatchIndex: clampedIndex,
		Meshes:             meshes,
		MannequinMeshes:    mannequinMeshes,
		TextureUrl:         tex.textureUrl,
		TextureDdsBase64:   tex.ddsBase64,
	}
}
