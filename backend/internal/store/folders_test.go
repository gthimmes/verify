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
	tree, err := s.FolderTree(ctx, p.ID, false)
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

	tree, err := s.FolderTree(ctx, p.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(tree) != 1 || tree[0].Name != "Top" {
		t.Fatalf("expected single root Top, got %+v", tree)
	}
	if tree[0].CaseCount != 4 {
		t.Fatalf("Top should roll up to 4 cases, got %d", tree[0].CaseCount)
	}
	if tree[0].OwnCount != 1 {
		t.Fatalf("Top.OwnCount: 1 direct case expected, got %d", tree[0].OwnCount)
	}
	mid := tree[0].Children[0]
	if mid.Name != "Mid" || mid.CaseCount != 3 {
		t.Fatalf("Mid: name=%s count=%d", mid.Name, mid.CaseCount)
	}
	if mid.OwnCount != 0 {
		t.Fatalf("Mid.OwnCount: 0 direct cases expected, got %d", mid.OwnCount)
	}
	if len(mid.Children) != 2 {
		t.Fatalf("expected 2 leaves, got %d", len(mid.Children))
	}
	for _, leaf := range mid.Children {
		// Each leaf has its own direct cases and no descendants.
		if leaf.OwnCount != leaf.CaseCount {
			t.Fatalf("leaf %s: OwnCount=%d CaseCount=%d should match (no children)",
				leaf.Name, leaf.OwnCount, leaf.CaseCount)
		}
		if leaf.OwnCount == 0 {
			t.Fatalf("leaf %s: expected >0 direct cases", leaf.Name)
		}
	}
}

// makeCaseInFolder inserts a test case under a folder via raw SQL so the
// folder-tree roll-ups can be exercised without the full CreateTestCase path.
func makeCaseInFolder(t *testing.T, _ interface{}, projectID, folderID, userID, title string) {
	t.Helper()
	pool := testutil.Pool(t)
	if _, err := pool.Exec(context.Background(),
		`insert into test_cases(project_id, folder_id, public_id, sequence_num, title, created_by_id, updated_by_id)
		   values($1, $2, $3, (select coalesce(max(sequence_num), 0)+1 from test_cases where project_id = $1), $4, $5, $5)`,
		projectID, folderID, "X-"+title, title, userID); err != nil {
		t.Fatalf("insert case: %v", err)
	}
}
