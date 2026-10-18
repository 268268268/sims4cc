package updater

import (
	"testing"
)

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		v1       string
		v2       string
		expected int
	}{
		{"2.0.1", "2.0.0", 1},
		{"v2.0.1", "2.0.0", 1},
		{"2.0.0", "2.0.0", 0},
		{"v2.0.0", "v2.0.0", 0},
		{"1.9.9", "2.0.0", -1},
		{"2.1.0", "2.0.9", 1},
		{"2.0.0", "2.0.1", -1},
		{"2.0.0", "2.0.0-rc1", 1},
		{"2.0.0-rc1", "2.0.0", -1},
	}

	for _, tt := range tests {
		got := CompareVersions(tt.v1, tt.v2)
		if got != tt.expected {
			t.Errorf("CompareVersions(%q, %q) = %d; want %d", tt.v1, tt.v2, got, tt.expected)
		}
	}
}

func TestPickBestAsset(t *testing.T) {
	assets := []GitHubAsset{
		{Name: "source_code.zip", BrowserDownloadURL: "https://example.com/source.zip"},
		{Name: "sims4-mod-manager-v2.0.0-windows-x64.zip", BrowserDownloadURL: "https://example.com/win.zip"},
		{Name: "sims4-mod-manager.exe", BrowserDownloadURL: "https://example.com/exe"},
	}

	best, isZip, err := pickBestAsset(assets)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if best.Name != "sims4-mod-manager.exe" {
		t.Errorf("expected sims4-mod-manager.exe, got %s", best.Name)
	}
	if isZip {
		t.Errorf("expected isZip=false, got true")
	}

	// Test fallback to zip when exe is not present
	zipOnly := []GitHubAsset{
		{Name: "sims4-mod-manager-v2.0.0-windows-x64.zip", BrowserDownloadURL: "https://example.com/win.zip"},
	}
	bestZip, isZip2, err2 := pickBestAsset(zipOnly)
	if err2 != nil {
		t.Fatalf("unexpected error: %v", err2)
	}
	if bestZip.Name != "sims4-mod-manager-v2.0.0-windows-x64.zip" || !isZip2 {
		t.Errorf("expected zip asset and isZip=true")
	}
}
