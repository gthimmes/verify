package api

import (
	"net/http"
	"strconv"
	"strings"

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
	if !s.ensureRole(w, r, id, rankAdmin) {
		return
	}
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

// ─── members ─────────────────────────────────────────────────────────────────

func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) {
	members, err := s.Store.ListMembers(r.Context(), chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, members)
}

func (s *Server) addMember(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	if !s.ensureRole(w, r, projectID, rankAdmin) {
		return
	}
	var in domain.AddMemberInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	m, err := s.Store.AddMember(r.Context(), projectID, in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, m)
}

func (s *Server) updateMemberRole(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	if !s.ensureRole(w, r, projectID, rankAdmin) {
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if err := s.Store.UpdateMemberRole(r.Context(), projectID, chi.URLParam(r, "userId"), in.Role, currentUserID(r)); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) removeMember(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	if !s.ensureRole(w, r, projectID, rankAdmin) {
		return
	}
	if err := s.Store.RemoveMember(r.Context(), projectID, chi.URLParam(r, "userId"), currentUserID(r)); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

// ─── folders ─────────────────────────────────────────────────────────────────

func (s *Server) listFolders(w http.ResponseWriter, r *http.Request) {
	includeArchived := r.URL.Query().Get("includeArchived") == "1"
	tree, err := s.Store.FolderTree(r.Context(), chi.URLParam(r, "projectId"), includeArchived)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, tree)
}

func (s *Server) createFolder(w http.ResponseWriter, r *http.Request) {
	var in domain.CreateFolderInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	in.ProjectID = chi.URLParam(r, "projectId")
	f, err := s.Store.CreateFolder(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, f)
}

func (s *Server) patchFolder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "folderId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByFolder(r.Context(), id) }, rankEditor) {
		return
	}
	var in struct {
		Name     *string `json:"name"`
		Archived *bool   `json:"archived"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if in.Name != nil {
		if err := s.Store.RenameFolder(r.Context(), id, *in.Name, currentUserID(r)); err != nil {
			writeErr(w, err)
			return
		}
	}
	if in.Archived != nil {
		if err := s.Store.SetFolderArchived(r.Context(), id, *in.Archived, currentUserID(r)); err != nil {
			writeErr(w, err)
			return
		}
	}
	writeJSON(w, 204, nil)
}

func (s *Server) moveFolder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "folderId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByFolder(r.Context(), id) }, rankEditor) {
		return
	}
	var in struct {
		TargetParentID *string `json:"targetParentId"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if err := s.Store.MoveFolder(r.Context(), id, in.TargetParentID, currentUserID(r)); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) reorderFolder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "folderId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByFolder(r.Context(), id) }, rankEditor) {
		return
	}
	var in struct {
		Direction string `json:"direction"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if err := s.Store.ReorderFolder(r.Context(), id, in.Direction, currentUserID(r)); err != nil {
		writeErr(w, err)
		return
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
	id := chi.URLParam(r, "caseId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), id) }, rankViewer) {
		return
	}
	c, err := s.Store.GetTestCase(r.Context(), id)
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
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), id) }, rankEditor) {
		return
	}
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
	id := chi.URLParam(r, "caseId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), id) }, rankEditor) {
		return
	}
	if err := s.Store.SoftDeleteTestCase(r.Context(), id, true); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) restoreCase(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "caseId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), id) }, rankEditor) {
		return
	}
	if err := s.Store.SoftDeleteTestCase(r.Context(), id, false); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) listCaseVersions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "caseId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), id) }, rankViewer) {
		return
	}
	versions, err := s.Store.ListCaseVersions(r.Context(), id)
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
	caseID := chi.URLParam(r, "caseId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), caseID) }, rankViewer) {
		return
	}
	v, err := s.Store.GetCaseVersion(r.Context(), caseID, version)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, v)
}

func (s *Server) listRelations(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "caseId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), id) }, rankViewer) {
		return
	}
	rels, err := s.Store.ListRelations(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, rels)
}

func (s *Server) addRelation(w http.ResponseWriter, r *http.Request) {
	caseID := chi.URLParam(r, "caseId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), caseID) }, rankEditor) {
		return
	}
	var in struct {
		TargetCaseID string `json:"targetCaseId"`
		RelationType string `json:"relationType"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if err := s.Store.AddRelation(r.Context(), caseID, in.TargetCaseID, in.RelationType, currentUserID(r)); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) removeRelation(w http.ResponseWriter, r *http.Request) {
	caseID := chi.URLParam(r, "caseId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), caseID) }, rankEditor) {
		return
	}
	if err := s.Store.RemoveRelation(r.Context(), caseID, chi.URLParam(r, "otherId"), currentUserID(r)); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) listTemplates(w http.ResponseWriter, r *http.Request) {
	ts, err := s.Store.ListTemplates(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, ts)
}

