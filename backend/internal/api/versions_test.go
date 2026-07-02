package api_test

import (
	"net/http"
	"testing"
)

func TestCaseVersions_endpoint(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	var p map[string]any
	do(t, "POST", base+"/projects", map[string]string{"name": "Hist Co", "key": "HIS"}, &p)
	pid := p["id"].(string)
	var folder map[string]any
	do(t, "POST", base+"/projects/"+pid+"/folders", map[string]string{"name": "Folder"}, &folder)
	fid := folder["id"].(string)

	body := map[string]any{
		"folderId": fid, "title": "First", "type": "functional",
		"priority": "medium", "status": "active", "automationStatus": "not_automated",
		"steps": []map[string]any{{"order": 0, "action": "a", "expected": "b"}},
	}
	var c map[string]any
	do(t, "POST", base+"/projects/"+pid+"/cases", body, &c)
	cid := c["id"].(string)

	body["title"] = "Second"
	do(t, "PUT", base+"/cases/"+cid, body, nil)

	var versions []map[string]any
	res := do(t, "GET", base+"/cases/"+cid+"/versions", nil, &versions)
	expectStatus(t, res, http.StatusOK)
	if len(versions) != 2 {
		t.Fatalf("expected 2 versions, got %d", len(versions))
	}
	if versions[0]["version"].(float64) != 2 {
		t.Fatalf("expected newest-first, got v%v", versions[0]["version"])
	}

	var v1 map[string]any
	res = do(t, "GET", base+"/cases/"+cid+"/versions/1", nil, &v1)
	expectStatus(t, res, http.StatusOK)
	snap := v1["snapshot"].(map[string]any)
	if snap["title"] != "First" {
		t.Fatalf("v1 snapshot title: %v", snap["title"])
	}

	res = do(t, "GET", base+"/cases/"+cid+"/versions/99", nil, nil)
	expectStatus(t, res, http.StatusNotFound)
}
