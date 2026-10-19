package curseforge

import (
	"os"
	"testing"
)

// Эталонная старая реализация для проверки эквивалентности
func oldComputeFingerprint(data []byte) uint32 {
	filtered := make([]byte, 0, len(data))
	for _, b := range data {
		if b == 9 || b == 10 || b == 13 || b == 32 {
			continue
		}
		filtered = append(filtered, b)
	}
	return Murmur2(filtered, 1)
}

func TestFingerprintEquivalence(t *testing.T) {
	// 1. Тест с пустым буфером
	testBuffers := [][]byte{
		{},
		[]byte(""),
		// 2. Только пробелы/табы/переносы
		[]byte("   \t\t\r\n \r \n\t   "),
		// 3. Короткие буферы разной длины, не кратные 4
		[]byte("A"),
		[]byte("AB"),
		[]byte("ABC"),
		[]byte("ABCD"),
		[]byte("ABCDE"),
		[]byte("ABCDEF"),
		[]byte("ABCDEFG"),
		[]byte("ABCDEFGH"),
		[]byte("ABCDEFGHI"),
		// 4. Реалистичный заголовок DBPF с вкраплением пробельных байтов
		[]byte("DBPF\x02\x00\x00\x00\x00\x00\x00\x00\t \r\nSims4PackageData1234567"),
	}

	// 5. Различные размеры со случайными данными (включая не кратные 4 и больше 64 КБ)
	sizes := []int{
		13, 31, 64, 127, 255, 512, 1023, 4095, 7777,
		64*1024 - 1,
		64 * 1024,
		64*1024 + 1,
		64*1024 + 3,
		130 * 1024, // > 2 блоков по 64 КБ
		200*1024 + 7,
	}

	for _, sz := range sizes {
		buf := make([]byte, sz)
		for i := 0; i < sz; i++ {
			// Каждые несколько байт вставляем пробельные байты 9, 10, 13, 32
			if i%7 == 0 {
				buf[i] = 32 // space
			} else if i%11 == 0 {
				buf[i] = 10 // newline
			} else if i%13 == 0 {
				buf[i] = 13 // CR
			} else if i%17 == 0 {
				buf[i] = 9 // tab
			} else {
				buf[i] = byte((i*37 + 101) % 256)
			}
		}
		testBuffers = append(testBuffers, buf)
	}

	for idx, buf := range testBuffers {
		expected := oldComputeFingerprint(buf)
		got := ComputeFingerprint(buf)

		if got != expected {
			t.Fatalf("test case #%d (len=%d): expected %d, got %d", idx, len(buf), expected, got)
		}

		// Также проверяем ComputeFileFingerprint через временный файл на диске
		tmpFile, err := os.CreateTemp("", "cf_fp_test_*.bin")
		if err != nil {
			t.Fatalf("failed to create temp file: %v", err)
		}
		tmpPath := tmpFile.Name()
		if _, err := tmpFile.Write(buf); err != nil {
			tmpFile.Close()
			os.Remove(tmpPath)
			t.Fatalf("failed to write temp file: %v", err)
		}
		tmpFile.Close()

		fileFp, err := ComputeFileFingerprint(tmpPath)
		os.Remove(tmpPath)
		if err != nil {
			t.Fatalf("ComputeFileFingerprint failed for test case #%d: %v", idx, err)
		}
		if fileFp != expected {
			t.Fatalf("ComputeFileFingerprint test case #%d (len=%d): expected %d, got %d", idx, len(buf), expected, fileFp)
		}
	}
}

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
