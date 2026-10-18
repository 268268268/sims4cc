package resolver

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var (
	tsrItemRe     = regexp.MustCompile(`thesimsresource\.com/(?:downloads/(?:details/[^\s/]+/id/(\d+)|(\d+))|[\w/-]+-id-(\d+)|[\w/-]+/id/(\d+))`)
	itchIoRe      = regexp.MustCompile(`^https?://([a-z0-9-]+)\.itch\.io/([a-z0-9-]+)`)
	githubRelRe   = regexp.MustCompile(`github\.com/([\w.-]+)/([\w.-]+)(?:/releases(?:/tag/([^/?#]+))?)?`)
	boostyPostRe  = regexp.MustCompile(`boosty\.to/([\w.-]+)/posts/([0-9a-fA-F-]+)`)
	kemonoPostRe  = regexp.MustCompile(`kemono\.(?:su|cr|party)/([a-z0-9]+)/user/([^/]+)/post/(\d+)`)
	simsFindsRe   = regexp.MustCompile(`simsfinds\.com/(?:downloads|[\w-]+)/(\d+)`)
	tumblrPostRe  = regexp.MustCompile(`https?://([a-z0-9-]+\.tumblr\.com)/(?:post/)?(\d+)`)
	patreonFileRe = regexp.MustCompile(`patreon\.com/file\?h=(\d+)&m=(\d+)`)
)

// Разворачивает редиректы Tumblr (t.umblr.com/redirect?z=...), href.li, Pinterest, SimsFinds и Google
func DecodeOutboundRedirect(raw string) string {
	raw = html.UnescapeString(strings.TrimSpace(raw))
	if strings.Contains(raw, "t.umblr.com/redirect") {
		if u, err := url.Parse(raw); err == nil {
			if z := u.Query().Get("z"); z != "" {
				return DecodeOutboundRedirect(z)
			}
		}
		if idx := strings.Index(raw, "z="); idx != -1 {
			sub := raw[idx+2:]
			if amp := strings.Index(sub, "&"); amp != -1 {
				sub = sub[:amp]
			}
			if unesc, err := url.QueryUnescape(sub); err == nil && strings.HasPrefix(unesc, "http") {
				return DecodeOutboundRedirect(unesc)
			}
		}
	}
	if idx := strings.Index(raw, "href.li/?"); idx != -1 {
		return DecodeOutboundRedirect(raw[idx+9:])
	}
	if strings.Contains(raw, "click.simsfinds.com/go") {
		if u, err := url.Parse(raw); err == nil {
			if target := u.Query().Get("url"); target != "" {
				return DecodeOutboundRedirect(target)
			}
		}
	}
	if strings.Contains(raw, "pinterest.") && strings.Contains(raw, "/offsite/?url=") {
		if u, err := url.Parse(raw); err == nil {
			if target := u.Query().Get("url"); target != "" {
				return DecodeOutboundRedirect(target)
			}
		}
	}
	if strings.Contains(raw, "google.") && strings.Contains(raw, "/url?") {
		if u, err := url.Parse(raw); err == nil {
			if q := u.Query().Get("q"); q != "" {
				return DecodeOutboundRedirect(q)
			}
			if target := u.Query().Get("url"); target != "" {
				return DecodeOutboundRedirect(target)
			}
		}
	}
	return raw
}

