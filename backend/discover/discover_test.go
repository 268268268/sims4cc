package discover

import (
	"testing"
)

func TestFetchMtsFeed(t *testing.T) {
	items := FetchMtsFeed()
	if len(items) == 0 {
		t.Fatalf("expected at least 1 item from FetchMtsFeed, got 0")
	}
	first := items[0]
	if first.Title == "" {
		t.Errorf("expected non-empty title")
	}
	if first.SourceType != "modthesims" {
		t.Errorf("expected sourceType modthesims, got %s", first.SourceType)
	}
	if first.Url == "" {
		t.Errorf("expected non-empty url")
	}
}

func TestFetchTumblrTagFeed(t *testing.T) {
	res := FetchTumblrTagFeed(map[string]any{
		"tags": []string{"ts4cc"},
	})
	if !res.Ok {
		t.Fatalf("expected ok true from FetchTumblrTagFeed")
	}
	if len(res.Items) == 0 {
		t.Fatalf("expected at least 1 item from Tumblr tag feed, got 0")
	}
	first := res.Items[0]
	if first.SourceType != "tumblr" {
		t.Errorf("expected sourceType tumblr, got %s", first.SourceType)
	}
	if first.Id == "" {
		t.Errorf("expected non-empty Id")
	}
}

func TestFetchSourceFeedMts(t *testing.T) {
	res := FetchSourceFeed(map[string]any{
		"sourceId": "builtin-mts",
		"sort":     "new",
		"cat":      0,
	})
	if !res.Ok {
		t.Fatalf("expected ok true from FetchSourceFeed builtin-mts, got error: %s", res.Error)
	}
	if len(res.Items) == 0 {
		t.Fatalf("expected items from MTS source feed")
	}
}

func TestGetMtsDetail(t *testing.T) {
	url := "https://modthesims.info/d/701047/scythelord-wall-decorations.html"
	detail := GetMtsDetail(url)
	if !detail.Ok {
		t.Fatalf("expected detail.Ok true, got false")
	}
	if len(detail.Downloads) == 0 {
		t.Fatalf("expected downloads > 0 for MTS mod, got %d", len(detail.Downloads))
	}
}

func TestAddAndGetSavedLink(t *testing.T) {
	entry := map[string]any{
		"id":    "test:entry:123",
		"title": "Test Mod",
		"url":   "https://example.com/mod",
	}
	AddSavedLink(entry)
	links := GetSavedLinks()
	found := false
	for _, l := range links {
		if lm, ok := l.(map[string]any); ok && lm["id"] == "test:entry:123" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected to find saved link with id test:entry:123")
	}
	RemoveSavedLink("test:entry:123")
}

func TestWarmDiscoverCache(t *testing.T) {
	_ = GetCachedDiscover()
	res := FetchDiscover(nil)
	if !res.Ok {
		t.Fatalf("expected FetchDiscover Ok=true")
	}
	patreonSources := 0
	for _, s := range res.Sources {
		if s.Type == "patreon" {
			patreonSources++
		}
	}
	patreonItems := 0
	patreonFree := 0
	patreonPaid := 0
	for _, it := range res.Items {
		if it.SourceType == "patreon" {
			patreonItems++
			if it.Locked {
				patreonPaid++
			} else {
				patreonFree++
			}
		}
	}
	t.Logf("Total sources: %d (Patreon sources: %d), Total items: %d (Patreon: %d, Free: %d, Paid: %d)",
		len(res.Sources), patreonSources, len(res.Items), patreonItems, patreonFree, patreonPaid)
	if patreonSources < 60 {
		t.Fatalf("expected at least 60 Patreon sources, got %d", patreonSources)
	}
	if patreonItems < 500 {
		t.Fatalf("expected at least 500 Patreon items, got %d", patreonItems)
	}
}
