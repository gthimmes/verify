package api_test

import (
	"net/http"
	"testing"
)

func TestFolderManagement_endpoints(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	var p map[string]any
	do(t, "POST", base+"/projects", map[string]string{"name": "Folder Co", "key": "FLD"}, &p)
	pid := p["id"].(string)

	mkFolder := func(name string, parentID *string) string {
		body := map[string]any{"name": name}
		if parentID != nil {
			body["parentId"] = *parentID
		}
		var f map[string]any
		res := do(t, "POST", base+"/projects/"+pid+"/folders", body, &f)
		expectStatus(t, res, http.StatusCreated)
		return f["id"].(string)
	}

	top := mkFolder("Top", nil)
	child := mkFolder("Child", &top)
	other := mkFolder("Other", nil)

	// Rename.
	res := do(t, "PATCH", base+"/folders/"+top, map[string]any{"name": "Renamed Top"}, nil)
	expectStatus(t, res, http.StatusNoContent)

	var tree []map[string]any
	do(t, "GET", base+"/projects/"+pid+"/folders", nil, &tree)
	if len(tree) != 2 {
		t.Fatalf("expected 2 roots, got %d", len(tree))
	}

	// Move Other under the renamed top.
	res = do(t, "POST", base+"/folders/"+other+"/move", map[string]any{"targetParentId": top}, nil)
	expectStatus(t, res, http.StatusNoContent)
	tree = nil
	do(t, "GET", base+"/projects/"+pid+"/folders", nil, &tree)
	if len(tree) != 1 {
		t.Fatalf("expected 1 root after move, got %d", len(tree))
	}

	// Cycle: moving top under its descendant child must 400.
	res = do(t, "POST", base+"/folders/"+top+"/move", map[string]any{"targetParentId": child}, nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for cycle, got %d", res.StatusCode)
	}

	// Archive the top: default tree empties, includeArchived shows it.
	res = do(t, "PATCH", base+"/folders/"+top, map[string]any{"archived": true}, nil)
	expectStatus(t, res, http.StatusNoContent)
	tree = nil
	do(t, "GET", base+"/projects/"+pid+"/folders", nil, &tree)
	if len(tree) != 0 {
		t.Fatalf("expected 0 visible roots after archive, got %d", len(tree))
	}
	tree = nil
	do(t, "GET", base+"/projects/"+pid+"/folders?includeArchived=1", nil, &tree)
	if len(tree) != 1 {
		t.Fatalf("expected 1 root with includeArchived, got %d", len(tree))
	}

	// Patching a missing folder 404s.
	res = do(t, "PATCH", base+"/folders/00000000-0000-0000-0000-000000000000", map[string]any{"name": "x"}, nil)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for missing folder, got %d", res.StatusCode)
	}
}
