package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/verify/backend/internal/store"
)

type Server struct {
	Store *store.Store
}

func New(s *store.Store) *Server { return &Server{Store: s} }

// userIDKey is the request-scoped current-user id.
type ctxKey int

const userKey ctxKey = 1

func (s *Server) currentUserMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		u, err := s.Store.CurrentUser(ctx)
		if err != nil {
			http.Error(w, "auth bootstrap failed", http.StatusInternalServerError)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, u.ID)))
	})
}

func currentUserID(r *http.Request) string {
	if v, ok := r.Context().Value(userKey).(string); ok {
		return v
	}
	return ""
}

// Routes returns the wired router.
func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)
	r.Use(s.currentUserMiddleware)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, http.StatusOK, map[string]string{"ok": "ok"}) })

	r.Route("/api/v1", func(r chi.Router) {
		// projects
		r.Get("/projects", s.listProjects)
		r.Post("/projects", s.createProject)
		r.Get("/projects/{projectId}", s.getProject)
		r.Patch("/projects/{projectId}", s.patchProject)

		// areas + features
		r.Get("/projects/{projectId}/areas", s.listAreas)
		r.Get("/projects/{projectId}/hierarchy", s.listHierarchy)
		r.Post("/projects/{projectId}/areas", s.createArea)
		r.Patch("/areas/{areaId}", s.patchArea)
		r.Post("/areas/{areaId}/reorder", s.reorderArea)
		r.Get("/projects/{projectId}/folders", s.listFolders)
		r.Post("/projects/{projectId}/folders", s.createFolder)
		r.Patch("/folders/{folderId}", s.patchFolder)
		r.Post("/folders/{folderId}/move", s.moveFolder)
		r.Post("/folders/{folderId}/reorder", s.reorderFolder)
		r.Get("/projects/{projectId}/features", s.listFeatures)
		r.Post("/projects/{projectId}/features", s.createFeature)
		r.Patch("/features/{featureId}", s.patchFeature)

		// test cases
		r.Get("/projects/{projectId}/cases", s.listCases)
		r.Get("/projects/{projectId}/cases/export.csv", s.exportCasesCSV)
		r.Post("/projects/{projectId}/cases", s.createCase)
		r.Get("/cases/{caseId}", s.getCase)
		r.Put("/cases/{caseId}", s.updateCase)
		r.Delete("/cases/{caseId}", s.deleteCase)
		r.Post("/cases/{caseId}/restore", s.restoreCase)
		r.Post("/cases/{caseId}/duplicate", s.duplicateCase)
		r.Get("/cases/{caseId}/versions", s.listCaseVersions)
		r.Get("/cases/{caseId}/versions/{version}", s.getCaseVersion)
		r.Post("/projects/{projectId}/cases/bulk", s.bulkUpdateCases)

		// runs
		r.Get("/runs", s.listAllRuns)
		r.Get("/projects/{projectId}/runs", s.listRuns)
		r.Post("/projects/{projectId}/runs", s.createRun)
		r.Get("/runs/{runId}", s.getRun)
		r.Get("/runs/{runId}/executions", s.listExecutions)
		r.Get("/runs/{runId}/export.csv", s.exportRunCSV)
		r.Patch("/runs/{runId}/status", s.setRunStatus)
		r.Post("/runs/{runId}/clone", s.cloneRun)
		r.Post("/runs/{runId}/rerun-failed", s.reRunFailed)

		// executions
		r.Patch("/executions/{executionId}", s.recordExecution)

		// saved filters
		r.Get("/projects/{projectId}/saved-filters", s.listSavedFilters)
		r.Post("/projects/{projectId}/saved-filters", s.createSavedFilter)
		r.Delete("/saved-filters/{filterId}", s.deleteSavedFilter)

		// reports + audit + search
		r.Get("/projects/{projectId}/report", s.projectReport)
		r.Get("/audit/recent", s.recentAudit)
		r.Get("/search", s.search)
	})

	return r
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// helpers

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func writeErr(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	log.Printf("[api] error: %v", err)
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
}

func decode(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}
