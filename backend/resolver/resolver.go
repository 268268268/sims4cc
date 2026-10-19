package resolver

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/curseforge"
)

type DownloadFile struct {
	Name string `json:"name"`
	Url  string `json:"url"`
	Via  string `json:"via,omitempty"`
}

type ResolvedLink struct {
	Ok         bool           `json:"ok"`
	Id         string         `json:"id,omitempty"`
	Title      string         `json:"title,omitempty"`
	Author     string         `json:"author,omitempty"`
	AvatarUrl  string         `json:"avatarUrl,omitempty"`
	Summary    string         `json:"summary,omitempty"`
	SourceType string         `json:"sourceType,omitempty"`
	Url        string         `json:"url,omitempty"`
	DirectUrl  string         `json:"directUrl,omitempty"`
	FileName   string         `json:"fileName,omitempty"`
	ImageUrl   string         `json:"imageUrl,omitempty"`
	Images     []string       `json:"images,omitempty"`
	OpenUrl    string         `json:"openUrl,omitempty"`
	Reason     string         `json:"reason,omitempty"`
	Locked     bool           `json:"locked,omitempty"`
	Via        string         `json:"via,omitempty"`
	Downloads  []DownloadFile `json:"downloads,omitempty"`
}

var (
	gdriveRe       = regexp.MustCompile(`https?://(?:drive\.google\.com/(?:file/d/|open\?id=|uc\?[^"']*id=)|drive\.usercontent\.google\.com/download\?id=)([\w-]+)`)
	gdriveFolderRe = regexp.MustCompile(`https?://drive\.google\.com/(?:drive/(?:u/\d+/)?folders/|open\?id=)([\w-]+)`)
	sfsFileRe      = regexp.MustCompile(`https?://(?:www\.)?simfileshare\.net/download/(\d+)`)
	sfsFolderRe    = regexp.MustCompile(`https?://(?:www\.)?simfileshare\.net/folder/(\d+)`)
	mediafireRe    = regexp.MustCompile(`https?://(?:www\.)?mediafire\.com/(?:file|view|download)/([a-z0-9]+)`)
	mfFolderRe     = regexp.MustCompile(`https?://(?:www\.)?mediafire\.com/folder/([a-z0-9]+)`)
	patreonRe      = regexp.MustCompile(`patreon\.com/(?:(?:cw|c)/)?(?:[\w.-]+/)?posts/(?:[^\s/?#]+-)?(\d+)`)
	cfSlugRe       = regexp.MustCompile(`curseforge\.com/sims4/[\w-]+/([\w-]+)`)
	pinterestRe    = regexp.MustCompile(`pinterest\.[a-z.]+/pin/(?:[\w-]+--)?([A-Za-z0-9_-]+)`)
	mtsRe          = regexp.MustCompile(`modthesims\.info/(?:d/|download\.php\?t=)?(\d+)`)
	tumblrModernRe = regexp.MustCompile(`tumblr\.com/([a-zA-Z0-9_-]+)/(\d+)`)
)

func IsInstallable(name string) bool {
	low := strings.ToLower(strings.TrimSpace(name))
	return strings.HasSuffix(low, ".package") ||
		strings.HasSuffix(low, ".ts4script") ||
		strings.HasSuffix(low, ".zip") ||
		strings.HasSuffix(low, ".rar") ||
		strings.HasSuffix(low, ".7z")
}

func probeFilename(dlUrl string) string {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("HEAD", dlUrl, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		req, _ = http.NewRequest("GET", dlUrl, nil)
		req.Header.Set("Range", "bytes=0-0")
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
		resp, err = client.Do(req)
		if err != nil {
			return ""
		}
	}
	defer resp.Body.Close()

	cd := resp.Header.Get("Content-Disposition")
	if cd != "" {
		re := regexp.MustCompile(`filename\*?=(?:UTF-8'')?["']?([^"';]+)`)
		if m := re.FindStringSubmatch(cd); len(m) > 1 {
			fn := strings.TrimSpace(m[1])
			if unesc, err := url.QueryUnescape(fn); err == nil {
				return unesc
			}
			return fn
		}
	}
	return ""
}

// Разрешает входящую ссылку в прямой URL или список файлов для скачивания
func ResolveLink(rawUrl string) ResolvedLink {
	return resolveLinkInternal(rawUrl, 0)
}

