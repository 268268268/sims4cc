package downloader

import (
	"testing"
	"sims4cc-wails/backend/discover"
)

func TestExtractMetadataAndQueue(t *testing.T) {
	modId, title, author, img := extractCfMeta(map[string]any{
		"id":   float64(999111),
		"name": "Test CurseForge Mod",
		"authors": []any{
			map[string]any{"name": "TestAuthor"},
		},
		"logo": map[string]any{"thumbnailUrl": "https://example.com/thumb.png"},
	})
	if modId != 999111 || title != "Test CurseForge Mod" || author != "TestAuthor" || img != "https://example.com/thumb.png" {
		t.Fatalf("unexpected CF meta: id=%d title=%s author=%s img=%s", modId, title, author, img)
	}

	itemId, dTitle, dAuthor, dImg, sType := extractDiscoverMeta(map[string]any{
		"id":         "tsr:1795090",
		"title":      "TSR Carpet",
		"author":     "Rirann",
		"imageUrl":   "https://example.com/tsr.jpg",
		"sourceType": "tsr",
	})
	if itemId != "tsr:1795090" || dTitle != "TSR Carpet" || dAuthor != "Rirann" || dImg != "https://example.com/tsr.jpg" || sType != "tsr" {
		t.Fatalf("unexpected Discover meta: id=%s title=%s author=%s type=%s", itemId, dTitle, dAuthor, sType)
	}
}

func TestNewDiscoverFeedsLive(t *testing.T) {
	// 1. TSR Feed
	tsrItems, nextPg, err := discover.FetchTsrFeedAdvanced(1, "")
	if err != nil {
		t.Fatalf("FetchTsrFeedAdvanced err: %v", err)
	}
	t.Logf("[TSR] Fetched %d items (nextPage=%d)", len(tsrItems), nextPg)
	if len(tsrItems) == 0 {
		t.Errorf("Expected >0 TSR items")
	}

	// 2. Itch.io Feed
	itchItems, err := discover.FetchItchFeed(discover.Source{
		Id:    "i_adeepindigo",
		Type:  "itch",
		Input: "adeepindigomods",
		Label: "adeepindigo",
	})
	if err != nil {
		t.Fatalf("FetchItchFeed err: %v", err)
	}
	t.Logf("[Itch.io] Fetched %d items", len(itchItems))
	if len(itchItems) == 0 {
		t.Errorf("Expected >0 Itch.io items")
	}

	// 3. GitHub Releases Feed
	ghItems, ghNext, err := discover.FetchGitHubFeed(discover.Source{
		Id:    "gh_s4cl",
		Type:  "github",
		Input: "DeviantGameMods/Sims4CommunityLibrary",
		Label: "Sims 4 Community Library",
	}, 1)
	if err != nil {
		t.Fatalf("FetchGitHubFeed err: %v", err)
	}
	t.Logf("[GitHub] Fetched %d releases (nextPage=%d)", len(ghItems), ghNext)
	if len(ghItems) == 0 {
		t.Errorf("Expected >0 GitHub releases")
	}
}
