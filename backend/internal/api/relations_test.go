package api_test

import (
	"net/http"
	"testing"
)

func TestRelations_endpoint(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	var p map[string]any
	do(t, "POST", base+"/projects", map[string]string{"name": "Rel Co", "key": "REL"}, &p)
	pid := p["id"].(string)
	var folder map[string]any
	do(t, "POST", base+"/projects/"+pid+"/folders", map[string]string{"name": "Folder"}, &folder)
	fid := folder["id"].(string)

	mkCase := func(title string) string {
		var c map[string]any
		do(t, "POST", base+"/projects/"+pid+"/cases", map[string]any{
			"folderId": fid, "title": title, "type": "functional",
			"priority": "low", "status": "active", "automationStatus": "not_automated",
			"steps": []map[string]any{{"order": 0, "action": "x", "expected": "y"}},
		}, &c)
		return c["id"].(string)
	}
	a, b := mkCase("Alpha"), mkCase("Beta")

	// Link A → B.
	res := do(t, "POST", base+"/cases/"+a+"/relations", map[string]any{"targetCaseId": b}, nil)
	expectStatus(t, res, http.StatusNoContent)

	// Visible from B too (undirected).
	var rels []map[string]any
	do(t, "GET", base+"/cases/"+b+"/relations", nil, &rels)
	if len(rels) != 1 || rels[0]["id"] != a {
		t.Fatalf("expected B to link back to A, got %v", rels)
	}

	// Remove and confirm gone.
	res = do(t, "DELETE", base+"/cases/"+a+"/relations/"+b, nil, nil)
	expectStatus(t, res, http.StatusNoContent)
	rels = nil
	do(t, "GET", base+"/cases/"+a+"/relations", nil, &rels)
	if len(rels) != 0 {
		t.Fatalf("expected no relations after delete, got %d", len(rels))
	}

	// Self-link → 400.
	res = do(t, "POST", base+"/cases/"+a+"/relations", map[string]any{"targetCaseId": a}, nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for self-link, got %d", res.StatusCode)
	}
}
