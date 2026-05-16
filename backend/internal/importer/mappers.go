package importer

import "strings"

// MapType collapses the Testiny "Type" string onto our enum.  The full set
// of values seen in the export and how each maps:
//
//	FUNCTIONAL      → functional
//	REGRESSION      → regression
//	SMOKE           → smoke
//	"Smoke & Sanity"→ smoke
//	INTEGRATION     → integration
//	EXPLORATORY     → exploratory
//	PERFORMANCE     → performance
//	SECURITY        → security
//	ACCESSIBILITY   → accessibility
//	ACCEPTANCE      → acceptance
//	OTHER           → other
//	"Compatibility" → compatibility
//	"" / unknown    → functional   (the system default)
func MapType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "":
		return "functional"
	case "functional":
		return "functional"
	case "regression":
		return "regression"
	case "smoke", "smoke & sanity":
		return "smoke"
	case "integration":
		return "integration"
	case "exploratory":
		return "exploratory"
	case "performance":
		return "performance"
	case "security":
		return "security"
	case "accessibility":
		return "accessibility"
	case "acceptance":
		return "acceptance"
	case "compatibility":
		return "compatibility"
	case "other":
		return "other"
	}
	return "other"
}

// MapPriority maps Testiny's numeric priority (0..3, often null) to our
// word-based enum.  When in doubt the answer is "medium" — that's both
// Testiny's most common value and our default.
func MapPriority(raw any) string {
	switch v := raw.(type) {
	case nil:
		return "medium"
	case int:
		return priorityFromInt(v)
	case int32:
		return priorityFromInt(int(v))
	case int64:
		return priorityFromInt(int(v))
	case float32:
		return priorityFromInt(int(v))
	case float64:
		return priorityFromInt(int(v))
	case string:
		s := strings.TrimSpace(strings.ToLower(v))
		if s == "" {
			return "medium"
		}
		switch s {
		case "0", "0.0", "critical":
			return "critical"
		case "1", "1.0", "high":
			return "high"
		case "2", "2.0", "medium":
			return "medium"
		case "3", "3.0", "low":
			return "low"
		}
	}
	return "medium"
}

func priorityFromInt(n int) string {
	switch n {
	case 0:
		return "critical"
	case 1:
		return "high"
	case 2:
		return "medium"
	case 3:
		return "low"
	}
	return "medium"
}
