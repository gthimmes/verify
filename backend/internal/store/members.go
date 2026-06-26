package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/verify/backend/internal/domain"
)

// validMemberRole is the set of roles assignable through the members API.
func validMemberRole(role string) bool {
	return role == "admin" || role == "editor" || role == "viewer"
}

// ListMembers returns every member of a project with their role, ordered by
// role rank (admins first) then name.  The project owner is flagged.
func (s *Store) ListMembers(ctx context.Context, projectID string) ([]domain.ProjectMember, error) {
	rows, err := s.Pool.Query(ctx, `
		select u.id::text, u.name, u.email, pm.role, u.avatar_url,
		       (p.owner_id = u.id) as is_owner, pm.created_at
		from project_members pm
		join users u on u.id = pm.user_id
		join projects p on p.id = pm.project_id
		where pm.project_id = $1
		order by case pm.role when 'admin' then 0 when 'editor' then 1 else 2 end, lower(u.name)`,
		projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ProjectMember{}
	for rows.Next() {
		var m domain.ProjectMember
		if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Role, &m.AvatarURL, &m.IsOwner, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// MemberRole returns a user's role on a project, or ErrNotFound if they are not
// a member.
func (s *Store) MemberRole(ctx context.Context, projectID, userID string) (string, error) {
	var role string
	err := s.Pool.QueryRow(ctx,
		`select role from project_members where project_id = $1 and user_id = $2`,
		projectID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return role, err
}

// AddMember adds (or re-roles) a member by email.  The user is created on the
// fly if they don't exist yet, so you can invite people before their first
// sign-in.  Returns the resulting membership.
func (s *Store) AddMember(ctx context.Context, projectID string, in domain.AddMemberInput, actorID string) (*domain.ProjectMember, error) {
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if email == "" {
		return nil, fmt.Errorf("email required")
	}
	role := strings.TrimSpace(in.Role)
	if role == "" {
		role = "editor"
	}
	if !validMemberRole(role) {
		return nil, fmt.Errorf("invalid role %q", role)
	}

	// Verify the project exists (clear error rather than an FK violation).
	var ok bool
	if err := s.Pool.QueryRow(ctx, `select true from projects where id = $1`, projectID).Scan(&ok); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	// Derive a display name from the email local-part for brand-new users.
	name := email
	if at := strings.IndexByte(email, '@'); at > 0 {
		name = email[:at]
	}
	user, err := s.EnsureUser(ctx, email, name, "member")
	if err != nil {
		return nil, err
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		insert into project_members(project_id, user_id, role) values($1,$2,$3)
		on conflict(project_id, user_id) do update set role = excluded.role`,
		projectID, user.ID, role); err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, tx, actorID, "project.member_add", "Project", projectID,
		nil, map[string]any{"userId": user.ID, "email": email, "role": role}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	members, err := s.ListMembers(ctx, projectID)
	if err != nil {
		return nil, err
	}
	for i := range members {
		if members[i].UserID == user.ID {
			return &members[i], nil
		}
	}
	return nil, ErrNotFound
}

// UpdateMemberRole changes a member's role.  The project owner cannot be
// demoted out of admin (so a project always has at least one admin).
func (s *Store) UpdateMemberRole(ctx context.Context, projectID, userID, role, actorID string) error {
	role = strings.TrimSpace(role)
	if !validMemberRole(role) {
		return fmt.Errorf("invalid role %q", role)
	}
	owner, err := s.projectOwner(ctx, projectID)
	if err != nil {
		return err
	}
	if userID == owner && role != "admin" {
		return fmt.Errorf("the project owner must remain an admin")
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`update project_members set role = $3 where project_id = $1 and user_id = $2`,
		projectID, userID, role)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := writeAudit(ctx, tx, actorID, "project.member_role", "Project", projectID,
		nil, map[string]any{"userId": userID, "role": role}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RemoveMember revokes a user's project membership.  The owner cannot be
// removed.
func (s *Store) RemoveMember(ctx context.Context, projectID, userID, actorID string) error {
	owner, err := s.projectOwner(ctx, projectID)
	if err != nil {
		return err
	}
	if userID == owner {
		return fmt.Errorf("the project owner cannot be removed")
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`delete from project_members where project_id = $1 and user_id = $2`,
		projectID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := writeAudit(ctx, tx, actorID, "project.member_remove", "Project", projectID,
		nil, map[string]any{"userId": userID}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) projectOwner(ctx context.Context, projectID string) (string, error) {
	var owner string
	err := s.Pool.QueryRow(ctx, `select owner_id::text from projects where id = $1`, projectID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return owner, err
}

// ─── project-id resolvers (for authorization on entity-scoped routes) ────────

func (s *Store) scalarProjectID(ctx context.Context, query string, args ...any) (string, error) {
	var pid string
	err := s.Pool.QueryRow(ctx, query, args...).Scan(&pid)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return pid, err
}

func (s *Store) ProjectIDByCase(ctx context.Context, caseID string) (string, error) {
	return s.scalarProjectID(ctx, `select project_id::text from test_cases where id = $1`, caseID)
}

func (s *Store) ProjectIDByRun(ctx context.Context, runID string) (string, error) {
	return s.scalarProjectID(ctx, `select project_id::text from test_runs where id = $1`, runID)
}

func (s *Store) ProjectIDByExecution(ctx context.Context, executionID string) (string, error) {
	return s.scalarProjectID(ctx, `
		select r.project_id::text
		from test_executions e
		join test_runs r on r.id = e.run_id
		where e.id = $1`, executionID)
}

func (s *Store) ProjectIDByArea(ctx context.Context, areaID string) (string, error) {
	return s.scalarProjectID(ctx, `select project_id::text from areas where id = $1`, areaID)
}

func (s *Store) ProjectIDByFolder(ctx context.Context, folderID string) (string, error) {
	return s.scalarProjectID(ctx, `select project_id::text from folders where id = $1`, folderID)
}

func (s *Store) ProjectIDByFeature(ctx context.Context, featureID string) (string, error) {
	return s.scalarProjectID(ctx, `
		select a.project_id::text from features f
		join areas a on a.id = f.area_id
		where f.id = $1`, featureID)
}

// ProjectIDByEntity resolves an attachable entity (test_case | execution) to
// its owning project.
func (s *Store) ProjectIDByEntity(ctx context.Context, entityType, entityID string) (string, error) {
	switch entityType {
	case "test_case":
		return s.ProjectIDByCase(ctx, entityID)
	case "execution":
		return s.ProjectIDByExecution(ctx, entityID)
	default:
		return "", fmt.Errorf("unknown attachment entity %q", entityType)
	}
}

// ProjectIDByAttachment resolves an attachment to its owning project, hopping
// through whichever entity it is attached to.
func (s *Store) ProjectIDByAttachment(ctx context.Context, attachmentID string) (string, error) {
	var entityType, entityID string
	err := s.Pool.QueryRow(ctx,
		`select entity_type, entity_id::text from attachments where id = $1`, attachmentID).
		Scan(&entityType, &entityID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return s.ProjectIDByEntity(ctx, entityType, entityID)
}
