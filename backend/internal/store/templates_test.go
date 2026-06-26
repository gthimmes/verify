package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

func TestTemplates_createListUpdateDelete(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()

	tpl, err := s.CreateTemplate(ctx, domain.CreateTemplateInput{
		Name:        "API smoke test",
		Description: "Standard happy-path API check",
		Body: domain.TemplateBody{
			Title:    "Verify {{endpoint}} returns 200",
			Priority: "high",
			Type:     "smoke",
			Tags:     []string{"smoke", "api"},
			Steps: []domain.TestStep{
				{Order: 1, Action: "Send GET", Expected: "200 OK"},
			},
			Parameters: []domain.TestCaseParam{{Name: "endpoint", Order: 1}},
		},
	}, uid)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if tpl.Body.Priority != "high" || len(tpl.Body.Steps) != 1 || tpl.Body.Steps[0].Action != "Send GET" {
		t.Fatalf("body roundtrip failed: %+v", tpl.Body)
	}
	if tpl.CreatedByName == "" {
		t.Fatalf("expected creator name populated")
	}

	list, err := s.ListTemplates(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 template, got %d", len(list))
	}

	updated, err := s.UpdateTemplate(ctx, tpl.ID, domain.CreateTemplateInput{
		Name: "API smoke test v2",
		Body: domain.TemplateBody{Priority: "critical", Type: "smoke"},
	}, uid)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "API smoke test v2" || updated.Body.Priority != "critical" {
		t.Fatalf("update didn't apply: %+v", updated)
	}

	if err := s.DeleteTemplate(ctx, tpl.ID, uid); err != nil {
		t.Fatalf("delete: %v", err)
	}
	list, _ = s.ListTemplates(ctx)
	if len(list) != 0 {
		t.Fatalf("expected 0 after delete, got %d", len(list))
	}
}

func TestTemplates_duplicateNameRejected(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()

	if _, err := s.CreateTemplate(ctx, domain.CreateTemplateInput{Name: "Dup"}, uid); err != nil {
		t.Fatal(err)
	}
	// Case-insensitive uniqueness on the name.
	if _, err := s.CreateTemplate(ctx, domain.CreateTemplateInput{Name: "dup"}, uid); err == nil {
		t.Fatal("expected duplicate-name error")
	}
}

func TestTemplates_validationAndNotFound(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()

	if _, err := s.CreateTemplate(ctx, domain.CreateTemplateInput{Name: "  "}, uid); err == nil {
		t.Fatal("expected error for blank name")
	}
	if _, err := s.GetTemplate(ctx, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if err := s.DeleteTemplate(ctx, "00000000-0000-0000-0000-000000000000", uid); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound on delete, got %v", err)
	}
}

func TestTemplates_emptyBodyNormalizes(t *testing.T) {
	s, uid := newTest(t)
	ctx := context.Background()

	tpl, err := s.CreateTemplate(ctx, domain.CreateTemplateInput{Name: "Bare"}, uid)
	if err != nil {
		t.Fatal(err)
	}
	if tpl.Body.Tags == nil || tpl.Body.Steps == nil || tpl.Body.Parameters == nil {
		t.Fatalf("expected slices initialised to non-nil: %+v", tpl.Body)
	}
	if tpl.Body.Type != "functional" || tpl.Body.Priority != "medium" {
		t.Fatalf("expected default type/priority, got %q/%q", tpl.Body.Type, tpl.Body.Priority)
	}
}