func resolveLinkInternal(rawUrl string, hop int) ResolvedLink {
	rawUrl = DecodeOutboundRedirect(rawUrl)
	if rawUrl == "" {
		return ResolvedLink{Ok: false, Reason: "URL не указан"}
	}

	u, err := url.Parse(rawUrl)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Некорректный URL"}
	}

	if u.Scheme != "http" && u.Scheme != "https" {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Поддерживаются только http/https ссылки"}
	}

	host := strings.ToLower(u.Host)
	pathLower := strings.ToLower(u.Path)

	// Блокируем локальные адреса (безопасность SSRF)
	if host == "localhost" || strings.HasPrefix(host, "127.") || host == "0.0.0.0" || strings.HasPrefix(host, "192.168.") || strings.HasPrefix(host, "10.") {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Локальные адреса заблокированы"}
	}

	// 1. ModTheSims
	if strings.Contains(host, "modthesims.info") {
		return ResolveModTheSims(rawUrl)
	}

	// 2. Pinterest Pin & pin.it shortlinks
	if strings.Contains(host, "pinterest.") || host == "pin.it" {
		if hop >= 3 {
			return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Слишком много переходов"}
		}
		return resolvePinterestPinHop(rawUrl, hop)
	}

	// 3. Patreon Direct File Link (patreon.com/file?h=...&m=...)
	if strings.Contains(host, "patreon.com") && patreonFileRe.MatchString(rawUrl) {
		fn := probeFilename(rawUrl)
		if fn == "" {
			fn = "patreon_attachment.package"
		}
		return ResolvedLink{
			Ok:         true,
			Id:         "resolved:patreonfile:" + fn,
			Title:      strings.TrimSuffix(fn, filepath.Ext(fn)),
			SourceType: "patreon",
			Url:        rawUrl,
			DirectUrl:  rawUrl,
			FileName:   fn,
			Via:        "patreon",
			Downloads:  []DownloadFile{{Name: fn, Url: rawUrl, Via: "patreon"}},
		}
	}

	// 4. Patreon Post
	if strings.Contains(host, "patreon.com") && patreonRe.MatchString(rawUrl) {
		m := patreonRe.FindStringSubmatch(rawUrl)
		if len(m) > 1 {
			return resolvePatreonPost(m[1], rawUrl, hop)
		}
	}

	// 5. Boosty Post
	if strings.Contains(host, "boosty.to") && boostyPostRe.MatchString(rawUrl) {
		m := boostyPostRe.FindStringSubmatch(rawUrl)
		if len(m) > 2 {
			return resolveBoostyPost(m[1], m[2], rawUrl, hop)
		}
	}

	// 5b. Tumblr Post (tumblr.com/{blog}/{id}, {blog}.tumblr.com/post/{id}, or tmblr.co/{short})
	if host == "tmblr.co" || strings.Contains(host, "tumblr.com") {
		if m := tumblrModernRe.FindStringSubmatch(rawUrl); len(m) > 2 && m[1] != "post" && m[1] != "blog" && m[1] != "tagged" {
			return resolveTumblrPost(m[1], m[2], rawUrl, hop)
		}
		if m := tumblrPostRe.FindStringSubmatch(rawUrl); len(m) > 2 {
			blog := strings.TrimSuffix(m[1], ".tumblr.com")
			return resolveTumblrPost(blog, m[2], rawUrl, hop)
		}
		if host == "tmblr.co" && hop < 3 {
			loc := UnshortenUrl(rawUrl)
			if loc != "" && loc != rawUrl {
				return resolveLinkInternal(loc, hop+1)
			}
		}
	}

	// 6. The Sims Resource (TSR)
	if strings.Contains(host, "thesimsresource.com") {
		return resolveTSR(rawUrl)
	}

	// 7. Itch.io
	if strings.HasSuffix(host, ".itch.io") {
		return resolveItchIO(rawUrl)
	}

	// 8. GitHub Releases / Repo
	if strings.Contains(host, "github.com") && githubRelRe.MatchString(rawUrl) {
		return resolveGitHubRelease(rawUrl)
	}

	// 9. Kemono Mirror
	if (strings.Contains(host, "kemono.cr") || strings.Contains(host, "kemono.su") || strings.Contains(host, "kemono.party")) && kemonoPostRe.MatchString(rawUrl) {
		return resolveKemono(rawUrl)
	}

	// 10. SimsFinds
	if strings.Contains(host, "simsfinds.com") {
		return resolveSimsFinds(rawUrl, hop)
	}

	// 11. Mega.nz File or Folder
	if strings.Contains(host, "mega.nz") || strings.Contains(host, "mega.co.nz") {
		return resolveMega(rawUrl)
	}

	// 12. SimFileShare Folder
	if strings.Contains(host, "simfileshare.net") && sfsFolderRe.MatchString(rawUrl) {
		m := sfsFolderRe.FindStringSubmatch(rawUrl)
		if len(m) > 1 {
			return resolveSimFileShareFolder(m[1], rawUrl)
		}
	}

	// 13. SimFileShare Single File
	if strings.Contains(host, "simfileshare.net") || strings.Contains(host, "simfil.es") {
		return resolveSimFileShare(rawUrl)
	}

	// 14. MediaFire Folder
	if strings.Contains(host, "mediafire.com") && mfFolderRe.MatchString(rawUrl) {
		m := mfFolderRe.FindStringSubmatch(rawUrl)
		if len(m) > 1 {
			return resolveMediaFireFolder(m[1], rawUrl)
		}
	}

	// 15. MediaFire File
	if strings.Contains(host, "mediafire.com") {
		return resolveMediaFire(rawUrl)
	}

	// 16. Google Drive Folder
	if strings.Contains(host, "drive.google.com") && gdriveFolderRe.MatchString(rawUrl) {
		m := gdriveFolderRe.FindStringSubmatch(rawUrl)
		if len(m) > 1 {
			return resolveGoogleDriveFolder(m[1], rawUrl)
		}
	}

	// 17. Google Drive Single File
	if strings.Contains(host, "drive.google.com") || strings.Contains(host, "drive.usercontent.google.com") {
		if m := gdriveRe.FindStringSubmatch(rawUrl); len(m) > 1 {
			return resolveGoogleDriveFile(m[1], rawUrl)
		}
	}

	// 18. Dropbox File or Folder (сохраняем rlkey и ставим dl=1)
	if strings.Contains(host, "dropbox.com") || strings.Contains(host, "dropboxusercontent.com") {
		q := u.Query()
		q.Set("dl", "1")
		u.RawQuery = q.Encode()
		direct := u.String()
		fn := filepathBase(u.Path)
		if fn == "" || !IsInstallable(fn) {
			if probed := probeFilename(direct); probed != "" {
				fn = probed
			} else if strings.Contains(u.Path, "/scl/fo/") || strings.Contains(u.Path, "/sh/") {
				fn = "dropbox_folder.zip"
			} else if fn != "" && !strings.Contains(fn, ".") {
				fn += ".zip"
			}
		}
		return ResolvedLink{
			Ok:         true,
			Id:         "resolved:dropbox:" + fn,
			Title:      strings.TrimSuffix(fn, filepath.Ext(fn)),
			SourceType: "dropbox",
			Url:        rawUrl,
			DirectUrl:  direct,
			FileName:   fn,
			Via:        "dropbox",
			Downloads:  []DownloadFile{{Name: fn, Url: direct, Via: "dropbox"}},
		}
	}

	// 19. CurseForge Mod Page
	if strings.Contains(host, "curseforge.com") && cfSlugRe.MatchString(rawUrl) {
		m := cfSlugRe.FindStringSubmatch(rawUrl)
		if len(m) > 1 {
			return resolveCurseForge(m[1], rawUrl)
		}
	}

	// 20. Прямой файл мода
	if IsInstallable(pathLower) {
		fn := filepathBase(u.Path)
		if strings.Contains(host, "patreonusercontent.com") && (fn == "1.package" || fn == "1.zip") {
			if probed := probeFilename(rawUrl); probed != "" {
				fn = probed
			}
		}
		return ResolvedLink{
			Ok:         true,
			Id:         "resolved:direct:" + fn,
			Title:      strings.TrimSuffix(fn, filepath.Ext(fn)),
			SourceType: "direct",
			Url:        rawUrl,
			DirectUrl:  rawUrl,
			FileName:   fn,
			Via:        "direct",
			Downloads:  []DownloadFile{{Name: fn, Url: rawUrl, Via: "direct"}},
		}
	}

	// Если хост известный "не скачиваемый" (соцсети, видео, донаты)
	if isBoringHost(host) {
		return ResolvedLink{
			Ok:      false,
			OpenUrl: rawUrl,
			Reason:  "Этот сайт не содержит файлов для скачивания мода",
		}
	}

	// 21. Универсальный переход по внешней странице (блог автора, tumblr-пост, кастомный сайт)
	if hop < 2 {
		return resolveGenericPage(rawUrl, hop)
	}

	return ResolvedLink{
		Ok:      false,
		OpenUrl: rawUrl,
		Reason:  "Требуется ручное скачивание на странице автора",
	}
}

