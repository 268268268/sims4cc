package resolver

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var (
	megaFileRe    = regexp.MustCompile(`mega\.(?:co\.)?nz/(?:file/([^#/?]+)#([A-Za-z0-9_-]+)|#!([^!]+)!([A-Za-z0-9_-]+))`)
	megaFolderRe  = regexp.MustCompile(`mega\.(?:co\.)?nz/(?:folder/([^#/?]+)#([A-Za-z0-9_-]+)|#F!([^!]+)!([A-Za-z0-9_-]+))`)
	megaStreamRe  = regexp.MustCompile(`^mega://file/([^#]+)#([A-Za-z0-9_-]+)$`)
	megaFStreamRe = regexp.MustCompile(`^mega://folder/([^/]+)/([^#]+)#([A-Za-z0-9_-]+)$`)
)

func megaBase64Decode(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if m := len(s) % 4; m != 0 {
		s += strings.Repeat("=", 4-m)
	}
	return base64.URLEncoding.DecodeString(s)
}

func megaDeriveFileKey(rawKey []byte) (aesKey []byte, ctrIV []byte, err error) {
	if len(rawKey) < 32 {
		return nil, nil, fmt.Errorf("некорректная длина ключа Mega (%d)", len(rawKey))
	}
	aesKey = make([]byte, 16)
	for i := 0; i < 16; i++ {
		aesKey[i] = rawKey[i] ^ rawKey[i+16]
	}
	ctrIV = make([]byte, 16)
	copy(ctrIV[0:8], rawKey[16:24])
	return aesKey, ctrIV, nil
}

func megaDecryptAttr(attrB64 string, aesKey []byte) string {
	encAttr, err := megaBase64Decode(attrB64)
	if err != nil || len(encAttr) == 0 || len(encAttr)%16 != 0 {
		return ""
	}
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return ""
	}
	iv := make([]byte, 16)
	dec := make([]byte, len(encAttr))
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(dec, encAttr)

	str := string(bytes.TrimRight(dec, "\x00"))
	if !strings.HasPrefix(str, "MEGA{") {
		return ""
	}
	jsonPart := strings.TrimPrefix(str, "MEGA")
	var meta struct {
		N string `json:"n"`
	}
	if err := json.Unmarshal([]byte(jsonPart), &meta); err != nil {
		return ""
	}
	return strings.TrimSpace(meta.N)
}

// Разрешает ссылку на файл или папку Mega.nz
func resolveMega(rawUrl string) ResolvedLink {
	if m := megaFolderRe.FindStringSubmatch(rawUrl); len(m) > 0 {
		folderId := m[1]
		folderKey := m[2]
		if folderId == "" {
			folderId = m[3]
			folderKey = m[4]
		}
		return resolveMegaFolder(folderId, folderKey, rawUrl)
	}

	m := megaFileRe.FindStringSubmatch(rawUrl)
	if len(m) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось извлечь ID и ключ из ссылки Mega.nz"}
	}
	fileId := m[1]
	fileKey := m[2]
	if fileId == "" {
		fileId = m[3]
		fileKey = m[4]
	}

	rawKey, err := megaBase64Decode(fileKey)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Некорректный ключ дешифрования Mega.nz"}
	}
	aesKey, _, err := megaDeriveFileKey(rawKey)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: err.Error()}
	}

	reqBody, _ := json.Marshal([]map[string]any{
		{"a": "g", "g": 1, "ssl": 2, "p": fileId},
	})
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post("https://g.api.mega.co.nz/cs?id=1", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Ошибка запроса к Mega API"}
	}
	defer resp.Body.Close()

	var apiRes []struct {
		S  int64  `json:"s"`
		At string `json:"at"`
		G  string `json:"g"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiRes); err != nil || len(apiRes) == 0 || apiRes[0].At == "" {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Файл Mega.nz недоступен или удален"}
	}

	fileName := megaDecryptAttr(apiRes[0].At, aesKey)
	if fileName == "" {
		fileName = fmt.Sprintf("mega_%s.package", fileId)
	}

	streamUrl := fmt.Sprintf("mega://file/%s#%s", fileId, fileKey)
	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:mega:" + fileId,
		Title:      strings.TrimSuffix(fileName, filepathExt(fileName)),
		SourceType: "mega",
		Url:        rawUrl,
		DirectUrl:  streamUrl,
		FileName:   fileName,
		Via:        "mega",
		Downloads:  []DownloadFile{{Name: fileName, Url: streamUrl, Via: "mega"}},
	}
}

func resolveMegaFolder(folderId, folderKey, rawUrl string) ResolvedLink {
	masterKey, err := megaBase64Decode(folderKey)
	if err != nil || len(masterKey) < 16 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Некорректный ключ папки Mega.nz"}
	}
	masterBlock, err := aes.NewCipher(masterKey[:16])
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: err.Error()}
	}

	reqBody, _ := json.Marshal([]map[string]any{
		{"a": "f", "c": 1, "r": 1},
	})
	client := &http.Client{Timeout: 15 * time.Second}
	apiUrl := fmt.Sprintf("https://g.api.mega.co.nz/cs?id=1&n=%s", folderId)
	resp, err := client.Post(apiUrl, "application/json", bytes.NewReader(reqBody))
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Ошибка чтения папки Mega.nz"}
	}
	defer resp.Body.Close()

	var apiRes []struct {
		F []struct {
			H string `json:"h"`
			T int    `json:"t"`
			A string `json:"a"`
			K string `json:"k"`
			S int64  `json:"s"`
		} `json:"f"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiRes); err != nil || len(apiRes) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось получить список файлов папки Mega.nz"}
	}

	var downloads []DownloadFile
	folderTitle := ""

	for _, node := range apiRes[0].F {
		if node.K == "" || node.A == "" {
			continue
		}
		kParts := strings.Split(node.K, ":")
		encNodeKeyB64 := kParts[len(kParts)-1]
		encNodeKey, err := megaBase64Decode(encNodeKeyB64)
		if err != nil || len(encNodeKey) < 16 || len(encNodeKey)%16 != 0 {
			continue
		}

		decNodeKey := make([]byte, len(encNodeKey))
		for bs := 0; bs < len(encNodeKey); bs += 16 {
			masterBlock.Decrypt(decNodeKey[bs:bs+16], encNodeKey[bs:bs+16])
		}

		if node.T == 1 && folderTitle == "" {
			// Корневая папка (16-байтный ключ)
			folderTitle = megaDecryptAttr(node.A, decNodeKey[:16])
			continue
		}

		if node.T == 0 && len(decNodeKey) >= 32 {
			aesKey, _, err := megaDeriveFileKey(decNodeKey)
			if err != nil {
				continue
			}
			fn := megaDecryptAttr(node.A, aesKey)
			if fn != "" && IsInstallable(fn) {
				b64Key := base64.RawURLEncoding.EncodeToString(decNodeKey[:32])
				streamUrl := fmt.Sprintf("mega://folder/%s/%s#%s", folderId, node.H, b64Key)
				downloads = append(downloads, DownloadFile{
					Name: fn,
					Url:  streamUrl,
					Via:  "mega",
				})
			}
		}
	}

	if len(downloads) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "В папке Mega.nz не найдено подходящих файлов модов"}
	}
	if folderTitle == "" {
		folderTitle = fmt.Sprintf("Папка Mega (%d файлов)", len(downloads))
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:megafolder:" + folderId,
		Title:      folderTitle,
		SourceType: "mega",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		Via:        "mega",
		Downloads:  downloads,
	}
}

