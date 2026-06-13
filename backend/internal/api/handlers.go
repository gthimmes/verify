package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

// ─── projects ────────────────────────────────────────────────────────────────

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	includeArchived := r.URL.Query().Get("archived") == "1"
	projects, err := s.Store.ListProjects(r.Context(), includeArchived)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, projects)
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "projectId")
	p, err := s.Store.GetProject(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, p)
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	var in domain.CreateProjectInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	p, err := s.Store.CreateProject(r.Context(), in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, p)
}

func (s *Server) patchProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "projectId")
	var in struct {
		Name   *string `json:"name"`
		Status *string `json:"status"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if in.Name != nil {
		if err := s.Store.RenameProject(r.Context(), id, *in.Name); err != nil {
			writeErr(w, err)
			return
		}
	}
	if in.Status != nil {
		if err := s.Store.SetProjectStatus(r.Context(), id, *in.Status); err != nil {
			writeErr(w, err)
			return
		}
	}
	writeJSON(w, 204, nil)
}

// ─── areas + features ────────────────────────────────────────────────────────

func (s *Server) listAreas(w http.ResponseWriter, r *http.Request) {
	areas, err := s.Store.ListAreas(r.Context(), chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, areas)
}

func (s *Server) listHierarchy(w http.ResponseWriter, r *http.Request) {
	tree, err := s.Store.ListAreasWithFeatures(r.Context(), chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, tree)
}

func (s *Server) createArea(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	var in domain.CreateAreaInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	in.ProjectID = projectID
	a, err := s.Store.CreateArea(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, a)
}

func (s *Server) patchArea(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "areaId")
	var in struct {
		Archived *bool `json:"archived"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if in.Archived != nil {
		if err := s.Store.SetAreaArchived(r.Context(), id, *in.Archived); err != nil {
			writeErr(w, err)
			return
		}
	}
	writeJSON(w, 204, nil)
}

func (s *Server) reorderArea(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "areaId")
	var in struct {
		Direction string `json:"direction"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if err := s.Store.ReorderArea(r.Context(), id, in.Direction); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) listFolders(w http.ResponseWriter, r *http.Request) {
	tree, err := s.Store.FolderTree(r.Context(), chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, tree)
}

func (s *Server) listFeatures(w http.ResponseWriter, r *http.Request) {
	features, err := s.Store.ListFeatures(r.Context(), chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, features)
}

func (s *Server) createFeature(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	var in domain.CreateFeatureInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	in.ProjectID = projectID
	f, err := s.Store.CreateFeature(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, f)
}

func (s *Server) patchFeature(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "featureId")
	var in struct {
		Archived     *bool   `json:"archived"`
		TargetAreaID *string `json:"targetAreaId"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if in.Archived != nil {
		if err := s.Store.SetFeatureArchived(r.Context(), id, *in.Archived); err != nil {
			writeErr(w, err)
			return
		}
	}
	if in.TargetAreaID != nil {
		if err := s.Store.MoveFeature(r.Context(), id, *in.TargetAreaID); err != nil {
			writeErr(w, err)
			return
		}
	}
	writeJSON(w, 204, nil)
}

// ─── test cases ──────────────────────────────────────────────────────────────

