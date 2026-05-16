// Package importer turns Testiny .xlsx exports into the shape our store
// expects.  Each transformation is a pure function with its own test file
// next to it; the CLI in cmd/import-testiny composes them.
package importer

import "strings"

// FolderPath is the parsed segments of a Testiny `Folder` cell, ordered
// root-first.  e.g.
//
//	"Project > Module > Sub" → ["Project", "Module", "Sub"]
//
// Empty segments are dropped; whitespace is trimmed.  We deliberately
// preserve the full path verbatim — second-guessing the export (e.g.,
// dropping a project-name prefix) loses fidelity, and the schema can
// represent arbitrary depth.
type FolderPath struct {
	Segments []string
	// CaseStatus is "deprecated" iff the path starts with "DEPRECATED",
	// matching Testiny's archive convention.
	CaseStatus string
}

// ParseFolder splits a `>` path into segments.  Returns ("(uncategorized)",
// active) for empty input so every imported case lands somewhere.
func ParseFolder(raw string) FolderPath {
	segs := splitFolder(raw)
	if len(segs) == 0 {
		return FolderPath{Segments: []string{"(uncategorized)"}, CaseStatus: "active"}
	}
	status := "active"
	if strings.EqualFold(segs[0], "DEPRECATED") {
		status = "deprecated"
	}
	return FolderPath{Segments: segs, CaseStatus: status}
}

func splitFolder(raw string) []string {
	parts := strings.Split(raw, ">")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