// Резолвинг поста Patreon через публичный JSON API (с поддержкой галереи скриншотов и внешних ссылок в тексте)
func resolvePatreonPost(postId, originalUrl string, hop int) ResolvedLink {
	apiUrl := fmt.Sprintf("https://www.patreon.com/api/posts/%s?json-api-version=1.0&json-api-use-default-includes=false&include=attachments,media,attachments_media,images,campaign&fields[post]=title,teaser_text,content,current_user_can_view,is_paid,url,image&fields[attachment]=name,url&fields[media]=id,file_name,download_url,image_urls,mimetype&fields[campaign]=name,avatar_photo_image_urls", postId)

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: originalUrl, Reason: err.Error()}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Referer", "https://www.patreon.com/")

	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: originalUrl, Reason: "Ошибка запроса к Patreon API"}
	}
	defer resp.Body.Close()

	var payload struct {
		Data struct {
			Attributes struct {
				Title              string `json:"title"`
				TeaserText         string `json:"teaser_text"`
				Content            string `json:"content"`
				CurrentUserCanView bool   `json:"current_user_can_view"`
				IsPaid             bool   `json:"is_paid"`
				Url                string `json:"url"`
				Image              struct {
					Url      string `json:"url"`
					LargeUrl string `json:"large_url"`
					ThumbUrl string `json:"thumb_url"`
				} `json:"image"`
			} `json:"attributes"`
		} `json:"data"`
		Included []struct {
			Id         string `json:"id"`
			Type       string `json:"type"`
			Attributes struct {
				Name        string `json:"name"`
				FileName    string `json:"file_name"`
				Url         string `json:"url"`
				DownloadUrl string `json:"download_url"`
				Mimetype    string `json:"mimetype"`
				ImageUrls   struct {
					Original     string `json:"original"`
					DefaultLarge string `json:"default_large"`
					Default      string `json:"default"`
				} `json:"image_urls"`
				AvatarPhotoImageUrls struct {
					Original string `json:"original"`
					Default  string `json:"default"`
				} `json:"avatar_photo_image_urls"`
			} `json:"attributes"`
		} `json:"included"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return ResolvedLink{Ok: false, OpenUrl: originalUrl, Reason: "Не удалось распарсить ответ Patreon"}
	}

	postUrl := payload.Data.Attributes.Url
	if postUrl == "" {
		postUrl = originalUrl
	}

	creator := "Patreon Creator"
	avatarUrl := ""
	var images []string
	seenImg := make(map[string]bool)

	addImg := func(u string) {
		if u != "" && !seenImg[u] {
			seenImg[u] = true
			images = append(images, u)
		}
	}

	if payload.Data.Attributes.Image.Url != "" {
		addImg(payload.Data.Attributes.Image.Url)
	} else if payload.Data.Attributes.Image.LargeUrl != "" {
		addImg(payload.Data.Attributes.Image.LargeUrl)
	} else if payload.Data.Attributes.Image.ThumbUrl != "" {
		addImg(payload.Data.Attributes.Image.ThumbUrl)
	}

	for _, inc := range payload.Included {
		if inc.Type == "campaign" {
			if inc.Attributes.Name != "" {
				creator = inc.Attributes.Name
			}
			if inc.Attributes.AvatarPhotoImageUrls.Original != "" {
				avatarUrl = inc.Attributes.AvatarPhotoImageUrls.Original
			} else if inc.Attributes.AvatarPhotoImageUrls.Default != "" {
				avatarUrl = inc.Attributes.AvatarPhotoImageUrls.Default
			}
		} else if inc.Type == "media" {
			if !IsInstallable(inc.Attributes.FileName) {
				if inc.Attributes.ImageUrls.Original != "" {
					addImg(inc.Attributes.ImageUrls.Original)
				} else if inc.Attributes.ImageUrls.DefaultLarge != "" {
					addImg(inc.Attributes.ImageUrls.DefaultLarge)
				} else if inc.Attributes.ImageUrls.Default != "" {
					addImg(inc.Attributes.ImageUrls.Default)
				}
			}
		}
	}

	coverImg := ""
	if len(images) > 0 {
		coverImg = images[0]
	}

	if !payload.Data.Attributes.CurrentUserCanView {
		reason := "Пост доступен только для патронов автора"
		if !payload.Data.Attributes.IsPaid {
			reason = "Пост находится в раннем доступе (Early Access) для патронов"
		}
		return ResolvedLink{
			Ok:        false,
			OpenUrl:   postUrl,
			ImageUrl:  coverImg,
			Images:    images,
			AvatarUrl: avatarUrl,
			Reason:    reason,
			Locked:    true,
		}
	}

	var downloads []DownloadFile
	seen := make(map[string]bool)

	for _, inc := range payload.Included {
		if (inc.Type == "media" || inc.Type == "attachments_media") && IsInstallable(inc.Attributes.FileName) {
			fn := inc.Attributes.FileName
			dlUrl := inc.Attributes.DownloadUrl
			if dlUrl == "" && postId != "" && inc.Id != "" {
				dlUrl = fmt.Sprintf("https://www.patreon.com/file?h=%s&m=%s", postId, inc.Id)
			}
			if dlUrl != "" && !seen[fn] {
				seen[fn] = true
				downloads = append(downloads, DownloadFile{Name: fn, Url: dlUrl, Via: "patreon"})
			}
		} else if inc.Type == "attachment" && inc.Attributes.Url != "" && IsInstallable(inc.Attributes.Name) {
			fn := inc.Attributes.Name
			if !seen[fn] {
				seen[fn] = true
				downloads = append(downloads, DownloadFile{Name: fn, Url: inc.Attributes.Url, Via: "patreon"})
			}
		}
	}

	// Если прямых вложений нет, проверяем ссылки на SFS / Google Drive / MediaFire / Mega внутри HTML-контента и тизера поста
	textToScan := payload.Data.Attributes.Content + "\n" + payload.Data.Attributes.TeaserText
	if len(downloads) == 0 && textToScan != "" && hop < 2 {
		for _, cand := range findKnownLinks(textToScan) {
			sub := resolveLinkInternal(cand, hop+1)
			if sub.Ok && len(sub.Downloads) > 0 {
				for _, d := range sub.Downloads {
					if !seen[d.Url] {
						seen[d.Url] = true
						downloads = append(downloads, d)
					}
				}
			}
		}
	}

	if len(downloads) == 0 {
		return ResolvedLink{
			Ok:        false,
			OpenUrl:   postUrl,
			ImageUrl:  coverImg,
			Images:    images,
			AvatarUrl: avatarUrl,
			Reason:    "В посте нет подходящих файлов модов (.package / .zip)",
		}
	}

	summary := stripTags(payload.Data.Attributes.Content)
	if summary == "" {
		summary = payload.Data.Attributes.TeaserText
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:patreon:" + postId,
		Title:      payload.Data.Attributes.Title,
		Author:     creator,
		AvatarUrl:  avatarUrl,
		Summary:    summary,
		SourceType: "patreon",
		Url:        postUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		ImageUrl:   coverImg,
		Images:     images,
		Via:        "patreon",
		Downloads:  downloads,
	}
}

// Резолвинг отдельного файла SimFileShare (парсит точное имя файла со страницы /download/{id}/)
func resolveSimFileShare(rawUrl string) ResolvedLink {
	id := ""
	if m := sfsFileRe.FindStringSubmatch(rawUrl); len(m) > 1 {
		id = m[1]
	} else if strings.Contains(rawUrl, "simfil.es/") {
		parts := strings.Split(rawUrl, "simfil.es/")
		if len(parts) > 1 {
			id = strings.Trim(strings.Split(parts[1], "/")[0], "?#")
		}
	}

	if id == "" {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось распознать ID SimFileShare"}
	}

	direct := fmt.Sprintf("https://simfileshare.net/download/%s/?dl", id)
	name := probeFilename(direct)

	if name == "" {
		pageUrl := fmt.Sprintf("https://simfileshare.net/download/%s/", id)
		client := &http.Client{Timeout: 10 * time.Second}
		req, _ := http.NewRequest("GET", pageUrl, nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
		if resp, err := client.Do(req); err == nil {
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
			resp.Body.Close()
			htmlStr := string(b)
			reTitle := regexp.MustCompile(`<title>\s*SimFileShare\s*-\s*([^<]+?)\s*</title>`)
			if m := reTitle.FindStringSubmatch(htmlStr); len(m) > 1 {
				cand := strings.TrimSpace(html.UnescapeString(m[1]))
				if IsInstallable(cand) {
					name = cand
				}
			}
			if name == "" {
				reH4 := regexp.MustCompile(`<h4>([^<]+?\.(?:package|zip|rar|7z|ts4script))`)
				if m := reH4.FindStringSubmatch(htmlStr); len(m) > 1 {
					name = strings.TrimSpace(html.UnescapeString(m[1]))
				}
			}
		}
	}

	if name == "" {
		name = fmt.Sprintf("simfileshare_%s.package", id)
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:sfs:" + id,
		Title:      strings.TrimSuffix(name, filepath.Ext(name)),
		SourceType: "simfileshare",
		Url:        rawUrl,
		DirectUrl:  direct,
		FileName:   name,
		Via:        "simfileshare",
		Downloads:  []DownloadFile{{Name: name, Url: direct, Via: "simfileshare"}},
	}
}

// Резолвинг папки SimFileShare
func resolveSimFileShareFolder(folderId, rawUrl string) ResolvedLink {
	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", rawUrl, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось открыть папку SimFileShare"}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	htmlStr := string(body)

	reLinks := regexp.MustCompile(`href="(/download/(\d+)/?)"[^>]*>([^<]+)</a>`)
	matches := reLinks.FindAllStringSubmatch(htmlStr, -1)

	var downloads []DownloadFile
	seen := make(map[string]bool)

	for _, m := range matches {
		if len(m) > 3 {
			fid := m[2]
			fn := strings.TrimSpace(html.UnescapeString(m[3]))
			dlUrl := fmt.Sprintf("https://simfileshare.net/download/%s/?dl", fid)
			if !seen[dlUrl] && IsInstallable(fn) {
				seen[dlUrl] = true
				downloads = append(downloads, DownloadFile{Name: fn, Url: dlUrl, Via: "simfileshare"})
			}
		}
	}

	if len(downloads) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "В папке SimFileShare не найдено файлов для скачивания"}
	}

	folderTitle := fmt.Sprintf("Папка SimFileShare (%d файлов)", len(downloads))
	reTitle := regexp.MustCompile(`<title>\s*SimFileShare\s*-\s*([^<]+?)\s*</title>`)
	if mt := reTitle.FindStringSubmatch(htmlStr); len(mt) > 1 {
		folderTitle = strings.TrimSpace(html.UnescapeString(mt[1]))
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:sfsfolder:" + folderId,
		Title:      folderTitle,
		SourceType: "simfileshare",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		Via:        "simfileshare",
		Downloads:  downloads,
	}
}

// Резолвинг страницы загрузки MediaFire (включая get_info API и download\d+ CDN)
func resolveMediaFire(rawUrl string) ResolvedLink {
	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", rawUrl, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Ошибка подключения к MediaFire"}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	htmlStr := string(body)

	dl := ""
	reMf := regexp.MustCompile(`aria-label="Download file"[^>]*href="([^"]+)"`)
	if m := reMf.FindStringSubmatch(htmlStr); len(m) > 1 {
		dl = m[1]
	}
	if dl == "" || !strings.HasPrefix(dl, "http") {
		reDirect := regexp.MustCompile(`https?://download\d+\.mediafire\.com/[^\s"'<>]+`)
		if m := reDirect.FindString(htmlStr); m != "" {
			dl = m
		}
	}
	if dl == "" || !strings.HasPrefix(dl, "http") {
		reScrambled := regexp.MustCompile(`data-scrambled-url="([A-Za-z0-9+/=]+)"`)
		if m := reScrambled.FindStringSubmatch(htmlStr); len(m) > 1 {
			if decoded, err := base64.StdEncoding.DecodeString(m[1]); err == nil {
				dl = string(decoded)
			}
		}
	}

	if dl == "" || !strings.HasPrefix(dl, "http") {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Прямая ссылка MediaFire не найдена"}
	}

	name := ""
	if mKey := mediafireRe.FindStringSubmatch(rawUrl); len(mKey) > 1 {
		infoUrl := fmt.Sprintf("https://www.mediafire.com/api/1.5/file/get_info.php?quick_key=%s&response_format=json", mKey[1])
		if infoResp, err := client.Get(infoUrl); err == nil {
			var infoPayload struct {
				Response struct {
					FileInfo struct {
						Filename string `json:"filename"`
					} `json:"file_info"`
				} `json:"response"`
			}
			_ = json.NewDecoder(infoResp.Body).Decode(&infoPayload)
			infoResp.Body.Close()
			if infoPayload.Response.FileInfo.Filename != "" {
				name = infoPayload.Response.FileInfo.Filename
			}
		}
	}

	if name == "" {
		parts := strings.Split(dl, "/")
		name = parts[len(parts)-1]
		if idx := strings.Index(name, "?"); idx != -1 {
			name = name[:idx]
		}
		if unesc, err := url.QueryUnescape(name); err == nil {
			name = unesc
		}
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:mediafire:" + rawUrl,
		Title:      strings.TrimSuffix(name, filepath.Ext(name)),
		SourceType: "mediafire",
		Url:        rawUrl,
		DirectUrl:  dl,
		FileName:   name,
		Via:        "mediafire",
		Downloads:  []DownloadFile{{Name: name, Url: dl, Via: "mediafire"}},
	}
}

