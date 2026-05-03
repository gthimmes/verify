// Package testutil wires up the integration test environment: a real Postgres
// connection (defaulting to the verify_test database), one-time migration
// application, and a Reset helper that truncates every table between tests.
//
// All store and api tests should call Setup at the top of TestMain and
// Reset(t, pool) at the start of each test that mutates state.
package testutil

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/verify/backend/internal/db"
	"github.com/verify/backend/internal/store"
)

const defaultURL = "postgres://verify:verify@localhost:5432/verify_test?sslmode=disable"

var (
	once   sync.Once
	pool   *pgxpool.Pool
	setupErr error
)

// Pool returns a pgx pool against the test database.  It is safe to call from
// many tests; the pool is created exactly once per process.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	once.Do(initPool)
	if setupErr != nil {
		t.Skipf("testutil: postgres unavailable (%v); set TEST_DATABASE_URL or run docker compose up -d postgres", setupErr)
	}
	return pool
}

// Store returns a store.Store backed by the test pool.
func Store(t *testing.T) *store.Store {
	t.Helper()
	return store.New(Pool(t))
}

// Reset truncates every table in dependency order so each test starts from a
// known-empty state.  Tables are listed explicitly to avoid DROP/CREATE cost.
func Reset(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	tables := []string{
		"execution_attempts",
		"test_executions",
		"run_snapshot_cases",
		"test_runs",
		"test_case_versions",
		"test_case_data_rows",
		"test_case_params",
		"test_steps",
		"test_case_tags",
		"test_cases",
		"features",
		"areas",
		"project_members",
		"projects",
		"tags",
		"audit_logs",
		"users",
	}
	if _, err := pool.Exec(ctx, "truncate "+strings.Join(tables, ", ")+" restart identity cascade"); err != nil {
		t.Fatalf("reset: %v", err)
	}
}

// SeedUser creates the demo admin and returns its id.  Most tests need one.
func SeedUser(t *testing.T, s *store.Store) string {
	t.Helper()
	u, err := s.EnsureUser(context.Background(), "demo@verify.local", "Demo Admin", "admin")
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return u.ID
}

// AuditCount returns the number of audit_logs rows matching action.  Tests
// assert on this to verify audit invariants.
func AuditCount(t *testing.T, pool *pgxpool.Pool, action string) int {
	t.Helper()
	var n int
	err := pool.QueryRow(context.Background(),
		`select count(*) from audit_logs where action = $1`, action).Scan(&n)
	if err != nil {
		t.Fatalf("audit count: %v", err)
	}
	return n
}

// MustExec runs a SQL statement against the test DB or fails.
func MustExec(t *testing.T, sql string, args ...any) {
	t.Helper()
	if _, err := Pool(t).Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("exec %q: %v", sql, err)
	}
}

func initPool() {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		url = defaultURL
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		setupErr = err
		return
	}
	cfg.MaxConns = 5
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	p, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		setupErr = err
		return
	}
	if err := p.Ping(ctx); err != nil {
		setupErr = fmt.Errorf("ping: %w", err)
		return
	}
	if err := db.Migrate(ctx, p); err != nil {
		setupErr = fmt.Errorf("migrate: %w", err)
		return
	}
	pool = p
}
