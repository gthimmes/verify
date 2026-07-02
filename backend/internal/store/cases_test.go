package store_test

import (
	"context"
	"strings"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
	"github.com/verify/backend/internal/testutil"
)

func TestCreateTestCase_publicIDFormatAndSequence(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	c1 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Pay invoice"}, uid)
	c2 := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Refund"}, uid)

	if c1.PublicID != "ACM-PAY-0001" || c2.PublicID != "ACM-PAY-0002" {
		t.Fatalf("ids: %s, %s", c1.PublicID, c2.PublicID)
	}
	if c1.SequenceNum != 1 || c2.SequenceNum != 2 {
		t.Fatalf("sequence: %d, %d", c1.SequenceNum, c2.SequenceNum)
	}
}

func TestCreateTestCase_writesStepsParamsRowsAndTags(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time")
	in := domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Parameterized refund",
		Tags: []string{"smoke", "money"},
		Steps: []domain.TestStep{
			{Order: 0, Action: "Open {{method}} payment", Expected: "Modal opens"},
			{Order: 1, Action: "Refund {{partial}}", Expected: "Status updates"},
		},
		Parameters: []domain.TestCaseParam{{Name: "method", Order: 0}, {Name: "partial", Order: 1}},
		DataRows: []domain.TestCaseDataRow{
			{Order: 0, Label: ptr("card_50"), Values: map[string]string{"method": "credit card", "partial": "$50"}},
			{Order: 1, Label: ptr("ach_25"), Values: map[string]string{"method": "ACH", "partial": "$25"}},
		},
	}
	tc := makeCase(t, s, in, uid)

	got, err := s.GetTestCase(context.Background(), tc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Steps) != 2 {
		t.Fatalf("steps: %d", len(got.Steps))
	}
	if len(got.Parameters) != 2 {
		t.Fatalf("params: %d", len(got.Parameters))
	}
	if len(got.DataRows) != 2 {
		t.Fatalf("rows: %d", len(got.DataRows))
	}
	if got.DataRows[0].Values["method"] != "credit card" {
		t.Fatalf("data row[0].method = %q", got.DataRows[0].Values["method"])
	}
	if !equalSet(got.Tags, []string{"smoke", "money"}) {
		t.Fatalf("tags: %v", got.Tags)
	}
}

func TestCreateTestCase_emptyTitleIsRejected(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "Feature One")
	_, err := s.CreateTestCase(context.Background(), domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "x",
	}, uid)
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestUpdateTestCase_bumpsVersionAndResetsChildRows(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "Feature One")
	tc := makeCase(t, s, domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Original",
		Tags:  []string{"smoke"},
		Steps: []domain.TestStep{{Order: 0, Action: "step1", Expected: ""}},
	}, uid)

	updated, err := s.UpdateTestCase(context.Background(), tc.ID, domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Updated", Type: "regression", Priority: "high",
		Status: "active", AutomationStatus: "partial", Tags: []string{"regression"},
		Steps: []domain.TestStep{
			{Order: 0, Action: "step1 v2", Expected: ""},
			{Order: 1, Action: "step2", Expected: ""},
		},
	}, uid)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Version != 2 {
		t.Fatalf("version: %d", updated.Version)
	}
	if updated.Title != "Updated" {
		t.Fatalf("title: %q", updated.Title)
	}
	if len(updated.Steps) != 2 {
		t.Fatalf("steps: %d", len(updated.Steps))
	}
	if !equalSet(updated.Tags, []string{"regression"}) {
		t.Fatalf("tags should be replaced, got %v", updated.Tags)
	}

	// version table holds both
	pool := testutil.Pool(t)
	var versions int
	_ = pool.QueryRow(context.Background(),
		`select count(*) from test_case_versions where test_case_id = $1`, tc.ID).Scan(&versions)
	if versions != 2 {
		t.Fatalf("expected 2 version rows, got %d", versions)
	}
}

func TestSoftDeleteRestoreTestCase(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "Feature One")
	tc := makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Some case"}, uid)

	if err := s.SoftDeleteTestCase(context.Background(), tc.ID, true); err != nil {
		t.Fatal(err)
	}
	cases, _ := s.ListTestCases(context.Background(), store.CaseListFilter{ProjectID: p.ID})
	if len(cases) != 0 {
		t.Fatal("soft-deleted case should not appear in default list")
	}
	cases, _ = s.ListTestCases(context.Background(), store.CaseListFilter{ProjectID: p.ID, IncludeDeleted: true})
	if len(cases) != 1 {
		t.Fatal("archived filter should expose deleted")
	}

	if err := s.SoftDeleteTestCase(context.Background(), tc.ID, false); err != nil {
		t.Fatal(err)
	}
	cases, _ = s.ListTestCases(context.Background(), store.CaseListFilter{ProjectID: p.ID})
	if len(cases) != 1 {
		t.Fatal("restored case should appear")
	}
}

