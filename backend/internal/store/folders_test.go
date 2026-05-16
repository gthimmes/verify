package store_test

import (
	"context"
	"testing"

	"github.com/verify/backend/internal/testutil"
)

func TestEnsureFolderPath_createsAndReusesChain(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "FT", "Folder Tree")
	ctx := context.Background()

	leaf, err := s.EnsureFolderPath(ctx, p.ID, []string{"A", "B", "C"})
	if err != nil {
		t.Fatal(err)
	}
	if leaf == "" {
		t.Fatal("leaf id empty")
	}
	// Re-running with the same path must NOT create new folders.
	leaf2, err := s.EnsureFolderPath(ctx, p.ID, []string{"A", "B", "C"})
	if err != nil {
		t.Fatal(err)
	}
	if leaf != leaf2 {
		t.Fatalf("ensure path not idempotent: %s vs %s", leaf, leaf2)
	}
	// Sibling under "A/B" should reuse A and B but create D.
	if _, err := s.EnsureFolderPath(ctx, p.ID, []string{"A", "B", "D"}); err != nil {
		t.Fatal(err)
	}
	tree, err := s.FolderTree(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(tree) != 1 || tree[0].Name != "A" {
		t.Fatalf("expected single root 'A', got %+v", tree)
	}
	if len(tree[0].Children) != 1 || tree[0].Children[0].Name != "B" {
		t.Fatalf("expected child 'B', got %+v", tree[0].Children)
	}
	if len(tree[0].Children[0].Children) != 2 {
		t.Fatalf("expected 2 grandchildren, got %d", len(tree[0].Children[0].Children))
	}
}

func TestFolderTree_rollsUpCaseCounts(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "RC", "Roll-up Counts")
	ctx := context.Background()

	a, _ := s.EnsureFolderPath(ctx, p.ID, []string{"Top", "Mid", "Leaf-1"})
	b, _ := s.EnsureFolderPath(ctx, p.ID, []string{"Top", "Mid", "Leaf-2"})
	c, _ := s.EnsureFolderPath(ctx, p.ID, []string{"Top"})

	makeCaseInFolder(t, s, p.ID, a, uid, "case 1")
	makeCaseInFolder(t, s, p.ID, a, uid, "case 2")
	makeCaseInFolder(t, s, p.ID, b, uid, "case 3")
	makeCaseInFolder(t, s, p.ID, c, uid, "case 4 at top")

	tree, err := s.FolderTree(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(tree) != 1 || tree[0].Name != "Top" {
		t.Fatalf("expected single root Top, got %+v", tree)
	}
	if tree[0].CaseCount != 4 {
		t.Fatalf("Top should roll up to 4 cases, got %d", tree[0].CaseCount)
	}
	mid := tree[0].Children[0]
	if mid.Name != "Mid" || mid.CaseCount != 3 {
		t.Fatalf("Mid: name=%s count=%d", mid.Name, mid.CaseCount)
	}
	if len(mid.Children) != 2 {
		t.Fatalf("expected 2 leaves, got %d", len(mid.Children))
	}
}

// makeCaseInFolder inserts a test case under a folder via raw SQL so we can
// bypass the legacy feature_id requirement still present on the existing
// CreateTestCase path.  Once feature_id is removed, this helper goes away.
func makeCaseInFolder(t *testing.T, _ interface{}, projectID, folderID, userID, title string) {
	t.Helper()
	pool := testutil.Pool(t)
	// pick any existing feature id to satisfy the legacy not-null FK
	var featureID string
	if err := pool.QueryRow(context.Background(),
		`select id::text from features limit 1`).Scan(&featureID); err != nil {
		// if no feature exists, create a transient area+feature so we can satisfy the FK
		var areaID string
		_ = pool.QueryRow(context.Background(),
			`insert into areas(project_id, key, name) values($1, 'TMP', 'tmp') returning id::text`,
			projectID).Scan(&areaID)
		_ = pool.QueryRow(context.Background(),
			`insert into features(area_id, name) values($1, 'tmp') returning id::text`,
			areaID).Scan(&featureID)
	}
	if _, err := pool.Exec(context.Background(),
		`insert into test_cases(project_id, feature_id, folder_id, public_id, sequence_num, title, created_by_id, updated_by_id)
		   values($1, $2, $3, $4, (select coalesce(max(sequence_num), 0)+1 from test_cases where project_id = $1), $5, $6, $6)`,
		projectID, featureID, folderID, "X-"+title, title, userID); err != nil {
		t.Fatalf("insert case: %v", err)
	}
}
