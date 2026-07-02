// Demo seeder — creates the Acme Storefront + Internal demo projects.
//
// By default the seeder is **idempotent and non-destructive**: it will skip
// any project whose key already exists, and it will not touch unrelated
// data.  Pass `--wipe` to remove the Acme/Internal demo projects before
// re-seeding (useful for tests that want a clean fixture).  Pass
// `--wipe-all` to truncate every table in the database (the old behaviour;
// dangerous, intended only for the test database).
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/verify/backend/internal/db"
	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

var demoProjectKeys = []string{"ACM", "INT"}

func main() {
	wipeDemos := flag.Bool("wipe", false, "delete Acme + Internal demo projects before re-seeding")
	wipeAll := flag.Bool("wipe-all", false, "DANGEROUS: truncate every table in the database before re-seeding (test DB only)")
	flag.Parse()

	_ = godotenv.Load(".env", "../.env")
	ctx := context.Background()
	pool, err := db.Connect(ctx)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	switch {
	case *wipeAll:
		if err := wipe(ctx, pool); err != nil {
			log.Fatalf("wipe: %v", err)
		}
	case *wipeDemos:
		if err := wipeDemoProjects(ctx, pool); err != nil {
			log.Fatalf("wipe demos: %v", err)
		}
	default:
		// Default: idempotent.  If the demos already exist, exit cleanly so
		// shared test/dev databases don't get clobbered.
		exists, err := demosAlreadyPresent(ctx, pool)
		if err != nil {
			log.Fatalf("check demos: %v", err)
		}
		if exists {
			fmt.Println("[seed] Acme/Internal demos already present — nothing to do (pass --wipe to refresh)")
			return
		}
	}
	st := store.New(pool)
	admin, err := st.EnsureUser(ctx, "demo@verify.local", "Demo Admin", "admin")
	if err != nil {
		log.Fatalf("ensure admin: %v", err)
	}
	tester, err := st.EnsureUser(ctx, "tester@verify.local", "Riya Tester", "member")
	if err != nil {
		log.Fatalf("ensure tester: %v", err)
	}
	if _, err := st.EnsureUser(ctx, "dev@verify.local", "Sam Dev", "member"); err != nil {
		log.Fatalf("ensure dev: %v", err)
	}

	tags := []string{"smoke", "regression", "P0", "release-blocker", "happy-path", "edge-case", "auth", "money", "calendar-ui"}
	for _, t := range tags {
		if _, err := pool.Exec(ctx, `insert into tags(name) values($1) on conflict do nothing`, t); err != nil {
			log.Fatalf("tag %s: %v", t, err)
		}
	}

	fmt.Println("Seeding Acme Storefront…")
	acme, err := st.CreateProject(ctx, domain.CreateProjectInput{
		Name:        "Acme Storefront",
		Key:         "ACM",
		Description: "Customer-facing app: payments, calendar, identity. Year-1 manual catalog.",
	}, admin.ID)
	if err != nil {
		log.Fatalf("acme: %v", err)
	}
	internal, err := st.CreateProject(ctx, domain.CreateProjectInput{
		Name:        "Acme Internal Tools",
		Key:         "INT",
		Description: "Internal admin console used by support and finance.",
	}, admin.ID)
	if err != nil {
		log.Fatalf("internal: %v", err)
	}

	acmeCases, err := buildAcme(ctx, st, acme)
	if err != nil {
		log.Fatalf("acme cases: %v", err)
	}
	fmt.Printf("  + %d Acme Storefront cases\n", len(acmeCases))

	internalCases, err := buildInternal(ctx, st, internal)
	if err != nil {
		log.Fatalf("internal cases: %v", err)
	}
	fmt.Printf("  + %d Acme Internal Tools cases\n", len(internalCases))

	fmt.Println("Seeding runs…")

	// completed staging regression — ~3 weeks ago
	completedSelected := selectByPriority(acmeCases, []string{"critical", "high"}, 14)
	if err := buildRun(ctx, pool, runSpec{
		ProjectID:   acme.ID,
		OwnerID:     admin.ID,
		TesterID:    tester.ID,
		Name:        "April staging regression",
		Description: "Pre-release smoke + regression on staging.",
		Environment: "staging",
		Build:       "v2.41.0-rc1",
		Status:      "completed",
		PlanStart:   time.Now().AddDate(0, 0, -21),
		PlanEnd:     time.Now().AddDate(0, 0, -14),
		CaseIDs:     completedSelected,
		Fill: func(i, total, seq int) string {
			if seq%7 == 0 {
				return "fail"
			}
			if seq%11 == 0 {
				return "blocked"
			}
			return "pass"
		},
	}); err != nil {
		log.Fatalf("completed run: %v", err)
	}

	// in-progress nightly smoke — partly executed
	inProgressSelected := pickN(acmeCases, 18)
	if err := buildRun(ctx, pool, runSpec{
		ProjectID:   acme.ID,
		OwnerID:     admin.ID,
		TesterID:    tester.ID,
		Name:        "May 1 nightly smoke",
		Description: "Daily smoke run.",
		Environment: "staging",
		Build:       "main@a3f81c",
		Status:      "in_progress",
		PlanStart:   time.Now().AddDate(0, 0, -1),
		PlanEnd:     time.Now().AddDate(0, 0, 1),
		CaseIDs:     inProgressSelected,
		Fill: func(i, total, seq int) string {
			if i < total*55/100 {
				if seq%9 == 0 {
					return "fail"
				}
				if seq%13 == 0 {
					return "blocked"
				}
				return "pass"
			}
			return "not_run"
		},
	}); err != nil {
		log.Fatalf("in-progress run: %v", err)
	}

	// draft prod release
	draftSelected := selectByPriority(acmeCases, []string{"critical"}, 8)
	if err := buildRun(ctx, pool, runSpec{
		ProjectID:   acme.ID,
		OwnerID:     admin.ID,
		TesterID:    tester.ID,
		Name:        "Prod release verification (draft)",
		Description: "Release-day smoke; not started.",
		Environment: "prod",
		Build:       "v2.42.0",
		Status:      "draft",
		PlanStart:   time.Now(),
		PlanEnd:     time.Now().AddDate(0, 0, 2),
		CaseIDs:     draftSelected,
		Fill:        func(i, total, seq int) string { return "not_run" },
	}); err != nil {
		log.Fatalf("draft run: %v", err)
	}

	// internal weekly smoke — completed
	if err := buildRun(ctx, pool, runSpec{
		ProjectID:   internal.ID,
		OwnerID:     admin.ID,
		TesterID:    tester.ID,
		Name:        "Internal weekly smoke",
		Description: "Weekly smoke for internal tools.",
		Environment: "staging",
		Build:       "internal@b7d12",
		Status:      "completed",
		PlanStart:   time.Now().AddDate(0, 0, -4),
		PlanEnd:     time.Now().AddDate(0, 0, -3),
		CaseIDs:     idsOf(internalCases),
		Fill: func(i, total, seq int) string {
			if seq%5 == 0 {
				return "fail"
			}
			return "pass"
		},
	}); err != nil {
		log.Fatalf("internal run: %v", err)
	}

	// audit log noise
	for _, c := range acmeCases[:min(8, len(acmeCases))] {
		_, _ = pool.Exec(ctx, `insert into audit_logs(actor_id,action,entity,entity_id,after_json) values($1,'test_case.create','TestCase',$2,$3)`,
			admin.ID, c.id, []byte(fmt.Sprintf(`{"title":%q,"publicId":%q}`, c.title, c.publicID)))
	}

	fmt.Println("Done.")
}

