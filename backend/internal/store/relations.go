package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/verify/backend/internal/domain"
)

// AddRelation links two cases.  Both must exist, be in the same project, and
// not be soft-deleted.  The link is undirected (see the migration), so adding
// B from A is a no-op if A→B already exists.
func (s *Store) AddRelation(ctx context.Context, sourceID, targetID, relationType, userID string) error {
	if sourceID == targetID {
		return fmt.Errorf("a case cannot relate to itself")
	}
	if relationType == "" {
		relationType = "related"
	}

	var srcProj, tgtProj string
	if err := s.Pool.QueryRow(ctx,
		`select project_id::text from test_cases where id = $1 and deleted_at is null`, sourceID).Scan(&srcProj); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if err := s.Pool.QueryRow(ctx,
		`select project_id::text from test_cases where id = $1 and deleted_at is null`, targetID).Scan(&tgtProj); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("target case not found")
		}
		return err
	}
	if srcProj != tgtProj {
		return fmt.Errorf("cases must be in the same project to be linked")
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// on-conflict on the normalized pair index makes re-linking idempotent.
	if _, err := tx.Exec(ctx, `
		insert into test_case_relations(source_case_id, target_case_id, relation_type, created_by_id)
		values($1, $2, $3, $4)
		on conflict (least(source_case_id, target_case_id), greatest(source_case_id, target_case_id))
		do nothing`,
		sourceID, targetID, relationType, userID); err != nil {
		return err
	}
	if err := writeAudit(ctx, tx, userID, "test_case.relation_add", "TestCase", sourceID,
		nil, map[string]any{"targetId": targetID, "relationType": relationType}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RemoveRelation deletes the link between two cases in either direction.
func (s *Store) RemoveRelation(ctx context.Context, caseID, otherID, userID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		delete from test_case_relations
		where (source_case_id = $1 and target_case_id = $2)
		   or (source_case_id = $2 and target_case_id = $1)`,
		caseID, otherID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := writeAudit(ctx, tx, userID, "test_case.relation_remove", "TestCase", caseID,
		nil, map[string]any{"targetId": otherID}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ListRelations returns the cases linked to caseID, from either direction,
// excluding soft-deleted cases, ordered by public id.
func (s *Store) ListRelations(ctx context.Context, caseID string) ([]domain.RelatedCase, error) {
	rows, err := s.Pool.Query(ctx, `
		select other.id::text, other.public_id, other.title, other.status, other.priority, rel.relation_type
		from (
			select target_case_id as other_id, relation_type from test_case_relations where source_case_id = $1
			union all
			select source_case_id as other_id, relation_type from test_case_relations where target_case_id = $1
		) rel
		join test_cases other on other.id = rel.other_id and other.deleted_at is null
		order by other.public_id`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.RelatedCase{}
	for rows.Next() {
		var rc domain.RelatedCase
		if err := rows.Scan(&rc.ID, &rc.PublicID, &rc.Title, &rc.Status, &rc.Priority, &rc.RelationType); err != nil {
			return nil, err
		}
		out = append(out, rc)
	}
	return out, rows.Err()
}
