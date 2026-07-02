package store_test

import (
	"context"
	"testing"

	"github.com/verify/backend/internal/domain"
)

func TestCreateProject_uniqueKeyAutoSuffix(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p1, err := s.CreateProject(ctx, domain.CreateProjectInput{Name: "Acme", Key: "ACM"}, uid)
	if err != nil {
		t.Fatalf("first project: %v", err)
	}
	if p1.Key != "ACM" {
		t.Fatalf("want key ACM, got %q", p1.Key)
	}
	p2, err := s.CreateProject(ctx, domain.CreateProjectInput{Name: "Acme Two", Key: "ACM"}, uid)
	if err != nil {
		t.Fatalf("second project: %v", err)
	}
	if p2.Key == "ACM" {
		t.Fatalf("expected suffixed key, got duplicate ACM")
	}
}

func TestCreateProject_keyDerivedFromName(t *testing.T) {
	s, uid := newTest(t)
	p, err := s.CreateProject(context.Background(),
		domain.CreateProjectInput{Name: "Customer Portal"}, uid)
	if err != nil {
		t.Fatal(err)
	}
	if p.Key != "CP" {
		t.Fatalf("want CP, got %q", p.Key)
	}
}

func TestCreateProject_validatesName(t *testing.T) {
	s, uid := newTest(t)
	if _, err := s.CreateProject(context.Background(),
		domain.CreateProjectInput{Name: "x"}, uid); err == nil {
		t.Fatal("expected error for too-short name")
	}
}

func TestListProjects_filtersArchivedByDefault(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	a := makeProject(t, s, uid, "AAA", "Project A")
	b := makeProject(t, s, uid, "BBB", "Project B")
	if err := s.SetProjectStatus(ctx, b.ID, "archived"); err != nil {
		t.Fatal(err)
	}
	active, err := s.ListProjects(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(active) != 1 || active[0].ID != a.ID {
		t.Fatalf("expected only A, got %d projects", len(active))
	}
	all, err := s.ListProjects(ctx, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("expected both, got %d", len(all))
	}
}

func TestListProjects_emptyReturnsNonNilSlice(t *testing.T) {
	s, _ := newTest(t)
	got, err := s.ListProjects(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("expected non-nil empty slice")
	}
	if len(got) != 0 {
		t.Fatalf("expected 0, got %d", len(got))
	}
}

func TestListProjects_summaryCountsAreAccurate(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	makeCase(t, s, domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Pay invoice",
		AutomationStatus: "full",
	}, uid)
	makeCase(t, s, domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Refund payment",
		AutomationStatus: "not_automated",
	}, uid)

	rows, err := s.ListProjects(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 project, got %d", len(rows))
	}
	r := rows[0]
	if r.TestCaseCount != 2 || r.AutomatedCount != 1 || r.FolderCount != 1 {
		t.Fatalf("unexpected counts: cases=%d auto=%d folders=%d", r.TestCaseCount, r.AutomatedCount, r.FolderCount)
	}
}

func TestRenameProject_updatesAndValidates(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	if err := s.RenameProject(context.Background(), p.ID, "Renamed"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetProject(context.Background(), p.ID)
	if got.Name != "Renamed" {
		t.Fatalf("expected Renamed, got %q", got.Name)
	}
	if err := s.RenameProject(context.Background(), p.ID, "x"); err == nil {
		t.Fatal("expected error for too-short name")
	}
}

func TestSetProjectStatus_rejectsUnknown(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	if err := s.SetProjectStatus(context.Background(), p.ID, "deleted"); err == nil {
		t.Fatal("expected error for invalid status")
	}
}

func TestGetProject_notFound(t *testing.T) {
	s, _ := newTest(t)
	if _, err := s.GetProject(context.Background(), "00000000-0000-0000-0000-000000000000"); err == nil {
		t.Fatal("expected ErrNotFound")
	}
}