// ─── wipe ────────────────────────────────────────────────────────────────────

func wipe(ctx context.Context, pool *pgxpool.Pool) error {
	tables := []string{
		"execution_attempts", "test_executions", "run_snapshot_cases", "test_runs",
		"test_case_versions", "test_case_data_rows", "test_case_params", "test_steps",
		"test_case_tags", "test_cases", "folders",
		"project_members", "projects", "tags", "audit_logs",
	}
	for _, t := range tables {
		if _, err := pool.Exec(ctx, "delete from "+t); err != nil {
			return fmt.Errorf("delete from %s: %w", t, err)
		}
	}
	return nil
}

// demosAlreadyPresent returns true when *every* demo project key in
// demoProjectKeys is already in the database, in which case the seed has
// nothing useful to add and should exit silently.  This is the property
// that makes the default mode safe to run against a populated database.
func demosAlreadyPresent(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	for _, key := range demoProjectKeys {
		var exists bool
		err := pool.QueryRow(ctx, `select exists(select 1 from projects where key = $1)`, key).Scan(&exists)
		if err != nil {
			return false, err
		}
		if !exists {
			return false, nil
		}
	}
	return true, nil
}

// wipeDemoProjects removes the Acme + Internal demo projects and their
// dependent runs.  Unlike wipe(), it leaves everything else (imported
// projects, audit log, tags) intact — safe to run against a working DB.
func wipeDemoProjects(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `
		delete from test_runs where project_id in (select id from projects where key = any($1))
	`, demoProjectKeys); err != nil {
		return fmt.Errorf("wipe runs: %w", err)
	}
	if _, err := pool.Exec(ctx, `
		delete from projects where key = any($1)
	`, demoProjectKeys); err != nil {
		return fmt.Errorf("wipe projects: %w", err)
	}
	return nil
}

