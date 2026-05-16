package importer

import (
	"fmt"
	"io"
	"sort"
)

// PrintSummary writes a human-readable dry-run report.  The shape is
// designed to be skimmed: counts at the top, mappings in the middle, the
// long tail (folders, skips) at the bottom.
func PrintSummary(out io.Writer, plan Plan) {
	s := plan.Summary
	fmt.Fprintf(out, "=== Import plan ===\n")
	fmt.Fprintf(out, "Project:           %s (%s)\n", plan.Project.Name, plan.Project.Key)
	fmt.Fprintf(out, "Total cases:       %d\n", s.TotalRows)
	fmt.Fprintf(out, "Unique paths:      %d\n", len(s.UniquePaths))
	fmt.Fprintf(out, "With precondition: %d\n", s.WithPrecondition)
	fmt.Fprintf(out, "Multi-step cases:  %d\n", s.WithMultipleSteps)
	fmt.Fprintln(out)

	fmt.Fprintln(out, "--- Cases per source sheet ---")
	for _, k := range sortedKeysByValueDesc(s.BySheet) {
		fmt.Fprintf(out, "  %-30s %5d\n", k, s.BySheet[k])
	}
	fmt.Fprintln(out)

	fmt.Fprintln(out, "--- Type mapping result ---")
	for _, k := range sortedKeysByValueDesc(s.ByType) {
		fmt.Fprintf(out, "  %-15s %5d\n", k, s.ByType[k])
	}
	fmt.Fprintln(out)

	fmt.Fprintln(out, "--- Priority mapping result ---")
	for _, k := range sortedKeysByValueDesc(s.ByPriority) {
		fmt.Fprintf(out, "  %-10s %5d\n", k, s.ByPriority[k])
	}
	fmt.Fprintln(out)

	fmt.Fprintln(out, "--- Case status (active vs deprecated) ---")
	for _, k := range sortedKeysByValueDesc(s.ByCaseStatus) {
		fmt.Fprintf(out, "  %-15s %5d\n", k, s.ByCaseStatus[k])
	}
	fmt.Fprintln(out)

	fmt.Fprintln(out, "--- Folder paths (first 30) ---")
	limit := len(s.UniquePaths)
	if limit > 30 {
		limit = 30
	}
	for _, p := range s.UniquePaths[:limit] {
		fmt.Fprintf(out, "  %s\n", p)
	}
	if len(s.UniquePaths) > limit {
		fmt.Fprintf(out, "  …and %d more\n", len(s.UniquePaths)-limit)
	}
	fmt.Fprintln(out)

	if len(s.SkippedReasons) > 0 {
		fmt.Fprintln(out, "--- Skipped rows ---")
		for _, k := range sortedKeysByValueDesc(s.SkippedReasons) {
			fmt.Fprintf(out, "  %-30s %5d\n", k, s.SkippedReasons[k])
		}
		fmt.Fprintln(out)
	}
}

func sortedKeysByValueDesc(m map[string]int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if m[keys[i]] != m[keys[j]] {
			return m[keys[i]] > m[keys[j]]
		}
		return keys[i] < keys[j]
	})
	return keys
}
