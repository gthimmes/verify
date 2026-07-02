package api_test

import (
	"net/http"
	"testing"
)

// TestTypeEnum_acceptsAllSupportedValues asserts the API stores every type
// value the UI dropdown offers.  If someone widens the dropdown but forgets
// to widen the Zod schema (or vice versa), this test catches the drift.
func TestTypeEnum_acceptsAllSupportedValues(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	// build a project + area + feature once
	var p map[string]any
	do(t, "POST", base+"/projects", map[string]string{"name": "Type Enum", "key": "TYP"}, &p)
	pid := p["id"].(string)
	var folder map[string]any
	do(t, "POST", base+"/projects/"+pid+"/folders", map[string]string{"name": "Folder"}, &folder)
	fid := folder["id"].(string)

	supported := []string{
		"functional",
		"regression",
		"smoke",
		"integration",
		"exploratory",
		"performance",
		"security",
		"accessibility",
		"acceptance",
		"compatibility",
		"other",
	}
	for _, typ := range supported {
		var got map[string]any
		res := do(t, "POST", base+"/projects/"+pid+"/cases", map[string]any{
			"folderId": fid, "title": "case " + typ,
			"type": typ, "priority": "medium", "status": "active",
			"automationStatus": "not_automated",
			"steps": []map[string]any{{"order": 0, "action": "do", "expected": "ok"}},
		}, &got)
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("type %q rejected by API: %d", typ, res.StatusCode)
		}
		if got["type"] != typ {
			t.Fatalf("type %q round-tripped as %v", typ, got["type"])
		}
	}
}
