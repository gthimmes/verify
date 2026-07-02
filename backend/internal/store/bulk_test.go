package store_test

import (
	"context"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

func TestBulkUpdateCases_setPriorityStatusAutomation(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	c1 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Case one", Priority: "low"}, uid)
	c2 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Case two", Priority: "low"}, uid)
	ids := []string{c1.ID, c2.ID}

	n, err := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: ids, Op: "priority", Value: "critical"}, uid)
	if err != nil {
		t.Fatalf("bulk priority: %v", err)
	}
	if n != 2 {
		t.Fatalf("affected: want 2, got %d", n)
	}
	for _, id := range ids {
		got, _ := s.GetTestCase(ctx, id)
		if got.Priority != "critical" {
			t.Fatalf("case %s priority: %q", id, got.Priority)
		}
	}

	if _, err := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: ids, Op: "status", Value: "deprecated"}, uid); err != nil {
		t.Fatalf("bulk status: %v", err)
	}
	if _, err := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: ids, Op: "automation", Value: "full"}, uid); err != nil {
		t.Fatalf("bulk automation: %v", err)
	}
	got, _ := s.GetTestCase(ctx, c1.ID)
	if got.Status != "deprecated" || got.AutomationStatus != "full" {
		t.Fatalf("status=%q automation=%q", got.Status, got.AutomationStatus)
	}
}

func TestBulkUpdateCases_moveToFolder(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	c1 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Movable"}, uid)

	dest, err := s.CreateFolder(ctx, domain.CreateFolderInput{ProjectID: p.ID, Name: "Destination"})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	if _, err := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: []string{c1.ID}, Op: "move", Value: dest.ID}, uid); err != nil {
		t.Fatalf("bulk move: %v", err)
	}
	// The case should now appear when filtering by the destination folder.
	cases, err := s.ListTestCases(ctx, store.CaseListFilter{ProjectID: p.ID, FolderID: dest.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(cases) != 1 || cases[0].ID != c1.ID {
		t.Fatalf("expected case in destination folder, got %d cases", len(cases))
	}
}

func TestBulkUpdateCases_deleteAndRestore(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	c1 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Doomed"}, uid)

	if _, err := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: []string{c1.ID}, Op: "delete"}, uid); err != nil {
		t.Fatalf("bulk delete: %v", err)
	}
	live, _ := s.ListTestCases(ctx, store.CaseListFilter{ProjectID: p.ID})
	if len(live) != 0 {
		t.Fatalf("expected 0 live cases, got %d", len(live))
	}
	deleted, _ := s.ListTestCases(ctx, store.CaseListFilter{ProjectID: p.ID, IncludeDeleted: true})
	if len(deleted) != 1 {
		t.Fatalf("expected 1 deleted case, got %d", len(deleted))
	}

	if _, err := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: []string{c1.ID}, Op: "restore"}, uid); err != nil {
		t.Fatalf("bulk restore: %v", err)
	}
	live, _ = s.ListTestCases(ctx, store.CaseListFilter{ProjectID: p.ID})
	if len(live) != 1 {
		t.Fatalf("expected 1 restored case, got %d", len(live))
	}
}

func TestBulkUpdateCases_addAndRemoveTag(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	c1 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Taggable one"}, uid)
	c2 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Taggable two", Tags: []string{"regression"}}, uid)
	ids := []string{c1.ID, c2.ID}

	// add "smoke" to both
	n, err := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: ids, Op: "addTag", Value: "smoke"}, uid)
	if err != nil {
		t.Fatalf("addTag: %v", err)
	}
	if n != 2 {
		t.Fatalf("addTag affected: want 2, got %d", n)
	}
	for _, id := range ids {
		got, _ := s.GetTestCase(ctx, id)
		if !contains(got.Tags, "smoke") {
			t.Fatalf("case %s missing smoke tag: %v", id, got.Tags)
		}
	}
	// adding again is a no-op (on conflict do nothing)
	if n, _ := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: ids, Op: "addTag", Value: "smoke"}, uid); n != 0 {
		t.Fatalf("re-add should affect 0, got %d", n)
	}

	// remove "smoke" from both; c2 keeps its "regression" tag
	if _, err := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: ids, Op: "removeTag", Value: "smoke"}, uid); err != nil {
		t.Fatalf("removeTag: %v", err)
	}
	got2, _ := s.GetTestCase(ctx, c2.ID)
	if contains(got2.Tags, "smoke") {
		t.Fatalf("smoke should be gone: %v", got2.Tags)
	}
	if !contains(got2.Tags, "regression") {
		t.Fatalf("regression should remain: %v", got2.Tags)
	}
}

func contains(xs []string, target string) bool {
	for _, x := range xs {
		if x == target {
			return true
		}
	}
	return false
}

func TestBulkUpdateCases_validation(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	c1 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Guarded"}, uid)

	cases := []domain.BulkCaseRequest{
		{CaseIDs: nil, Op: "priority", Value: "high"},
		{CaseIDs: []string{c1.ID}, Op: "priority", Value: "nonsense"},
		{CaseIDs: []string{c1.ID}, Op: "bogus", Value: "x"},
		{CaseIDs: []string{c1.ID}, Op: "move", Value: ""},
	}
	for i, req := range cases {
		if _, err := s.BulkUpdateCases(ctx, req, uid); err == nil {
			t.Fatalf("case %d: expected error, got nil", i)
		}
	}
}

func TestBulkUpdateCases_writesAudit(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	c1 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Audited"}, uid)

	if _, err := s.BulkUpdateCases(ctx, domain.BulkCaseRequest{CaseIDs: []string{c1.ID}, Op: "priority", Value: "high"}, uid); err != nil {
		t.Fatal(err)
	}
	logs, err := s.RecentAudit(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, l := range logs {
		if l.Action == "test_case.bulk_update" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a test_case.bulk_update audit row")
	}
}
