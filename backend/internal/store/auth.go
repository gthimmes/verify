package store

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/verify/backend/internal/domain"
)

// sessionTTL is how long a session stays valid after login.
const sessionTTL = 30 * 24 * time.Hour

// UpsertGoogleUser links a Google identity to a user, creating one if needed.
// Matching is by google_sub first, then by email (so a pre-seeded user keeps
// its row and role when they first sign in with Google).  New users default to
// the "member" role; per-project access is governed by project_members.
func (s *Store) UpsertGoogleUser(ctx context.Context, p domain.GoogleProfile) (domain.User, error) {
	var pic *string
	if v := strings.TrimSpace(p.Picture); v != "" {
		pic = &v
	}
	name := strings.TrimSpace(p.Name)
	if name == "" {
		name = p.Email
	}

	var u domain.User
	// 1) Known Google account.
	err := s.Pool.QueryRow(ctx,
		`update users set name = $2, avatar_url = $3, last_login_at = now()
		 where google_sub = $1
		 returning id::text, email, name, role, avatar_url`,
		p.Sub, name, pic,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.AvatarURL)
	if err == nil {
		return u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return u, err
	}

	// 2) First sign-in: attach to an existing email or create a new user.
	err = s.Pool.QueryRow(ctx, `
		insert into users(email, name, role, google_sub, avatar_url, last_login_at)
		values($1, $2, 'member', $3, $4, now())
		on conflict(email) do update set
			name = excluded.name,
			google_sub = excluded.google_sub,
			avatar_url = excluded.avatar_url,
			last_login_at = now()
		returning id::text, email, name, role, avatar_url`,
		p.Email, name, p.Sub, pic,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.AvatarURL)
	return u, err
}

// CreateSession mints an opaque session token for a user and records a login
// audit entry.  The token is what the web layer stores in its httpOnly cookie.
func (s *Store) CreateSession(ctx context.Context, userID, userAgent string) (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	expires := time.Now().Add(sessionTTL)

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", time.Time{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`insert into sessions(token, user_id, user_agent, expires_at) values($1,$2,$3,$4)`,
		token, userID, userAgent, expires,
	); err != nil {
		return "", time.Time{}, err
	}
	if err := writeAudit(ctx, tx, userID, "auth.login", "User", userID, nil, nil); err != nil {
		return "", time.Time{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", time.Time{}, err
	}
	return token, expires, nil
}

// UserBySession resolves a non-expired session token to its user.  Returns
// ErrNotFound when the token is unknown or expired.
func (s *Store) UserBySession(ctx context.Context, token string) (domain.User, error) {
	var u domain.User
	err := s.Pool.QueryRow(ctx, `
		select u.id::text, u.email, u.name, u.role, u.avatar_url
		from sessions s
		join users u on u.id = s.user_id
		where s.token = $1 and s.expires_at > now()`,
		token,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.AvatarURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// DeleteSession revokes a session token (logout).  Unknown tokens are a no-op.
func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.Pool.Exec(ctx, `delete from sessions where token = $1`, token)
	return err
}
