package actions

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCopyFileUnique(t *testing.T) {
	tmpDir := t.TempDir()
	srcFile := filepath.Join(tmpDir, "sample.package")
	if err := os.WriteFile(srcFile, []byte("DBPFtest"), 0644); err != nil {
		t.Fatalf("Failed to create src file: %v", err)
	}

	destDir := filepath.Join(tmpDir, "target")
	if err := os.MkdirAll(destDir, 0755); err != nil {
		t.Fatalf("Failed to create target dir: %v", err)
	}

	// 1st copy
	out1, err := CopyFileUnique(srcFile, destDir)
	if err != nil {
		t.Fatalf("First copy failed: %v", err)
	}
	if filepath.Base(out1) != "sample.package" {
		t.Errorf("Expected base sample.package, got %s", filepath.Base(out1))
	}

	// 2nd copy (collision handling)
	out2, err := CopyFileUnique(srcFile, destDir)
	if err != nil {
		t.Fatalf("Second copy failed: %v", err)
	}
	if filepath.Base(out2) != "sample (1).package" {
		t.Errorf("Expected collision name sample (1).package, got %s", filepath.Base(out2))
	}
}
