package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/verify/backend/internal/api"
	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
	"github.com/verify/backend/internal/testutil"
)

// newEnforcedServer builds a server with AuthEnforced=true against a fresh DB.
func newEnforcedServer(t *testing.T) (*httptest.Server, *store.Store) {
	t.Helper()
	pool := testutil.Pool(t)
	testutil.Reset(t, pool)
	s := store.New(pool)
	srv := api.New(s)
	srv.AuthEnforced = true
	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)
	return ts, s
}

// session mints a session token for a user with the given global role.
func session(t *testing.T, s *store.Store, email, role string) string {
	t.Helper()
	u, err := s.EnsureUser(t.Context(), email, email, role)
	if err != nil {
		t.Fatalf("ensure user: %v", err)
	}
	tok, _, err := s.CreateSession(t.Context(), u.ID, "test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	return tok
}

// doAuth issues a request with an optional bearer token.
func doAuth(t *testing.T, method, url, token string, body any, into any) *http.Response {
	t.Helper()
	var buf io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		buf = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, url, buf)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	if into != nil {
		defer res.Body.Close()
		_ = json.NewDecoder(res.Body).Decode(into)
	}
	return res
}

func TestAuthz_enforcement(t *testing.T) {
	ts, s := newEnforcedServer(t)
	base := ts.URL + "/api/v1"
	ctx := t.Context()

	// Users.
	ownerTok := session(t, s, "owner@x.io", "member")
	editorTok := session(t, s, "editor@x.io", "member")
	viewerTok := session(t, s, "viewer@x.io", "member")
	outsiderTok := session(t, s, "outsider@x.io", "member")
	orgAdminTok := session(t, s, "boss@x.io", "admin")

	owner, _ := s.EnsureUser(ctx, "owner@x.io", "owner@x.io", "member")
	proj, err := s.CreateProject(ctx, domain.CreateProjectInput{Name: "Secure", Key: "SEC"}, owner.ID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	if _, err := s.AddMember(ctx, proj.ID, domain.AddMemberInput{Email: "editor@x.io", Role: "editor"}, owner.ID); err != nil {
		t.Fatalf("add editor: %v", err)
	}
	if _, err := s.AddMember(ctx, proj.ID, domain.AddMemberInput{Email: "viewer@x.io", Role: "viewer"}, owner.ID); err != nil {
		t.Fatalf("add viewer: %v", err)
	}

	projURL := base + "/projects/" + proj.ID
	foldersURL := projURL + "/folders"

	// 1) No token → 401.
	res := doAuth(t, "GET", projURL, "", nil, nil)
	expectStatus(t, res, http.StatusUnauthorized)

	// 2) Outsider (authenticated, not a member) → 403.
	res = doAuth(t, "GET", projURL, outsiderTok, nil, nil)
	expectStatus(t, res, http.StatusForbidden)

	// 3) Viewer can read…
	res = doAuth(t, "GET", projURL, viewerTok, nil, nil)
	expectStatus(t, res, http.StatusOK)
	// …but cannot write.
	res = doAuth(t, "POST", foldersURL, viewerTok, map[string]string{"name": "Nope"}, nil)
	expectStatus(t, res, http.StatusForbidden)

	// 4) Editor can write.
	res = doAuth(t, "POST", foldersURL, editorTok, map[string]string{"name": "Yep"}, nil)
	expectStatus(t, res, http.StatusCreated)

	// 5) Editor cannot administer the project (settings = admin).
	res = doAuth(t, "PATCH", projURL, editorTok, map[string]string{"name": "Renamed"}, nil)
	expectStatus(t, res, http.StatusForbidden)
	// …nor manage members.
	res = doAuth(t, "POST", projURL+"/members", editorTok,
		map[string]string{"email": "x@x.io", "role": "viewer"}, nil)
	expectStatus(t, res, http.StatusForbidden)

	// 6) Owner (project admin) can administer + manage members.
	res = doAuth(t, "PATCH", projURL, ownerTok, map[string]string{"name": "Renamed"}, nil)
	expectStatus(t, res, http.StatusNoContent)
	res = doAuth(t, "POST", projURL+"/members", ownerTok,
		map[string]string{"email": "newbie@x.io", "role": "editor"}, nil)
	expectStatus(t, res, http.StatusCreated)

	// 7) Org admin bypasses project membership entirely.
	res = doAuth(t, "GET", projURL, orgAdminTok, nil, nil)
	expectStatus(t, res, http.StatusOK)
	res = doAuth(t, "PATCH", projURL, orgAdminTok, map[string]string{"name": "BossRename"}, nil)
	expectStatus(t, res, http.StatusNoContent)
}

func TestAuthz_entityRoutesResolveProject(t *testing.T) {
	ts, s := newEnforcedServer(t)
	base := ts.URL + "/api/v1"
	ctx := t.Context()

	owner, _ := s.EnsureUser(ctx, "o2@x.io", "o2", "member")
	proj, err := s.CreateProject(ctx, domain.CreateProjectInput{Name: "Entity", Key: "ENT"}, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	outsiderTok := session(t, s, "nope@x.io", "member")

	// Create a folder (entity) as the owner so we have an id to probe.
	folder, err := s.CreateFolder(ctx, domain.CreateFolderInput{ProjectID: proj.ID, Name: "F"})
	if err != nil {
		t.Fatal(err)
	}

	// An outsider hitting the entity-scoped route is denied via project
	// resolution (PATCH /folders/{id} resolves to ENT, where they're not a member).
	res := doAuth(t, "PATCH", base+"/folders/"+folder.ID, outsiderTok,
		map[string]any{"name": "hijack"}, nil)
	expectStatus(t, res, http.StatusForbidden)
}