func (s *Server) getTemplate(w http.ResponseWriter, r *http.Request) {
	t, err := s.Store.GetTemplate(r.Context(), chi.URLParam(r, "templateId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, t)
}

func (s *Server) createTemplate(w http.ResponseWriter, r *http.Request) {
	if !s.ensureOrgAdmin(w, r) {
		return
	}
	var in domain.CreateTemplateInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	t, err := s.Store.CreateTemplate(r.Context(), in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, t)
}

func (s *Server) updateTemplate(w http.ResponseWriter, r *http.Request) {
	if !s.ensureOrgAdmin(w, r) {
		return
	}
	var in domain.CreateTemplateInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	t, err := s.Store.UpdateTemplate(r.Context(), chi.URLParam(r, "templateId"), in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, t)
}

func (s *Server) deleteTemplate(w http.ResponseWriter, r *http.Request) {
	if !s.ensureOrgAdmin(w, r) {
		return
	}
	if err := s.Store.DeleteTemplate(r.Context(), chi.URLParam(r, "templateId"), currentUserID(r)); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

func (s *Server) listAttachments(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	entityType, entityID := q.Get("entityType"), q.Get("entityId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByEntity(r.Context(), entityType, entityID) }, rankViewer) {
		return
	}
	atts, err := s.Store.ListAttachments(r.Context(), entityType, entityID)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, atts)
}

func (s *Server) addAttachment(w http.ResponseWriter, r *http.Request) {
	var in domain.CreateAttachmentInput
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByEntity(r.Context(), in.EntityType, in.EntityID) }, rankEditor) {
		return
	}
	a, err := s.Store.AddAttachment(r.Context(), in, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, a)
}

func (s *Server) downloadAttachment(w http.ResponseWriter, r *http.Request) {
	aid := chi.URLParam(r, "attachmentId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByAttachment(r.Context(), aid) }, rankViewer) {
		return
	}
	filename, contentType, data, err := s.Store.GetAttachmentBlob(r.Context(), aid)
	if err != nil {
		writeErr(w, err)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", "inline; filename=\""+sanitizeFilename(filename)+"\"")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (s *Server) deleteAttachment(w http.ResponseWriter, r *http.Request) {
	aid := chi.URLParam(r, "attachmentId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByAttachment(r.Context(), aid) }, rankEditor) {
		return
	}
	if err := s.Store.DeleteAttachment(r.Context(), aid, currentUserID(r)); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 204, nil)
}

// sanitizeFilename strips characters that would break the Content-Disposition
// header (quotes, control chars, path separators).
func sanitizeFilename(name string) string {
	return strings.Map(func(r rune) rune {
		if r < 32 || r == '"' || r == '\\' || r == '/' {
			return '_'
		}
		return r
	}, name)
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
	id := chi.URLParam(r, "caseId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByCase(r.Context(), id) }, rankEditor) {
		return
	}
	c, err := s.Store.DuplicateTestCase(r.Context(), id, currentUserID(r))
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
	q := r.URL.Query()
	runs, err := s.Store.ListRunsFiltered(r.Context(), store.RunListFilter{
		ProjectID: chi.URLParam(r, "projectId"),
		Status:    q.Get("status"),
		Query:     q.Get("q"),
	})
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
	id := chi.URLParam(r, "runId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByRun(r.Context(), id) }, rankViewer) {
		return
	}
	run, err := s.Store.GetRun(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, run)
}

func (s *Server) listExecutions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByRun(r.Context(), id) }, rankViewer) {
		return
	}
	execs, err := s.Store.ListExecutions(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, execs)
}

func (s *Server) setRunStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByRun(r.Context(), id) }, rankEditor) {
		return
	}
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
	id := chi.URLParam(r, "runId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByRun(r.Context(), id) }, rankEditor) {
		return
	}
	run, err := s.Store.CloneRun(r.Context(), id, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, run)
}

func (s *Server) reRunFailed(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByRun(r.Context(), id) }, rankEditor) {
		return
	}
	run, err := s.Store.ReRunFailed(r.Context(), id, currentUserID(r))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, run)
}

// ─── executions ──────────────────────────────────────────────────────────────

func (s *Server) recordExecution(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "executionId")
	if !s.resolveAndAuthorize(w, r, func() (string, error) { return s.Store.ProjectIDByExecution(r.Context(), id) }, rankEditor) {
		return
	}
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
