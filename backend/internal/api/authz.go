package api

import (
	"errors"
	"net/http"

	"github.com/verify/backend/internal/store"
)

// Project-role ranks.  Higher rank ⇒ more capability.
const (
	rankViewer = 1 // read
	rankEditor = 2 // read + author/execute
	rankAdmin  = 3 // everything, incl. settings + member management
)

// roleRank maps a stored role string to a rank.  Legacy/unknown roles are
// treated as editor so pre-RBAC memberships keep working.
func roleRank(role string) int {
	switch role {
	case "admin":
		return rankAdmin
	case "viewer":
		return rankViewer
	case "editor", "tester", "member":
		return rankEditor
	default:
		return rankEditor
	}
}

// ensureRole authorizes the current user for an action on a project requiring
// at least `min` rank.  When enforcement is off it is a no-op (returns true).
// On denial it writes the response (401/403) and returns false, so callers do:
//
//	if !s.ensureRole(w, r, projectID, rankEditor) { return }
func (s *Server) ensureRole(w http.ResponseWriter, r *http.Request, projectID string, min int) bool {
	if !s.AuthEnforced {
		return true
	}
	u, ok := currentUser(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return false
	}
	// Org-level admins (users.role = "admin") bypass per-project checks.
	if u.Role == "admin" {
		return true
	}
	role, err := s.Store.MemberRole(r.Context(), projectID, u.ID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "not a member of this project"})
			return false
		}
		writeErr(w, err)
		return false
	}
	if roleRank(role) < min {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "insufficient role for this action"})
		return false
	}
	return true
}

// ensureOrgAdmin authorizes an action that is global (not project-scoped), such
// as managing templates.  When enforcement is off it is a no-op.
func (s *Server) ensureOrgAdmin(w http.ResponseWriter, r *http.Request) bool {
	if !s.AuthEnforced {
		return true
	}
	u, ok := currentUser(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return false
	}
	if u.Role != "admin" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "org admin required"})
		return false
	}
	return true
}

// resolveAndAuthorize resolves a project id via a lookup (returning the entity's
// project) and then authorizes the current user against it.  Centralizes the
// "load entity → check role" pattern used by entity-scoped routes.
func (s *Server) resolveAndAuthorize(
	w http.ResponseWriter,
	r *http.Request,
	resolve func() (string, error),
	min int,
) bool {
	if !s.AuthEnforced {
		return true
	}
	pid, err := resolve()
	if err != nil {
		writeErr(w, err)
		return false
	}
	return s.ensureRole(w, r, pid, min)
}
