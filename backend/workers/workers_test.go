package workers

import (
	"runtime"
	"testing"
)

func TestCount(t *testing.T) {
	c := Count()
	expected := runtime.NumCPU() - 2
	if expected < 1 {
		expected = 1
	}
	if c != expected {
		t.Fatalf("expected Count() = %d, got %d", expected, c)
	}
	if c < 1 {
		t.Fatalf("Count() must be >= 1, got %d", c)
	}
}
