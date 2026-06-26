package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/verify/backend/internal/domain"
)

// normalizeTemplateBody initialises the slice fields to non-nil so the JSON
// encodes as [] (the UI iterates over them) and applies light defaults.
func normalizeTemplateBody(b *domain.TemplateBody) {
	if b.Tags == nil {
		b.Tags = []string{}
	}
	if b.Steps == nil {
		b.Steps = []domain.TestStep{}
	}
	if b.Parameters == nil {
		b.Parameters = []domain.TestCaseParam{}
	}
	if b.Type == "" {
		b.Type = "functional"
	}
	if b.Priority == "" {
		b.Priority = "medium"
	}
}

func friendlyTemplateErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return fmt.Errorf("a template with that name already exists")
	}
	return err
}

// CreateTemplate inserts a new template.
func (s *Store) CreateTemplate(ctx context.Context, in domain.CreateTemplateInput, userID string) (*domain.Template, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, fmt.Errorf("name required")
	}
	if len(in.Name) > 120 {
		return nil, fmt.Errorf("name too long")
	}
	normalizeTemplateBody(&in.Body)
	bodyJSON, err := json.Marshal(in.Body)
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
		insert into test_case_templates(name, description, body, created_by_id)
		values($1,$2,$3,$4)
		returning id::text`,
		in.Name, strings.TrimSpace(in.Description), bodyJSON, userID,
	).Scan(&id); err != nil {
		return nil, friendlyTemplateErr(err)
	}
	if err := writeAudit(ctx, tx, userID, "template.create", "Template", id,
		nil, map[string]any{"name": in.Name}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetTemplate(ctx, id)
}

// UpdateTemplate overwrites a template's name, description, and body.
func (s *Store) UpdateTemplate(ctx context.Context, id string, in domain.CreateTemplateInput, userID string) (*domain.Template, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, fmt.Errorf("name required")
	}
	if len(in.Name) > 120 {
		return nil, fmt.Errorf("name too long")
	}
	normalizeTemplateBody(&in.Body)
	bodyJSON, err := json.Marshal(in.Body)
	if err != nil {
		return nil, err
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		update test_case_templates
		set name = $2, description = $3, body = $4, updated_at = now()
		where id = $1`,
		id, in.Name, strings.TrimSpace(in.Description), bodyJSON)
	if err != nil {
		return nil, friendlyTemplateErr(err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	if err := writeAudit(ctx, tx, userID, "template.update", "Template", id,
		nil, map[string]any{"name": in.Name}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetTemplate(ctx, id)
}

// DeleteTemplate hard-deletes a template (config, not user content).
func (s *Store) DeleteTemplate(ctx context.Context, id, userID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `delete from test_case_templates where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := writeAudit(ctx, tx, userID, "template.delete", "Template", id, nil, nil); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ListTemplates returns every template, alphabetically by name.
func (s *Store) ListTemplates(ctx context.Context) ([]domain.Template, error) {
	rows, err := s.Pool.Query(ctx, `
		select t.id::text, t.name, t.description, t.body,
		       coalesce(u.name, ''), t.created_at, t.updated_at
		from test_case_templates t
		left join users u on u.id = t.created_by_id
		order by lower(t.name)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTemplates(rows)
}

// GetTemplate returns one template by id.
func (s *Store) GetTemplate(ctx context.Context, id string) (*domain.Template, error) {
	rows, err := s.Pool.Query(ctx, `
		select t.id::text, t.name, t.description, t.body,
		       coalesce(u.name, ''), t.created_at, t.updated_at
		from test_case_templates t
		left join users u on u.id = t.created_by_id
		where t.id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out, err := scanTemplates(rows)
	if err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, ErrNotFound
	}
	return &out[0], nil
}

func scanTemplates(rows pgx.Rows) ([]domain.Template, error) {
	out := []domain.Template{}
	for rows.Next() {
		var t domain.Template
		var raw []byte
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &raw,
			&t.CreatedByName, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &t.Body); err != nil {
				return nil, err
			}
		}
		normalizeTemplateBody(&t.Body)
		out = append(out, t)
	}
	return out, rows.Err()
}
