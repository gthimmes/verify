package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

func TestRelations_addListRemove(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	pid, caseIDs := runFixture(t, s, uid)
	_ = pid
	a, b := caseIDs[0], caseIDs[1]

	if err := s.AddRelation(ctx, a, b, "related", uid); err != nil {
		t.Fatal(err)
	}

	// Undirected: visible from both ends.
	fromA, _ := s.ListRelations(ctx, a)
	if len(fromA) != 1 || fromA[0].ID != b {
		t.Fatalf("from A: %+v", fromA)
	}
	fromB, _ := s.ListRelations(ctx, b)
	if len(fromB) != 1 || fromB[0].ID != a {
		t.Fatalf("from B: %+v", fromB)
	}

	// Re-adding the reverse is idempotent (no duplicate).
	if err := s.AddRelation(ctx, b, a, "related", uid); err != nil {
		t.Fatal(err)
	}
	fromA, _ = s.ListRelations(ctx, a)
	if len(fromA) != 1 {
		t.Fatalf("expected 1 relation after reverse re-add, got %d", len(fromA))
	}

	// Self-link rejected.
	if err := s.AddRelation(ctx, a, a, "", uid); err == nil {
		t.Fatal("expected self-link rejection")
	}

	// Remove (either direction) clears it.
	if err := s.RemoveRelation(ctx, a, b, uid); err != nil {
		t.Fatal(err)
	}
	fromA, _ = s.ListRelations(ctx, a)
	if len(fromA) != 0 {
		t.Fatalf("expected 0 after remove, got %d", len(fromA))
	}
	// Removing a missing relation is ErrNotFound.
	if err := s.RemoveRelation(ctx, a, b, uid); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestRelations_crossProjectRejected(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	_, caseIDs := runFixture(t, s, uid)

	// A case in a different project.
	p2 := makeProject(t, s, uid, "OTH", "Other")
	a2 := makeArea(t, s, p2.ID, "GEN", "General")
	f2 := makeFeature(t, s, p2.ID, a2.ID, "Feature")
	other := makeCase(t, s, domain.TestCaseInput{
		ProjectID: p2.ID, FeatureID: f2.ID, Title: "Elsewhere",
		Priority: "low", AutomationStatus: "not_automated",
	}, uid)

	if err := s.AddRelation(ctx, caseIDs[0], other.ID, "related", uid); err == nil {
		t.Fatal("expected cross-project link to be rejected")
	}
}
