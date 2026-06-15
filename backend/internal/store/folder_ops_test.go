package store_test

import (
	"context"
	"strings"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

func mkFolder(t *testing.T, s *store.Store, projectID, name string, parent *string) string {
	t.Helper()
	f, err := s.CreateFolder(context.Background(), domain.CreateFolderInput{
		ProjectID: projectID, ParentID: parent, Name: name,
	})
	if err != nil {
		t.Fatalf("create folder %q: %v", name, err)
	}
	return f.ID
}

func TestRenameFolder(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "RN", "Rename")
	ctx := context.Background()

	id := mkFolder(t, s, p.ID, "Original", nil)
	if err := s.RenameFolder(ctx, id, "  Renamed  ", uid); err != nil {
		t.Fatal(err)
	}
	tree, _ := s.FolderTree(ctx, p.ID, false)
	if len(tree) != 1 || tree[0].Name != "Renamed" {
		t.Fatalf("expected trimmed rename, got %+v", tree)
	}

	// Empty name is rejected.
	if err := s.RenameFolder(ctx, id, "   ", uid); err == nil {
		t.Fatal("expected error renaming to blank")
	}

	// Renaming to collide with a sibling under the same parent is rejected
	// with a friendly message.
	other := mkFolder(t, s, p.ID, "Sibling", nil)
	err := s.RenameFolder(ctx, other, "Renamed", uid)
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("expected duplicate-name error, got %v", err)
	}
}

func TestSetFolderArchived_cascadesAndHides(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "AR", "Archive")
	ctx := context.Background()

	top := mkFolder(t, s, p.ID, "Top", nil)
	mid := mkFolder(t, s, p.ID, "Mid", &top)
	_ = mkFolder(t, s, p.ID, "Leaf", &mid)
	keep := mkFolder(t, s, p.ID, "Keep", nil)
	_ = keep

	if err := s.SetFolderArchived(ctx, top, true, uid); err != nil {
		t.Fatal(err)
	}

	// Default tree hides the whole archived subtree, keeps the sibling.
	visible, _ := s.FolderTree(ctx, p.ID, false)
	if len(visible) != 1 || visible[0].Name != "Keep" {
		t.Fatalf("expected only 'Keep' visible, got %+v", visible)
	}

	// With includeArchived the subtree returns and every node is archived.
	all, _ := s.FolderTree(ctx, p.ID, true)
	var topNode *domain.FolderNode
	for _, n := range all {
		if n.ID == top {
			topNode = n
		}
	}
	if topNode == nil {
		t.Fatal("archived top not returned with includeArchived")
	}
	if !topNode.Archived || !topNode.Children[0].Archived || !topNode.Children[0].Children[0].Archived {
		t.Fatalf("archive did not cascade: %+v", topNode)
	}

	// Unarchiving the top brings the subtree back into the default tree.
	if err := s.SetFolderArchived(ctx, top, false, uid); err != nil {
		t.Fatal(err)
	}
	visible2, _ := s.FolderTree(ctx, p.ID, false)
	if len(visible2) != 2 {
		t.Fatalf("expected 2 roots after unarchive, got %d", len(visible2))
	}
}

func TestMoveFolder_reparentsAndRejectsCycles(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "MV", "Move")
	ctx := context.Background()

	a := mkFolder(t, s, p.ID, "A", nil)
	b := mkFolder(t, s, p.ID, "B", nil)
	bChild := mkFolder(t, s, p.ID, "B-child", &b)

	// Move B under A.
	if err := s.MoveFolder(ctx, b, &a, uid); err != nil {
		t.Fatal(err)
	}
	tree, _ := s.FolderTree(ctx, p.ID, false)
	if len(tree) != 1 || tree[0].ID != a {
		t.Fatalf("expected single root A, got %+v", tree)
	}
	if len(tree[0].Children) != 1 || tree[0].Children[0].ID != b {
		t.Fatalf("expected B nested under A, got %+v", tree[0].Children)
	}

	// Moving A into B's subtree (B-child) is a cycle and must fail.
	if err := s.MoveFolder(ctx, a, &bChild, uid); err == nil {
		t.Fatal("expected cycle rejection moving A under its descendant")
	}
	// Moving a folder into itself must fail.
	if err := s.MoveFolder(ctx, a, &a, uid); err == nil {
		t.Fatal("expected rejection moving A into itself")
	}

	// Move B back to root (nil parent).
	if err := s.MoveFolder(ctx, b, nil, uid); err != nil {
		t.Fatal(err)
	}
	roots, _ := s.FolderTree(ctx, p.ID, false)
	if len(roots) != 2 {
		t.Fatalf("expected 2 roots after moving B to root, got %d", len(roots))
	}
}

func TestReorderFolder_swapsSiblings(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "RO", "Reorder")
	ctx := context.Background()

	first := mkFolder(t, s, p.ID, "First", nil)
	_ = mkFolder(t, s, p.ID, "Second", nil)
	_ = mkFolder(t, s, p.ID, "Third", nil)

	// First starts at index 0; moving it up is a no-op.
	if err := s.ReorderFolder(ctx, first, "up", uid); err != nil {
		t.Fatal(err)
	}
	tree, _ := s.FolderTree(ctx, p.ID, false)
	if tree[0].Name != "First" {
		t.Fatalf("up at edge should be a no-op, got %s first", tree[0].Name)
	}

	// Moving First down swaps it with Second.
	if err := s.ReorderFolder(ctx, first, "down", uid); err != nil {
		t.Fatal(err)
	}
	tree, _ = s.FolderTree(ctx, p.ID, false)
	if tree[0].Name != "Second" || tree[1].Name != "First" {
		t.Fatalf("expected Second, First, Third; got %s, %s, %s", tree[0].Name, tree[1].Name, tree[2].Name)
	}

	if err := s.ReorderFolder(ctx, first, "sideways", uid); err == nil {
		t.Fatal("expected error for invalid direction")
	}
}
