package discover

import (
	"crypto/sha1"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/resolver"
	"sims4cc-wails/backend/scanner"
)

func TestLiveVerifyFeeds(t *testing.T) {
	t.Run("PatreonFeed_okruee", func(t *testing.T) {
		items, nextCursor, err := FetchPatreonFeed(Source{Id: "p_okruee", Type: "patreon", Input: "okruee", Label: "okruee"}, "")
		t.Logf("Patreon (okruee) items: %d, nextCursor=%q, err=%v", len(items), nextCursor, err)
		if err != nil || len(items) == 0 {
			t.Errorf("Expected Patreon items for okruee, got %d (err=%v)", len(items), err)
			return
		}
		first := items[0]
		t.Logf("Sample Patreon item: Title=%q Author=%q AvatarUrl=%q ImageUrl=%q Images=%d Downloads=%d Links=%d",
			first.Title, first.Author, first.AvatarUrl, first.ImageUrl, len(first.Images), len(first.Downloads), len(first.Links))
		if first.AvatarUrl == "" {
			t.Errorf("Expected AvatarUrl for Patreon feed")
		}
		if first.ImageUrl == "" {
			t.Errorf("Expected ImageUrl for Patreon feed")
		}
	})

	t.Run("TumblrFeed_maxismatchccworld", func(t *testing.T) {
		items, err := FetchTumblrFeed(Source{Id: "t_mm", Type: "tumblr", Input: "maxismatchccworld", Label: "Maxis Match CC World"}, 0)
		t.Logf("Tumblr (maxismatchccworld) items: %d, err=%v", len(items), err)
		if err != nil || len(items) == 0 {
			t.Errorf("Expected Tumblr items for maxismatchccworld, got %d (err=%v)", len(items), err)
			return
		}
		first := items[0]
		t.Logf("Sample Tumblr item: Title=%q AvatarUrl=%q ImageUrl=%q Images=%d Links=%v",
			first.Title, first.AvatarUrl, first.ImageUrl, len(first.Images), first.Links)
		if first.AvatarUrl == "" {
			t.Errorf("Expected AvatarUrl for Tumblr feed")
		}
	})

	t.Run("TumblrTagFeed_ts4cc", func(t *testing.T) {
		res := FetchTumblrTagFeed(map[string]any{"tags": []string{"ts4cc"}})
		t.Logf("Tumblr Tag (ts4cc) items: %d, ok=%v, err=%q", len(res.Items), res.Ok, res.Error)
		if len(res.Items) == 0 {
			t.Errorf("Expected Tumblr tag items for ts4cc, got 0")
			return
		}
		first := res.Items[0]
		t.Logf("Sample Tumblr Tag item: Title=%q Author=%q AvatarUrl=%q ImageUrl=%q Images=%d Links=%v",
			first.Title, first.Author, first.AvatarUrl, first.ImageUrl, len(first.Images), first.Links)
	})

	t.Run("BoostyFeed_thesimochka", func(t *testing.T) {
		items, nextOffset, err := FetchBoostyFeed(Source{Id: "b_sim", Type: "boosty", Input: "thesimochka", Label: "thesimochka"}, "")
		t.Logf("Boosty (thesimochka) items: %d, nextOffset=%q, err=%v", len(items), nextOffset, err)
		if err != nil || len(items) == 0 {
			t.Errorf("Expected Boosty items for thesimochka, got %d (err=%v)", len(items), err)
			return
		}
		first := items[0]
		t.Logf("Sample Boosty item: Title=%q Author=%q AvatarUrl=%q ImageUrl=%q Images=%d Downloads=%d Links=%d Locked=%v",
			first.Title, first.Author, first.AvatarUrl, first.ImageUrl, len(first.Images), len(first.Downloads), len(first.Links), first.Locked)
	})

	t.Run("ModTheSimsFeed", func(t *testing.T) {
		items := FetchMtsFeed()
		t.Logf("ModTheSims items: %d", len(items))
		if len(items) == 0 {
			t.Errorf("Expected ModTheSims items, got 0")
			return
		}
		t.Logf("Sample MTS item: Title=%q Author=%q ImageUrl=%q Url=%q", items[0].Title, items[0].Author, items[0].ImageUrl, items[0].Url)
	})
}

