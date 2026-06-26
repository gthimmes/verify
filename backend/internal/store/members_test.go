package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

func TestMembers_addListRoleRemove(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "MEM", "Members Co")

	// The creator is auto-added as admin (CreateProject).
	members, err := s.ListMembers(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(members) != 1 || members[0].Role != "admin" || !members[0].IsOwner {
		t.Fatalf("expected owner-admin, got %+v", members)
	}

	// Add a member by email (creates the user on the fly).
	m, err := s.AddMember(ctx, p.ID, domain.AddMemberInput{Email: "Bob@Example.com", Role: "editor"}, uid)
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if m.Email != "bob@example.com" || m.Role != "editor" {
		t.Fatalf("normalize/role failed: %+v", m)
	}

	role, err := s.MemberRole(ctx, p.ID, m.UserID)
	if err != nil || role != "editor" {
		t.Fatalf("role lookup: %q %v", role, err)
	}

	// Re-adding the same email updates the role (idempotent upsert).
	if _, err := s.AddMember(ctx, p.ID, domain.AddMemberInput{Email: "bob@example.com", Role: "viewer"}, uid); err != nil {
		t.Fatal(err)
	}
	role, _ = s.MemberRole(ctx, p.ID, m.UserID)
	if role != "viewer" {
		t.Fatalf("expected role updated to viewer, got %q", role)
	}

	// Promote then remove.
	if err := s.UpdateMemberRole(ctx, p.ID, m.UserID, "admin", uid); err != nil {
		t.Fatalf("update role: %v", err)
	}
	if err := s.RemoveMember(ctx, p.ID, m.UserID, uid); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if _, err := s.MemberRole(ctx, p.ID, m.UserID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound after removal, got %v", err)
	}
}

func TestMembers_ownerProtected(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "OWN", "Owner Co")

	// The owner cannot be demoted out of admin…
	if err := s.UpdateMemberRole(ctx, p.ID, uid, "viewer", uid); err == nil {
		t.Fatal("expected error demoting the owner")
	}
	// …nor removed.
	if err := s.RemoveMember(ctx, p.ID, uid, uid); err == nil {
		t.Fatal("expected error removing the owner")
	}
}

func TestMembers_validation(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "VAL", "Validation Co")

	if _, err := s.AddMember(ctx, p.ID, domain.AddMemberInput{Email: "  ", Role: "editor"}, uid); err == nil {
		t.Fatal("expected error for blank email")
	}
	if _, err := s.AddMember(ctx, p.ID, domain.AddMemberInput{Email: "x@x.io", Role: "superuser"}, uid); err == nil {
		t.Fatal("expected error for invalid role")
	}
}

func TestMembers_projectIDResolvers(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()
	p := makeProject(t, s, uid, "RES", "Resolver Co")

	folder, err := s.CreateFolder(ctx, domain.CreateFolderInput{ProjectID: p.ID, Name: "F"})
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.ProjectIDByFolder(ctx, folder.ID)
	if err != nil || got != p.ID {
		t.Fatalf("ProjectIDByFolder: %q %v (want %q)", got, err, p.ID)
	}
	if _, err := s.ProjectIDByCase(ctx, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound for missing case, got %v", err)
	}
}
