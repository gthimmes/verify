package api_test

import (
	"net/http"
	"testing"
)

func TestSavedFilters_endpoint(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	var p map[string]any
	do(t, "POST", base+"/projects", map[string]string{"name": "Filter Co", "key": "FIL"}, &p)
	pid := p["id"].(string)

	// create
	var created map[string]any
	res := do(t, "POST", base+"/projects/"+pid+"/saved-filters", map[string]any{
		"name": "Critical", "query": map[string]string{"priority": "critical"}, "shared": true,
	}, &created)
	expectStatus(t, res, http.StatusCreated)
	fid := created["id"].(string)
	if q := created["query"].(map[string]any); q["priority"] != "critical" {
		t.Fatalf("query: %v", q)
	}

	// list
	var list []map[string]any
	res = do(t, "GET", base+"/projects/"+pid+"/saved-filters", nil, &list)
	expectStatus(t, res, http.StatusOK)
	if len(list) != 1 {
		t.Fatalf("expected 1 filter, got %d", len(list))
	}

	// delete
	res = do(t, "DELETE", base+"/saved-filters/"+fid, nil, nil)
	expectStatus(t, res, http.StatusNoContent)

	res = do(t, "GET", base+"/projects/"+pid+"/saved-filters", nil, &list)
	expectStatus(t, res, http.StatusOK)
	if len(list) != 0 {
		t.Fatalf("expected 0 after delete, got %d", len(list))
	}
}
