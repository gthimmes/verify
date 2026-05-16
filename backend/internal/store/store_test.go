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

func makeArea(t *testing.T, s *store.Store, projectID, key, name string) *domain.Area {
	t.Helper()
	a, err := s.CreateArea(context.Background(), domain.CreateAreaInput{
		ProjectID: projectID, Name: name, Key: key,
	})
	if err != nil {
		t.Fatalf("create area: %v", err)
	}
	return a
}

func makeFeature(t *testing.T, s *store.Store, projectID, areaID, name string) *domain.Feature {
	t.Helper()
	f, err := s.CreateFeature(context.Background(), domain.CreateFeatureInput{
		ProjectID: projectID, AreaID: areaID, Name: name,
	})
	if err != nil {
		t.Fatalf("create feature: %v", err)
	}
	return f
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
