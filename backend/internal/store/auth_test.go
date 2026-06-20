package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
	"github.com/verify/backend/internal/testutil"
)

func TestUpsertGoogleUser_createsLinksAndUpdates(t *testing.T) {
	s, _ := newTest(t)
	ctx := context.Background()

	// New Google account → new user, member role, avatar stored.
	u1, err := s.UpsertGoogleUser(ctx, domain.GoogleProfile{
		Sub: "g-alice", Email: "alice@example.com", Name: "Alice", Picture: "http://img/a.png",
	})
	if err != nil {
		t.Fatal(err)
	}
	if u1.Email != "alice@example.com" || u1.Role != "member" {
		t.Fatalf("unexpected new user: %+v", u1)
	}
	if u1.AvatarURL == nil || *u1.AvatarURL != "http://img/a.png" {
		t.Fatalf("avatar not stored: %+v", u1.AvatarURL)
	}

	// Same sub again → same row, updated name.
	u2, err := s.UpsertGoogleUser(ctx, domain.GoogleProfile{
		Sub: "g-alice", Email: "alice@example.com", Name: "Alice Smith",
	})
	if err != nil {
		t.Fatal(err)
	}
	if u2.ID != u1.ID || u2.Name != "Alice Smith" {
		t.Fatalf("update-by-sub failed: %+v (was %s)", u2, u1.ID)
	}

	// Pre-existing user by email → linked, role preserved.
	bob, err := s.EnsureUser(ctx, "bob@example.com", "Bob", "admin")
	if err != nil {
		t.Fatal(err)
	}
	u3, err := s.UpsertGoogleUser(ctx, domain.GoogleProfile{
		Sub: "g-bob", Email: "bob@example.com", Name: "Bob G",
	})
	if err != nil {
		t.Fatal(err)
	}
	if u3.ID != bob.ID {
		t.Fatalf("email link failed: got %s want %s", u3.ID, bob.ID)
	}
	if u3.Role != "admin" {
		t.Fatalf("existing role should be preserved, got %q", u3.Role)
	}
}

func TestSessions_createResolveExpireDelete(t *testing.T) {
	s, _ := newTest(t)
	ctx := context.Background()
	u, _ := s.UpsertGoogleUser(ctx, domain.GoogleProfile{Sub: "g-s", Email: "s@example.com", Name: "Sessioned"})

	token, exp, err := s.CreateSession(ctx, u.ID, "test-agent")
	if err != nil {
		t.Fatal(err)
	}
	if token == "" || !exp.After(time.Now()) {
		t.Fatalf("bad session: token=%q exp=%v", token, exp)
	}
	if testutil.AuditCount(t, testutil.Pool(t), "auth.login") != 1 {
		t.Fatal("expected one auth.login audit row")
	}

	got, err := s.UserBySession(ctx, token)
	if err != nil || got.ID != u.ID {
		t.Fatalf("resolve failed: %v / %+v", err, got)
	}

	// Unknown token → ErrNotFound.
	if _, err := s.UserBySession(ctx, "nope"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("unknown token: want ErrNotFound, got %v", err)
	}

	// Expired session → ErrNotFound.
	pool := testutil.Pool(t)
	if _, err := pool.Exec(ctx,
		`insert into sessions(token, user_id, expires_at) values($1,$2, now() - interval '1 hour')`,
		"stale", u.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserBySession(ctx, "stale"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expired token: want ErrNotFound, got %v", err)
	}

	// Delete → ErrNotFound afterwards.
	if err := s.DeleteSession(ctx, token); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserBySession(ctx, token); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("deleted token: want ErrNotFound, got %v", err)
	}
}
