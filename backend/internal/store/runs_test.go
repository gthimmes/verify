package store_test

import (
	"context"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
	"github.com/verify/backend/internal/testutil"
)

// runFixture builds a project + area + feature + 2 cases + 1 parameterized
// case with 2 data rows.  Returns the case ids in deterministic order.
func runFixture(t *testing.T, s *store.Store, uid string) (projectID string, caseIDs []string) {
	t.Helper()
	p := makeProject(t, s, uid, "ACM", "Acme")
	a := makeArea(t, s, p.ID, "PAY", "Payments")
	f := makeFeature(t, s, p.ID, a.ID, "One-time payment")

	c1 := makeCase(t, s, domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Pay invoice",
		Priority: "critical", AutomationStatus: "not_automated",
	}, uid)
	c2 := makeCase(t, s, domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Refund",
		Priority: "high", AutomationStatus: "not_automated",
	}, uid)
	cParam := makeCase(t, s, domain.TestCaseInput{
		ProjectID: p.ID, FolderID: f.ID, Title: "Pay across methods",
		Priority: "high",
		Steps: []domain.TestStep{
			{Order: 0, Action: "Pay with {{method}}", Expected: "Charged"},
		},
		Parameters: []domain.TestCaseParam{{Name: "method", Order: 0}},
		DataRows: []domain.TestCaseDataRow{
			{Order: 0, Label: ptr("card"), Values: map[string]string{"method": "credit card"}},
			{Order: 1, Label: ptr("ach"), Values: map[string]string{"method": "ACH"}},
		},
	}, uid)
	return p.ID, []string{c1.ID, c2.ID, cParam.ID}
}

func TestCreateRun_snapshotsCasesAndExpandsDataRows(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)

	run, err := s.CreateRun(context.Background(), domain.CreateRunInput{
		ProjectID: pid, Name: "May regression",
		Environment: "staging", Build: "v1.0.0",
		CaseIDs: caseIDs,
	}, uid)
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != "draft" {
		t.Fatalf("status: %q", run.Status)
	}
	// 2 plain cases + 1 case × 2 data rows = 4 executions
	if run.Counts.Total != 4 {
		t.Fatalf("expected 4 executions, got %d", run.Counts.Total)
	}
	if run.Counts.NotRun != 4 {
		t.Fatalf("all should start as not_run, got NotRun=%d", run.Counts.NotRun)
	}

	execs, err := s.ListExecutions(context.Background(), run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(execs) != 4 {
		t.Fatalf("expected 4 executions, got %d", len(execs))
	}
	// the parameterized case should produce 2 rows with index 0 and 1
	var idxs []int
	for _, e := range execs {
		if e.DataRowIndex != nil {
			idxs = append(idxs, *e.DataRowIndex)
		}
	}
	if len(idxs) != 2 {
		t.Fatalf("expected 2 parameterized executions, got %d", len(idxs))
	}
}

func TestCreateRun_rejectsEmptyCaseList(t *testing.T) {
	s, uid := newTest(t)
	pid, _ := runFixture(t, s, uid)
	if _, err := s.CreateRun(context.Background(), domain.CreateRunInput{
		ProjectID: pid, Name: "Empty",
	}, uid); err == nil {
		t.Fatal("expected error for empty CaseIDs")
	}
}

func TestSetRunStatus_setsActualStartAndEnd(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	run, _ := s.CreateRun(context.Background(), domain.CreateRunInput{
		ProjectID: pid, Name: "Status run", CaseIDs: caseIDs,
	}, uid)

	if err := s.SetRunStatus(context.Background(), run.ID, "in_progress", ""); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetRun(context.Background(), run.ID)
	if got.ActualStart == nil {
		t.Fatal("actual_start should be set after starting")
	}

	if err := s.SetRunStatus(context.Background(), run.ID, "completed", ""); err != nil {
		t.Fatal(err)
	}
	got, _ = s.GetRun(context.Background(), run.ID)
	if got.ActualEnd == nil {
		t.Fatal("actual_end should be set after completing")
	}
}

