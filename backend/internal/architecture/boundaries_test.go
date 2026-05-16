// Package architecture holds tests that enforce structural invariants of the
// codebase.  They are not unit tests of behaviour — they are contracts about
// where code is allowed to live, so the architecture stays cohesive as the
// project grows.
//
// Each test names the rule and points at the file or doc that codifies it.
// If a rule needs to change, change it here first, then update the offending
// code, then update ARCHITECTURE.md.
package architecture_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// repoRoot walks up from the test file to find the directory that holds go.mod.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 8; i++ {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Fatalf("could not find go.mod above %s", dir)
	return ""
}

func walkGoFiles(t *testing.T, root string, visit func(path string)) {
	t.Helper()
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			if info.Name() == "vendor" || strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		if strings.HasSuffix(path, "_test.go") {
			return nil
		}
		visit(path)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// Rule: handlers don't import pgx or run SQL directly.
// Codified in ARCHITECTURE.md → "the API is the surface; the store is the
// implementation. Handlers don't write SQL."
func TestRule_apiPackageDoesNotImportPgxOrEmbedSQL(t *testing.T) {
	root := filepath.Join(repoRoot(t), "internal", "api")
	walkGoFiles(t, root, func(path string) {
		fset := token.NewFileSet()
		f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		for _, imp := range f.Imports {
			val := strings.Trim(imp.Path.Value, `"`)
			if strings.HasPrefix(val, "github.com/jackc/pgx") {
				t.Errorf("%s imports %s — handlers must call store methods, not pgx", path, val)
			}
		}
	})

	// no inline `select`, `insert`, `update`, `delete` SQL strings
	walkGoFiles(t, root, func(path string) {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		text := string(body)
		// Use regex with word boundaries to avoid hitting Go keywords like `select`.
		re := regexp.MustCompile("(?i)(?m)`\\s*(select|insert\\s+into|update|delete\\s+from)\\s")
		if re.MatchString(text) {
			t.Errorf("%s contains inline SQL — handlers must call store methods", path)
		}
	})
}

// Rule: store doesn't import net/http.
// Codified in ARCHITECTURE.md → "the store doesn't speak HTTP".
func TestRule_storeDoesNotImportHTTP(t *testing.T) {
	root := filepath.Join(repoRoot(t), "internal", "store")
	walkGoFiles(t, root, func(path string) {
		fset := token.NewFileSet()
		f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		for _, imp := range f.Imports {
			val := strings.Trim(imp.Path.Value, `"`)
			if val == "net/http" || strings.HasPrefix(val, "github.com/go-chi") {
				t.Errorf("%s imports %s — store layer must not reference HTTP", path, val)
			}
		}
	})
}

// Rule: only the migration runner and the seed CLI are allowed to issue
// DDL (create/drop/truncate).  This catches the next person who tries to add
// "migration logic" inside a handler or store method.
func TestRule_ddlIsConfinedToMigrationsAndSeed(t *testing.T) {
	root := repoRoot(t)
	allowed := []string{
		filepath.Join(root, "internal", "db"),
		filepath.Join(root, "cmd", "seed"),
		filepath.Join(root, "internal", "testutil"),
	}
	isAllowed := func(p string) bool {
		for _, a := range allowed {
			if strings.HasPrefix(p, a+string(filepath.Separator)) || p == a {
				return true
			}
		}
		return false
	}
	re := regexp.MustCompile("(?i)`(\\s*)(create\\s+table|drop\\s+table|truncate\\s)")
	walkGoFiles(t, root, func(path string) {
		if isAllowed(path) {
			return
		}
		body, _ := os.ReadFile(path)
		if re.Match(body) {
			t.Errorf("%s contains DDL — only db/seed packages may issue schema changes", path)
		}
	})
}

// Rule: every store mutation that creates an entity must write to audit_logs.
// We approximate this by checking that store.go names every entity in at
// least one audit log call.  If you add a new entity, add the audit write.
func TestRule_storeWritesAuditForCoreMutations(t *testing.T) {
	root := repoRoot(t)
	body, err := os.ReadFile(filepath.Join(root, "internal", "store", "store.go"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(body)
	requiredActions := []string{
		"test_case.create",
		"test_case.update",
		"run.create",
		"execution.update",
	}
	for _, a := range requiredActions {
		if !strings.Contains(text, `"`+a+`"`) {
			t.Errorf("store.go missing audit write for action %q", a)
		}
	}
}
