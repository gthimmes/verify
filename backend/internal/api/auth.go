package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/verify/backend/internal/domain"
)

// GoogleExchanger turns an OAuth authorization code into a Google profile.
// It's an interface so tests can inject a fake instead of calling Google.
type GoogleExchanger interface {
	Exchange(ctx context.Context, code, redirectURI string) (domain.GoogleProfile, error)
}

// httpGoogleExchanger is the real implementation: it swaps the code for an
// access token, then reads the userinfo endpoint.  Credentials come from the
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET environment variables.
type httpGoogleExchanger struct{}

func (httpGoogleExchanger) Exchange(ctx context.Context, code, redirectURI string) (domain.GoogleProfile, error) {
	var p domain.GoogleProfile
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	if clientID == "" || clientSecret == "" {
		return p, fmt.Errorf("google oauth not configured (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)")
	}

	form := url.Values{
		"code":          {code},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	}
	tokReq, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	tokReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokRes, err := http.DefaultClient.Do(tokReq)
	if err != nil {
		return p, err
	}
	defer tokRes.Body.Close()
	if tokRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(tokRes.Body)
		return p, fmt.Errorf("google token exchange failed: %s", strings.TrimSpace(string(body)))
	}
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(tokRes.Body).Decode(&tok); err != nil {
		return p, err
	}
	if tok.AccessToken == "" {
		return p, fmt.Errorf("google token exchange returned no access token")
	}

	infoReq, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://www.googleapis.com/oauth2/v3/userinfo", nil)
	infoReq.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	infoRes, err := http.DefaultClient.Do(infoReq)
	if err != nil {
		return p, err
	}
	defer infoRes.Body.Close()
	if infoRes.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(infoRes.Body)
		return p, fmt.Errorf("google userinfo failed: %s", strings.TrimSpace(string(body)))
	}
	if err := json.NewDecoder(infoRes.Body).Decode(&p); err != nil {
		return p, err
	}
	if p.Sub == "" || p.Email == "" {
		return p, fmt.Errorf("google userinfo missing sub/email")
	}
	return p, nil
}

// exchangeGoogle is called by the Next.js callback route (server-to-server).
// It trades the authorization code for a profile, upserts the user, mints a
// session, and returns the session token for the web layer to store.
func (s *Server) exchangeGoogle(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code        string `json:"code"`
		RedirectURI string `json:"redirectUri"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if in.Code == "" || in.RedirectURI == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code and redirectUri required"})
		return
	}

	profile, err := s.Google.Exchange(r.Context(), in.Code, in.RedirectURI)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	user, err := s.Store.UpsertGoogleUser(r.Context(), profile)
	if err != nil {
		writeErr(w, err)
		return
	}
	token, expires, err := s.Store.CreateSession(r.Context(), user.ID, r.UserAgent())
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token":     token,
		"expiresAt": expires.UTC().Format(time.RFC3339),
		"user":      user,
	})
}

// logout revokes the bearer session token, if present.
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if token := bearerToken(r); token != "" {
		if err := s.Store.DeleteSession(r.Context(), token); err != nil {
			writeErr(w, err)
			return
		}
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// me returns the current user resolved by the auth middleware (real session
// user when signed in, demo user otherwise).
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	if u, ok := currentUser(r); ok {
		writeJSON(w, http.StatusOK, u)
		return
	}
	writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not authenticated"})
}

// bearerToken extracts a token from the Authorization: Bearer <token> header.
func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}
