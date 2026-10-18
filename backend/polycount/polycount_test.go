package polycount

import (
	"testing"
)

func TestSeverityClassification(t *testing.T) {
	tests := []struct {
		polys    int
		expected string
	}{
		{5000, "low"},
		{10000, "low"},
		{10001, "medium"},
		{25000, "medium"},
		{25001, "heavy"},
		{50000, "heavy"},
		{50001, "critical"},
		{120000, "critical"},
	}

	for _, tt := range tests {
		severity := "low"
		if tt.polys > 50000 {
			severity = "critical"
		} else if tt.polys > 25000 {
			severity = "heavy"
		} else if tt.polys > 10000 {
			severity = "medium"
		}

		if severity != tt.expected {
			t.Errorf("For %d polys, expected severity %s, got %s", tt.polys, tt.expected, severity)
		}
	}
}
