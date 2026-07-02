package store_test

import (
	"context"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

func TestCaseVersions_recordedOnCreateAndUpdate(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	tc := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Original title"}, uid)

	// edit twice
	in := domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Second title",
		Type: "functional", Priority: "high", Status: "active", AutomationStatus: "not_automated",
		Steps: []domain.TestStep{{Order: 0, Action: "do", Expected: "done"}},
	}
	if _, err := s.UpdateTestCase(ctx, tc.ID, in, uid); err != nil {
		t.Fatal(err)
	}
	in.Title = "Third title"
	if _, err := s.UpdateTestCase(ctx, tc.ID, in, uid); err != nil {
		t.Fatal(err)
	}

	versions, err := s.ListCaseVersions(ctx, tc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(versions) != 3 {
		t.Fatalf("expected 3 versions, got %d", len(versions))
	}
	// newest first
	if versions[0].Version != 3 || versions[2].Version != 1 {
		t.Fatalf("order: %d..%d", versions[0].Version, versions[2].Version)
	}
	if versions[0].ChangedByName == "" {
		t.Fatalf("expected changedByName to be populated")
	}

	// snapshot of v1 holds the original title
	v1, err := s.GetCaseVersion(ctx, tc.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	if v1.Snapshot.Title != "Original title" {
		t.Fatalf("v1 title: %q", v1.Snapshot.Title)
	}
	v3, err := s.GetCaseVersion(ctx, tc.ID, 3)
	if err != nil {
		t.Fatal(err)
	}
	if v3.Snapshot.Title != "Third title" {
		t.Fatalf("v3 title: %q", v3.Snapshot.Title)
	}
}

func TestGetCaseVersion_notFound(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	tc := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Only v1"}, uid)

	if _, err := s.GetCaseVersion(ctx, tc.ID, 99); err != store.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}
