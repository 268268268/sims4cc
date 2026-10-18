package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateModsFolder(t *testing.T) {
	// 1. Пустой путь
	res := ValidateModsFolder("")
	if res.Valid {
		t.Fatalf("empty path should not be valid")
	}

	// 2. Временная тестовая папка
	tmp := t.TempDir()
	res = ValidateModsFolder(tmp)
	if !res.Valid {
		t.Fatalf("existing directory should be valid: %s", res.Message)
	}

	// 3. Создаем тестовый .package файл
	f, err := os.Create(filepath.Join(tmp, "test_mod.package"))
	if err != nil {
		t.Fatal(err)
	}
	f.Close()

	res = ValidateModsFolder(tmp)
	if !res.Valid || res.PackageCount != 1 {
		t.Fatalf("expected 1 package count, got %d", res.PackageCount)
	}
}