func TestSetRunStatus_aborted(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	run, _ := s.CreateRun(context.Background(), domain.CreateRunInput{
		ProjectID: pid, Name: "Status run", CaseIDs: caseIDs,
	}, uid)
	if err := s.SetRunStatus(context.Background(), run.ID, "aborted", "build broken"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetRun(context.Background(), run.ID)
	if got.Status != "aborted" {
		t.Fatalf("status: %q", got.Status)
	}
	if got.AbortReason == nil || *got.AbortReason != "build broken" {
		t.Fatalf("reason missing or wrong: %v", got.AbortReason)
	}
}

func TestCloneRun_duplicatesEverything(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	src, _ := s.CreateRun(context.Background(), domain.CreateRunInput{
		ProjectID: pid, Name: "Source", CaseIDs: caseIDs,
		Environment: "staging", Build: "v1.0.0",
	}, uid)
	clone, err := s.CloneRun(context.Background(), src.ID, uid)
	if err != nil {
		t.Fatal(err)
	}
	if clone.ID == src.ID {
		t.Fatal("clone must have a new id")
	}
	if clone.Counts.Total != src.Counts.Total {
		t.Fatalf("clone exec count %d != src %d", clone.Counts.Total, src.Counts.Total)
	}
	if clone.Status != "draft" {
		t.Fatalf("clone should start as draft, got %q", clone.Status)
	}
}

func TestReRunFailed_onlyIncludesFailedAndBlocked(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	src, _ := s.CreateRun(context.Background(), domain.CreateRunInput{
		ProjectID: pid, Name: "Source", CaseIDs: caseIDs,
	}, uid)

	// record one pass, one fail, one blocked, one not_run
	execs, _ := s.ListExecutions(context.Background(), src.ID)
	results := []string{"pass", "fail", "blocked", "not_run"}
	for i, e := range execs {
		_ = s.RecordExecution(context.Background(), e.ID, domain.RecordExecutionInput{
			Result: results[i],
		}, uid)
	}

	rerun, err := s.ReRunFailed(context.Background(), src.ID, uid)
	if err != nil {
		t.Fatal(err)
	}
	if rerun.Counts.Total != 2 {
		t.Fatalf("expected 2 (fail+blocked), got %d", rerun.Counts.Total)
	}
	if rerun.ParentRunID == nil || *rerun.ParentRunID != src.ID {
		t.Fatalf("parent_run_id should be %s, got %v", src.ID, rerun.ParentRunID)
	}
}

func TestListRuns_filterActiveOnly(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	r1, _ := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "Active", CaseIDs: caseIDs}, uid)
	r2, _ := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "Done", CaseIDs: caseIDs}, uid)
	_ = s.SetRunStatus(context.Background(), r2.ID, "completed", "")

	all, _ := s.ListRuns(context.Background(), pid, false)
	if len(all) != 2 {
		t.Fatalf("all: %d", len(all))
	}
	active, _ := s.ListRuns(context.Background(), "", true)
	found := false
	for _, r := range active {
		if r.ID == r1.ID {
			found = true
		}
		if r.ID == r2.ID {
			t.Fatal("completed run should not appear in active list")
		}
	}
	if !found {
		t.Fatal("active run missing")
	}
	_ = testutil.AuditCount(t, testutil.Pool(t), "run.create") // touch to make sure no panic
}

func TestListRunsFiltered_statusAndQuery(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	ctx := context.Background()

	smoke, _ := s.CreateRun(ctx, domain.CreateRunInput{
		ProjectID: pid, Name: "Smoke nightly", Build: "build-42", CaseIDs: caseIDs,
	}, uid)
	reg, _ := s.CreateRun(ctx, domain.CreateRunInput{
		ProjectID: pid, Name: "Regression sweep", CaseIDs: caseIDs,
	}, uid)
	_ = s.SetRunStatus(ctx, reg.ID, "completed", "")

	// Status filter returns only the completed run.
	completed, _ := s.ListRunsFiltered(ctx, store.RunListFilter{ProjectID: pid, Status: "completed"})
	if len(completed) != 1 || completed[0].ID != reg.ID {
		t.Fatalf("status filter: expected only the completed run, got %d", len(completed))
	}

	// Text query matches name (case-insensitive).
	byName, _ := s.ListRunsFiltered(ctx, store.RunListFilter{ProjectID: pid, Query: "smoke"})
	if len(byName) != 1 || byName[0].ID != smoke.ID {
		t.Fatalf("name query: expected the smoke run, got %d", len(byName))
	}

	// Text query also matches build.
	byBuild, _ := s.ListRunsFiltered(ctx, store.RunListFilter{ProjectID: pid, Query: "build-42"})
	if len(byBuild) != 1 || byBuild[0].ID != smoke.ID {
		t.Fatalf("build query: expected the smoke run, got %d", len(byBuild))
	}

	// No-filter still returns both.
	all, _ := s.ListRunsFiltered(ctx, store.RunListFilter{ProjectID: pid})
	if len(all) != 2 {
		t.Fatalf("unfiltered: expected 2 runs, got %d", len(all))
	}
}

func TestCreateRun_writesAuditLog(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	_, _ = s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "Audit", CaseIDs: caseIDs}, uid)
	if testutil.AuditCount(t, testutil.Pool(t), "run.create") != 1 {
		t.Fatal("expected one run.create audit row")
	}
}
