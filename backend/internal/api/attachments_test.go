package api_test

import (
	"encoding/base64"
	"io"
	"net/http"
	"testing"
)

func TestAttachments_uploadListDownloadDelete(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	// Need a real case id for the entity.
	var p map[string]any
	do(t, "POST", base+"/projects", map[string]string{"name": "Att Co", "key": "ATT"}, &p)
	pid := p["id"].(string)
	var folder map[string]any
	do(t, "POST", base+"/projects/"+pid+"/folders", map[string]string{"name": "Folder"}, &folder)
	var c map[string]any
	do(t, "POST", base+"/projects/"+pid+"/cases", map[string]any{
		"folderId": folder["id"].(string), "title": "Has files", "type": "functional",
		"priority": "low", "status": "active", "automationStatus": "not_automated",
		"steps": []map[string]any{{"order": 0, "action": "x", "expected": "y"}},
	}, &c)
	caseID := c["id"].(string)

	payload := base64.StdEncoding.EncodeToString([]byte("hello screenshot"))

	// Upload.
	var att map[string]any
	res := do(t, "POST", base+"/attachments", map[string]any{
		"entityType": "test_case", "entityId": caseID,
		"filename": "shot.txt", "contentType": "text/plain", "data": payload,
	}, &att)
	expectStatus(t, res, http.StatusCreated)
	attID := att["id"].(string)
	if att["sizeBytes"].(float64) != 16 {
		t.Fatalf("size: %v", att["sizeBytes"])
	}

	// List.
	var list []map[string]any
	do(t, "GET", base+"/attachments?entityType=test_case&entityId="+caseID, nil, &list)
	if len(list) != 1 || list[0]["filename"] != "shot.txt" {
		t.Fatalf("list: %v", list)
	}

	// Download returns the original bytes.
	dl, err := http.Get(base + "/attachments/" + attID + "/download")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(dl.Body)
	dl.Body.Close()
	if string(body) != "hello screenshot" {
		t.Fatalf("download body: %q", string(body))
	}
	if ct := dl.Header.Get("Content-Type"); ct != "text/plain" {
		t.Fatalf("content-type: %q", ct)
	}

	// Delete, then the list is empty.
	res = do(t, "DELETE", base+"/attachments/"+attID, nil, nil)
	expectStatus(t, res, http.StatusNoContent)
	list = nil
	do(t, "GET", base+"/attachments?entityType=test_case&entityId="+caseID, nil, &list)
	if len(list) != 0 {
		t.Fatalf("expected 0 after delete, got %d", len(list))
	}
}

func TestAttachments_rejectsBadInput(t *testing.T) {
	srv, _ := newServer(t)
	base := srv.URL + "/api/v1"

	// Invalid entity type → 400.
	res := do(t, "POST", base+"/attachments", map[string]any{
		"entityType": "nope", "entityId": "00000000-0000-0000-0000-000000000000",
		"filename": "x.txt", "data": base64.StdEncoding.EncodeToString([]byte("y")),
	}, nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad entity type: want 400, got %d", res.StatusCode)
	}

	// Empty payload → 400.
	res = do(t, "POST", base+"/attachments", map[string]any{
		"entityType": "execution", "entityId": "00000000-0000-0000-0000-000000000000",
		"filename": "x.txt", "data": "",
	}, nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty payload: want 400, got %d", res.StatusCode)
	}
}
