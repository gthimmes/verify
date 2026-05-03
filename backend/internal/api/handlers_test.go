package api_test

import (
	"net/http"
	"testing"
)

func TestHealth(t *testing.T) {
	srv, _ := newServer(t)
	res := do(t, "GET", srv.URL+"/health", nil, nil)
	expectStatus(t, res, 200)
}

func TestListProjects_emptyReturnsArrayNotNull(t *testing.T) {
	srv, _ := newServer(t)
	var got []map[string]any
	res := do(t, "GET", srv.URL+"/api/v1/projects", nil, &got)
	expectStatus(t, res, 200)
	if got == nil {
		t.Fatal("expected JSON array, got null")
	}
}

func TestCreateProject_returns201AndBody(t *testing.T) {
	srv, _ := newServer(t)
	var body map[string]any
	res := do(t, "POST", srv.URL+"/api/v1/projects", map[string]string{
		"name": "Test Project", "key": "TST",
	}, &body)
	expectStatus(t, res, 201)
	if body["key"] != "TST" {
		t.Fatalf("key: %v", body["key"])
	}
	if body["id"] == nil {
		t.Fatal("id should be set")
	}
}

func TestCreateProject_rejectsTooShortName(t *testing.T) {
	srv, _ := newServer(t)
	res := do(t, "POST", srv.URL+"/api/v1/projects", map[string]string{"name": "x"}, nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", res.StatusCode)
	}
}

func TestGetProject_404OnUnknown(t *testing.T) {
	srv, _ := newServer(t)
	res := do(t, "GET", srv.URL+"/api/v1/projects/00000000-0000-0000-0000-000000000000", nil, nil)
	expectStatus(t, res, 404)
}

func TestPatchProject_renames(t *testing.T) {
	srv, _ := newServer(t)
	var p map[string]any
	do(t, "POST", srv.URL+"/api/v1/projects", map[string]string{"name": "Original", "key": "ORIG"}, &p)

	id := p["id"].(string)
	res := do(t, "PATCH", srv.URL+"/api/v1/projects/"+id, map[string]string{"name": "Renamed"}, nil)
	expectStatus(t, res, 204)

	var got map[string]any
	do(t, "GET", srv.URL+"/api/v1/projects/"+id, nil, &got)
	if got["name"] != "Renamed" {
		t.Fatalf("name: %v", got["name"])
	}
}

func TestSearch_endpointReturnsMatches(t *testing.T) {
	srv, _ := newServer(t)
	// build a project with a case
	var p map[string]any
	do(t, "POST", srv.URL+"/api/v1/projects", map[string]string{"name": "Searchable", "key": "SCH"}, &p)
	pid := p["id"].(string)

	var area map[string]any
	do(t, "POST", srv.URL+"/api/v1/projects/"+pid+"/areas", map[string]string{"name": "Area", "key": "AAA"}, &area)
	aid := area["id"].(string)

	var feat map[string]any
	do(t, "POST", srv.URL+"/api/v1/projects/"+pid+"/features", map[string]string{"areaId": aid, "name": "Feature"}, &feat)
	fid := feat["id"].(string)

	caseBody := map[string]any{
		"featureId": fid, "title": "Refund a card", "description": "tests refunds",
		"type": "regression", "priority": "high", "status": "active", "automationStatus": "not_automated",
		"steps": []map[string]any{{"order": 0, "action": "click refund", "expected": "ok"}},
	}
	var c map[string]any
	res := do(t, "POST", srv.URL+"/api/v1/projects/"+pid+"/cases", caseBody, &c)
	expectStatus(t, res, 201)

	var hits []map[string]any
	do(t, "GET", srv.URL+"/api/v1/search?q=refund", nil, &hits)
	if len(hits) == 0 {
		t.Fatal("expected search hit")
	}
}