// Резолвинг открытой папки MediaFire через официальный API
func resolveMediaFireFolder(key, rawUrl string) ResolvedLink {
	apiUrl := fmt.Sprintf("https://www.mediafire.com/api/1.4/folder/get_content.php?folder_key=%s&content_type=files&chunk=1&response_format=json", key)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(apiUrl)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось получить список файлов MediaFire"}
	}
	defer resp.Body.Close()

	var payload struct {
		Response struct {
			FolderContent struct {
				Name  string `json:"name"`
				Files []struct {
					Filename string `json:"filename"`
					Links    struct {
						NormalDownload string `json:"normal_download"`
					} `json:"links"`
				} `json:"files"`
			} `json:"folder_content"`
		} `json:"response"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось распарсить ответ папки MediaFire"}
	}

	var downloads []DownloadFile
	for _, f := range payload.Response.FolderContent.Files {
		if IsInstallable(f.Filename) && f.Links.NormalDownload != "" {
			r := resolveMediaFire(f.Links.NormalDownload)
			if r.Ok && len(r.Downloads) > 0 {
				downloads = append(downloads, r.Downloads...)
			}
		}
	}

	if len(downloads) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "В папке MediaFire не найдено файлов для скачивания"}
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:mffolder:" + key,
		Title:      fmt.Sprintf("Папка MediaFire: %s", payload.Response.FolderContent.Name),
		SourceType: "mediafire",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		Via:        "mediafire",
		Downloads:  downloads,
	}
}

// Резолвинг одиночного файла Google Drive через drive.usercontent.google.com
func resolveGoogleDriveFile(id, rawUrl string) ResolvedLink {
	direct := fmt.Sprintf("https://drive.usercontent.google.com/download?id=%s&export=download&confirm=t", id)
	name := ""

	// Пробуем быстро достать имя файла из og:title страницы просмотра
	viewUrl := fmt.Sprintf("https://drive.google.com/file/d/%s/view", id)
	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", viewUrl, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	if resp, err := client.Do(req); err == nil {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
		resp.Body.Close()
		reOgTitle := regexp.MustCompile(`<meta[^>]+property="og:title"[^>]+content="([^"]+)"`)
		if m := reOgTitle.FindStringSubmatch(string(b)); len(m) > 1 {
			cand := strings.TrimSpace(html.UnescapeString(m[1]))
			if IsInstallable(cand) {
				name = cand
			}
		}
	}

	if name == "" {
		name = probeFilename(direct)
	}
	if name == "" {
		name = fmt.Sprintf("gdrive_%s.zip", id)
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:gdrive:" + id,
		Title:      strings.TrimSuffix(name, filepath.Ext(name)),
		SourceType: "gdrive",
		Url:        rawUrl,
		DirectUrl:  direct,
		FileName:   name,
		Via:        "gdrive",
		Downloads:  []DownloadFile{{Name: name, Url: direct, Via: "gdrive"}},
	}
}