func TestLiveVerifyResolvers(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{"PatreonPost", "https://www.patreon.com/posts/153849989"},
		{"SimFileShare_File", "https://simfileshare.net/download/5911519/"},
		{"SimFileShare_Folder", "https://simfileshare.net/folder/278345/"},
		{"MediaFire_File", "https://www.mediafire.com/file/xyd35m4et6ogyd6/"},
		{"GoogleDrive_File", "https://drive.google.com/file/d/1w_zVVp1uFrPXQxufGEGfcq2ngekgL83s/view"},
		{"Dropbox_File", "https://www.dropbox.com/scl/fi/r2kd2skcy5ylbbta5y1pz/DJI_0003.MP4?rlkey=wcdgqangn7t3lnmmv6li9mu9h&dl=0"},
		{"GitHub_Release", "https://github.com/DeviantGameMods/Sims4CommunityLibrary/releases"},
		{"ItchIO_EducationOverhaul", "https://adeepindigomods.itch.io/education-overhaul"},
		{"ItchIO_DelinquentTeens", "https://adeepindigomods.itch.io/delinquent-teens"},
		{"Boosty_Post", "https://boosty.to/thesimochka/posts/985c4bbb-1e8e-4549-aa3b-9df97f021f16"},
		{"Kemono_Post", "https://kemono.cr/patreon/user/35626381/post/130854729"},
		{"SimsFinds_Post", "https://www.simsfinds.com/downloads/408200/ruby-set-cardigan-skirt-sims4"},
		{"Pinterest_Pin", "https://www.pinterest.com/pin/587790188899859200/"},
		{"Pinterest_Pin_Alpha", "https://www.pinterest.com/pin/e1_AfqPShxLp6PsWlgXeDFLKN7iyFCIjw6-z4IlgMATSUDSL9Psj-Su/"},
		{"ModTheSims_Mod", "https://modthesims.info/d/701047/scythelord-wall-decorations.html"},
		{"TSR_Mod", "https://www.thesimsresource.com/downloads/1728911"},
		{"Mega_Folder", "https://mega.nz/folder/FkwkiDKa#G2TYoEpAgn75YNv5GfLS8A"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := resolver.ResolveLink(tc.url)
			t.Logf("[%s] Ok=%v Via=%q Title=%q Author=%q FileName=%q DirectUrl=%q ImageUrl=%q Images=%d Downloads=%d Reason=%q",
				tc.name, res.Ok, res.Via, res.Title, res.Author, res.FileName, res.DirectUrl, res.ImageUrl, len(res.Images), len(res.Downloads), res.Reason)
		})
	}
}

func TestLiveVerifySaveExternalThumbnail(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "sims4_thumb_verify_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	pkgPath := filepath.Join(tmpDir, "test_covered_mod.package")
	dbpfDummy := make([]byte, 96)
	copy(dbpfDummy[0:4], []byte("DBPF"))
	if err := os.WriteFile(pkgPath, dbpfDummy, 0644); err != nil {
		t.Fatal(err)
	}

	testImgUrl := "https://opengraph.githubassets.com/1/DeviantGameMods/Sims4CommunityLibrary"
	scanner.SaveExternalThumbnail(tmpDir, testImgUrl)

	h := sha1.Sum([]byte(pkgPath))
	key := hex.EncodeToString(h[:8])
	cacheDir := scanner.GetThumbCacheDir()

	foundCached := ""
	for _, ext := range []string{".jpg", ".png", ".webp"} {
		cand := filepath.Join(cacheDir, key+ext)
		if fi, err := os.Stat(cand); err == nil && fi.Size() > 0 {
			foundCached = cand
			_ = os.Remove(cand)
			break
		}
	}

	if foundCached == "" {
		t.Errorf("Expected cached external thumbnail in %s for key %s, got none!", cacheDir, key)
	} else {
		t.Logf("Verified cached external thumbnail saved at: %s", foundCached)
	}
}

func TestLiveEndToEndDownload(t *testing.T) {
	tmpMods, err := os.MkdirTemp("", "sims4_test_mods_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpMods)

	// Временно переопределяем ModsFolder в config
	cfg := config.ReadConfig()
	origFolder := cfg.ModsFolder
	if strings.Contains(origFolder, "AppData\\Local\\Temp") || origFolder == "" {
		origFolder = "C:\\Users\\pozi2\\Sims4User\\Mods"
	}
	_ = config.SetConfig("modsFolder", tmpMods)
	defer func() {
		_ = config.SetConfig("modsFolder", origFolder)
	}()

	// 1. Тестируем скачивание реального мода через SimFileShare
	sfsRes := resolver.ResolveLink("https://simfileshare.net/download/5911730/")
	if !sfsRes.Ok || len(sfsRes.Downloads) == 0 {
		t.Fatalf("SimFileShare resolve failed: %s", sfsRes.Reason)
	}

	testItem := DiscoverItem{
		Id:          "test_sfs_download",
		Title:       "Vp_pearl-studs",
		ImageUrl:    "https://opengraph.githubassets.com/1/DeviantGameMods/Sims4CommunityLibrary",
		Downloads:   sfsRes.Downloads,
		DownloadUrl: sfsRes.DirectUrl,
	}

	dlRes := DownloadDiscoverItem(nil, testItem)
	t.Logf("DownloadDiscoverItem result: Ok=%v Installed=%v Errors=%v", dlRes.Ok, dlRes.Installed, dlRes.Errors)
	if !dlRes.Ok || len(dlRes.Installed) == 0 {
		t.Fatalf("Download failed: %v", dlRes.Errors)
	}

	installedPath := dlRes.Installed[0]
	data, err := os.ReadFile(installedPath)
	if err != nil {
		t.Fatalf("Failed to read installed file: %v", err)
	}
	if len(data) < 32 {
		t.Fatalf("Installed file too small: %d bytes", len(data))
	}
	header := string(data[:4])
	t.Logf("Downloaded file %q (size=%d bytes), magic header=%q", filepath.Base(installedPath), len(data), header)
	if header != "DBPF" {
		t.Errorf("Expected DBPF header, got %q", header)
	} else {
		t.Logf("VERIFIED: File has valid DBPF binary header!")
	}
}
