package store_test

import (
	"context"
	"testing"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
	"github.com/verify/backend/internal/testutil"
)

// helpers shared by every test file in this package

func newTest(t *testing.T) (*store.Store, string) {
	t.Helper()
	pool := testutil.Pool(t)
	testutil.Reset(t, pool)
	s := store.New(pool)
	uid := testutil.SeedUser(t, s)
	return s, uid
}

// makeProject creates a project with the given key and returns its id.
func makeProject(t *testing.T, s *store.Store, ownerID, key, name string) *domain.Project {
	t.Helper()
	p, err := s.CreateProject(context.Background(), domain.CreateProjectInput{
		Name: name, Key: key, Description: name + " description",
	}, ownerID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	return p
}

// makeArea creates a top-level folder (the area/feature layout is gone; these
// helpers keep the older call sites working against the folder tree).
func makeArea(t *testing.T, s *store.Store, projectID, key, name string) *domain.Folder {
	t.Helper()
	f, err := s.CreateFolder(context.Background(), domain.CreateFolderInput{
		ProjectID: projectID, Name: name,
	})
	if err != nil {
		t.Fatalf("create folder (area): %v", err)
	}
	return f
}

// makeFeature creates a child folder under the given parent folder id.
func makeFeature(t *testing.T, s *store.Store, projectID, areaID, name string) *domain.Folder {
	t.Helper()
	parent := areaID
	f, err := s.CreateFolder(context.Background(), domain.CreateFolderInput{
		ProjectID: projectID, ParentID: &parent, Name: name,
	})
	if err != nil {
		t.Fatalf("create folder (feature): %v", err)
	}
	return f
}

// makeFolder creates a top-level folder and returns its id (for newer tests).
func makeFolder(t *testing.T, s *store.Store, projectID, name string) string {
	t.Helper()
	f, err := s.CreateFolder(context.Background(), domain.CreateFolderInput{
		ProjectID: projectID, Name: name,
	})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	return f.ID
}

func makeCase(t *testing.T, s *store.Store, in domain.TestCaseInput, userID string) *domain.TestCase {
	t.Helper()
	if in.Type == "" {
		in.Type = "functional"
	}
	if in.Priority == "" {
		in.Priority = "medium"
	}
	if in.Status == "" {
		in.Status = "active"
	}
	if in.AutomationStatus == "" {
		in.AutomationStatus = "not_automated"
	}
	if len(in.Steps) == 0 {
		in.Steps = []domain.TestStep{{Order: 0, Action: "do thing", Expected: "thing happens"}}
	}
	tc, err := s.CreateTestCase(context.Background(), in, userID)
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	return tc
}
