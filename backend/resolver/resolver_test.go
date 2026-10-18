package resolver

import (
	"testing"
)

func TestResolveDirectLink(t *testing.T) {
	url := "https://example.com/mods/cool_hair.package"
	res := ResolveLink(url)
	if !res.Ok || res.DirectUrl != url {
		t.Fatalf("expected direct url %s, got %+v", url, res)
	}
	if res.FileName != "cool_hair.package" {
		t.Fatalf("expected filename cool_hair.package, got %s", res.FileName)
	}
}

func TestResolveGoogleDriveLink(t *testing.T) {
	url := "https://drive.google.com/file/d/1A2B3C4D5E6F/view?usp=sharing"
	res := ResolveLink(url)
	if !res.Ok {
		t.Fatalf("expected ok true for google drive, got %+v", res)
	}
	expected := "https://drive.usercontent.google.com/download?id=1A2B3C4D5E6F&export=download&confirm=t"
	if res.DirectUrl != expected {
		t.Fatalf("expected %s, got %s", expected, res.DirectUrl)
	}
}

func TestResolveDropboxLink(t *testing.T) {
	url := "https://www.dropbox.com/s/12345/mod.zip?dl=0"
	res := ResolveLink(url)
	if !res.Ok {
		t.Fatalf("expected ok true for dropbox, got %+v", res)
	}
	expected := "https://www.dropbox.com/s/12345/mod.zip?dl=1"
	if res.DirectUrl != expected {
		t.Fatalf("expected %s, got %s", expected, res.DirectUrl)
	}
}

func TestIsInstallable(t *testing.T) {
	cases := map[string]bool{
		"hair.package":          true,
		"script.ts4script":      true,
		"archive.zip":           true,
		"rar_archive.rar":       true,
		"image.png":             false,
		"document.pdf":          false,
		"virus.exe":             false,
	}
	for name, expected := range cases {
		if got := IsInstallable(name); got != expected {
			t.Errorf("IsInstallable(%q) = %v, expected %v", name, got, expected)
		}
	}
}

func TestResolveModTheSims(t *testing.T) {
	url := "https://modthesims.info/d/701047/scythelord-wall-decorations.html"
	res := ResolveLink(url)
	if !res.Ok {
		t.Fatalf("expected ok true for MTS, got %+v", res)
	}
	if len(res.Downloads) == 0 {
		t.Fatalf("expected at least 1 download for MTS, got 0")
	}
	if res.SourceType != "modthesims" {
		t.Fatalf("expected sourceType modthesims, got %s", res.SourceType)
	}
}