// Резолвинг папки Google Drive через легкий embeddedfolderview
func resolveGoogleDriveFolder(folderId, rawUrl string) ResolvedLink {
	embedUrl := fmt.Sprintf("https://drive.google.com/embeddedfolderview?id=%s#list", folderId)
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", embedUrl, nil)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: err.Error()}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось открыть папку Google Drive"}
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	htmlContent := string(bodyBytes)

	reEntry := regexp.MustCompile(`id="entry-([\w-]+)"[\s\S]*?flip-entry-title">([^<]+)<`)
	matches := reEntry.FindAllStringSubmatch(htmlContent, -1)

	var downloads []DownloadFile
	for _, m := range matches {
		if len(m) > 2 {
			id := m[1]
			name := strings.TrimSpace(html.UnescapeString(m[2]))
			if IsInstallable(name) {
				dl := fmt.Sprintf("https://drive.usercontent.google.com/download?id=%s&export=download&confirm=t", id)
				downloads = append(downloads, DownloadFile{
					Name: name,
					Url:  dl,
					Via:  "gdrive",
				})
			}
		}
	}

	if len(downloads) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "В папке Google Drive не найдено файлов для скачивания"}
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:gdrivefolder:" + folderId,
		Title:      fmt.Sprintf("Папка Google Drive (%d файлов)", len(downloads)),
		SourceType: "gdrive",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		Via:        "gdrive",
		Downloads:  downloads,
	}
}

