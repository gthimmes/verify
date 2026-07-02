package db_test

import (
	"context"
	"sort"
	"testing"

	"github.com/verify/backend/internal/db"
	"github.com/verify/backend/internal/testutil"
)

// expected is the canonical list of tables.  Adding a new table means
// updating this list, so a reviewer can see it on the diff.
var expectedTables = []string{
	"attachments",
	"audit_logs",
	"execution_attempts",
	"folders",
	"project_members",
	"projects",
	"run_snapshot_cases",
	"saved_filters",
	"schema_migrations",
	"sessions",
	"tags",
	"test_case_data_rows",
	"test_case_params",
	"test_case_relations",
	"test_case_tags",
	"test_case_templates",
	"test_case_versions",
	"test_cases",
	"test_executions",
	"test_runs",
	"test_steps",
	"users",
}

func TestMigrate_appliesEverySchemaTable(t *testing.T) {
	pool := testutil.Pool(t)
	rows, err := pool.Query(context.Background(), `
		select table_name from information_schema.tables
		where table_schema = 'public' order by table_name`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		got = append(got, name)
	}
	sort.Strings(got)
	if !equalSlices(got, expectedTables) {
		t.Fatalf("schema drift\n got:  %v\n want: %v", got, expectedTables)
	}
}

func TestMigrate_isIdempotent(t *testing.T) {
	pool := testutil.Pool(t)
	// already migrated by testutil; running it again must be a noop
	if err := db.Migrate(context.Background(), pool); err != nil {
		t.Fatalf("re-migrate: %v", err)
	}
}

func TestMigrate_unicodeUUIDExtension(t *testing.T) {
	pool := testutil.Pool(t)
	var enabled bool
	err := pool.QueryRow(context.Background(),
		`select exists(select 1 from pg_extension where extname = 'pgcrypto')`).Scan(&enabled)
	if err != nil {
		t.Fatal(err)
	}
	if !enabled {
		t.Fatal("pgcrypto extension should be enabled by 0001_init.sql")
	}
}

// Critical partial-unique indexes.  Catches accidental loss when migrations are edited.
func TestMigrate_partialUniqueIndexesPresent(t *testing.T) {
	pool := testutil.Pool(t)
	rows, err := pool.Query(context.Background(),
		`select indexname from pg_indexes where tablename = 'test_executions' and indexname like 'test_executions_%_uniq'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := []string{}
	for rows.Next() {
		var name string
		_ = rows.Scan(&name)
		got = append(got, name)
	}
	sort.Strings(got)
	want := []string{"test_executions_no_row_uniq", "test_executions_with_row_uniq"}
	if !equalSlices(got, want) {
		t.Fatalf("missing partial-unique indexes:\n got:  %v\n want: %v", got, want)
	}
}

func equalSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