// Разворачивает короткие ссылки (например tmblr.co, bit.ly, tinyurl) следуя HTTP редиректам
func UnshortenUrl(rawUrl string) string {
	client := &http.Client{
		Timeout: 7 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 6 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}
	req, err := http.NewRequest("HEAD", rawUrl, nil)
	if err != nil {
		return rawUrl
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	resp, err := client.Do(req)
	if err != nil || resp == nil {
		return rawUrl
	}
	defer resp.Body.Close()
	if resp.Request != nil && resp.Request.URL != nil {
		finalUrl := resp.Request.URL.String()
		if finalUrl != "" {
			return finalUrl
		}
	}
	return rawUrl
}

// 1. The Sims Resource (TSR) — полное 5-шаговое получение подписанной ссылки без браузера
func resolveTSR(rawUrl string) ResolvedLink {
	m := tsrItemRe.FindStringSubmatch(rawUrl)
	itemId := ""
	for i := 1; i < len(m); i++ {
		if m[i] != "" {
			itemId = m[i]
			break
		}
	}
	if itemId == "" {
		reAnyNum := regexp.MustCompile(`/(\d{6,9})(?:[/?#]|$)`)
		if m2 := reAnyNum.FindStringSubmatch(rawUrl); len(m2) > 1 {
			itemId = m2[1]
		}
	}
	if itemId == "" {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось определить ID мода на The Sims Resource"}
	}

	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Jar:     jar,
		Timeout: 25 * time.Second,
	}
	ua := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

	// Опционально парсим страницу мода для получения галереи скриншотов и обложки
	var images []string
	coverImg := ""
	title := "TSR Creation #" + itemId
	author := "TSR Artist"

	normalizeTsrImg := func(u string) string {
		u = strings.TrimSpace(u)
		if strings.HasPrefix(u, "//") {
			return "https:" + u
		}
		if strings.HasPrefix(u, "/") {
			return "https://www.thesimsresource.com" + u
		}
		return u
	}

	pageReq, _ := http.NewRequest("GET", fmt.Sprintf("https://www.thesimsresource.com/downloads/%s", itemId), nil)
	pageReq.Header.Set("User-Agent", ua)
	if pageResp, err := client.Do(pageReq); err == nil {
		b, _ := io.ReadAll(io.LimitReader(pageResp.Body, 1024*1024))
		pageResp.Body.Close()
		htmlStr := string(b)

		reOg := regexp.MustCompile(`<meta[^>]+property="og:image"[^>]+content="([^"]+)"`)
		if mog := reOg.FindStringSubmatch(htmlStr); len(mog) > 1 {
			coverImg = normalizeTsrImg(mog[1])
			images = append(images, coverImg)
		}
		reScaled := regexp.MustCompile(`(?:https?://(?:www\.)?thesimsresource\.com)?/scaled/\d+/w-\d+h-\d+-\d+\.(?:jpg|png)`)
		seenImg := map[string]bool{coverImg: true}
		for _, imgMatch := range reScaled.FindAllString(htmlStr, 12) {
			hiRes := normalizeTsrImg(regexp.MustCompile(`w-\d+h-\d+`).ReplaceAllString(imgMatch, "w-800h-600"))
			if !seenImg[hiRes] {
				seenImg[hiRes] = true
				images = append(images, hiRes)
			}
		}
	}

	// Шаг 1: Инициализация сессии скачивания (устанавливает куку tsrdlsession)
	sessUrl := fmt.Sprintf("https://www.thesimsresource.com/downloads/session/itemId/%s", itemId)
	req1, _ := http.NewRequest("GET", sessUrl, nil)
	req1.Header.Set("User-Agent", ua)
	req1.Header.Set("Referer", rawUrl)
	if resp1, err := client.Do(req1); err == nil {
		resp1.Body.Close()
	}

	// Шаг 2: Запрос тикета initDownload
	initUrl := fmt.Sprintf("https://www.thesimsresource.com/ajax.php?c=downloads&a=initDownload&itemid=%s&setItems=&format=zip", itemId)
	req2, _ := http.NewRequest("GET", initUrl, nil)
	req2.Header.Set("User-Agent", ua)
	req2.Header.Set("X-Requested-With", "XMLHttpRequest")
	req2.Header.Set("Referer", rawUrl)
	resp2, err := client.Do(req2)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, ImageUrl: coverImg, Images: images, Reason: "Ошибка инициализации загрузки TSR"}
	}
	var initPayload struct {
		Error  string `json:"error"`
		Ticket string `json:"ticket"`
		Url    string `json:"url"`
	}
	_ = json.NewDecoder(resp2.Body).Decode(&initPayload)
	resp2.Body.Close()

	if initPayload.Ticket == "" {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, ImageUrl: coverImg, Images: images, Reason: "TSR не выдал тикет скачивания"}
	}

	// Шаг 3: Запуск серверного таймера ожидания на странице тикета
	ticketPageUrl := fmt.Sprintf("https://www.thesimsresource.com/downloads/download/itemId/%s/ticket/%s", itemId, initPayload.Ticket)
	req3, _ := http.NewRequest("GET", ticketPageUrl, nil)
	req3.Header.Set("User-Agent", ua)
	req3.Header.Set("Referer", rawUrl)
	if resp3, err := client.Do(req3); err == nil {
		resp3.Body.Close()
	}

	// Шаг 4: Ожидание бесплатного таймера TSR (8.5 секунд)
	time.Sleep(8500 * time.Millisecond)

	// Шаг 5: Получение финальной подписанной ссылки CDN
	finalApiUrl := fmt.Sprintf("https://www.thesimsresource.com/ajax.php?c=downloads&a=getdownloadurl&ajax=1&itemid=%s&mid=0&lk=0&ticket=%s", itemId, initPayload.Ticket)
	req5, _ := http.NewRequest("GET", finalApiUrl, nil)
	req5.Header.Set("User-Agent", ua)
	req5.Header.Set("X-Requested-With", "XMLHttpRequest")
	req5.Header.Set("Referer", ticketPageUrl)
	resp5, err := client.Do(req5)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, ImageUrl: coverImg, Images: images, Reason: "Ошибка получения финальной ссылки TSR"}
	}
	defer resp5.Body.Close()

	var dlPayload struct {
		Error      string `json:"error"`
		Url        string `json:"url"`
		PreviewUrl string `json:"previewUrl"`
		Data       struct {
			Title  string `json:"title"`
			Artist string `json:"artist"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp5.Body).Decode(&dlPayload); err != nil || dlPayload.Url == "" {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, ImageUrl: coverImg, Images: images, Reason: "Не удалось получить прямую ссылку TSR"}
	}

	if dlPayload.Data.Title != "" {
		title = html.UnescapeString(dlPayload.Data.Title)
	}
	if dlPayload.Data.Artist != "" {
		author = html.UnescapeString(dlPayload.Data.Artist)
	}
	if dlPayload.PreviewUrl != "" {
		hiPrev := normalizeTsrImg(regexp.MustCompile(`w-\d+h-\d+`).ReplaceAllString(dlPayload.PreviewUrl, "w-800h-600"))
		if coverImg == "" {
			coverImg = hiPrev
		}
		if len(images) == 0 {
			images = append(images, hiPrev)
		}
	}

	fn := probeFilename(dlPayload.Url)
	if fn == "" || strings.HasPrefix(strings.ToLower(fn), "file_rev") {
		ext := ".package"
		if uParsed, err := url.Parse(dlPayload.Url); err == nil && uParsed != nil {
			if e := filepath.Ext(uParsed.Path); IsInstallable("a" + e) {
				ext = e
			}
		}
		cleanTitle := regexp.MustCompile(`[<>:"/\\|?*]`).ReplaceAllString(title, "_")
		cleanAuthor := regexp.MustCompile(`[<>:"/\\|?*]`).ReplaceAllString(author, "_")
		fn = fmt.Sprintf("%s - %s%s", cleanAuthor, cleanTitle, ext)
	}

	return ResolvedLink{
		Ok:         true,
		Id:         "resolved:tsr:" + itemId,
		Title:      title,
		Author:     author,
		SourceType: "tsr",
		Url:        rawUrl,
		DirectUrl:  dlPayload.Url,
		FileName:   fn,
		ImageUrl:   coverImg,
		Images:     images,
		Via:        "tsr",
		Downloads:  []DownloadFile{{Name: fn, Url: dlPayload.Url, Via: "tsr"}},
	}
}

func extractItchCsrf(htmlStr string) string {
	re1 := regexp.MustCompile(`name=["']csrf_token["'][^>]*value=["']([^"']+)["']`)
	if m := re1.FindStringSubmatch(htmlStr); len(m) > 1 {
		return m[1]
	}
	re2 := regexp.MustCompile(`value=["']([^"']+)["'][^>]*name=["']csrf_token["']`)
	if m := re2.FindStringSubmatch(htmlStr); len(m) > 1 {
		return m[1]
	}
	return ""
}

// 2. Itch.io — мгновенный резолвинг бесплатных модов без таймеров через CSRF API
func resolveItchIO(rawUrl string) ResolvedLink {
	m := itchIoRe.FindStringSubmatch(rawUrl)
	if len(m) < 3 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Некорректный адрес страницы Itch.io"}
	}
	creator := m[1]
	slug := m[2]
	basePageUrl := fmt.Sprintf("https://%s.itch.io/%s", creator, slug)

	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 15 * time.Second}
	ua := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

	req1, _ := http.NewRequest("GET", basePageUrl, nil)
	req1.Header.Set("User-Agent", ua)
	resp1, err := client.Do(req1)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось загрузить страницу Itch.io"}
	}
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp1.Body, 2*1024*1024))
	resp1.Body.Close()
	htmlStr := string(bodyBytes)

	csrfToken := extractItchCsrf(htmlStr)
	if csrfToken == "" {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "CSRF токен Itch.io не найден"}
	}

	title := slug
	reTitle := regexp.MustCompile(`<meta[^>]+property="og:title"[^>]+content="([^"]+)"|<title>([^<]+)</title>`)
	if mt := reTitle.FindStringSubmatch(htmlStr); len(mt) > 1 {
		t := mt[1]
		if t == "" && len(mt) > 2 {
			t = mt[2]
		}
		title = strings.TrimSpace(html.UnescapeString(t))
	}

	var images []string
	coverImg := ""
	reOgImg := regexp.MustCompile(`<meta[^>]+property="og:image"[^>]+content="([^"]+)"|<meta[^>]+content="([^"]+)"[^>]+property="og:image"`)
	if mi := reOgImg.FindStringSubmatch(htmlStr); len(mi) > 1 {
		rawOg := mi[1]
		if rawOg == "" && len(mi) > 2 {
			rawOg = mi[2]
		}
		if rawOg != "" {
			coverImg = regexp.MustCompile(`/\d+x\d+(?:c)?/`).ReplaceAllString(rawOg, "/original/")
			images = append(images, coverImg)
		}
	}
	reShots := regexp.MustCompile(`href=["'](https://img\.itch\.zone/[^"']+)["']`)
	seenImg := map[string]bool{coverImg: true}
	for _, ms := range reShots.FindAllStringSubmatch(htmlStr, 10) {
		if len(ms) > 1 && !seenImg[ms[1]] {
			seenImg[ms[1]] = true
			images = append(images, ms[1])
		}
	}

	// Сначала проверяем прямые upload_id на самой странице
	reUploads := regexp.MustCompile(`data-upload_id="(\d+)"`)
	uploadMatches := reUploads.FindAllStringSubmatch(htmlStr, -1)
	dlPageHtml := htmlStr
	dlPageReferer := basePageUrl
	fromDownloadPage := false

	// Если прямых кнопок нет (требуется переход через /download_url)
	if len(uploadMatches) == 0 {
		form := url.Values{"csrf_token": {csrfToken}}
		req2, _ := http.NewRequest("POST", basePageUrl+"/download_url", strings.NewReader(form.Encode()))
		req2.Header.Set("User-Agent", ua)
		req2.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
		req2.Header.Set("X-Requested-With", "XMLHttpRequest")
		req2.Header.Set("Referer", basePageUrl)
		if resp2, err := client.Do(req2); err == nil {
			var dlUrlRes struct {
				Url string `json:"url"`
			}
			_ = json.NewDecoder(resp2.Body).Decode(&dlUrlRes)
			resp2.Body.Close()
			if dlUrlRes.Url != "" {
				req3, _ := http.NewRequest("GET", dlUrlRes.Url, nil)
				req3.Header.Set("User-Agent", ua)
				req3.Header.Set("Referer", basePageUrl)
				if resp3, err := client.Do(req3); err == nil {
					b3, _ := io.ReadAll(io.LimitReader(resp3.Body, 2*1024*1024))
					resp3.Body.Close()
					dlPageHtml = string(b3)
					dlPageReferer = dlUrlRes.Url
					fromDownloadPage = true
					uploadMatches = reUploads.FindAllStringSubmatch(dlPageHtml, -1)
					if c2 := extractItchCsrf(dlPageHtml); c2 != "" {
						csrfToken = c2
					}
				}
			}
		}
	}

	// Извлекаем названия файлов рядом с upload_id
	reUploadBlock := regexp.MustCompile(`data-upload_id="(\d+)"[\s\S]{0,600}?class="name"[^>]*>([^<]+)<`)
	nameByUpload := make(map[string]string)
	for _, mb := range reUploadBlock.FindAllStringSubmatch(dlPageHtml, -1) {
		if len(mb) > 2 {
			nameByUpload[mb[1]] = strings.TrimSpace(html.UnescapeString(mb[2]))
		}
	}

	var downloads []DownloadFile
	seenUp := make(map[string]bool)

	for _, um := range uploadMatches {
		if len(um) < 2 {
			continue
		}
		upId := um[1]
		if seenUp[upId] {
			continue
		}
		seenUp[upId] = true

		form := url.Values{"csrf_token": {csrfToken}}
		fileEndpoint := fmt.Sprintf("%s/file/%s", basePageUrl, upId)
		if !fromDownloadPage {
			fileEndpoint += "?source=view_game&as_props=1"
		}
		reqF, _ := http.NewRequest("POST", fileEndpoint, strings.NewReader(form.Encode()))
		reqF.Header.Set("User-Agent", ua)
		reqF.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
		reqF.Header.Set("X-Requested-With", "XMLHttpRequest")
		reqF.Header.Set("Referer", dlPageReferer)

		respF, err := client.Do(reqF)
		if err != nil {
			continue
		}
		var fileRes struct {
			Url      string `json:"url"`
			External bool   `json:"external"`
		}
		_ = json.NewDecoder(respF.Body).Decode(&fileRes)
		respF.Body.Close()

		if fileRes.Url == "" {
			continue
		}

		niceLabel := nameByUpload[upId]
		if niceLabel != "" {
			niceLabel = regexp.MustCompile(`[<>:"/\\|?*]`).ReplaceAllString(niceLabel, " ")
			niceLabel = strings.Join(strings.Fields(niceLabel), " ")
		}

		// Если автор прикрепил внешнюю ссылку (например Box/GDrive/SFS)
		if fileRes.External && !strings.Contains(fileRes.Url, "itch.zone") && !strings.Contains(fileRes.Url, "itchio") {
			sub := resolveLinkInternal(fileRes.Url, 1)
			if sub.Ok && len(sub.Downloads) > 0 {
				for _, d := range sub.Downloads {
					if niceLabel != "" && len(sub.Downloads) == 1 {
						ext := filepath.Ext(d.Name)
						if ext == "" {
							ext = ".zip"
						}
						if !IsInstallable(niceLabel) {
							d.Name = niceLabel + ext
						} else {
							d.Name = niceLabel
						}
					}
					downloads = append(downloads, d)
				}
				continue
			}
		}

		fn := niceLabel
		if fn == "" {
			fn = probeFilename(fileRes.Url)
		}
		if fn == "" {
			fn = fmt.Sprintf("%s_%s.zip", slug, upId)
		} else if !IsInstallable(fn) {
			fn += ".zip"
		}

		downloads = append(downloads, DownloadFile{
			Name: fn,
			Url:  fileRes.Url,
			Via:  "itchio",
		})
	}

	if len(downloads) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, ImageUrl: coverImg, Images: images, Reason: "На странице Itch.io не найдено бесплатных файлов для скачивания"}
	}

	return ResolvedLink{
		Ok:         true,
		Id:         fmt.Sprintf("resolved:itchio:%s:%s", creator, slug),
		Title:      title,
		Author:     creator,
		SourceType: "itchio",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		ImageUrl:   coverImg,
		Images:     images,
		Via:        "itchio",
		Downloads:  downloads,
	}
}