// Резолвинг мода CurseForge по ссылке со слагом (включая логотип и скриншоты)
func resolveCurseForge(slug, originalUrl string) ResolvedLink {
	res := curseforge.SearchMods(curseforge.SearchParams{
		SearchFilter: slug,
		PageSize:     5,
	})

	if res.Error != "" {
		return ResolvedLink{Ok: false, OpenUrl: originalUrl, Reason: res.Error}
	}

	rawJson, _ := json.Marshal(res.Data)
	var mods []struct {
		Id      int    `json:"id"`
		Name    string `json:"name"`
		Slug    string `json:"slug"`
		Summary string `json:"summary"`
		Logo    struct {
			Url string `json:"url"`
		} `json:"logo"`
		Screenshots []struct {
			Url string `json:"url"`
		} `json:"screenshots"`
		Authors []struct {
			Name string `json:"name"`
		} `json:"authors"`
		LatestFiles []struct {
			Id          int    `json:"id"`
			FileName    string `json:"fileName"`
			DownloadUrl string `json:"downloadUrl"`
		} `json:"latestFiles"`
	}

	if err := json.Unmarshal(rawJson, &mods); err != nil || len(mods) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: originalUrl, Reason: "Мод на CurseForge не найден"}
	}

	match := &mods[0]
	for i := range mods {
		if mods[i].Slug == slug {
			match = &mods[i]
			break
		}
	}

	var images []string
	if match.Logo.Url != "" {
		images = append(images, match.Logo.Url)
	}
	for _, sc := range match.Screenshots {
		if sc.Url != "" {
			images = append(images, sc.Url)
		}
	}

	author := "CurseForge"
	if len(match.Authors) > 0 && match.Authors[0].Name != "" {
		author = match.Authors[0].Name
	}

	if len(match.LatestFiles) == 0 {
		return ResolvedLink{
			Ok:       false,
			OpenUrl:  originalUrl,
			ImageUrl: match.Logo.Url,
			Images:   images,
			Reason:   "У этого мода нет файлов на CurseForge",
		}
	}

	lf := match.LatestFiles[0]
	dlUrl := lf.DownloadUrl
	// Empty downloadUrl means the author disabled 3rd-party distribution: respect it unless the user opted in.
	if dlUrl == "" && lf.Id > 0 && config.ReadConfig().BypassRestrictedDownloads {
		part1 := lf.Id / 1000
		part2 := lf.Id % 1000
		dlUrl = fmt.Sprintf("https://edge.forgecdn.net/files/%d/%d/%s", part1, part2, url.QueryEscape(lf.FileName))
	}

	if dlUrl == "" {
		return ResolvedLink{
			Ok:       false,
			OpenUrl:  originalUrl,
			ImageUrl: match.Logo.Url,
			Images:   images,
			Reason:   "Скачивание файла заблокировано автором на CurseForge",
		}
	}

	return ResolvedLink{
		Ok:         true,
		Id:         fmt.Sprintf("cf:%d", match.Id),
		Title:      match.Name,
		Author:     author,
		Summary:    match.Summary,
		SourceType: "curseforge",
		Url:        originalUrl,
		DirectUrl:  dlUrl,
		FileName:   lf.FileName,
		ImageUrl:   match.Logo.Url,
		Images:     images,
		Via:        "curseforge",
		Downloads:  []DownloadFile{{Name: lf.FileName, Url: dlUrl, Via: "curseforge"}},
	}
}

// Резолвинг пина Pinterest: поддержка pin.it, PinResource API и сохранение оригинальной обложки
func resolvePinterestPin(rawUrl string) ResolvedLink {
	return resolvePinterestPinHop(rawUrl, 0)
}

