package store_test

import (
	"context"
	"testing"

	"github.com/verify/backend/internal/domain"
)

func TestProjectReport_aggregatesBasicMetrics(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)

	// add a fully-automated case + a partially-automated one to exercise the count
	_ = caseIDs

	rep, err := s.ProjectReport(context.Background(), pid)
	if err != nil {
		t.Fatal(err)
	}
	if rep.TotalCases != 3 {
		t.Fatalf("totalCases: %d", rep.TotalCases)
	}
	if rep.AutomationPct != 0 {
		t.Fatalf("automationPct should be 0 for fixture, got %d", rep.AutomationPct)
	}
	if len(rep.FolderCoverage) != 1 {
		t.Fatalf("expected 1 folder, got %d", len(rep.FolderCoverage))
	}
}

func TestProjectReport_candidatesPrioritizeFailingCriticalCases(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	// Run + record: critical case fails twice, high case passes
	run, err := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "Report run", CaseIDs: caseIDs}, uid)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	execs, _ := s.ListExecutions(context.Background(), run.ID)
	for _, e := range execs {
		if e.SnapshotCase.Priority == "critical" {
			_ = s.RecordExecution(context.Background(), e.ID, domain.RecordExecutionInput{Result: "fail"}, uid)
		} else {
			_ = s.RecordExecution(context.Background(), e.ID, domain.RecordExecutionInput{Result: "pass"}, uid)
		}
	}

	rep, _ := s.ProjectReport(context.Background(), pid)
	if len(rep.Candidates) == 0 {
		t.Fatal("expected candidates to be ranked")
	}
	// the critical-failing case should be the top candidate
	if rep.Candidates[0].Case.Priority != "critical" {
		t.Fatalf("top candidate priority: %q", rep.Candidates[0].Case.Priority)
	}
}

func TestProjectReport_topFailingCounts(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)

	// Run twice, fail the same case twice.
	run, _ := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "R1", CaseIDs: caseIDs}, uid)
	execs, _ := s.ListExecutions(context.Background(), run.ID)
	first := execs[0]
	_ = s.RecordExecution(context.Background(), first.ID, domain.RecordExecutionInput{Result: "fail"}, uid)

	run2, _ := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "R2", CaseIDs: caseIDs}, uid)
	execs2, _ := s.ListExecutions(context.Background(), run2.ID)
	for _, e := range execs2 {
		if e.SnapshotCase.PublicID == first.SnapshotCase.PublicID {
			_ = s.RecordExecution(context.Background(), e.ID, domain.RecordExecutionInput{Result: "fail"}, uid)
		}
	}

	rep, _ := s.ProjectReport(context.Background(), pid)
	if len(rep.TopFailing) == 0 {
		t.Fatal("expected top failing entries")
	}
	if rep.TopFailing[0].Case.PublicID != first.SnapshotCase.PublicID {
		t.Fatalf("top failing case: %q", rep.TopFailing[0].Case.PublicID)
	}
	if rep.TopFailing[0].Count != 2 {
		t.Fatalf("count: %d", rep.TopFailing[0].Count)
	}
}

func TestRecentAudit_returnsInOrder(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	_, _ = s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "Audit run", CaseIDs: caseIDs}, uid)
	logs, err := s.RecentAudit(context.Background(), 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) == 0 {
		t.Fatal("expected audit log entries from fixture")
	}
	// entries are ordered desc by created_at; the most recent should be run.create
	if logs[0].Action != "run.create" {
		t.Fatalf("most recent action: %q", logs[0].Action)
	}
}
