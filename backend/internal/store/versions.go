package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/verify/backend/internal/domain"
)

// ListCaseVersions returns a case's edit history newest-first, without the
// (potentially large) snapshot bodies.  test_case_versions is written on every
// create + update, so version 1 is the original.
func (s *Store) ListCaseVersions(ctx context.Context, caseID string) ([]domain.CaseVersionMeta, error) {
	rows, err := s.Pool.Query(ctx, `
		select v.version, coalesce(u.name, ''), v.changed_at
		from test_case_versions v
		left join users u on u.id = v.changed_by_id
		where v.test_case_id = $1
		order by v.version desc`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.CaseVersionMeta{}
	for rows.Next() {
		var m domain.CaseVersionMeta
		if err := rows.Scan(&m.Version, &m.ChangedByName, &m.ChangedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetCaseVersion returns a single historical version with its snapshot decoded
// back into a TestCaseInput.
func (s *Store) GetCaseVersion(ctx context.Context, caseID string, version int) (*domain.CaseVersion, error) {
	var v domain.CaseVersion
	var raw []byte
	err := s.Pool.QueryRow(ctx, `
		select v.version, coalesce(u.name, ''), v.changed_at, v.snapshot_json
		from test_case_versions v
		left join users u on u.id = v.changed_by_id
		where v.test_case_id = $1 and v.version = $2`, caseID, version,
	).Scan(&v.Version, &v.ChangedByName, &v.ChangedAt, &raw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &v.Snapshot); err != nil {
			return nil, err
		}
	}
	return &v, nil
}
