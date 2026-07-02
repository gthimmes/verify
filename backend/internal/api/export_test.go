package api_test

import (
	"encoding/csv"
	"io"
	"net/http"
	"strings"
	"testing"
)

// buildRunWithExecutions creates project → area → feature → case → run and
// records one pass + one fail.  Returns (projectID, runID).
func buildRunWithExecutions(t *testing.T, base string) (string, string) {
	t.Helper()
	var p map[string]any
	do(t, "POST", base+"/projects", map[string]string{"name": "Export Co", "key": "EXP"}, &p)
	pid := p["id"].(string)

	var folder map[string]any
	do(t, "POST", base+"/projects/"+pid+"/folders", map[string]string{"name": "Payments"}, &folder)
	fid := folder["id"].(string)

	caseBody := map[string]any{
		"folderId": fid, "title": "Refund a card", "type": "regression",
		"priority": "high", "status": "active", "automationStatus": "not_automated",
		"tags":  []string{"smoke"},
		"steps": []map[string]any{{"order": 0, "action": "click refund", "expected": "ok"}},
	}
	var c map[string]any
	do(t, "POST", base+"/projects/"+pid+"/cases", caseBody, &c)
	cid := c["id"].(string)

	var run map[string]any
	do(t, "POST", base+"/projects/"+pid+"/runs", map[string]any{
		"name": "Smoke run", "environment": "staging", "build": "v1.0.0", "caseIds": []string{cid},
	}, &run)
	rid := run["id"].(string)

	var execs []map[string]any
	do(t, "GET", base+"/runs/"+rid+"/executions", nil, &execs)
	do(t, "PATCH", base+"/executions/"+execs[0]["id"].(string),
		map[string]any{"result": "pass", "comments": "looks good"}, nil)

	return pid, rid
}

// getCSV fetches a CSV endpoint and returns the parsed records + the response.
func getCSV(t *testing.T, url string) (*http.Response, [][]string) {
	t.Helper()
	res, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d (%s)", res.StatusCode, string(body))
	}
	records, err := csv.NewReader(strings.NewReader(string(body))).ReadAll()
	if err != nil {
		t.Fatalf("parse csv: %v\n%s", err, string(body))
	}
	return res, records
}

func TestExportRunCSV(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"
	_, rid := buildRunWithExecutions(t, base)

	res, records := getCSV(t, base+"/runs/"+rid+"/export.csv")

	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Fatalf("content-type: %q", ct)
	}
	if cd := res.Header.Get("Content-Disposition"); !strings.Contains(cd, "smoke-run-results.csv") {
		t.Fatalf("content-disposition: %q", cd)
	}
	if len(records) != 2 { // header + 1 execution
		t.Fatalf("expected header + 1 row, got %d rows", len(records))
	}
	header := records[0]
	if header[0] != "Case ID" || header[5] != "Result" {
		t.Fatalf("unexpected header: %v", header)
	}
	row := records[1]
	if row[0] != "EXP-PAY-0001" {
		t.Fatalf("case id: %q", row[0])
	}
	if row[5] != "pass" {
		t.Fatalf("result: %q", row[5])
	}
	if row[6] == "" {
		t.Fatalf("expected executed-by to be set, got empty")
	}
}

func TestExportCasesCSV(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"
	pid, _ := buildRunWithExecutions(t, base)

	res, records := getCSV(t, base+"/projects/"+pid+"/cases/export.csv")

	if cd := res.Header.Get("Content-Disposition"); !strings.Contains(cd, "cases.csv") {
		t.Fatalf("content-disposition: %q", cd)
	}
	if len(records) != 2 { // header + 1 case
		t.Fatalf("expected header + 1 case, got %d rows", len(records))
	}
	if records[0][0] != "Case ID" || records[0][2] != "Folder" || records[0][6] != "Automation" {
		t.Fatalf("unexpected header: %v", records[0])
	}
	if records[1][0] != "EXP-PAY-0001" || records[1][1] != "Refund a card" {
		t.Fatalf("unexpected row: %v", records[1])
	}
	if records[1][2] != "Payments" { // Folder column
		t.Fatalf("folder: %q", records[1][2])
	}
	if records[1][7] != "smoke" { // Tags column
		t.Fatalf("tags: %q", records[1][7])
	}
}

func TestExportCasesCSV_filterApplies(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"
	pid, _ := buildRunWithExecutions(t, base)

	// priority=low matches nothing (the only case is high).
	_, records := getCSV(t, base+"/projects/"+pid+"/cases/export.csv?priority=low")
	if len(records) != 1 { // header only
		t.Fatalf("expected header only, got %d rows", len(records))
	}
}
