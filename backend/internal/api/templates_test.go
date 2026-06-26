package api_test

import (
	"net/http"
	"testing"
)

func TestTemplates_endpoint(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	// create
	var created map[string]any
	res := do(t, "POST", base+"/templates", map[string]any{
		"name":        "Smoke",
		"description": "Happy path",
		"body": map[string]any{
			"title":    "Verify endpoint",
			"priority": "high",
			"type":     "smoke",
			"tags":     []string{"smoke"},
			"steps":    []map[string]any{{"order": 1, "action": "GET", "expected": "200"}},
		},
	}, &created)
	expectStatus(t, res, http.StatusCreated)
	tid := created["id"].(string)
	if body := created["body"].(map[string]any); body["priority"] != "high" {
		t.Fatalf("body roundtrip: %v", body)
	}

	// list
	var list []map[string]any
	res = do(t, "GET", base+"/templates", nil, &list)
	expectStatus(t, res, http.StatusOK)
	if len(list) != 1 {
		t.Fatalf("expected 1 template, got %d", len(list))
	}

	// update
	var updated map[string]any
	res = do(t, "PATCH", base+"/templates/"+tid, map[string]any{
		"name": "Smoke v2",
		"body": map[string]any{"priority": "critical", "type": "smoke"},
	}, &updated)
	expectStatus(t, res, http.StatusOK)
	if updated["name"] != "Smoke v2" {
		t.Fatalf("update name: %v", updated["name"])
	}

	// get
	var got map[string]any
	res = do(t, "GET", base+"/templates/"+tid, nil, &got)
	expectStatus(t, res, http.StatusOK)

	// delete
	res = do(t, "DELETE", base+"/templates/"+tid, nil, nil)
	expectStatus(t, res, http.StatusNoContent)

	res = do(t, "GET", base+"/templates", nil, &list)
	expectStatus(t, res, http.StatusOK)
	if len(list) != 0 {
		t.Fatalf("expected 0 after delete, got %d", len(list))
	}
}