func (s *Server) listCases(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	cases, err := s.Store.ListTestCases(r.Context(), store.CaseListFilter{
		ProjectID:          chi.URLParam(r, "projectId"),
		IncludeDeleted:     q.Get("archived") == "1",
		Type:               q.Get("type"),
		Priority:           q.Get("priority"),
		Status:             q.Get("status"),
		AutomationStatus:   q.Get("automationStatus"),
		FeatureID:          q.Get("featureId"),
		AreaID:             q.Get("areaId"),
		FolderID:           q.Get("folderId"),
		IncludeDescendants: q.Get("descendants") != "0", // default ON for tree filter
		Tag:                q.Get("tag"),
		Q:                  q.Get("q"),
		Limit:              limit,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, cases)
}

func (s *Server) getCase(w http.ResponseWriter, r *http.Request) {
	c, err := s.Store.GetTestCase(r.Context(), chi.URLParam(r, "caseId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, c)
}

func (s *Server) createCase(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	var in domain.TestCaseInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	in.ProjectID = projectID
	c, err := s.Store.CreateTestCase(r.Context(), in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, c)
}

func (s *Server) updateCase(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "caseId")
	var in domain.TestCaseInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	c, err := s.Store.UpdateTestCase(r.Context(), id, in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, c)
}

func (s *Server) deleteCase(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.SoftDeleteTestCase(r.Context(), chi.URLParam(r, "caseId"), true); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) restoreCase(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.SoftDeleteTestCase(r.Context(), chi.URLParam(r, "caseId"), false); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) listCaseVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := s.Store.ListCaseVersions(r.Context(), chi.URLParam(r, "caseId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, versions)
}

func (s *Server) getCaseVersion(w http.ResponseWriter, r *http.Request) {
	version, err := strconv.Atoi(chi.URLParam(r, "version"))
	if err != nil {
		writeErr(w, err)
		return
	}
	v, err := s.Store.GetCaseVersion(r.Context(), chi.URLParam(r, "caseId"), version)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, v)
}

func (s *Server) bulkUpdateCases(w http.ResponseWriter, r *http.Request) {
	var in domain.BulkCaseRequest
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	n, err := s.Store.BulkUpdateCases(r.Context(), in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, domain.BulkCaseResult{Updated: n})
}

func (s *Server) duplicateCase(w http.ResponseWriter, r *http.Request) {
	c, err := s.Store.DuplicateTestCase(r.Context(), chi.URLParam(r, "caseId"), currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, c)
}

// ─── runs ────────────────────────────────────────────────────────────────────

func (s *Server) listAllRuns(w http.ResponseWriter, r *http.Request) {
	onlyActive := r.URL.Query().Get("active") == "1"
	runs, err := s.Store.ListRuns(r.Context(), "", onlyActive)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, runs)
}

func (s *Server) listRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := s.Store.ListRuns(r.Context(), chi.URLParam(r, "projectId"), false)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, runs)
}

func (s *Server) createRun(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	var in domain.CreateRunInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	in.ProjectID = projectID
	run, err := s.Store.CreateRun(r.Context(), in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, run)
}

func (s *Server) getRun(w http.ResponseWriter, r *http.Request) {
	run, err := s.Store.GetRun(r.Context(), chi.URLParam(r, "runId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, run)
}

func (s *Server) listExecutions(w http.ResponseWriter, r *http.Request) {
	execs, err := s.Store.ListExecutions(r.Context(), chi.URLParam(r, "runId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, execs)
}

func (s *Server) setRunStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runId")
	var in struct {
		Status      string `json:"status"`
		AbortReason string `json:"abortReason"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if err := s.Store.SetRunStatus(r.Context(), id, in.Status, in.AbortReason); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) cloneRun(w http.ResponseWriter, r *http.Request) {
	run, err := s.Store.CloneRun(r.Context(), chi.URLParam(r, "runId"), currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, run)
}

func (s *Server) reRunFailed(w http.ResponseWriter, r *http.Request) {
	run, err := s.Store.ReRunFailed(r.Context(), chi.URLParam(r, "runId"), currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, run)
}

// ─── executions ──────────────────────────────────────────────────────────────

func (s *Server) recordExecution(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "executionId")
	var in domain.RecordExecutionInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if err := s.Store.RecordExecution(r.Context(), id, in, currentUserID(r)); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

// ─── saved filters ───────────────────────────────────────────────────────────

func (s *Server) listSavedFilters(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	filters, err := s.Store.ListSavedFilters(r.Context(), chi.URLParam(r, "projectId"), scope, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, filters)
}

func (s *Server) createSavedFilter(w http.ResponseWriter, r *http.Request) {
	var in domain.CreateSavedFilterInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	in.ProjectID = chi.URLParam(r, "projectId")
	f, err := s.Store.CreateSavedFilter(r.Context(), in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, f)
}

func (s *Server) deleteSavedFilter(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeleteSavedFilter(r.Context(), chi.URLParam(r, "filterId"), currentUserID(r)); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

// ─── reports + audit + search ────────────────────────────────────────────────

func (s *Server) projectReport(w http.ResponseWriter, r *http.Request) {
	rep, err := s.Store.ProjectReport(r.Context(), chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, rep)
}

func (s *Server) recentAudit(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	logs, err := s.Store.RecentAudit(r.Context(), limit)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, logs)
}

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	cases, err := s.Store.SearchCases(r.Context(), q, limit)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, cases)
}
