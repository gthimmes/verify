package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/store"
)

type Server struct {
	Store  *store.Store
	Google GoogleExchanger
	// AuthEnforced turns on hard authentication + per-project role checks.
	// When false (the default), the API runs additively: unauthenticated
	// requests fall back to the demo user and role checks are no-ops.
	AuthEnforced bool
}

func New(s *store.Store) *Server {
	return &Server{
		Store:        s,
		Google:       httpGoogleExchanger{},
		AuthEnforced: authEnforcedFromEnv(),
	}
}

func authEnforcedFromEnv() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AUTH_ENFORCED"))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// request-scoped current-user keys.
type ctxKey int

const (
	userKey    ctxKey = 1 // current-user id (string)
	userObjKey ctxKey = 2 // current user (domain.User)
)

// currentUserMiddleware resolves the request's user.  A valid bearer session
// token (forwarded by the web layer) wins; otherwise it falls back to the demo
// user so the app and tests keep working while auth is additive.
func (s *Server) currentUserMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		if token := bearerToken(r); token != "" {
			if u, err := s.Store.UserBySession(ctx, token); err == nil {
				next.ServeHTTP(w, r.WithContext(withUser(r.Context(), u)))
				return
			}
			// Unknown/expired token → fall through below.
		}

		// No valid session.  Under enforcement, only public paths proceed;
		// everything else is rejected.  Otherwise fall back to the demo user.
		if s.AuthEnforced {
			if isPublicPath(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}

		u, err := s.Store.CurrentUser(ctx)
		if err != nil {
			http.Error(w, "auth bootstrap failed", http.StatusInternalServerError)
			return
		}
		next.ServeHTTP(w, r.WithContext(withUser(r.Context(), u)))
	})
}

// isPublicPath lists endpoints reachable without a session even when auth is
// enforced: the health check and the OAuth code exchange (the login itself).
func isPublicPath(p string) bool {
	switch p {
	case "/health", "/api/v1/auth/google/exchange":
		return true
	}
	return false
}

// projectAccess gates every /projects/{projectId}/... route when enforcement
// is on: GETs require viewer rank, mutations require editor.  Handlers that
// need a stricter rank (e.g. project settings, member management) add their own
// ensureRole(...) on top.
func (s *Server) projectAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.AuthEnforced {
			next.ServeHTTP(w, r)
			return
		}
		min := rankViewer
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			min = rankEditor
		}
		if !s.ensureRole(w, r, chi.URLParam(r, "projectId"), min) {
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withUser(ctx context.Context, u domain.User) context.Context {
	ctx = context.WithValue(ctx, userKey, u.ID)
	return context.WithValue(ctx, userObjKey, u)
}

// currentUser returns the request's resolved user.
func currentUser(r *http.Request) (domain.User, bool) {
	u, ok := r.Context().Value(userObjKey).(domain.User)
	return u, ok
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
		// auth
		r.Post("/auth/google/exchange", s.exchangeGoogle)
		r.Post("/auth/logout", s.logout)
		r.Get("/auth/me", s.me)

		// projects (collection)
		r.Get("/projects", s.listProjects)
		r.Post("/projects", s.createProject)

		// project-scoped routes share the projectAccess gate (viewer for reads,
		// editor for writes); stricter actions add their own ensureRole.
		r.Route("/projects/{projectId}", func(r chi.Router) {
			r.Use(s.projectAccess)
			r.Get("/", s.getProject)
			r.Patch("/", s.patchProject)
			r.Get("/areas", s.listAreas)
			r.Get("/hierarchy", s.listHierarchy)
			r.Post("/areas", s.createArea)
			r.Get("/folders", s.listFolders)
			r.Post("/folders", s.createFolder)
			r.Get("/features", s.listFeatures)
			r.Post("/features", s.createFeature)
			r.Get("/cases", s.listCases)
			r.Get("/cases/export.csv", s.exportCasesCSV)
			r.Post("/cases", s.createCase)
			r.Post("/cases/bulk", s.bulkUpdateCases)
			r.Get("/runs", s.listRuns)
			r.Post("/runs", s.createRun)
			r.Get("/saved-filters", s.listSavedFilters)
			r.Post("/saved-filters", s.createSavedFilter)
			r.Get("/report", s.projectReport)
			// members
			r.Get("/members", s.listMembers)
			r.Post("/members", s.addMember)
			r.Patch("/members/{userId}", s.updateMemberRole)
			r.Delete("/members/{userId}", s.removeMember)
		})

		// areas + features (entity-scoped)
		r.Patch("/areas/{areaId}", s.patchArea)
		r.Post("/areas/{areaId}/reorder", s.reorderArea)
		r.Patch("/folders/{folderId}", s.patchFolder)
		r.Post("/folders/{folderId}/move", s.moveFolder)
		r.Post("/folders/{folderId}/reorder", s.reorderFolder)
		r.Patch("/features/{featureId}", s.patchFeature)

		// test cases (entity-scoped)
		r.Get("/cases/{caseId}", s.getCase)
		r.Put("/cases/{caseId}", s.updateCase)
		r.Delete("/cases/{caseId}", s.deleteCase)
		r.Post("/cases/{caseId}/restore", s.restoreCase)
		r.Post("/cases/{caseId}/duplicate", s.duplicateCase)
		r.Get("/cases/{caseId}/versions", s.listCaseVersions)
		r.Get("/cases/{caseId}/versions/{version}", s.getCaseVersion)
		r.Get("/cases/{caseId}/relations", s.listRelations)
		r.Post("/cases/{caseId}/relations", s.addRelation)
		r.Delete("/cases/{caseId}/relations/{otherId}", s.removeRelation)

		// runs (entity-scoped; project-scoped list/create are in the group above)
		r.Get("/runs", s.listAllRuns)
		r.Get("/runs/{runId}", s.getRun)
		r.Get("/runs/{runId}/executions", s.listExecutions)
		r.Get("/runs/{runId}/export.csv", s.exportRunCSV)
		r.Patch("/runs/{runId}/status", s.setRunStatus)
		r.Post("/runs/{runId}/clone", s.cloneRun)
		r.Post("/runs/{runId}/rerun-failed", s.reRunFailed)

		// executions
		r.Patch("/executions/{executionId}", s.recordExecution)

		// attachments
		r.Get("/attachments", s.listAttachments)
		r.Post("/attachments", s.addAttachment)
		r.Get("/attachments/{attachmentId}/download", s.downloadAttachment)
		r.Delete("/attachments/{attachmentId}", s.deleteAttachment)

		// templates
		r.Get("/templates", s.listTemplates)
		r.Post("/templates", s.createTemplate)
		r.Get("/templates/{templateId}", s.getTemplate)
		r.Patch("/templates/{templateId}", s.updateTemplate)
		r.Delete("/templates/{templateId}", s.deleteTemplate)

		// saved filters (entity-scoped delete; project-scoped list/create above)
		r.Delete("/saved-filters/{filterId}", s.deleteSavedFilter)

		// audit + search
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