// 3. GitHub Releases / Repo — скачивание скриптовых модов и библиотек через официальный GitHub API
func resolveGitHubRelease(rawUrl string) ResolvedLink {
	m := githubRelRe.FindStringSubmatch(rawUrl)
	if len(m) < 3 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Некорректная ссылка на репозиторий GitHub"}
	}
	owner := m[1]
	repo := strings.TrimSuffix(m[2], ".git")
	tag := ""
	if len(m) > 3 {
		tag = m[3]
	}

	apiUrl := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", owner, repo)
	if tag != "" {
		apiUrl = fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/tags/%s", owner, repo, tag)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", apiUrl, nil)
	req.Header.Set("User-Agent", "Sims4ModManager/2.0")
	req.Header.Set("Accept", "application/vnd.github+json")

	coverImg := fmt.Sprintf("https://opengraph.githubassets.com/1/%s/%s", owner, repo)
	images := []string{coverImg}
	var downloads []DownloadFile
	title := repo
	avatarUrl := fmt.Sprintf("https://github.com/%s.png?size=120", owner)

	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		var release struct {
			Name    string `json:"name"`
			TagName string `json:"tag_name"`
			Body    string `json:"body"`
			HtmlUrl string `json:"html_url"`
			Author  struct {
				Login     string `json:"login"`
				AvatarUrl string `json:"avatar_url"`
			} `json:"author"`
			Assets []struct {
				Name               string `json:"name"`
				BrowserDownloadUrl string `json:"browser_download_url"`
			} `json:"assets"`
		}

		if json.NewDecoder(resp.Body).Decode(&release) == nil {
			for _, a := range release.Assets {
				if IsInstallable(a.Name) && a.BrowserDownloadUrl != "" {
					downloads = append(downloads, DownloadFile{
						Name: a.Name,
						Url:  a.BrowserDownloadUrl,
						Via:  "github",
					})
				}
			}
			reMdImg := regexp.MustCompile(`!\[[^\]]*\]\((https?://[^\s)]+\.(?:png|jpg|jpeg|webp|gif)[^\s)]*)\)`)
			for _, im := range reMdImg.FindAllStringSubmatch(release.Body, 8) {
				if len(im) > 1 {
					images = append(images, im[1])
				}
			}
			if release.Name != "" {
				title = release.Name
			} else if release.TagName != "" {
				title = fmt.Sprintf("%s (%s)", repo, release.TagName)
			}
			if release.Author.AvatarUrl != "" {
				avatarUrl = release.Author.AvatarUrl
			}
		}
	}

	// Fallback: если у репозитория нет оформленного Release с .zip/.package ассетами, скачиваем zip-архив главной ветки репозитория
	if len(downloads) == 0 {
		zipUrl := fmt.Sprintf("https://api.github.com/repos/%s/%s/zipball", owner, repo)
		if tag != "" {
			zipUrl = fmt.Sprintf("https://api.github.com/repos/%s/%s/zipball/%s", owner, repo, tag)
		}
		downloads = append(downloads, DownloadFile{
			Name: fmt.Sprintf("%s-%s.zip", owner, repo),
			Url:  zipUrl,
			Via:  "github",
		})
	}

	return ResolvedLink{
		Ok:         true,
		Id:         fmt.Sprintf("resolved:github:%s/%s", owner, repo),
		Title:      title,
		Author:     owner,
		AvatarUrl:  avatarUrl,
		SourceType: "github",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		ImageUrl:   coverImg,
		Images:     images,
		Via:        "github",
		Downloads:  downloads,
	}
}

