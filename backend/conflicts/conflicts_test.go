package conflicts

import (
	"os"
	"path/filepath"
	"testing"
)

func TestComputeSha1(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.txt")
	content := []byte("hello world")
	if err := os.WriteFile(testFile, content, 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	h, err := computeSha1(testFile)
	if err != nil {
		t.Fatalf("computeSha1 failed: %v", err)
	}
	expected := "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed"
	if h != expected {
		t.Errorf("Expected hash %s, got %s", expected, h)
	}
}

func TestTypeLabels(t *testing.T) {
	if label, ok := typeLabels[0x034aeecb]; !ok || label != "CAS part" {
		t.Errorf("Expected 'CAS part' for 0x034aeecb, got %s", label)
	}
	if label, ok := typeLabels[0x319e4f1d]; !ok || label != "Object definition" {
		t.Errorf("Expected 'Object definition' for 0x319e4f1d, got %s", label)
	}
}