func resolvePinterestPinHop(rawUrl string, hop int) ResolvedLink {
	// Если это короткая ссылка pin.it — разворачиваем редирект
	if strings.Contains(strings.ToLower(rawUrl), "pin.it/") {
		noRedir := &http.Client{
			Timeout: 10 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
		req, _ := http.NewRequest("GET", rawUrl, nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
		if resp, err := noRedir.Do(req); err == nil {
			loc := resp.Header.Get("Location")
			resp.Body.Close()
			if loc != "" {
				rawUrl = loc
			}
		}
	}

	pinId := ""
	if m := pinterestRe.FindStringSubmatch(rawUrl); len(m) > 1 {
		pinId = m[1]
	}

	// Сначала пробуем внутренний JSON API Pinterest (отдает orig обложку и прямую ссылку автора)
	if pinId != "" {
		targetLink, origImg, pinTitle, pinAuthor, pinAvatar := fetchPinterestPinAPI(pinId)
		if origImg != "" || targetLink != "" {
			if targetLink != "" && !strings.Contains(targetLink, "pinterest.") && !strings.Contains(targetLink, "pinimg.") {
				resolved := resolveLinkInternal(targetLink, hop+1)
				if resolved.Ok {
					if resolved.ImageUrl == "" && origImg != "" {
						resolved.ImageUrl = origImg
					}
					if len(resolved.Images) == 0 && origImg != "" {
						resolved.Images = []string{origImg}
					}
					if resolved.Title == "" && pinTitle != "" {
						resolved.Title = pinTitle
					}
					if resolved.Author == "" && pinAuthor != "" {
						resolved.Author = pinAuthor
					}
					if resolved.AvatarUrl == "" && pinAvatar != "" {
						resolved.AvatarUrl = pinAvatar
					}
					return resolved
				}
				// Если ссылка автора ведет на страницу коллекции/блога
				return ResolvedLink{
					Ok:        false,
					OpenUrl:   targetLink,
					Title:     pinTitle,
					Author:    pinAuthor,
					AvatarUrl: pinAvatar,
					ImageUrl:  origImg,
					Images:    []string{origImg},
					Reason:    "Страница автора требует выбора мода",
				}
			}
			return ResolvedLink{
				Ok:        false,
				OpenUrl:   rawUrl,
				Title:     pinTitle,
				Author:    pinAuthor,
				AvatarUrl: pinAvatar,
				ImageUrl:  origImg,
				Images:    []string{origImg},
				Reason:    "Пин не содержит прямой ссылки на скачивание мода",
			}
		}
	}

	// Запасной вариант: чтение HTML страницы пина
	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", rawUrl, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось открыть пин Pinterest"}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	htmlContent := string(body)

	reLink := regexp.MustCompile(`"link"\s*:\s*"(https?:[^"]+)"`)
	mLink := reLink.FindAllStringSubmatch(htmlContent, -1)

	reOg := regexp.MustCompile(`<meta[^>]+property="og:image"[^>]+content="([^"]+)"`)
	imgUrl := ""
	if m := reOg.FindStringSubmatch(htmlContent); len(m) > 1 {
		imgUrl = strings.Replace(m[1], "/236x/", "/originals/", 1)
		imgUrl = strings.Replace(imgUrl, "/564x/", "/originals/", 1)
		imgUrl = strings.Replace(imgUrl, "/736x/", "/originals/", 1)
	}

	for _, ml := range mLink {
		if len(ml) > 1 {
			targetUrl := strings.ReplaceAll(ml[1], `\/`, `/`)
			if strings.Contains(targetUrl, "pinterest") || strings.Contains(targetUrl, "pinimg") {
				continue
			}
			resolved := resolveLinkInternal(targetUrl, hop+1)
			if resolved.Ok {
				if resolved.ImageUrl == "" {
					resolved.ImageUrl = imgUrl
				}
				if len(resolved.Images) == 0 && imgUrl != "" {
					resolved.Images = []string{imgUrl}
				}
				return resolved
			}
		}
	}

	return ResolvedLink{
		Ok:       false,
		OpenUrl:  rawUrl,
		ImageUrl: imgUrl,
		Images:   []string{imgUrl},
		Reason:   "Пин не содержит прямой ссылки на скачивание мода",
	}
}

// Резолвинг мода ModTheSims (включая полную галерею скриншотов)
func ResolveModTheSims(rawUrl string) ResolvedLink {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", rawUrl, nil)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: err.Error()}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось загрузить страницу ModTheSims"}
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Ошибка чтения страницы ModTheSims"}
	}
	htmlContent := string(bodyBytes)

	title := "ModTheSims Mod"
	reTitle := regexp.MustCompile(`<title>(.*?)(?:\s+-\s+Mod The Sims|\s+-\s+MTS)</title>`)
	if m := reTitle.FindStringSubmatch(htmlContent); len(m) > 1 {
		title = strings.TrimSpace(html.UnescapeString(m[1]))
	}

	author := "ModTheSims"
	reAuthor := regexp.MustCompile(`class="downloadcreatorname"[\s\S]*?<a[^>]*>([^<]+)</a>`)
	if m := reAuthor.FindStringSubmatch(htmlContent); len(m) > 1 {
		author = strings.TrimSpace(m[1])
	}

	reDl := regexp.MustCompile(`<a[^>]+href=["']([^"']*getfile\.php[^"']*)["'][^>]*>([\s\S]*?)</a>`)
	matchesDl := reDl.FindAllStringSubmatch(htmlContent, -1)

	var downloads []DownloadFile
	seen := make(map[string]bool)

	for _, m := range matchesDl {
		if len(m) > 2 {
			u := m[1]
			if !strings.HasPrefix(u, "http") {
				u = "https://modthesims.info/" + strings.TrimPrefix(u, "/")
			}
			fn := stripTags(m[2])
			if fn == "" || strings.EqualFold(fn, "Download") {
				continue
			}
			if !seen[u] && IsInstallable(fn) {
				seen[u] = true
				downloads = append(downloads, DownloadFile{Name: fn, Url: u, Via: "modthesims"})
			}
		}
	}

	var images []string
	seenImg := make(map[string]bool)
	reImg := regexp.MustCompile(`(?:href|src)=["']((?:https?:)?//thumbs\d*\.modthesims2\.com/img/[^"']+\.(?:png|jpg|jpeg|webp)[^"']*)["']`)
	for _, m := range reImg.FindAllStringSubmatch(htmlContent, -1) {
		if len(m) > 1 {
			iu := m[1]
			if strings.HasPrefix(iu, "//") {
				iu = "https:" + iu
			}
			if !seenImg[iu] {
				seenImg[iu] = true
				images = append(images, iu)
			}
		}
	}

	if len(images) == 0 {
		reOg := regexp.MustCompile(`<meta[^>]+property="og:image"[^>]+content="([^"]+)"`)
		if m := reOg.FindStringSubmatch(htmlContent); len(m) > 1 {
			iu := m[1]
			if strings.HasPrefix(iu, "//") {
				iu = "https:" + iu
			}
			images = append(images, iu)
		}
	}

	firstImg := ""
	if len(images) > 0 {
		firstImg = images[0]
	}

	if len(downloads) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, ImageUrl: firstImg, Images: images, Reason: "На странице ModTheSims не найдены файлы для скачивания"}
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:mts:" + rawUrl,
		Title:      title,
		Author:     author,
		SourceType: "modthesims",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		ImageUrl:   firstImg,
		Images:     images,
		Via:        "modthesims",
		Downloads:  downloads,
	}
}