// 4. Boosty — резолвинг поста креатора через публичный API Boosty
func resolveBoostyPost(blog, postId, rawUrl string, hop int) ResolvedLink {
	apiUrl := fmt.Sprintf("https://api.boosty.to/v1/blog/%s/post/%s", blog, postId)
	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", apiUrl, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Ошибка запроса к Boosty API"}
	}
	defer resp.Body.Close()

	var post struct {
		Id          string `json:"id"`
		Title       string `json:"title"`
		HasAccess   bool   `json:"hasAccess"`
		SignedQuery string `json:"signedQuery"`
		User        struct {
			Name      string `json:"name"`
			AvatarUrl string `json:"avatarUrl"`
		} `json:"user"`
		Teaser []struct {
			Type string `json:"type"`
			Url  string `json:"url"`
		} `json:"teaser"`
		Data []struct {
			Type    string `json:"type"`
			Url     string `json:"url"`
			Title   string `json:"title"`
			Content string `json:"content"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&post); err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось прочитать ответ Boosty API"}
	}

	var images []string
	seenImg := make(map[string]bool)
	for _, b := range post.Data {
		if b.Type == "image" && b.Url != "" && !seenImg[b.Url] {
			seenImg[b.Url] = true
			images = append(images, b.Url)
		}
	}
	for _, t := range post.Teaser {
		if t.Type == "image" && t.Url != "" && !seenImg[t.Url] {
			seenImg[t.Url] = true
			images = append(images, t.Url)
		}
	}
	coverImg := ""
	if len(images) > 0 {
		coverImg = images[0]
	}

	if !post.HasAccess {
		return ResolvedLink{
			Ok:        false,
			OpenUrl:   rawUrl,
			ImageUrl:  coverImg,
			Images:    images,
			AvatarUrl: post.User.AvatarUrl,
			Locked:    true,
			Reason:    "Этот пост на Boosty доступен только платным подписчикам",
		}
	}

	var downloads []DownloadFile
	seenDl := make(map[string]bool)
	var candidateLinks []string
	seenCand := make(map[string]bool)
	reRawUrl := regexp.MustCompile(`https?://[^\s"'<>\\]+`)

	addCand := func(u string) {
		u = strings.TrimSpace(strings.TrimRight(u, ".,);\"'"))
		if u != "" && !seenCand[u] && !strings.Contains(u, "t.me/") && !strings.Contains(u, "vk.com/") && !strings.Contains(u, "/donate") {
			seenCand[u] = true
			candidateLinks = append(candidateLinks, u)
		}
	}

	for _, b := range post.Data {
		if b.Type == "file" && b.Url != "" && IsInstallable(b.Title) {
			// Файлы cdn.boosty.to/file/ без signedQuery возвращают HTTP 403 Forbidden
			if strings.Contains(b.Url, "cdn.boosty.to/file/") && post.SignedQuery == "" {
				continue
			}
			dlUrl := b.Url
			if post.SignedQuery != "" {
				if strings.Contains(dlUrl, "?") {
					dlUrl += "&" + strings.TrimPrefix(post.SignedQuery, "?")
				} else {
					dlUrl += "?" + strings.TrimPrefix(post.SignedQuery, "?")
				}
			}
			if !seenDl[dlUrl] {
				seenDl[dlUrl] = true
				downloads = append(downloads, DownloadFile{
					Name: b.Title,
					Url:  dlUrl,
					Via:  "boosty",
				})
			}
		} else if b.Type == "link" && b.Url != "" {
			addCand(b.Url)
		} else if b.Type == "text" && b.Content != "" {
			for _, m := range reRawUrl.FindAllString(b.Content, -1) {
				addCand(m)
			}
		}
	}

	if len(downloads) == 0 && hop < 2 {
		for _, link := range candidateLinks {
			if strings.EqualFold(link, rawUrl) {
				continue
			}
			sub := resolveLinkInternal(link, hop+1)
			if sub.Ok && len(sub.Downloads) > 0 {
				for _, d := range sub.Downloads {
					if !seenDl[d.Url] {
						seenDl[d.Url] = true
						downloads = append(downloads, d)
					}
				}
			}
		}
	}

	if len(downloads) == 0 {
		return ResolvedLink{
			Ok:        false,
			OpenUrl:   rawUrl,
			ImageUrl:  coverImg,
			Images:    images,
			AvatarUrl: post.User.AvatarUrl,
			Reason:    "В посте Boosty не найдено файлов модов для прямого скачивания",
		}
	}

	author := post.User.Name
	if author == "" {
		author = blog
	}
	title := post.Title
	if title == "" {
		title = fmt.Sprintf("Boosty · %s", author)
	}

	return ResolvedLink{
		Ok:         true,
		Id:         fmt.Sprintf("resolved:boosty:%s:%s", blog, postId),
		Title:      title,
		Author:     author,
		AvatarUrl:  post.User.AvatarUrl,
		SourceType: "boosty",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		ImageUrl:   coverImg,
		Images:     images,
		Via:        "boosty",
		Downloads:  downloads,
	}
}

// 4b. Tumblr Post — резолвинг поста Tumblr через публичный JSONP API (/api/read/json?id=...)
func resolveTumblrPost(blog, postId, rawUrl string, hop int) ResolvedLink {
	blog = strings.TrimSpace(strings.TrimSuffix(blog, ".tumblr.com"))
	if blog == "" || postId == "" {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Некорректная ссылка на пост Tumblr"}
	}

	apiUrl := fmt.Sprintf("https://%s.tumblr.com/api/read/json?id=%s", blog, postId)
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: err.Error()}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Ошибка запроса к Tumblr API"}
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Ошибка чтения ответа Tumblr"}
	}

	raw := string(bodyBytes)
	firstBrace := strings.Index(raw, "{")
	lastBrace := strings.LastIndex(raw, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		if hop < 2 {
			return resolveGenericPage(rawUrl, hop)
		}
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось прочитать пост Tumblr"}
	}

	var payload struct {
		Tumblelog struct {
			Title string `json:"title"`
			Name  string `json:"name"`
		} `json:"tumblelog"`
		Posts []struct {
			RegularTitle string `json:"regular-title"`
			RegularBody  string `json:"regular-body"`
			PhotoCaption string `json:"photo-caption"`
			PhotoUrl1280 string `json:"photo-url-1280"`
			Photos       []struct {
				PhotoUrl1280 string `json:"photo-url-1280"`
			} `json:"photos"`
		} `json:"posts"`
	}

	if err := json.Unmarshal([]byte(raw[firstBrace:lastBrace+1]), &payload); err != nil || len(payload.Posts) == 0 {
		if hop < 2 {
			return resolveGenericPage(rawUrl, hop)
		}
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Пост Tumblr не найден"}
	}

	p := payload.Posts[0]
	contentHtml := p.RegularBody + "\n" + p.PhotoCaption
	images := ExtractTumblrHighResImages(contentHtml, p.PhotoUrl1280)
	for _, ph := range p.Photos {
		if ph.PhotoUrl1280 != "" {
			images = append(images, ph.PhotoUrl1280)
		}
	}
	coverImg := ""
	if len(images) > 0 {
		coverImg = images[0]
	}

	var downloads []DownloadFile
	seenDl := make(map[string]bool)
	if hop < 2 {
		candidates := findKnownLinks(contentHtml)
		for _, cand := range candidates {
			sub := resolveLinkInternal(cand, hop+1)
			if sub.Ok && len(sub.Downloads) > 0 {
				for _, d := range sub.Downloads {
					if !seenDl[d.Url] {
						seenDl[d.Url] = true
						downloads = append(downloads, d)
					}
				}
				if len(downloads) >= 6 {
					break
				}
			}
		}
	}

	if len(downloads) == 0 {
		return ResolvedLink{
			Ok:       false,
			OpenUrl:  rawUrl,
			ImageUrl: coverImg,
			Images:   images,
			Reason:   "В посте Tumblr не найдено прямых ссылок на скачивание мода",
		}
	}

	author := payload.Tumblelog.Title
	if author == "" {
		author = blog
	}
	title := strings.TrimSpace(p.RegularTitle)
	if title == "" {
		title = strings.TrimSuffix(downloads[0].Name, filepath.Ext(downloads[0].Name))
	}

	return ResolvedLink{
		Ok:         true,
		Id:         fmt.Sprintf("resolved:tumblr:%s:%s", blog, postId),
		Title:      title,
		Author:     author,
		AvatarUrl:  fmt.Sprintf("https://api.tumblr.com/v2/blog/%s.tumblr.com/avatar/512", blog),
		SourceType: "tumblr",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		ImageUrl:   coverImg,
		Images:     images,
		Via:        "tumblr",
		Downloads:  downloads,
	}
}

