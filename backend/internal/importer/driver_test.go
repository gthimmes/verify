package importer_test

import (
	"context"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/importer"
	"github.com/verify/backend/internal/store"
	"github.com/verify/backend/internal/testutil"
)

const fixturePath = "testdata/fixture.xlsx"

func TestRead_fixtureXlsx(t *testing.T) {
	rows, skipped, err := importer.Read(fixturePath)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(rows) != 8 {
		t.Fatalf("expected 8 rows from fixture, got %d", len(rows))
	}
	if len(skipped) == 0 || skipped[0] == "" {
		t.Fatalf("expected at least one skipped sheet (Summary), got %v", skipped)
	}
	// row shape sanity
	titles := map[string]bool{}
	for _, r := range rows {
		titles[r.Title] = true
	}
	if !titles["Open module landing page"] {
		t.Errorf("missing expected title; got %v", titles)
	}
}

func TestPlanRows_summaryShape(t *testing.T) {
	rows, _, err := importer.Read(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	project := &domain.Project{ID: "p1", Name: "Test Project", Key: "TST"}
	plan := importer.PlanRows(rows, project)

	// 8 rows total in fixture, 1 has no title -> 7 planned, 1 skipped
	if plan.Summary.TotalRows != 7 {
		t.Fatalf("expected 7 planned rows, got %d", plan.Summary.TotalRows)
	}
	if plan.Summary.SkippedReasons["missing title"] != 1 {
		t.Fatalf("expected 1 'missing title' skip, got %v", plan.Summary.SkippedReasons)
	}

	// type distribution
	if plan.Summary.ByType["functional"] != 2 {
		t.Errorf("functional count: %v", plan.Summary.ByType)
	}
	if plan.Summary.ByType["regression"] != 1 {
		t.Errorf("regression count: %v", plan.Summary.ByType)
	}
	if plan.Summary.ByType["acceptance"] != 1 {
		t.Errorf("acceptance count: %v", plan.Summary.ByType)
	}
	if plan.Summary.ByType["compatibility"] != 1 {
		t.Errorf("compatibility count: %v", plan.Summary.ByType)
	}
	if plan.Summary.ByType["other"] != 1 {
		t.Errorf("other count: %v", plan.Summary.ByType)
	}
	if plan.Summary.ByType["smoke"] != 1 {
		t.Errorf("expected Smoke & Sanity → smoke, got %v", plan.Summary.ByType)
	}

	// priority distribution
	if plan.Summary.ByPriority["critical"] != 1 {
		t.Errorf("critical priority count: %v", plan.Summary.ByPriority)
	}
	if plan.Summary.ByPriority["high"] != 1 {
		t.Errorf("high priority count: %v", plan.Summary.ByPriority)
	}

	// case status: one is deprecated (the [DEPRECATED] one)
	if plan.Summary.ByCaseStatus["deprecated"] != 1 {
		t.Errorf("deprecated count: %v", plan.Summary.ByCaseStatus)
	}
	if plan.Summary.ByCaseStatus["active"] != 6 {
		t.Errorf("active count: %v", plan.Summary.ByCaseStatus)
	}

	// folder paths from the synthetic fixture
	pathSet := map[string]bool{}
	for _, p := range plan.Summary.UniquePaths {
		pathSet[p] = true
	}
	for _, want := range []string{
		"Demo Project > Module A",
		"Demo Project > Module A > Drafts",
		"Demo Project > Module B > Settings",
		"DEPRECATED > Old Module",
		"CRITICAL CHANGES > Upgrade Suite",
	} {
		if !pathSet[want] {
			t.Errorf("missing folder path %q (have: %v)", want, plan.Summary.UniquePaths)
		}
	}

	// Multi-step: 1 case (Draft creation across roles has 2 scenarios)
	if plan.Summary.WithMultipleSteps < 1 {
		t.Errorf("expected at least 1 multi-step case, got %d", plan.Summary.WithMultipleSteps)
	}
}

func TestApply_writesPlanToDatabase(t *testing.T) {
	pool := testutil.Pool(t)
	testutil.Reset(t, pool)
	s := store.New(pool)
	uid := testutil.SeedUser(t, s)

	project, err := s.CreateProject(context.Background(), domain.CreateProjectInput{
		Name: "Import Target", Key: "IMP",
	}, uid)
	if err != nil {
		t.Fatal(err)
	}

	rows, _, err := importer.Read(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	plan := importer.PlanRows(rows, project)

	res, err := importer.Apply(context.Background(), s, plan, uid)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if res.CasesCreated != 7 {
		t.Fatalf("expected 7 cases created, got %d", res.CasesCreated)
	}
	// 7 cases land in 6 distinct paths -> at least 6 folders (and some
	// shared parents — "Demo Project", "Module A", etc.).  Lower-bound
	// check is fine; the important property is "many folders, not flat".
	if res.FoldersCreated < 6 {
		t.Fatalf("expected at least 6 folders created, got %d", res.FoldersCreated)
	}

	// verify via the store
	cases, err := s.ListTestCases(context.Background(), store.CaseListFilter{ProjectID: project.ID, Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	if len(cases) != 7 {
		t.Fatalf("expected 7 cases listed, got %d", len(cases))
	}
	// at least one case landed with status=deprecated
	deprecated := 0
	for _, c := range cases {
		if c.Status == "deprecated" {
			deprecated++
		}
	}
	if deprecated == 0 {
		t.Errorf("expected at least one deprecated case in list, got 0")
	}
}

func TestApply_isIdempotentOnFolders(t *testing.T) {
	pool := testutil.Pool(t)
	testutil.Reset(t, pool)
	s := store.New(pool)
	uid := testutil.SeedUser(t, s)
	project, _ := s.CreateProject(context.Background(), domain.CreateProjectInput{
		Name: "Idem", Key: "IDM",
	}, uid)

	rows, _, _ := importer.Read(fixturePath)
	plan := importer.PlanRows(rows, project)

	first, err := importer.Apply(context.Background(), s, plan, uid)
	if err != nil {
		t.Fatal(err)
	}
	second, err := importer.Apply(context.Background(), s, plan, uid)
	if err != nil {
		t.Fatal(err)
	}
	// The second apply must NOT re-create folders.
	if second.FoldersCreated != 0 {
		t.Errorf("second apply re-created folders: %d", second.FoldersCreated)
	}
	// Cases are not deduped — 7 + 7 = 14 in the project after the second apply.
	if first.CasesCreated+second.CasesCreated != 14 {
		t.Errorf("expected 14 cases total, got %d", first.CasesCreated+second.CasesCreated)
	}
}
