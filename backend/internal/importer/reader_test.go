package importer

import "testing"

func TestJiraKeysFromRequirements(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{"", ""},
		{`[{"key":"FIRM-6100","project_id":"10000","summary":"x","url":""}]`, "FIRM-6100"},
		{`[{"key":"A-1"}, {"key":"B-22"}, {"key":"C-333"}]`, "A-1,B-22,C-333"},
		{`garbled but no key tokens here`, ""},
	} {
		if got := JiraKeysFromRequirements(c.in); got != c.want {
			t.Errorf("JiraKeysFromRequirements(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestParseExcelTime(t *testing.T) {
	if got := parseExcelTime(""); got != nil {
		t.Errorf("empty should be nil, got %v", got)
	}
	if got := parseExcelTime("not-a-date"); got != nil {
		t.Errorf("garbage should be nil, got %v", got)
	}
	if got := parseExcelTime("2025-09-26 15:26:27.425000"); got == nil {
		t.Error("recognised datetime should parse")
	}
	if got := parseExcelTime("46723.123"); got == nil {
		t.Error("excel serial date should parse")
	}
}