// ─── case fixtures ───────────────────────────────────────────────────────────

type areaSpec struct {
	key      string
	name     string
	desc     string
	features []featureSpec
}
type featureSpec struct {
	name string
	desc string
}
type caseSpec struct {
	title               string
	description         string
	preconditions       string
	finalExpected       string
	type_               string
	priority            string
	automationStatus    string
	automationFramework string
	automationRef       string
	tags                []string
	jiraKeys            string
	steps               []stepSpec
	parameters          []string
	dataRows            []dataRowSpec
}
type stepSpec struct{ action, expected string }
type dataRowSpec struct {
	label  string
	values map[string]string
}

type seededCase struct {
	id        string
	publicID  string
	title     string
	priority  string
	type_     string
}

func buildAcme(ctx context.Context, st *store.Store, p *domain.Project) ([]seededCase, error) {
	areas := []areaSpec{
		{key: "PAY", name: "Payments", desc: "Charges, refunds, payouts, methods.", features: []featureSpec{
			{"One-time payment", "Customer pays an invoice once."},
			{"Recurring payments", "Schedule and renewal logic."},
			{"Refunds", "Full and partial refunds."},
			{"Payment methods", "Add, remove, default."},
		}},
		{key: "AUTH", name: "Auth", desc: "Sign-in, MFA, sessions, recovery.", features: []featureSpec{
			{"Sign in", "Username/password and SSO."},
			{"Account recovery", "Forgot password, magic link."},
			{"MFA", "TOTP, recovery codes."},
		}},
		{key: "CAL", name: "Calendar", desc: "Scheduling, availability, reminders.", features: []featureSpec{
			{"Booking flow", "External booking page → confirmed slot."},
			{"Recurring events", "Daily, weekly, monthly recurrence."},
			{"Reminders", "Email and push reminders."},
		}},
		{key: "ACCT", name: "Account", desc: "Profile, preferences, organizations.", features: []featureSpec{
			{"Profile", "Name, email, avatar."},
			{"Notifications prefs", "Per-channel preferences."},
		}},
	}
	cases := acmeCases()
	return seedHierarchy(ctx, st, p, areas, cases)
}

func buildInternal(ctx context.Context, st *store.Store, p *domain.Project) ([]seededCase, error) {
	areas := []areaSpec{
		{key: "REP", name: "Reports", desc: "Internal reporting console.", features: []featureSpec{
			{"Revenue report", "Daily revenue rollup."},
		}},
		{key: "OPS", name: "Ops", desc: "Support tooling.", features: []featureSpec{
			{"Customer search", "Find customers by email/name."},
			{"Refund tooling", "Issue manual refunds."},
		}},
	}
	cases := internalCasesData()
	return seedHierarchy(ctx, st, p, areas, cases)
}

