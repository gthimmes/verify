package api_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/verify/backend/internal/api"
	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
	"github.com/verify/backend/internal/testutil"
)

type fakeExchanger struct {
	profile domain.GoogleProfile
	err     error
}

func (f fakeExchanger) Exchange(_ context.Context, _, _ string) (domain.GoogleProfile, error) {
	return f.profile, f.err
}

// authServer builds a test server whose Google exchange is faked.
func authServer(t *testing.T, ex api.GoogleExchanger) (string, func()) {
	t.Helper()
	pool := testutil.Pool(t)
	testutil.Reset(t, pool)
	s := store.New(pool)
	if _, err := s.EnsureUser(t.Context(), "demo@verify.local", "Demo Admin", "admin"); err != nil {
		t.Fatalf("seed demo: %v", err)
	}
	srv := api.New(s)
	srv.Google = ex
	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)
	return ts.URL + "/api/v1", func() {}
}

// getWithToken issues a GET with a bearer token and decodes the JSON body.
func getWithToken(t *testing.T, url, token string, into any) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	if into != nil {
		defer res.Body.Close()
		_ = json.NewDecoder(res.Body).Decode(into)
	}
	return res
}

func TestGoogleAuth_exchangeMeLogout(t *testing.T) {
	base, done := authServer(t, fakeExchanger{profile: domain.GoogleProfile{
		Sub: "g-1", Email: "real@example.com", Name: "Real User", Picture: "http://img/r.png",
	}})
	defer done()

	// Exchange a (fake) code → session token + user.
	var ex struct {
		Token string         `json:"token"`
		User  map[string]any `json:"user"`
	}
	res := do(t, "POST", base+"/auth/google/exchange",
		map[string]string{"code": "abc", "redirectUri": "http://x/cb"}, &ex)
	expectStatus(t, res, http.StatusOK)
	if ex.Token == "" {
		t.Fatal("no session token returned")
	}
	if ex.User["email"] != "real@example.com" {
		t.Fatalf("unexpected user: %v", ex.User)
	}

	// /auth/me with the bearer token resolves to the real user.
	var who map[string]any
	res = getWithToken(t, base+"/auth/me", ex.Token, &who)
	expectStatus(t, res, http.StatusOK)
	if who["email"] != "real@example.com" {
		t.Fatalf("me (bearer): %v", who)
	}

	// /auth/me without a token falls back to the demo user (additive mode).
	var demo map[string]any
	res = getWithToken(t, base+"/auth/me", "", &demo)
	expectStatus(t, res, http.StatusOK)
	if demo["email"] != "demo@verify.local" {
		t.Fatalf("me (no token) should be demo, got %v", demo)
	}

	// Logout revokes the session…
	logoutReq, _ := http.NewRequest(http.MethodPost, base+"/auth/logout", nil)
	logoutReq.Header.Set("Authorization", "Bearer "+ex.Token)
	lr, err := http.DefaultClient.Do(logoutReq)
	if err != nil {
		t.Fatal(err)
	}
	expectStatus(t, lr, http.StatusNoContent)

	// …so the same token now falls back to demo.
	var after map[string]any
	res = getWithToken(t, base+"/auth/me", ex.Token, &after)
	expectStatus(t, res, http.StatusOK)
	if after["email"] != "demo@verify.local" {
		t.Fatalf("me after logout should be demo, got %v", after)
	}
}

func TestGoogleAuth_exchangeError(t *testing.T) {
	base, done := authServer(t, fakeExchanger{err: errors.New("google said no")})
	defer done()

	res := do(t, "POST", base+"/auth/google/exchange",
		map[string]string{"code": "abc", "redirectUri": "http://x/cb"}, nil)
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("expected 502 on exchange error, got %d", res.StatusCode)
	}
}