// Открывает расшифрованный на лету поток AES-128-CTR для ссылки mega://
func OpenMegaStream(ctx context.Context, megaUrl string) (io.ReadCloser, int64, string, error) {
	var apiEndpoint string
	var reqPayload []map[string]any
	var fileKeyB64 string

	if m := megaStreamRe.FindStringSubmatch(megaUrl); len(m) > 2 {
		fileId := m[1]
		fileKeyB64 = m[2]
		apiEndpoint = "https://g.api.mega.co.nz/cs?id=1"
		reqPayload = []map[string]any{{"a": "g", "g": 1, "ssl": 2, "p": fileId}}
	} else if m := megaFStreamRe.FindStringSubmatch(megaUrl); len(m) > 3 {
		folderId := m[1]
		nodeHandle := m[2]
		fileKeyB64 = m[3]
		apiEndpoint = fmt.Sprintf("https://g.api.mega.co.nz/cs?id=1&n=%s", folderId)
		reqPayload = []map[string]any{{"a": "g", "g": 1, "ssl": 2, "n": nodeHandle}}
	} else {
		return nil, 0, "", fmt.Errorf("некорректный mega:// URL")
	}

	rawKey, err := megaBase64Decode(fileKeyB64)
	if err != nil {
		return nil, 0, "", err
	}
	aesKey, ctrIV, err := megaDeriveFileKey(rawKey)
	if err != nil {
		return nil, 0, "", err
	}

	reqBody, _ := json.Marshal(reqPayload)
	req, err := http.NewRequestWithContext(ctx, "POST", apiEndpoint, bytes.NewReader(reqBody))
	if err != nil {
		return nil, 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, "", err
	}
	defer resp.Body.Close()

	var apiRes []struct {
		S  int64  `json:"s"`
		At string `json:"at"`
		G  string `json:"g"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiRes); err != nil || len(apiRes) == 0 || apiRes[0].G == "" {
		return nil, 0, "", fmt.Errorf("Mega API не вернул ссылку для скачивания")
	}

	fileName := megaDecryptAttr(apiRes[0].At, aesKey)
	dlReq, err := http.NewRequestWithContext(ctx, "GET", apiRes[0].G, nil)
	if err != nil {
		return nil, 0, "", err
	}
	dlResp, err := client.Do(dlReq)
	if err != nil {
		return nil, 0, "", err
	}
	if dlResp.StatusCode >= 400 {
		dlResp.Body.Close()
		return nil, 0, "", fmt.Errorf("Mega CDN HTTP %d", dlResp.StatusCode)
	}

	block, err := aes.NewCipher(aesKey)
	if err != nil {
		dlResp.Body.Close()
		return nil, 0, "", err
	}
	stream := cipher.NewCTR(block, ctrIV)

	return &megaReadCloser{
		Reader: &cipher.StreamReader{S: stream, R: dlResp.Body},
		Closer: dlResp.Body,
	}, apiRes[0].S, fileName, nil
}

type megaReadCloser struct {
	io.Reader
	io.Closer
}

func filepathExt(name string) string {
	if idx := strings.LastIndex(name, "."); idx != -1 {
		return name[idx:]
	}
	return ""
}