// seedHierarchy maps the demo's Area > Feature layout onto nested folders:
// each area becomes a top-level folder and each feature a child folder, with
// cases filed under the feature folder.
func seedHierarchy(ctx context.Context, st *store.Store, p *domain.Project, areas []areaSpec, byFeature map[string][]caseSpec) ([]seededCase, error) {
	out := []seededCase{}
	for _, a := range areas {
		for _, f := range a.features {
			folderID, err := st.EnsureFolderPath(ctx, p.ID, []string{a.name, f.name})
			if err != nil {
				return nil, err
			}
			for _, c := range byFeature[f.name] {
				in := domain.TestCaseInput{
					ProjectID:           p.ID,
					FolderID:            folderID,
					Title:               c.title,
					Description:         c.description,
					Preconditions:       c.preconditions,
					FinalExpected:       c.finalExpected,
					Type:                c.type_,
					Priority:            c.priority,
					Status:              "active",
					AutomationStatus:    c.automationStatus,
					AutomationFramework: c.automationFramework,
					AutomationRef:       c.automationRef,
					JiraKeys:            c.jiraKeys,
					Tags:                c.tags,
				}
				for i, s := range c.steps {
					in.Steps = append(in.Steps, domain.TestStep{Order: i, Action: s.action, Expected: s.expected})
				}
				for i, name := range c.parameters {
					in.Parameters = append(in.Parameters, domain.TestCaseParam{Name: name, Order: i})
				}
				for i, row := range c.dataRows {
					label := row.label
					in.DataRows = append(in.DataRows, domain.TestCaseDataRow{
						Order: i, Label: &label, Values: row.values,
					})
				}
				tc, err := st.CreateTestCase(ctx, in, p.OwnerID)
				if err != nil {
					return nil, fmt.Errorf("case %q: %w", c.title, err)
				}
				out = append(out, seededCase{id: tc.ID, publicID: tc.PublicID, title: tc.Title, priority: tc.Priority, type_: tc.Type})

				// retro-set automation reviewed at for some entries
				if c.automationStatus != "not_automated" {
					daysAgo := rand.Intn(180)
					_, _ = st.Pool.Exec(ctx, `update test_cases set automation_last_reviewed_at = now() - ($1::int * interval '1 day') where id = $2`,
						daysAgo, tc.ID)
				}
			}
		}
	}
	return out, nil
}

// ─── runs builder ────────────────────────────────────────────────────────────

type runSpec struct {
	ProjectID   string
	OwnerID     string
	TesterID    string
	Name        string
	Description string
	Environment string
	Build       string
	Status      string
	PlanStart   time.Time
	PlanEnd     time.Time
	CaseIDs     []string
	Fill        func(i, total, seq int) string
}

