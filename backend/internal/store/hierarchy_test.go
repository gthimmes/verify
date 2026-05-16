package store_test

import (
	"context"
	"testing"
)

func TestCreateArea_uniqueKeyPerProject(t *testing.T) {
	s, uid := newTest(t)
	p1 := makeProject(t, s, uid, "P1", "P1 Project")
	p2 := makeProject(t, s, uid, "P2", "P2 Project")

	a1 := makeArea(t, s, p1.ID, "PAY", "Payments")
	a2 := makeArea(t, s, p2.ID, "PAY", "Payments Two")
	if a1.Key != "PAY" || a2.Key != "PAY" {
		t.Fatalf("same key should be allowed across projects: %q vs %q", a1.Key, a2.Key)
	}

	again := makeArea(t, s, p1.ID, "PAY", "Other Payments")
	if again.Key == "PAY" {
		t.Fatal("expected suffixed key on duplicate within project")
	}
}

func TestReorderArea_swapsAdjacentNeighbours(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "PP", "PP Project")
	a := makeArea(t, s, p.ID, "AA", "Area A")
	b := makeArea(t, s, p.ID, "BB", "Area B")

	ctx := context.Background()
	if err := s.ReorderArea(ctx, b.ID, "up"); err != nil {
		t.Fatal(err)
	}
	areas, _ := s.ListAreas(ctx, p.ID)
	if len(areas) != 2 {
		t.Fatalf("expected 2 areas, got %d", len(areas))
	}
	if areas[0].ID != b.ID || areas[1].ID != a.ID {
		t.Fatalf("expected B,A after reorder; got %s,%s", areas[0].Key, areas[1].Key)
	}
}

func TestReorderArea_noopAtBoundary(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "PP", "PP Project")
	a := makeArea(t, s, p.ID, "AA", "Area A")
	if err := s.ReorderArea(context.Background(), a.ID, "up"); err != nil {
		t.Fatalf("up at top should noop, not error: %v", err)
	}
}

func TestSetAreaArchived_persists(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "PP", "PP Project")
	a := makeArea(t, s, p.ID, "AA", "Area A")
	if err := s.SetAreaArchived(context.Background(), a.ID, true); err != nil {
		t.Fatal(err)
	}
	got, _ := s.ListAreas(context.Background(), p.ID)
	if !got[0].Archived {
		t.Fatal("expected archived")
	}
}

func TestListAreasWithFeatures_groupsCorrectly(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "PP", "PP Project")
	a1 := makeArea(t, s, p.ID, "AA", "Area A")
	a2 := makeArea(t, s, p.ID, "BB", "Area B")
	makeFeature(t, s, p.ID, a1.ID, "F1")
	makeFeature(t, s, p.ID, a1.ID, "F2")
	makeFeature(t, s, p.ID, a2.ID, "F3")

	tree, err := s.ListAreasWithFeatures(context.Background(), p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(tree) != 2 {
		t.Fatalf("expected 2 areas, got %d", len(tree))
	}
	if len(tree[0].Features) != 2 || len(tree[1].Features) != 1 {
		t.Fatalf("feature grouping wrong: %d, %d", len(tree[0].Features), len(tree[1].Features))
	}
}

func TestMoveFeature_movesAndReorders(t *testing.T) {
	s, uid := newTest(t)
	p := makeProject(t, s, uid, "PP", "PP Project")
	a1 := makeArea(t, s, p.ID, "AA", "Area A")
	a2 := makeArea(t, s, p.ID, "BB", "Area B")
	f := makeFeature(t, s, p.ID, a1.ID, "F1")

	if err := s.MoveFeature(context.Background(), f.ID, a2.ID); err != nil {
		t.Fatal(err)
	}
	tree, _ := s.ListAreasWithFeatures(context.Background(), p.ID)
	for _, area := range tree {
		if area.ID == a1.ID && len(area.Features) != 0 {
			t.Fatal("source area still has features")
		}
		if area.ID == a2.ID && len(area.Features) != 1 {
			t.Fatalf("target area should have 1 feature, has %d", len(area.Features))
		}
	}
}
