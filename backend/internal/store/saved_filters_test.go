package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

func TestSavedFilters_createListDelete(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")

	f, err := s.CreateSavedFilter(ctx, domain.CreateSavedFilterInput{
		ProjectID: p.ID, Name: "Critical smoke", Scope: "cases",
		Query: map[string]string{"priority": "critical", "tag": "smoke"},
	}, uid)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if f.Query["priority"] != "critical" || f.Query["tag"] != "smoke" {
		t.Fatalf("query roundtrip: %v", f.Query)
	}
	if f.OwnerName == "" {
		t.Fatalf("expected owner name to be populated")
	}

	list, err := s.ListSavedFilters(ctx, p.ID, "cases", uid)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 filter, got %d", len(list))
	}

	if err := s.DeleteSavedFilter(ctx, f.ID, uid); err != nil {
		t.Fatalf("delete: %v", err)
	}
	list, _ = s.ListSavedFilters(ctx, p.ID, "cases", uid)
	if len(list) != 0 {
		t.Fatalf("expected 0 after delete, got %d", len(list))
	}
}

func TestSavedFilters_upsertByName(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")

	if _, err := s.CreateSavedFilter(ctx, domain.CreateSavedFilterInput{
		ProjectID: p.ID, Name: "My view", Query: map[string]string{"status": "active"},
	}, uid); err != nil {
		t.Fatal(err)
	}
	// Re-saving the same name overwrites the query rather than erroring.
	f2, err := s.CreateSavedFilter(ctx, domain.CreateSavedFilterInput{
		ProjectID: p.ID, Name: "My view", Query: map[string]string{"status": "draft"}, Shared: true,
	}, uid)
	if err != nil {
		t.Fatalf("re-save: %v", err)
	}
	if f2.Query["status"] != "draft" || !f2.Shared {
		t.Fatalf("upsert didn't overwrite: %+v", f2)
	}
	list, _ := s.ListSavedFilters(ctx, p.ID, "cases", uid)
	if len(list) != 1 {
		t.Fatalf("upsert created a duplicate: %d rows", len(list))
	}
}

func TestSavedFilters_sharedVisibleToOthers(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")

	other, err := s.EnsureUser(ctx, "other@verify.local", "Other User", "member")
	if err != nil {
		t.Fatal(err)
	}

	// uid creates one private and one shared filter.
	if _, err := s.CreateSavedFilter(ctx, domain.CreateSavedFilterInput{
		ProjectID: p.ID, Name: "Private", Query: map[string]string{"q": "x"},
	}, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSavedFilter(ctx, domain.CreateSavedFilterInput{
		ProjectID: p.ID, Name: "Team view", Query: map[string]string{"q": "y"}, Shared: true,
	}, uid); err != nil {
		t.Fatal(err)
	}

	// `other` sees only the shared one.
	list, err := s.ListSavedFilters(ctx, p.ID, "cases", other.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Name != "Team view" {
		t.Fatalf("expected only the shared filter, got %d (%+v)", len(list), list)
	}

	// `other` cannot delete uid's shared filter (not the owner).
	if err := s.DeleteSavedFilter(ctx, list[0].ID, other.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound deleting another user's filter, got %v", err)
	}
}

func TestSavedFilters_validation(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")

	if _, err := s.CreateSavedFilter(ctx, domain.CreateSavedFilterInput{ProjectID: p.ID, Name: "  "}, uid); err == nil {
		t.Fatal("expected error for blank name")
	}
	if _, err := s.CreateSavedFilter(ctx, domain.CreateSavedFilterInput{ProjectID: p.ID, Name: "x", Scope: "bogus"}, uid); err == nil {
		t.Fatal("expected error for bad scope")
	}
}
