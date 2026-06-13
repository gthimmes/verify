package store_test

import (
	"context"
	"testing"

	"github.com/verify/backend/internal/domain"
)

func TestRecordExecution_setsResultAndPromotesRunToInProgress(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	run, err := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "PromoteTest", CaseIDs: caseIDs}, uid)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	execs, _ := s.ListExecutions(context.Background(), run.ID)

	if err := s.RecordExecution(context.Background(), execs[0].ID, domain.RecordExecutionInput{
		Result: "pass", Comments: "ok",
	}, uid); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetRun(context.Background(), run.ID)
	if got.Status != "in_progress" {
		t.Fatalf("expected run to flip to in_progress, got %q", got.Status)
	}
	if got.ActualStart == nil {
		t.Fatal("actual_start should be populated when first result is recorded")
	}
	if got.Counts.Pass != 1 {
		t.Fatalf("counts.pass: %d", got.Counts.Pass)
	}
}

func TestRecordExecution_persistsStepResults(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	run, err := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "StepResults", CaseIDs: caseIDs}, uid)
	if err != nil {
		t.Fatal(err)
	}
	execs, _ := s.ListExecutions(context.Background(), run.ID)

	// "" and "blocked" entries should be dropped; only pass/fail survive.
	if err := s.RecordExecution(context.Background(), execs[0].ID, domain.RecordExecutionInput{
		Result: "fail",
		StepResults: []domain.StepResult{
			{Order: 0, Result: "pass"},
			{Order: 1, Result: "fail"},
			{Order: 2, Result: ""},
			{Order: 3, Result: "blocked"},
		},
	}, uid); err != nil {
		t.Fatal(err)
	}

	got, _ := s.ListExecutions(context.Background(), run.ID)
	var target *domain.Execution
	for i := range got {
		if got[i].ID == execs[0].ID {
			target = &got[i]
		}
	}
	if target == nil {
		t.Fatal("execution not found after record")
	}
	if len(target.StepResults) != 2 {
		t.Fatalf("expected 2 step results (pass/fail kept), got %d: %+v", len(target.StepResults), target.StepResults)
	}
	if target.StepResults[0].Order != 0 || target.StepResults[0].Result != "pass" {
		t.Fatalf("step 0: %+v", target.StepResults[0])
	}
	if target.StepResults[1].Order != 1 || target.StepResults[1].Result != "fail" {
		t.Fatalf("step 1: %+v", target.StepResults[1])
	}

	// Recording again with no step results clears the column.
	if err := s.RecordExecution(context.Background(), execs[0].ID, domain.RecordExecutionInput{Result: "pass"}, uid); err != nil {
		t.Fatal(err)
	}
	got, _ = s.ListExecutions(context.Background(), run.ID)
	for i := range got {
		if got[i].ID == execs[0].ID && len(got[i].StepResults) != 0 {
			t.Fatalf("expected step results cleared, got %+v", got[i].StepResults)
		}
	}
}

func TestRecordExecution_keepsHistoryOnReRecord(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	run, err := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "RunX", CaseIDs: caseIDs}, uid)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	execs, _ := s.ListExecutions(context.Background(), run.ID)
	id := execs[0].ID

	// pass, then fail, then pass again
	_ = s.RecordExecution(context.Background(), id, domain.RecordExecutionInput{Result: "pass"}, uid)
	_ = s.RecordExecution(context.Background(), id, domain.RecordExecutionInput{Result: "fail"}, uid)
	_ = s.RecordExecution(context.Background(), id, domain.RecordExecutionInput{Result: "pass"}, uid)

	after, _ := s.ListExecutions(context.Background(), run.ID)
	var found bool
	for _, e := range after {
		if e.ID != id {
			continue
		}
		found = true
		if e.Result != "pass" {
			t.Fatalf("current result: %q", e.Result)
		}
		if len(e.Attempts) != 2 {
			t.Fatalf("expected 2 prior attempts, got %d", len(e.Attempts))
		}
		if e.Attempts[0].Result != "pass" || e.Attempts[1].Result != "fail" {
			t.Fatalf("history order wrong: %+v", e.Attempts)
		}
	}
	if !found {
		t.Fatal("execution not found")
	}
}

func TestRecordExecution_notRunDoesNotPushHistory(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	run, err := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "RunX", CaseIDs: caseIDs}, uid)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	execs, _ := s.ListExecutions(context.Background(), run.ID)
	id := execs[0].ID

	// Initial state is not_run -- recording not_run again should not create attempts.
	_ = s.RecordExecution(context.Background(), id, domain.RecordExecutionInput{Result: "not_run"}, uid)
	after, _ := s.ListExecutions(context.Background(), run.ID)
	for _, e := range after {
		if e.ID == id && len(e.Attempts) != 0 {
			t.Fatalf("attempts: %d", len(e.Attempts))
		}
	}
}

func TestRecordExecution_capturesOptionalFields(t *testing.T) {
	s, uid := newTest(t)
	pid, caseIDs := runFixture(t, s, uid)
	run, err := s.CreateRun(context.Background(), domain.CreateRunInput{ProjectID: pid, Name: "RunX", CaseIDs: caseIDs}, uid)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	execs, _ := s.ListExecutions(context.Background(), run.ID)
	id := execs[0].ID
	dur := 42
	if err := s.RecordExecution(context.Background(), id, domain.RecordExecutionInput{
		Result: "fail", Comments: "broke", DurationSeconds: &dur,
		JiraDefectKeys: "JIRA-9", EnvOverride: "qa-1", BuildOverride: "v2.0.1",
	}, uid); err != nil {
		t.Fatal(err)
	}
	after, _ := s.ListExecutions(context.Background(), run.ID)
	for _, e := range after {
		if e.ID != id {
			continue
		}
		if e.Comments == nil || *e.Comments != "broke" {
			t.Fatal("comments missing")
		}
		if e.DurationSeconds == nil || *e.DurationSeconds != 42 {
			t.Fatal("duration missing")
		}
		if e.JiraDefectKeys == nil || *e.JiraDefectKeys != "JIRA-9" {
			t.Fatal("jira keys missing")
		}
		if e.EnvOverride == nil || *e.EnvOverride != "qa-1" {
			t.Fatal("env override missing")
		}
		if e.BuildOverride == nil || *e.BuildOverride != "v2.0.1" {
			t.Fatal("build override missing")
		}
	}
}

func TestRecordExecution_notFound(t *testing.T) {
	s, _ := newTest(t)
	uid := "00000000-0000-0000-0000-000000000000"
	if err := s.RecordExecution(context.Background(), uid, domain.RecordExecutionInput{Result: "pass"}, uid); err == nil {
		t.Fatal("expected ErrNotFound")
	}
}
