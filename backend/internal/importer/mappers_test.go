package importer

import "testing"

func TestMapType(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{"FUNCTIONAL", "functional"},
		{"functional", "functional"},
		{"  Functional  ", "functional"},
		{"REGRESSION", "regression"},
		{"SMOKE", "smoke"},
		{"Smoke & Sanity", "smoke"},
		{"INTEGRATION", "integration"},
		{"EXPLORATORY", "exploratory"},
		{"PERFORMANCE", "performance"},
		{"SECURITY", "security"},
		{"ACCESSIBILITY", "accessibility"},
		{"ACCEPTANCE", "acceptance"},
		{"Compatibility", "compatibility"},
		{"OTHER", "other"},
		{"", "functional"},
		{"made-up-value", "other"},
	} {
		if got := MapType(c.in); got != c.want {
			t.Errorf("MapType(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestMapPriority(t *testing.T) {
	for _, c := range []struct {
		in   any
		want string
	}{
		{nil, "medium"},
		{0, "critical"},
		{1, "high"},
		{2, "medium"},
		{3, "low"},
		{0.0, "critical"},
		{1.0, "high"},
		{2.0, "medium"},
		{3.0, "low"},
		{"0", "critical"},
		{"3", "low"},
		{"medium", "medium"},
		{"  ", "medium"},
		{"99", "medium"}, // unknown numeric → default
		{99, "medium"},   // unknown int    → default
	} {
		if got := MapPriority(c.in); got != c.want {
			t.Errorf("MapPriority(%v) = %q, want %q", c.in, got, c.want)
		}
	}
}