// 5. Kemono (зеркало постов Patreon/Boosty/Gumroad) — обход DDoS-Guard через заголовок Accept: text/css
func resolveKemono(rawUrl string) ResolvedLink {
	m := kemonoPostRe.FindStringSubmatch(rawUrl)
	if len(m) < 4 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Некорректная ссылка Kemono"}
	}
	service := m[1]
	userId := m[2]
	postId := m[3]

	apiUrl := fmt.Sprintf("https://kemono.cr/api/v1/%s/user/%s/post/%s", service, userId, postId)
	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", apiUrl, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "text/css")

	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Ошибка подключения к Kemono API"}
	}
	defer resp.Body.Close()

	var payload struct {
		Post struct {
			Id      string `json:"id"`
			User    string `json:"user"`
			Title   string `json:"title"`
			Content string `json:"content"`
			File    struct {
				Name string `json:"name"`
				Path string `json:"path"`
			} `json:"file"`
			Attachments []struct {
				Name string `json:"name"`
				Path string `json:"path"`
			} `json:"attachments"`
		} `json:"post"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось распарсить ответ Kemono API"}
	}

	var downloads []DownloadFile
	var images []string
	seen := make(map[string]bool)

	checkEntry := func(name, path string) {
		if path == "" {
			return
		}
		if name == "" {
			name = filepath.Base(path)
		}
		lower := strings.ToLower(name)
		if strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg") || strings.HasSuffix(lower, ".png") || strings.HasSuffix(lower, ".webp") {
			imgU := "https://img.kemono.cr/thumbnail/data" + path
			if !seen[imgU] {
				seen[imgU] = true
				images = append(images, imgU)
			}
			return
		}
		if IsInstallable(name) {
			dlU := fmt.Sprintf("https://kemono.cr/data%s?f=%s", path, url.QueryEscape(name))
			if !seen[dlU] {
				seen[dlU] = true
				downloads = append(downloads, DownloadFile{Name: name, Url: dlU, Via: "kemono"})
			}
		}
	}

	checkEntry(payload.Post.File.Name, payload.Post.File.Path)
	for _, att := range payload.Post.Attachments {
		checkEntry(att.Name, att.Path)
	}

	if len(downloads) == 0 && payload.Post.Content != "" {
		for _, cand := range findKnownLinks(payload.Post.Content) {
			sub := resolveLinkInternal(cand, 1)
			if sub.Ok && len(sub.Downloads) > 0 {
				downloads = append(downloads, sub.Downloads...)
			}
		}
	}

	coverImg := ""
	if len(images) > 0 {
		coverImg = images[0]
	}

	if len(downloads) == 0 {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, ImageUrl: coverImg, Images: images, Reason: "В посте Kemono нет файлов модов"}
	}

	return ResolvedLink{
		Ok:         true,
		Id:         fmt.Sprintf("resolved:kemono:%s:%s", userId, postId),
		Title:      payload.Post.Title,
		Author:     payload.Post.User,
		SourceType: "patreon",
		Url:        rawUrl,
		DirectUrl:  downloads[0].Url,
		FileName:   downloads[0].Name,
		ImageUrl:   coverImg,
		Images:     images,
		Via:        "kemono",
		Downloads:  downloads,
	}
}

// 6. SimsFinds — извлечение обложки и переход по внешней ссылке креатора
func resolveSimsFinds(rawUrl string, hop int) ResolvedLink {
	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", rawUrl, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return ResolvedLink{Ok: false, OpenUrl: rawUrl, Reason: "Не удалось загрузить страницу SimsFinds"}
	}
	defer resp.Body.Close()

	b, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	htmlStr := string(b)

	sfTitle := ""
	reTitle := regexp.MustCompile(`<meta[^>]+property="og:title"[^>]+content="([^"]+)"|<title>([^<]+)</title>`)
	if mt := reTitle.FindStringSubmatch(htmlStr); len(mt) > 1 {
		t := mt[1]
		if t == "" && len(mt) > 2 {
			t = mt[2]
		}
		sfTitle = strings.TrimSpace(html.UnescapeString(t))
	}

	coverImg := ""
	reOg := regexp.MustCompile(`<meta[^>]+property="og:image"[^>]+content="([^"]+)"`)
	if m := reOg.FindStringSubmatch(htmlStr); len(m) > 1 {
		coverImg = m[1]
	}

	var images []string
	seenImg := make(map[string]bool)
	addSfImg := func(u string) {
		u = strings.TrimSpace(u)
		if u != "" && !seenImg[u] {
			seenImg[u] = true
			images = append(images, u)
		}
	}

	if coverImg != "" {
		org := strings.Replace(coverImg, "-big.", "-org.", 1)
		org = strings.Replace(org, "-gnd.", "-org.", 1)
		addSfImg(org)
		addSfImg(coverImg)
	}

	reSfImg := regexp.MustCompile(`https://img\.simsfinds\.com(?:\.br)?/downloads/[^\s"'<>]+`)
	for _, im := range reSfImg.FindAllString(htmlStr, 10) {
		org := strings.Replace(im, "-big.", "-org.", 1)
		org = strings.Replace(org, "-gnd.", "-org.", 1)
		addSfImg(org)
		addSfImg(im)
	}
	if coverImg == "" && len(images) > 0 {
		coverImg = images[0]
	}

	reGo := regexp.MustCompile(`https?://click\.simsfinds\.com/go\?[^\s"'<>]+`)
	for _, goLink := range reGo.FindAllString(htmlStr, 5) {
		decoded := DecodeOutboundRedirect(goLink)
		if decoded != "" && decoded != goLink && hop < 3 {
			sub := resolveLinkInternal(decoded, hop+1)
			if sub.Ok {
				if sub.ImageUrl == "" || strings.Contains(sub.ImageUrl, "card-teaser-image") {
					sub.ImageUrl = coverImg
				}
				if len(sub.Images) == 0 {
					sub.Images = images
				}
				if sfTitle != "" && (sub.Title == "" || sub.Title == "1" || strings.HasPrefix(sub.Title, "c/")) {
					sub.Title = sfTitle
				}
				return sub
			}
		}
	}

	for _, cand := range findKnownLinks(htmlStr) {
		if hop < 3 {
			sub := resolveLinkInternal(cand, hop+1)
			if sub.Ok {
				if sub.ImageUrl == "" || strings.Contains(sub.ImageUrl, "card-teaser-image") {
					sub.ImageUrl = coverImg
				}
				if len(sub.Images) == 0 {
					sub.Images = images
				}
				if sfTitle != "" && (sub.Title == "" || sub.Title == "1" || strings.HasPrefix(sub.Title, "c/")) {
					sub.Title = sfTitle
				}
				return sub
			}
		}
	}

	return ResolvedLink{
		Ok:       false,
		OpenUrl:  rawUrl,
		Title:    sfTitle,
		ImageUrl: coverImg,
		Images:   images,
		Reason:   "На странице SimsFinds не найдена прямая ссылка на скачивание",
	}
}

