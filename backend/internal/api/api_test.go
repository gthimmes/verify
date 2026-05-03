package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/verify/backend/internal/api"
	"github.com/verify/backend/internal/store"
	"github.com/verify/backend/internal/testutil"
)

// newServer returns an httptest.Server wired up to the test database.
func newServer(t *testing.T) (*httptest.Server, *store.Store) {
	t.Helper()
	pool := testutil.Pool(t)
	testutil.Reset(t, pool)
	s := store.New(pool)
	if _, err := s.EnsureUser(t.Context(), "demo@verify.local", "Demo Admin", "admin"); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	srv := httptest.NewServer(api.New(s).Routes())
	t.Cleanup(srv.Close)
	return srv, s
}

// do is a thin JSON HTTP helper.  body may be nil.
func do(t *testing.T, method, url string, body any, into any) *http.Response {
	t.Helper()
	var buf io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		buf = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, url, buf)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	if into != nil && res.Header.Get("Content-Type") != "" {
		defer res.Body.Close()
		if err := json.NewDecoder(res.Body).Decode(into); err != nil && err != io.EOF {
			t.Fatalf("decode %s %s: %v", method, url, err)
		}
	}
	return res
}

// expectStatus is a tiny assert.
func expectStatus(t *testing.T, res *http.Response, want int) {
	t.Helper()
	if res.StatusCode != want {
		body, _ := io.ReadAll(res.Body)
		_ = res.Body.Close()
		t.Fatalf("status: want %d, got %d (%s)", want, res.StatusCode, string(body))
	}
}
