package curseforge

import (
	"testing"
)

func TestMurmur2AndFingerprint(t *testing.T) {
	// Simple test vector for Murmur2
	data := []byte("DBPF\x02\x00\x00\x00test-data")
	fp := ComputeFingerprint(data)
	if fp == 0 {
		t.Fatalf("expected non-zero fingerprint, got 0")
	}

	// Whitespace skipping verification: \t \n \r space should not change fingerprint
	dataWithWs := []byte("DBPF\x02\x00\x00\x00\t \r\ntest-data")
	fpWs := ComputeFingerprint(dataWithWs)
	if fp != fpWs {
		t.Fatalf("fingerprint mismatch with whitespace: %d vs %d", fp, fpWs)
	}
}

func TestPickLatestCfFile(t *testing.T) {
	files := []cfFileItem{
		{Id: 100, FileDate: "2024-01-01T10:00:00Z"},
		{Id: 200, FileDate: "2024-05-01T10:00:00Z"},
		{Id: 150, FileDate: "2024-03-01T10:00:00Z"},
	}
	latest := pickLatestCfFile(files)
	if latest == nil || latest.Id != 200 {
		t.Fatalf("expected file 200, got %+v", latest)
	}
}

func TestPickLatestFileFromMod(t *testing.T) {
	mod := map[string]any{
		"latestFiles": []any{
			map[string]any{"id": float64(10), "fileDate": "2023-01-01T00:00:00Z", "fileName": "old.package"},
			map[string]any{"id": float64(30), "fileDate": "2024-02-01T00:00:00Z", "fileName": "new.package"},
			map[string]any{"id": float64(20), "fileDate": "2023-06-01T00:00:00Z", "fileName": "mid.package"},
		},
	}
	latest := pickLatestFileFromMod(mod)
	if latest == nil {
		t.Fatalf("expected latest file, got nil")
	}
	if latest["id"].(float64) != 30 {
		t.Fatalf("expected file id 30, got %v", latest["id"])
	}
}
