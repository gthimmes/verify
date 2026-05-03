// contract_test exercises the entire REST surface end-to-end via httptest.
// If a frontend page breaks because we renamed a field, this test catches it
// before the UI sees it.
package api_test

import (
	"net/http"
	"testing"
)

func TestContract_fullEntityRoundTrip(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	// 1. create a project
	var project map[string]any
	res := do(t, "POST", base+"/projects",
		map[string]string{"name": "Contract Project", "key": "CON", "description": "round-trip test"},
		&project)
	expectStatus(t, res, http.StatusCreated)
	for _, f := range []string{"id", "key", "name", "ownerId", "ownerName", "createdAt", "updatedAt"} {
		if _, ok := project[f]; !ok {
			t.Fatalf("project missing %q", f)
		}
	}
	pid := project["id"].(string)

	// 2. create an area + feature
	var area map[string]any
	res = do(t, "POST", base+"/projects/"+pid+"/areas",
		map[string]string{"name": "Payments", "key": "PAY"}, &area)
	expectStatus(t, res, http.StatusCreated)
	aid := area["id"].(string)

	var feat map[string]any
	res = do(t, "POST", base+"/projects/"+pid+"/features",
		map[string]string{"areaId": aid, "name": "Refunds"}, &feat)
	expectStatus(t, res, http.StatusCreated)
	fid := feat["id"].(string)

	// 3. create a parameterized test case
	caseBody := map[string]any{
		"featureId": fid, "title": "Refund partial",
		"description": "issue partial refund", "preconditions": "have a paid invoice",
		"type": "regression", "priority": "high", "status": "active",
		"automationStatus": "not_automated", "tags": []string{"smoke", "money"},
		"steps": []map[string]any{
			{"order": 0, "action": "open {{method}} payment", "expected": "modal open"},
			{"order": 1, "action": "refund {{partial}}", "expected": "status changes"},
		},
		"parameters": []map[string]any{
			{"name": "method", "order": 0},
			{"name": "partial", "order": 1},
		},
		"dataRows": []map[string]any{
			{"order": 0, "label": "card_50", "values": map[string]string{"method": "card", "partial": "$50"}},
			{"order": 1, "label": "ach_25", "values": map[string]string{"method": "ACH", "partial": "$25"}},
		},
	}
	var tcase map[string]any
	res = do(t, "POST", base+"/projects/"+pid+"/cases", caseBody, &tcase)
	expectStatus(t, res, http.StatusCreated)
	for _, f := range []string{"id", "publicId", "sequenceNum", "title", "type", "priority", "status",
		"automationStatus", "tags", "steps", "parameters", "dataRows", "version", "createdByName"} {
		if _, ok := tcase[f]; !ok {
			t.Fatalf("case missing %q", f)
		}
	}
	cid := tcase["id"].(string)
	if tcase["publicId"].(string) != "CON-PAY-0001" {
		t.Fatalf("publicId: %v", tcase["publicId"])
	}

	// 4. list cases — shape sanity
	var cases []map[string]any
	res = do(t, "GET", base+"/projects/"+pid+"/cases", nil, &cases)
	expectStatus(t, res, http.StatusOK)
	if len(cases) != 1 {
		t.Fatalf("expected 1 case, got %d", len(cases))
	}
	if cases[0]["dataRowCount"].(float64) != 2 {
		t.Fatalf("dataRowCount: %v", cases[0]["dataRowCount"])
	}

	// 5. update the case
	caseBody["title"] = "Refund partial v2"
	res = do(t, "PUT", base+"/cases/"+cid, caseBody, nil)
	expectStatus(t, res, http.StatusOK)

	// 6. create a run
	runBody := map[string]any{
		"name": "Smoke run", "environment": "staging", "build": "v1.0.0",
		"caseIds": []string{cid},
	}
	var run map[string]any
	res = do(t, "POST", base+"/projects/"+pid+"/runs", runBody, &run)
	expectStatus(t, res, http.StatusCreated)
	rid := run["id"].(string)
	counts := run["counts"].(map[string]any)
	if counts["total"].(float64) != 2 {
		t.Fatalf("expected 2 executions (one per data row), got %v", counts["total"])
	}

	// 7. list executions, record a pass + fail
	var execs []map[string]any
	res = do(t, "GET", base+"/runs/"+rid+"/executions", nil, &execs)
	expectStatus(t, res, http.StatusOK)
	if len(execs) != 2 {
		t.Fatalf("expected 2 executions, got %d", len(execs))
	}

	res = do(t, "PATCH", base+"/executions/"+execs[0]["id"].(string),
		map[string]any{"result": "pass", "comments": "ok"}, nil)
	expectStatus(t, res, http.StatusNoContent)

	res = do(t, "PATCH", base+"/executions/"+execs[1]["id"].(string),
		map[string]any{"result": "fail", "comments": "bad"}, nil)
	expectStatus(t, res, http.StatusNoContent)

	// 8. run status should be in_progress, counts updated
	res = do(t, "GET", base+"/runs/"+rid, nil, &run)
	expectStatus(t, res, http.StatusOK)
	if run["status"] != "in_progress" {
		t.Fatalf("status: %v", run["status"])
	}
	counts = run["counts"].(map[string]any)
	if counts["pass"].(float64) != 1 || counts["fail"].(float64) != 1 {
		t.Fatalf("counts.pass=%v counts.fail=%v", counts["pass"], counts["fail"])
	}

	// 9. report endpoint shape
	var report map[string]any
	res = do(t, "GET", base+"/projects/"+pid+"/report", nil, &report)
	expectStatus(t, res, http.StatusOK)
	for _, f := range []string{"totalCases", "automationPct", "areaCoverage", "candidates", "topFailing", "staleAutomation", "staleManual"} {
		if _, ok := report[f]; !ok {
			t.Fatalf("report missing %q", f)
		}
	}

	// 10. clone run
	var clone map[string]any
	res = do(t, "POST", base+"/runs/"+rid+"/clone", nil, &clone)
	expectStatus(t, res, http.StatusCreated)
	if clone["id"] == run["id"] {
		t.Fatal("cloned run should have a new id")
	}

	// 11. re-run failed
	var rerun map[string]any
	res = do(t, "POST", base+"/runs/"+rid+"/rerun-failed", nil, &rerun)
	expectStatus(t, res, http.StatusCreated)
	rerunCounts := rerun["counts"].(map[string]any)
	if rerunCounts["total"].(float64) != 1 {
		t.Fatalf("rerun should have 1 (the failed one), got %v", rerunCounts["total"])
	}

	// 12. soft delete + restore
	res = do(t, "DELETE", base+"/cases/"+cid, nil, nil)
	expectStatus(t, res, http.StatusNoContent)
	res = do(t, "POST", base+"/cases/"+cid+"/restore", nil, nil)
	expectStatus(t, res, http.StatusNoContent)

	// 13. duplicate
	var dup map[string]any
	res = do(t, "POST", base+"/cases/"+cid+"/duplicate", nil, &dup)
	expectStatus(t, res, http.StatusCreated)
	if dup["id"] == cid {
		t.Fatal("dup should have new id")
	}

	// 14. set run status (in_progress -> completed)
	res = do(t, "PATCH", base+"/runs/"+rid+"/status", map[string]string{"status": "completed"}, nil)
	expectStatus(t, res, http.StatusNoContent)

	// 15. recent audit
	var logs []map[string]any
	res = do(t, "GET", base+"/audit/recent?limit=50", nil, &logs)
	expectStatus(t, res, http.StatusOK)
	if len(logs) == 0 {
		t.Fatal("expected audit log entries from this session")
	}
}