// 7. Pinterest Internal API (PinResource/get) — извлечение original обложки и внешней ссылки креатора
func fetchPinterestPinAPI(pinId string) (targetLink string, origImg string, title string, author string, avatar string) {
	csrfBytes := make([]byte, 16)
	_, _ = rand.Read(csrfBytes)
	csrfToken := hex.EncodeToString(csrfBytes)

	optsJson := fmt.Sprintf(`{"options":{"id":"%s","field_set_key":"detailed"}}`, pinId)
	apiUrl := fmt.Sprintf("https://www.pinterest.com/resource/PinResource/get/?data=%s&source_url=%s",
		url.QueryEscape(optsJson),
		url.QueryEscape("/pin/"+pinId+"/"),
	)

	client := &http.Client{Timeout: 12 * time.Second}
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err != nil {
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json, text/javascript, */*, q=0.01")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.Header.Set("X-Pinterest-AppState", "active")
	req.Header.Set("X-Pinterest-PWS-Handler", "www/[username].js")
	req.Header.Set("X-CSRFToken", csrfToken)
	req.Header.Set("Cookie", "csrftoken="+csrfToken)
	req.Header.Set("Referer", "https://www.pinterest.com/pin/"+pinId+"/")

	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var payload struct {
		ResourceResponse struct {
			Data struct {
				Title       string `json:"title"`
				GridTitle   string `json:"grid_title"`
				Description string `json:"description"`
				Link        string `json:"link"`
				UtmLink     string `json:"utm_link"`
				RichSummary struct {
					Url         string `json:"url"`
					DisplayName string `json:"display_name"`
				} `json:"rich_summary"`
				Images struct {
					Orig struct {
						Url string `json:"url"`
					} `json:"orig"`
					Large struct {
						Url string `json:"url"`
					} `json:"736x"`
				} `json:"images"`
				Pinner struct {
					FullName       string `json:"full_name"`
					Username       string `json:"username"`
					ImageMediumUrl string `json:"image_medium_url"`
				} `json:"pinner"`
			} `json:"data"`
		} `json:"resource_response"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return
	}

	d := payload.ResourceResponse.Data
	targetLink = d.Link
	if targetLink == "" {
		targetLink = d.RichSummary.Url
	}
	if targetLink == "" {
		targetLink = d.UtmLink
	}
	origImg = d.Images.Orig.Url
	if origImg == "" {
		origImg = d.Images.Large.Url
	}
	title = d.Title
	if title == "" {
		title = d.GridTitle
	}
	author = d.Pinner.FullName
	if author == "" {
		author = d.Pinner.Username
	}
	avatar = d.Pinner.ImageMediumUrl
	return
}

// Извлекает все полноразмерные скриншоты из HTML-контента поста Tumblr (включая srcset 2048w)
func ExtractTumblrHighResImages(htmlContent string, fallback1280 string) []string {
	var images []string
	seen := make(map[string]bool)

	addImg := func(u string) {
		u = strings.TrimSpace(u)
		if u == "" || seen[u] || strings.Contains(u, "avatar") || strings.Contains(u, "assets.tumblr.com") {
			return
		}
		seen[u] = true
		images = append(images, u)
	}

	reSrcset := regexp.MustCompile(`srcset=["']([^"']+)["']`)
	for _, m := range reSrcset.FindAllStringSubmatch(htmlContent, -1) {
		if len(m) > 1 {
			parts := strings.Split(m[1], ",")
			if len(parts) > 0 {
				last := strings.TrimSpace(parts[len(parts)-1])
				fields := strings.Fields(last)
				if len(fields) > 0 && strings.HasPrefix(fields[0], "http") {
					addImg(fields[0])
				}
			}
		}
	}

	if fallback1280 != "" {
		addImg(fallback1280)
	}

	reImg := regexp.MustCompile(`<img[^>]+src=["'](https?://[^"']+)["']`)
	for _, m := range reImg.FindAllStringSubmatch(htmlContent, -1) {
		if len(m) > 1 {
			addImg(m[1])
		}
	}

	return images
}