var boringHosts = map[string]bool{
	"instagram.com": true, "facebook.com": true, "twitter.com": true, "x.com": true,
	"youtube.com": true, "youtu.be": true, "tiktok.com": true, "discord.gg": true,
	"discord.com": true, "twitch.tv": true, "spotify.com": true, "reddit.com": true,
	"ko-fi.com": true, "paypal.com": true, "paypal.me": true, "buymeacoffee.com": true,
	"throne.com": true, "vk.com": true, "t.me": true, "telegram.me": true,
}

func isBoringHost(host string) bool {
	host = strings.ToLower(host)
	if boringHosts[host] {
		return true
	}
	for b := range boringHosts {
		if strings.HasSuffix(host, "."+b) {
			return true
		}
	}
	return false
}

func findKnownLinks(htmlContent string) []string {
	text := strings.ReplaceAll(htmlContent, `\/`, `/`)
	text = strings.ReplaceAll(text, `&amp;`, `&`)

	// Сначала вытаскиваем и декодируем редиректы Tumblr t.umblr.com/redirect?z=...
	reTumblrRedir := regexp.MustCompile(`https?://t\.umblr\.com/redirect\?[^\s"'<>\\)]+`)
	for _, tr := range reTumblrRedir.FindAllString(text, -1) {
		dec := DecodeOutboundRedirect(tr)
		if dec != "" && dec != tr {
			text += "\n" + dec
		}
	}

	patterns := []string{
		`https?://(?:[\w.-]+\.)?simfileshare\.net/(?:download|folder)/\d+[^\s"'<>\\)]*`,
		`https?://simfil\.es/\w+[^\s"'<>\\)]*`,
		`https?://(?:[\w.-]+\.)?mediafire\.com/[^\s"'<>\\)]+`,
		`https?://(?:[\w.-]+\.)?dropbox\.com/[^\s"'<>\\)]+`,
		`https?://drive\.google\.com/(?:file/d/|drive/(?:u/\d+/)?folders/|open\?id=)[\w-]+[^\s"'<>\\)]*`,
		`https?://mega\.(?:co\.)?nz/(?:file|folder|#!)[^\s"'<>\\)]+`,
		`https?://(?:www\.)?patreon\.com/(?:file\?h=\d+&m=\d+|(?:[\w-]+/)?posts/[\w-]+)[^\s"'<>\\)]*`,
		`https?://boosty\.to/[\w.-]+/posts/[0-9a-fA-F-]+[^\s"'<>\\)]*`,
		`https?://(?:www\.)?thesimsresource\.com/downloads/[^\s"'<>\\)]+`,
		`https?://[a-z0-9-]+\.itch\.io/[a-z0-9-]+[^\s"'<>\\)]*`,
		`https?://github\.com/[\w.-]+/[\w.-]+/releases[^\s"'<>\\)]*`,
		`https?://(?:www\.|legacy\.)?curseforge\.com/sims4/[\w-]+/[\w-]+[^\s"'<>\\)]*`,
		`https?://(?:www\.)?modthesims\.info/(?:d|download)/?\d+[^\s"'<>\\)]*`,
		`https?://[^\s"'<>\\)]+\.(?:zip|package|ts4script|rar|7z)(?:\?[^\s"'<>\\)]*)?`,
	}

	var out []string
	seen := make(map[string]bool)

	for _, p := range patterns {
		re := regexp.MustCompile(p)
		matches := re.FindAllString(text, -1)
		for _, m := range matches {
			m = strings.TrimRight(m, ".,);\"'")
			if !seen[m] {
				seen[m] = true
				out = append(out, m)
				if len(out) >= 10 {
					return out
				}
			}
		}
	}
	return out
}

func resolveGenericPage(rawUrl string, hop int) ResolvedLink {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", rawUrl, nil)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: err.Error()}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось открыть внешнюю страницу"}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 1500*1024))
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Ошибка чтения страницы"}
	}
	htmlContent := string(bodyBytes)

	imgUrl := ""
	reOg := regexp.MustCompile(`<meta[^>]+property="og:image"[^>]+content="([^"]+)"`)
	if m := reOg.FindStringSubmatch(htmlContent); len(m) > 1 {
		imgUrl = m[1]
	}

	images := ExtractTumblrHighResImages(htmlContent, imgUrl)
	if imgUrl == "" && len(images) > 0 {
		imgUrl = images[0]
	}

	candidates := findKnownLinks(htmlContent)
	for _, cand := range candidates {
		if cand == rawUrl {
			continue
		}
		sub := resolveLinkInternal(cand, hop+1)
		if sub.Ok && len(sub.Downloads) > 0 {
			if sub.ImageUrl == "" {
				sub.ImageUrl = imgUrl
			}
			if len(sub.Images) == 0 && len(images) > 0 {
				sub.Images = images
			}
			return sub
		}
	}

	return ResolvedLink{
		Ok:       false,
		OpenUrl:  rawUrl,
		ImageUrl: imgUrl,
		Images:   images,
		Reason:   "Требуется ручное скачивание на странице автора",
	}
}

func stripTags(s string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	cleaned := re.ReplaceAllString(s, " ")
	cleaned = html.UnescapeString(cleaned)
	return strings.Join(strings.Fields(cleaned), " ")
}

func filepathBase(p string) string {
	parts := strings.Split(strings.TrimSuffix(p, "/"), "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return "download.package"
}
