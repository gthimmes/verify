package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/verify/backend/internal/domain"
)

// CreateSavedFilter upserts a named filter for the given owner.  Re-saving
// under the same (project, owner, scope, name) overwrites the stored query and
// shared flag, so "Save" doubles as "update".
func (s *Store) CreateSavedFilter(ctx context.Context, in domain.CreateSavedFilterInput, ownerID string) (*domain.SavedFilter, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, fmt.Errorf("name required")
	}
	if len(in.Name) > 120 {
		return nil, fmt.Errorf("name too long")
	}
	scope := in.Scope
	if scope == "" {
		scope = "cases"
	}
	if scope != "cases" && scope != "runs" {
		return nil, fmt.Errorf("invalid scope %q", scope)
	}
	if in.Query == nil {
		in.Query = map[string]string{}
	}
	queryJSON, err := json.Marshal(in.Query)
	if err != nil {
		return nil, err
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id string
	if err := tx.QueryRow(ctx, `
		insert into saved_filters(project_id, owner_id, name, scope, query_json, shared)
		values($1,$2,$3,$4,$5,$6)
		on conflict(project_id, owner_id, scope, name)
		do update set query_json = excluded.query_json, shared = excluded.shared, updated_at = now()
		returning id::text`,
		in.ProjectID, ownerID, in.Name, scope, queryJSON, in.Shared,
	).Scan(&id); err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, tx, ownerID, "saved_filter.create", "SavedFilter", id,
		nil, map[string]any{"name": in.Name, "scope": scope, "shared": in.Shared}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.getSavedFilter(ctx, id)
}

// ListSavedFilters returns the caller's own filters plus any shared filters in
// the project, for the given scope, newest first.
func (s *Store) ListSavedFilters(ctx context.Context, projectID, scope, ownerID string) ([]domain.SavedFilter, error) {
	if scope == "" {
		scope = "cases"
	}
	rows, err := s.Pool.Query(ctx, `
		select sf.id::text, sf.project_id::text, sf.owner_id::text, coalesce(u.name,'') ,
		       sf.name, sf.scope, sf.query_json, sf.shared, sf.created_at, sf.updated_at
		from saved_filters sf
		left join users u on u.id = sf.owner_id
		where sf.project_id = $1 and sf.scope = $2 and (sf.owner_id = $3 or sf.shared)
		order by sf.updated_at desc`,
		projectID, scope, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSavedFilters(rows)
}

func (s *Store) getSavedFilter(ctx context.Context, id string) (*domain.SavedFilter, error) {
	rows, err := s.Pool.Query(ctx, `
		select sf.id::text, sf.project_id::text, sf.owner_id::text, coalesce(u.name,'') ,
		       sf.name, sf.scope, sf.query_json, sf.shared, sf.created_at, sf.updated_at
		from saved_filters sf
		left join users u on u.id = sf.owner_id
		where sf.id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out, err := scanSavedFilters(rows)
	if err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, ErrNotFound
	}
	return &out[0], nil
}

// DeleteSavedFilter removes a filter.  Only the owner may delete it.
func (s *Store) DeleteSavedFilter(ctx context.Context, id, ownerID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `delete from saved_filters where id = $1 and owner_id = $2`, id, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := writeAudit(ctx, tx, ownerID, "saved_filter.delete", "SavedFilter", id, nil, nil); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func scanSavedFilters(rows pgx.Rows) ([]domain.SavedFilter, error) {
	out := []domain.SavedFilter{}
	for rows.Next() {
		var f domain.SavedFilter
		var raw []byte
		if err := rows.Scan(&f.ID, &f.ProjectID, &f.OwnerID, &f.OwnerName,
			&f.Name, &f.Scope, &raw, &f.Shared, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		f.Query = map[string]string{}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &f.Query); err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return nil, err
			}
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
