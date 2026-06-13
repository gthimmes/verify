package api_test

import (
	"net/http"
	"testing"
)

func TestBulkUpdateCases_endpoint(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	var p map[string]any
	do(t, "POST", base+"/projects", map[string]string{"name": "Bulk Co", "key": "BLK"}, &p)
	pid := p["id"].(string)
	var area map[string]any
	do(t, "POST", base+"/projects/"+pid+"/areas", map[string]string{"name": "Area", "key": "ARE"}, &area)
	var feat map[string]any
	do(t, "POST", base+"/projects/"+pid+"/features", map[string]string{"areaId": area["id"].(string), "name": "Feat"}, &feat)
	fid := feat["id"].(string)

	mkCase := func(title string) string {
		var c map[string]any
		do(t, "POST", base+"/projects/"+pid+"/cases", map[string]any{
			"featureId": fid, "title": title, "type": "functional",
			"priority": "low", "status": "active", "automationStatus": "not_automated",
			"steps": []map[string]any{{"order": 0, "action": "x", "expected": "y"}},
		}, &c)
		return c["id"].(string)
	}
	id1, id2 := mkCase("Alpha"), mkCase("Beta")

	var res2 map[string]any
	res := do(t, "POST", base+"/projects/"+pid+"/cases/bulk", map[string]any{
		"caseIds": []string{id1, id2}, "op": "priority", "value": "critical",
	}, &res2)
	expectStatus(t, res, http.StatusOK)
	if res2["updated"].(float64) != 2 {
		t.Fatalf("updated: %v", res2["updated"])
	}

	var cases []map[string]any
	do(t, "GET", base+"/projects/"+pid+"/cases?priority=critical", nil, &cases)
	if len(cases) != 2 {
		t.Fatalf("expected 2 critical cases, got %d", len(cases))
	}

	// invalid op → 400
	res = do(t, "POST", base+"/projects/"+pid+"/cases/bulk", map[string]any{
		"caseIds": []string{id1}, "op": "nope",
	}, nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad op, got %d", res.StatusCode)
	}
}
