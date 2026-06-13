package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/verify/backend/internal/store"
)

// CSV export endpoints.  These are read-only and synchronous — the PDF
// variants in the roadmap will go through the v2 job runner, but a results
// table fits comfortably in a single request.

func (s *Server) exportRunCSV(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	run, err := s.Store.GetRun(r.Context(), runID)
	if err != nil {
		writeErr(w, err)
		return
	}
	execs, err := s.Store.ListExecutions(r.Context(), runID)
	if err != nil {
		writeErr(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", csvFilename(run.Name, "results")))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{
		"Case ID", "Title", "Priority", "Type", "Data Row", "Result",
		"Executed By", "Executed At", "Duration (s)", "Environment", "Build",
		"Comments", "Jira Defects",
	})
	for _, e := range execs {
		_ = cw.Write([]string{
			e.SnapshotCase.PublicID,
			e.SnapshotCase.Title,
			e.SnapshotCase.Priority,
			e.SnapshotCase.Type,
			derefStr(e.DataRowLabel),
			e.Result,
			derefStr(e.ExecutedByName),
			timeStr(e.ExecutedAt),
			intStr(e.DurationSeconds),
			derefStr(e.EnvOverride),
			derefStr(e.BuildOverride),
			derefStr(e.Comments),
			derefStr(e.JiraDefectKeys),
		})
	}
	cw.Flush()
}

func (s *Server) exportCasesCSV(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 {
		limit = 5000
	}
	cases, err := s.Store.ListTestCases(r.Context(), store.CaseListFilter{
		ProjectID:          projectID,
		IncludeDeleted:     q.Get("archived") == "1",
		Type:               q.Get("type"),
		Priority:           q.Get("priority"),
		Status:             q.Get("status"),
		AutomationStatus:   q.Get("automationStatus"),
		FeatureID:          q.Get("featureId"),
		AreaID:             q.Get("areaId"),
		FolderID:           q.Get("folderId"),
		IncludeDescendants: q.Get("descendants") != "0",
		Tag:                q.Get("tag"),
		Q:                  q.Get("q"),
		Limit:              limit,
	})
	if err != nil {
		writeErr(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", csvFilename("cases", "")))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{
		"Case ID", "Title", "Area", "Feature", "Priority", "Type", "Status",
		"Automation", "Tags", "Jira Keys", "Updated At",
	})
	for _, c := range cases {
		_ = cw.Write([]string{
			c.PublicID,
			c.Title,
			c.AreaName,
			c.FeatureName,
			c.Priority,
			c.Type,
			c.Status,
			c.AutomationStatus,
			strings.Join(c.Tags, " "),
			derefStr(c.JiraKeys),
			c.UpdatedAt.Format("2006-01-02 15:04"),
		})
	}
	cw.Flush()
}

// ─── small formatting helpers ────────────────────────────────────────────────

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func intStr(p *int) string {
	if p == nil {
		return ""
	}
	return strconv.Itoa(*p)
}

func timeStr(p *time.Time) string {
	if p == nil {
		return ""
	}
	return p.Format("2006-01-02 15:04")
}

// csvFilename builds a safe download name like "smoke-run-results.csv".
func csvFilename(base, suffix string) string {
	slug := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			return r
		case r >= 'A' && r <= 'Z':
			return r + 32
		case r == ' ' || r == '-' || r == '_':
			return '-'
		default:
			return -1
		}
	}, base)
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "export"
	}
	if suffix != "" {
		slug += "-" + suffix
	}
	return slug + ".csv"
}
