package importer

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

// Plan is what the dry-run prints + what the writer iterates.  It pairs
// each Row with the resolved schema decisions so the report and the write
// pass share one source of truth.
type Plan struct {
	Project *domain.Project
	Items   []PlannedCase
	Summary PlanSummary
}

type PlannedCase struct {
	Row        Row
	FolderPath FolderPath
	CaseStatus string
	Type       string
	Priority   string
	Steps      []ParsedStep
	JiraKeys   string
}

type PlanSummary struct {
	TotalRows         int
	BySheet           map[string]int
	ByType            map[string]int
	ByPriority        map[string]int
	ByCaseStatus      map[string]int
	UniquePaths       []string
	WithPrecondition  int
	WithMultipleSteps int
	SkippedReasons    map[string]int
}

func PlanRows(rows []Row, project *domain.Project) Plan {
	plan := Plan{
		Project: project,
		Summary: PlanSummary{
			BySheet:        map[string]int{},
			ByType:         map[string]int{},
			ByPriority:     map[string]int{},
			ByCaseStatus:   map[string]int{},
			SkippedReasons: map[string]int{},
		},
	}
	pathSet := map[string]bool{}

	for _, r := range rows {
		if r.Title == "" {
			plan.Summary.SkippedReasons["missing title"]++
			continue
		}
		fp := ParseFolder(r.Folder)
		typ := MapType(r.TypeRaw)
		prio := MapPriority(r.PriorityRaw)
		steps := ParseSteps(r.Steps, r.ExpectedResult)
		jira := JiraKeysFromRequirements(r.Requirements)

		plan.Items = append(plan.Items, PlannedCase{
			Row:        r,
			FolderPath: fp,
			CaseStatus: fp.CaseStatus,
			Type:       typ,
			Priority:   prio,
			Steps:      steps,
			JiraKeys:   jira,
		})
		plan.Summary.TotalRows++
		plan.Summary.BySheet[r.Sheet]++
		plan.Summary.ByType[typ]++
		plan.Summary.ByPriority[prio]++
		plan.Summary.ByCaseStatus[fp.CaseStatus]++
		if r.Precondition != "" {
			plan.Summary.WithPrecondition++
		}
		if len(steps) > 1 {
			plan.Summary.WithMultipleSteps++
		}
		pathSet[strings.Join(fp.Segments, " > ")] = true
	}
	plan.Summary.UniquePaths = make([]string, 0, len(pathSet))
	for p := range pathSet {
		plan.Summary.UniquePaths = append(plan.Summary.UniquePaths, p)
	}
	sort.Strings(plan.Summary.UniquePaths)
	return plan
}

// Apply writes the plan via the store.  Folders are upserted via
// EnsureFolderPath, so re-runs only add new ones.  Cases are always
// inserted (we don't dedupe — Testiny doesn't guarantee title uniqueness).
func Apply(ctx context.Context, s *store.Store, plan Plan, ownerID string) (ApplyResult, error) {
	res := ApplyResult{}
	if plan.Project == nil {
		return res, fmt.Errorf("plan.Project is nil")
	}
	pid := plan.Project.ID

	folderCache := map[string]string{}
	beforeFolders, err := s.FolderTree(ctx, pid, true)
	if err != nil {
		return res, err
	}
	preExisting := countFolders(beforeFolders)

	featureID, err := pickAnyFeature(ctx, s, pid)
	if err != nil {
		return res, err
	}

	for _, item := range plan.Items {
		key := strings.Join(item.FolderPath.Segments, "\x00")
		folderID, ok := folderCache[key]
		if !ok {
			fid, err := s.EnsureFolderPath(ctx, pid, item.FolderPath.Segments)
			if err != nil {
				return res, fmt.Errorf("ensure folder %v: %w", item.FolderPath.Segments, err)
			}
			folderCache[key] = fid
			folderID = fid
		}
		in := buildCaseInput(item, pid, featureID, folderID)
		if _, err := s.CreateTestCase(ctx, in, ownerID); err != nil {
			return res, fmt.Errorf("create case %q (%s): %w", item.Row.Title, item.Row.TestinyID, err)
		}
		res.CasesCreated++
	}

	afterFolders, _ := s.FolderTree(ctx, pid, true)
	res.FoldersCreated = countFolders(afterFolders) - preExisting
	return res, nil
}

func countFolders(roots []*domain.FolderNode) int {
	total := 0
	var walk func(n *domain.FolderNode)
	walk = func(n *domain.FolderNode) {
		total++
		for _, c := range n.Children {
			walk(c)
		}
	}
	for _, r := range roots {
		walk(r)
	}
	return total
}

// pickAnyFeature returns a feature id under the project, creating a
// throwaway "(legacy)" area+feature if none exists.  Once the legacy
// test_cases.feature_id column is dropped, this whole helper goes away.
func pickAnyFeature(ctx context.Context, s *store.Store, projectID string) (string, error) {
	features, err := s.ListFeatures(ctx, projectID)
	if err != nil {
		return "", err
	}
	if len(features) > 0 {
		return features[0].ID, nil
	}
	a, err := s.CreateArea(ctx, domain.CreateAreaInput{
		ProjectID: projectID, Key: "IMP", Name: "(legacy)",
	})
	if err != nil {
		return "", err
	}
	f, err := s.CreateFeature(ctx, domain.CreateFeatureInput{
		ProjectID: projectID, AreaID: a.ID, Name: "(legacy)",
	})
	if err != nil {
		return "", err
	}
	return f.ID, nil
}

func buildCaseInput(item PlannedCase, projectID, featureID, folderID string) domain.TestCaseInput {
	steps := make([]domain.TestStep, 0, len(item.Steps))
	for i, s := range item.Steps {
		steps = append(steps, domain.TestStep{Order: i, Action: s.Action, Expected: s.Expected})
	}
	return domain.TestCaseInput{
		ProjectID:        projectID,
		FeatureID:        featureID,
		FolderID:         &folderID,
		Title:            item.Row.Title,
		Preconditions:    item.Row.Precondition,
		Type:             item.Type,
		Priority:         item.Priority,
		Status:           item.CaseStatus,
		AutomationStatus: "not_automated",
		JiraKeys:         item.JiraKeys,
		Steps:            steps,
	}
}

// ApplyResult is what the write pass returns to the CLI for the final report.
type ApplyResult struct {
	FoldersCreated int
	CasesCreated   int
}