func TestDuplicateTestCase_clonesEverything(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "Feature One")
	src := makeCase(t, s, domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Source",
		Tags:  []string{"smoke"},
		Steps: []domain.TestStep{{Order: 0, Action: "s1", Expected: "e1"}},
		Parameters: []domain.TestCaseParam{{Name: "method", Order: 0}},
		DataRows: []domain.TestCaseDataRow{{Order: 0, Label: ptr("card"), Values: map[string]string{"method": "card"}}},
	}, uid)

	dup, err := s.DuplicateTestCase(context.Background(), src.ID, uid)
	if err != nil {
		t.Fatal(err)
	}
	if dup.PublicID == src.PublicID {
		t.Fatal("duplicate must have a new id")
	}
	if !strings.HasSuffix(dup.Title, "(copy)") {
		t.Fatalf("title: %q", dup.Title)
	}
	if len(dup.Steps) != 1 || len(dup.Parameters) != 1 || len(dup.DataRows) != 1 {
		t.Fatalf("children not copied: steps=%d params=%d rows=%d", len(dup.Steps), len(dup.Parameters), len(dup.DataRows))
	}
	if dup.Status != "draft" {
		t.Fatalf("status of dup should be draft, got %q", dup.Status)
	}
}

func TestListTestCases_filterByPriorityAndAutomation(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "Feature One")
	makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Case Alpha", Priority: "critical", AutomationStatus: "full"}, uid)
	makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Case Beta", Priority: "low", AutomationStatus: "not_automated"}, uid)
	makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Case Gamma", Priority: "critical", AutomationStatus: "not_automated"}, uid)

	got, err := s.ListTestCases(context.Background(), store.CaseListFilter{
		ProjectID: p.ID, Priority: "critical",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("priority filter: %d", len(got))
	}
	got, _ = s.ListTestCases(context.Background(), store.CaseListFilter{
		ProjectID: p.ID, AutomationStatus: "full",
	})
	if len(got) != 1 {
		t.Fatalf("automation filter: %d", len(got))
	}
}

func TestListTestCases_searchHitsTitleAndSteps(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "Feature One")
	makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Refund credit card"}, uid)
	makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Pay invoice",
		Steps: []domain.TestStep{{Order: 0, Action: "use the refund button", Expected: ""}},
	}, uid)
	makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Other"}, uid)

	got, err := s.ListTestCases(context.Background(), store.CaseListFilter{ProjectID: p.ID, Q: "refund"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 matches, got %d", len(got))
	}
}

func TestSearchCases_acrossProjects(t *testing.T) {
	s, uid := newTest(t)
	p1 := makeProject(t, s, uid, "P1", "P1")
	a1 := makeArea(t, s, p1.ID, "AA", "Area A")
	f1 := makeFeature(t, s, p1.ID, a1.ID, "Feature A")
	makeCase(t, s, domain.TestCaseInput{ProjectID: p1.ID, FolderID: f1.ID, Title: "Refund credit"}, uid)

	p2 := makeProject(t, s, uid, "P2", "P2")
	a2 := makeArea(t, s, p2.ID, "BB", "Area B")
	f2 := makeFeature(t, s, p2.ID, a2.ID, "Feature B")
	makeCase(t, s, domain.TestCaseInput{ProjectID: p2.ID, FolderID: f2.ID, Title: "Refund ACH"}, uid)

	got, err := s.SearchCases(context.Background(), "refund", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 results, got %d", len(got))
	}
}

func TestCreateTestCase_writesAuditLog(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "Feature One")
	makeCase(t, s, domain.TestCaseInput{ProjectID: p.ID, FolderID: f.ID, Title: "Audit case"}, uid)
	if got := testutil.AuditCount(t, testutil.Pool(t), "test_case.create"); got != 1 {
		t.Fatalf("expected 1 create audit, got %d", got)
	}
}

func ptr(s string) *string { return &s }

func equalSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	m := map[string]bool{}
	for _, x := range a {
		m[x] = true
	}
	for _, x := range b {
		if !m[x] {
			return false
		}
	}
	return true
}
