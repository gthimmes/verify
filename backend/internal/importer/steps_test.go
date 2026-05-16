package importer

import (
	"strings"
	"testing"
)

func TestParseSteps_singleBlock(t *testing.T) {
	steps := "[1]\n1. Open page\n2. Click button"
	expected := "[1]\nButton highlights"
	got := ParseSteps(steps, expected)
	if len(got) != 1 {
		t.Fatalf("expected 1 step, got %d", len(got))
	}
	if !strings.Contains(got[0].Action, "1. Open page") {
		t.Fatalf("action: %q", got[0].Action)
	}
	if !strings.Contains(got[0].Expected, "Button highlights") {
		t.Fatalf("expected: %q", got[0].Expected)
	}
}

func TestParseSteps_multipleBlocks(t *testing.T) {
	steps := strings.Join([]string{
		"[1] First scenario:",
		"do thing one",
		"do thing two",
		"",
		"[2] Second scenario:",
		"do other",
	}, "\n")
	expected := strings.Join([]string{
		"[1] result of first",
		"",
		"[2] result of second",
	}, "\n")
	got := ParseSteps(steps, expected)
	if len(got) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(got))
	}
	if !strings.Contains(got[0].Action, "First scenario") {
		t.Fatalf("step 1 action: %q", got[0].Action)
	}
	if !strings.Contains(got[0].Expected, "result of first") {
		t.Fatalf("step 1 expected: %q", got[0].Expected)
	}
	if !strings.Contains(got[1].Action, "do other") {
		t.Fatalf("step 2 action: %q", got[1].Action)
	}
	if !strings.Contains(got[1].Expected, "result of second") {
		t.Fatalf("step 2 expected: %q", got[1].Expected)
	}
}

func TestParseSteps_markersOnlyInSteps(t *testing.T) {
	steps := "[1] one\n[2] two"
	expected := "Some shared expected text"
	got := ParseSteps(steps, expected)
	if len(got) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(got))
	}
	for _, s := range got {
		if s.Expected != "Some shared expected text" {
			t.Fatalf("expected reuse: %q", s.Expected)
		}
	}
}

func TestParseSteps_markersOnlyInExpected(t *testing.T) {
	steps := "Just one big action with no markers"
	expected := "[1] result a\n[2] result b"
	got := ParseSteps(steps, expected)
	if len(got) != 1 {
		t.Fatalf("expected 1 step (collapsed), got %d", len(got))
	}
	if !strings.Contains(got[0].Action, "Just one big") {
		t.Fatalf("action: %q", got[0].Action)
	}
	if !strings.Contains(got[0].Expected, "[1] result a") {
		t.Fatalf("expected preserved: %q", got[0].Expected)
	}
}

func TestParseSteps_bothEmpty(t *testing.T) {
	got := ParseSteps("", "")
	if len(got) != 1 {
		t.Fatalf("expected single placeholder step, got %d", len(got))
	}
	if got[0].Action != "" || got[0].Expected != "" {
		t.Fatalf("expected blanks, got %+v", got[0])
	}
}

func TestParseSteps_misalignedIDsLineUpByID(t *testing.T) {
	// real Testiny exports sometimes have [1] [2] [3] in steps but only
	// [1] and [3] in expected — pair by id, leave missing as empty.
	steps := "[1] s1\n[2] s2\n[3] s3"
	expected := "[1] e1\n[3] e3"
	got := ParseSteps(steps, expected)
	if len(got) != 3 {
		t.Fatalf("expected 3 steps, got %d", len(got))
	}
	if got[0].Expected != "e1" || got[1].Expected != "" || got[2].Expected != "e3" {
		t.Fatalf("pairing wrong: %+v", got)
	}
}