func buildRun(ctx context.Context, pool *pgxpool.Pool, spec runSpec) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var actualStart, actualEnd *time.Time
	if spec.Status != "draft" {
		s := spec.PlanStart
		actualStart = &s
	}
	if spec.Status == "completed" {
		e := spec.PlanEnd
		actualEnd = &e
	}
	var runID string
	err = tx.QueryRow(ctx, `
		insert into test_runs(project_id,name,description,environment,build,owner_id,status,
			planned_start,planned_end,actual_start,actual_end)
		values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		returning id::text`,
		spec.ProjectID, spec.Name, spec.Description, spec.Environment, spec.Build, spec.OwnerID,
		spec.Status, spec.PlanStart, spec.PlanEnd, actualStart, actualEnd,
	).Scan(&runID)
	if err != nil {
		return err
	}

	// snapshot each case + create executions
	type fullCase struct {
		ID, PublicID, Title, Type, Priority           string
		Description, Preconditions, FinalExpected     *string
		Version                                       int
	}
	rows, err := tx.Query(ctx, `
		select id::text, public_id, title, type, priority, description, preconditions, final_expected, version, sequence_num
		from test_cases where id = any($1) order by sequence_num`, spec.CaseIDs)
	if err != nil {
		return err
	}
	type caseLite struct {
		fc  fullCase
		seq int
	}
	var cases []caseLite
	for rows.Next() {
		var c fullCase
		var seq int
		if err := rows.Scan(&c.ID, &c.PublicID, &c.Title, &c.Type, &c.Priority,
			&c.Description, &c.Preconditions, &c.FinalExpected, &c.Version, &seq); err != nil {
			rows.Close()
			return err
		}
		cases = append(cases, caseLite{fc: c, seq: seq})
	}
	rows.Close()

	total := len(cases)
	for i, cl := range cases {
		// snapshot json
		stepsJSON, paramsJSON, rowsJSON, err := snapshotJSON(ctx, tx, cl.fc.ID)
		if err != nil {
			return err
		}
		snap := fmt.Sprintf(`{"steps":%s,"parameters":%s,"dataRows":%s}`, stepsJSON, paramsJSON, rowsJSON)
		var snapID string
		err = tx.QueryRow(ctx, `
			insert into run_snapshot_cases(run_id,test_case_id,public_id,title,description,preconditions,
				final_expected,type,priority,snapshot_json,version)
			values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
			returning id::text`,
			runID, cl.fc.ID, cl.fc.PublicID, cl.fc.Title, cl.fc.Description, cl.fc.Preconditions, cl.fc.FinalExpected,
			cl.fc.Type, cl.fc.Priority, snap, cl.fc.Version,
		).Scan(&snapID)
		if err != nil {
			return err
		}

		// data rows
		drows, err := tx.Query(ctx, `select row_order, label from test_case_data_rows where test_case_id = $1 order by row_order`, cl.fc.ID)
		if err != nil {
			return err
		}
		type dr struct {
			order int
			label *string
		}
		var dataRows []dr
		for drows.Next() {
			var d dr
			if err := drows.Scan(&d.order, &d.label); err != nil {
				drows.Close()
				return err
			}
			dataRows = append(dataRows, d)
		}
		drows.Close()

		execAt := spec.PlanStart.Add(time.Duration(i) * time.Hour)
		if len(dataRows) == 0 {
			result := spec.Fill(i, total, cl.seq)
			if err := writeExecution(ctx, tx, runID, snapID, nil, nil, result, spec.TesterID, execAt); err != nil {
				return err
			}
		} else {
			for _, d := range dataRows {
				idx := d.order
				label := d.label
				result := spec.Fill(i, total, cl.seq)
				if err := writeExecution(ctx, tx, runID, snapID, &idx, label, result, spec.TesterID, execAt); err != nil {
					return err
				}
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}

func snapshotJSON(ctx context.Context, tx pgx.Tx, caseID string) (string, string, string, error) {
	var steps, params, rows string
	if err := tx.QueryRow(ctx, `
		select coalesce(jsonb_agg(jsonb_build_object('order', step_order, 'action', action, 'expected', expected) order by step_order), '[]'::jsonb)::text
		from test_steps where test_case_id = $1`, caseID).Scan(&steps); err != nil {
		return "", "", "", err
	}
	if err := tx.QueryRow(ctx, `
		select coalesce(jsonb_agg(jsonb_build_object('name', name, 'order', param_order) order by param_order), '[]'::jsonb)::text
		from test_case_params where test_case_id = $1`, caseID).Scan(&params); err != nil {
		return "", "", "", err
	}
	if err := tx.QueryRow(ctx, `
		select coalesce(jsonb_agg(jsonb_build_object('order', row_order, 'label', label, 'values', values_json) order by row_order), '[]'::jsonb)::text
		from test_case_data_rows where test_case_id = $1`, caseID).Scan(&rows); err != nil {
		return "", "", "", err
	}
	return steps, params, rows, nil
}

func writeExecution(ctx context.Context, tx pgx.Tx, runID, snapID string, idx *int, label *string, result, testerID string, execAt time.Time) error {
	var executedBy *string
	var executedAt *time.Time
	var comments, jiraKeys *string
	if result != "not_run" {
		eb := testerID
		executedBy = &eb
		ea := execAt
		executedAt = &ea
	}
	if result == "fail" {
		c := "Reproduces with the steps above."
		comments = &c
		j := "JIRA-999"
		jiraKeys = &j
	}
	if idx == nil {
		_, err := tx.Exec(ctx, `
			insert into test_executions(run_id,snapshot_case_id,result,executed_by_id,executed_at,comments,jira_defect_keys)
			values($1,$2,$3,$4,$5,$6,$7)`, runID, snapID, result, executedBy, executedAt, comments, jiraKeys)
		return err
	}
	_, err := tx.Exec(ctx, `
		insert into test_executions(run_id,snapshot_case_id,data_row_index,data_row_label,result,executed_by_id,executed_at,comments,jira_defect_keys)
		values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, runID, snapID, *idx, label, result, executedBy, executedAt, comments, jiraKeys)
	return err
}

// helpers

func selectByPriority(cases []seededCase, prios []string, max int) []string {
	want := map[string]bool{}
	for _, p := range prios {
		want[p] = true
	}
	out := []string{}
	for _, c := range cases {
		if want[c.priority] {
			out = append(out, c.id)
			if len(out) >= max {
				break
			}
		}
	}
	return out
}
func pickN(cases []seededCase, n int) []string {
	out := []string{}
	for i, c := range cases {
		if i >= n {
			break
		}
		out = append(out, c.id)
	}
	return out
}
func idsOf(cases []seededCase) []string {
	out := make([]string, len(cases))
	for i, c := range cases {
		out[i] = c.id
	}
	return out
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// trimStub for unused vars
var _ = strings.TrimSpace
