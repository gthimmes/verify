package importer

import (
	"reflect"
	"testing"
)

func TestParseFolder(t *testing.T) {
	cases := []struct {
		name     string
		in       string
		segments []string
		status   string
	}{
		{
			name:     "preserves full path verbatim",
			in:       "Project > Module A > Sub Module > Leaf",
			segments: []string{"Project", "Module A", "Sub Module", "Leaf"},
			status:   "active",
		},
		{
			name:     "single segment",
			in:       "DEPRECATED",
			segments: []string{"DEPRECATED"},
			status:   "deprecated",
		},
		{
			name:     "DEPRECATED with sub-folder",
			in:       "DEPRECATED > Old Module",
			segments: []string{"DEPRECATED", "Old Module"},
			status:   "deprecated",
		},
		{
			name:     "empty falls back to uncategorized",
			in:       "",
			segments: []string{"(uncategorized)"},
			status:   "active",
		},
		{
			name:     "trims whitespace and skips empty segments",
			in:       "  Project  >  > Module A >   ",
			segments: []string{"Project", "Module A"},
			status:   "active",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ParseFolder(c.in)
			if !reflect.DeepEqual(got.Segments, c.segments) {
				t.Errorf("\n got: %#v\nwant: %#v", got.Segments, c.segments)
			}
			if got.CaseStatus != c.status {
				t.Errorf("status = %q, want %q", got.CaseStatus, c.status)
			}
		})
	}
}
