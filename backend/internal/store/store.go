package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/verify/backend/internal/domain"
)

// ErrNotFound is returned when a record doesn't exist.
var ErrNotFound = errors.New("not found")

// Store wraps a pgx pool and exposes domain methods.
type Store struct {
	Pool *pgxpool.Pool
}

func New(p *pgxpool.Pool) *Store { return &Store{Pool: p} }

// ─── current user (mocked single user) ───────────────────────────────────────

// CurrentUser ensures a single demo admin exists and returns it.
func (s *Store) CurrentUser(ctx context.Context) (domain.User, error) {
	var u domain.User
	err := s.Pool.QueryRow(ctx, `
		select id::text, email, name, role
		from users where email = 'demo@verify.local'`,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Role)
	if err == nil {
		return u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return u, err
	}
	err = s.Pool.QueryRow(ctx, `
		insert into users(email, name, role) values('demo@verify.local','Demo Admin','admin')
		returning id::text, email, name, role`,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Role)
	return u, err
}

// EnsureUser creates-or-fetches a user by email.  Used by the seed.
func (s *Store) EnsureUser(ctx context.Context, email, name, role string) (domain.User, error) {
	var u domain.User
	err := s.Pool.QueryRow(ctx, `
		insert into users(email,name,role) values($1,$2,$3)
		on conflict(email) do update set name = excluded.name
		returning id::text, email, name, role`,
		email, name, role,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Role)
	return u, err
}

// ─── projects ────────────────────────────────────────────────────────────────

func (s *Store) ListProjects(ctx context.Context, includeArchived bool) ([]domain.ProjectSummary, error) {
	q := `
		select p.id::text, p.key, p.name, p.description, p.status, p.owner_id::text,
		       u.name, p.created_at, p.updated_at, p.deleted_at,
		       (select count(*) from test_cases tc where tc.project_id = p.id and tc.deleted_at is null) as case_count,
		       (select count(*) from areas a where a.project_id = p.id) as area_count,
		       (select count(*) from test_runs r where r.project_id = p.id) as run_count,
		       (select count(*) from test_runs r where r.project_id = p.id and r.status in ('draft','in_progress','blocked')) as active_runs,
		       (select count(*) from test_cases tc where tc.project_id = p.id and tc.deleted_at is null and tc.automation_status in ('full','partial')) as automated
		from projects p
		join users u on u.id = p.owner_id
		where p.deleted_at is null` +
		map[bool]string{true: "", false: " and p.status = 'active'"}[includeArchived] + `
		order by p.updated_at desc`
	rows, err := s.Pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ProjectSummary{}
	for rows.Next() {
		var p domain.ProjectSummary
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Description, &p.Status, &p.OwnerID, &p.OwnerName,
			&p.CreatedAt, &p.UpdatedAt, &p.DeletedAt,
			&p.TestCaseCount, &p.AreaCount, &p.RunCount, &p.ActiveRunCount, &p.AutomatedCount); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) GetProjectByKey(ctx context.Context, key string) (*domain.Project, error) {
	var p domain.Project
	err := s.Pool.QueryRow(ctx, `
		select p.id::text, p.key, p.name, p.description, p.status, p.owner_id::text, u.name,
		       p.created_at, p.updated_at, p.deleted_at
		from projects p join users u on u.id = p.owner_id
		where p.key = $1 and p.deleted_at is null`,
		key,
	).Scan(&p.ID, &p.Key, &p.Name, &p.Description, &p.Status, &p.OwnerID, &p.OwnerName,
		&p.CreatedAt, &p.UpdatedAt, &p.DeletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) GetProject(ctx context.Context, id string) (*domain.Project, error) {
	var p domain.Project
	err := s.Pool.QueryRow(ctx, `
		select p.id::text, p.key, p.name, p.description, p.status, p.owner_id::text, u.name,
		       p.created_at, p.updated_at, p.deleted_at
		from projects p join users u on u.id = p.owner_id
		where p.id = $1 and p.deleted_at is null`,
		id,
	).Scan(&p.ID, &p.Key, &p.Name, &p.Description, &p.Status, &p.OwnerID, &p.OwnerName,
		&p.CreatedAt, &p.UpdatedAt, &p.DeletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) CreateProject(ctx context.Context, in domain.CreateProjectInput, ownerID string) (*domain.Project, error) {
	in.Name = strings.TrimSpace(in.Name)
	if len(in.Name) < 2 {
		return nil, fmt.Errorf("name must be at least 2 chars")
	}
	key := strings.TrimSpace(in.Key)
	if key == "" {
		key = shortKey(in.Name)
	}
	// uniqueness: simple loop with suffix
	tryKey := key
	for n := 2; n < 50; n++ {
		var exists bool
		if err := s.Pool.QueryRow(ctx, `select exists(select 1 from projects where key = $1)`, tryKey).Scan(&exists); err != nil {
			return nil, err
		}
		if !exists {
			break
		}
		tryKey = fmt.Sprintf("%s%d", key, n)
	}
	var desc *string
	if d := strings.TrimSpace(in.Description); d != "" {
		desc = &d
	}
	var p domain.Project
	err := s.Pool.QueryRow(ctx, `
		insert into projects(key,name,description,owner_id) values($1,$2,$3,$4)
		returning id::text, key, name, description, status, owner_id::text,
		         (select name from users where id = $4),
		         created_at, updated_at, deleted_at`,
		tryKey, in.Name, desc, ownerID,
	).Scan(&p.ID, &p.Key, &p.Name, &p.Description, &p.Status, &p.OwnerID, &p.OwnerName,
		&p.CreatedAt, &p.UpdatedAt, &p.DeletedAt)
	if err != nil {
		return nil, err
	}
	_, _ = s.Pool.Exec(ctx, `insert into project_members(project_id,user_id,role) values($1,$2,'admin')
		on conflict do nothing`, p.ID, ownerID)
	return &p, nil
}

func (s *Store) RenameProject(ctx context.Context, id, name string) error {
	name = strings.TrimSpace(name)
	if len(name) < 2 {
		return fmt.Errorf("name too short")
	}
	_, err := s.Pool.Exec(ctx, `update projects set name = $1, updated_at = now() where id = $2`, name, id)
	return err
}

func (s *Store) SetProjectStatus(ctx context.Context, id, status string) error {
	if status != "active" && status != "archived" {
		return fmt.Errorf("invalid status")
	}
	_, err := s.Pool.Exec(ctx, `update projects set status = $1, updated_at = now() where id = $2`, status, id)
	return err
}

// ─── areas ───────────────────────────────────────────────────────────────────

// AreaWithFeatures is the hierarchy-tree row shape returned by /hierarchy.
type AreaWithFeatures struct {
	domain.Area
	Features []domain.Feature `json:"features"`
}

func (s *Store) ListAreasWithFeatures(ctx context.Context, projectID string) ([]AreaWithFeatures, error) {
	rows, err := s.Pool.Query(ctx, `
		select id::text, project_id::text, key, name, description, display_order, archived, created_at, updated_at
		from areas where project_id = $1 order by display_order, name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AreaWithFeatures{}
	areaIDs := []string{}
	for rows.Next() {
		var a domain.Area
		if err := rows.Scan(&a.ID, &a.ProjectID, &a.Key, &a.Name, &a.Description, &a.DisplayOrder,
			&a.Archived, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, AreaWithFeatures{Area: a, Features: []domain.Feature{}})
		areaIDs = append(areaIDs, a.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(areaIDs) == 0 {
		return out, nil
	}
	frows, err := s.Pool.Query(ctx, `
		select id::text, area_id::text, name, description, display_order, archived, created_at, updated_at
		from features where area_id = any($1) order by display_order, name`, areaIDs)
	if err != nil {
		return nil, err
	}
	defer frows.Close()
	for frows.Next() {
		var f domain.Feature
		if err := frows.Scan(&f.ID, &f.AreaID, &f.Name, &f.Description, &f.DisplayOrder,
			&f.Archived, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		for i := range out {
			if out[i].ID == f.AreaID {
				out[i].Features = append(out[i].Features, f)
				break
			}
		}
	}
	return out, frows.Err()
}

func (s *Store) ListAreas(ctx context.Context, projectID string) ([]domain.Area, error) {
	rows, err := s.Pool.Query(ctx, `
		select id::text, project_id::text, key, name, description, display_order, archived, created_at, updated_at
		from areas where project_id = $1 order by display_order, name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Area{}
	for rows.Next() {
		var a domain.Area
		if err := rows.Scan(&a.ID, &a.ProjectID, &a.Key, &a.Name, &a.Description, &a.DisplayOrder,
			&a.Archived, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) ListFeatures(ctx context.Context, projectID string) ([]domain.Feature, error) {
	rows, err := s.Pool.Query(ctx, `
		select f.id::text, f.area_id::text, f.name, f.description, f.display_order, f.archived,
		       f.created_at, f.updated_at
		from features f join areas a on a.id = f.area_id
		where a.project_id = $1
		order by a.display_order, f.display_order, f.name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Feature{}
	for rows.Next() {
		var f domain.Feature
		if err := rows.Scan(&f.ID, &f.AreaID, &f.Name, &f.Description, &f.DisplayOrder,
			&f.Archived, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) CreateArea(ctx context.Context, in domain.CreateAreaInput) (*domain.Area, error) {
	in.Name = strings.TrimSpace(in.Name)
	if len(in.Name) < 2 {
		return nil, fmt.Errorf("name too short")
	}
	desired := strings.ToUpper(strings.TrimSpace(in.Key))
	if desired == "" {
		desired = shortKey(in.Name)
	}
	tryKey := desired
	for n := 2; n < 50; n++ {
		var exists bool
		if err := s.Pool.QueryRow(ctx, `select exists(select 1 from areas where project_id = $1 and key = $2)`, in.ProjectID, tryKey).Scan(&exists); err != nil {
			return nil, err
		}
		if !exists {
			break
		}
		tryKey = fmt.Sprintf("%s%d", desired, n)
	}
	var maxOrd int
	_ = s.Pool.QueryRow(ctx, `select coalesce(max(display_order), -1) from areas where project_id = $1`, in.ProjectID).Scan(&maxOrd)
	var desc *string
	if d := strings.TrimSpace(in.Description); d != "" {
		desc = &d
	}
	var a domain.Area
	err := s.Pool.QueryRow(ctx, `
		insert into areas(project_id,key,name,description,display_order)
		values($1,$2,$3,$4,$5)
		returning id::text, project_id::text, key, name, description, display_order, archived, created_at, updated_at`,
		in.ProjectID, tryKey, in.Name, desc, maxOrd+1,
	).Scan(&a.ID, &a.ProjectID, &a.Key, &a.Name, &a.Description, &a.DisplayOrder,
		&a.Archived, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *Store) SetAreaArchived(ctx context.Context, id string, archived bool) error {
	_, err := s.Pool.Exec(ctx, `update areas set archived = $1, updated_at = now() where id = $2`, archived, id)
	return err
}

func (s *Store) ReorderArea(ctx context.Context, id, direction string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var projID string
	var ord int
	if err := tx.QueryRow(ctx, `select project_id::text, display_order from areas where id = $1`, id).Scan(&projID, &ord); err != nil {
		return err
	}
	op, dir := "<", "desc"
	if direction == "down" {
		op, dir = ">", "asc"
	}
	var nbrID string
	var nbrOrd int
	err = tx.QueryRow(ctx,
		fmt.Sprintf(`select id::text, display_order from areas where project_id = $1 and display_order %s $2 order by display_order %s limit 1`, op, dir),
		projID, ord).Scan(&nbrID, &nbrOrd)
	if errors.Is(err, pgx.ErrNoRows) {
		return tx.Rollback(ctx) // no-op
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `update areas set display_order = $1 where id = $2`, nbrOrd, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `update areas set display_order = $1 where id = $2`, ord, nbrID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ─── features ────────────────────────────────────────────────────────────────

func (s *Store) CreateFeature(ctx context.Context, in domain.CreateFeatureInput) (*domain.Feature, error) {
	in.Name = strings.TrimSpace(in.Name)
	if len(in.Name) < 2 {
		return nil, fmt.Errorf("name too short")
	}
	var maxOrd int
	_ = s.Pool.QueryRow(ctx, `select coalesce(max(display_order), -1) from features where area_id = $1`, in.AreaID).Scan(&maxOrd)
	var desc *string
	if d := strings.TrimSpace(in.Description); d != "" {
		desc = &d
	}
	var f domain.Feature
	err := s.Pool.QueryRow(ctx, `
		insert into features(area_id,name,description,display_order) values($1,$2,$3,$4)
		returning id::text, area_id::text, name, description, display_order, archived, created_at, updated_at`,
		in.AreaID, in.Name, desc, maxOrd+1,
	).Scan(&f.ID, &f.AreaID, &f.Name, &f.Description, &f.DisplayOrder, &f.Archived, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *Store) MoveFeature(ctx context.Context, featureID, targetAreaID string) error {
	var maxOrd int
	_ = s.Pool.QueryRow(ctx, `select coalesce(max(display_order), -1) from features where area_id = $1`, targetAreaID).Scan(&maxOrd)
	_, err := s.Pool.Exec(ctx, `update features set area_id = $1, display_order = $2, updated_at = now() where id = $3`,
		targetAreaID, maxOrd+1, featureID)
	return err
}

func (s *Store) SetFeatureArchived(ctx context.Context, id string, archived bool) error {
	_, err := s.Pool.Exec(ctx, `update features set archived = $1, updated_at = now() where id = $2`, archived, id)
	return err
}

// ─── test cases ──────────────────────────────────────────────────────────────

// CaseListFilter — used by /cases list.
type CaseListFilter struct {
	ProjectID          string
	IncludeDeleted     bool
	Type               string
	Priority           string
	Status             string
	AutomationStatus   string
	FeatureID          string
	AreaID             string
	FolderID           string
	IncludeDescendants bool // when true and FolderID is set, include cases in any descendant folder
	Tag                string
	Q                  string
	Limit              int
}

// TestCaseLite — a list-row payload (no steps/dataRows).
type TestCaseLite struct {
	domain.TestCase
	DataRowCount int `json:"dataRowCount"`
}

func (s *Store) ListTestCases(ctx context.Context, f CaseListFilter) ([]TestCaseLite, error) {
	args := []any{f.ProjectID}
	cond := []string{"tc.project_id = $1"}
	if f.IncludeDeleted {
		cond = append(cond, "tc.deleted_at is not null")
	} else {
		cond = append(cond, "tc.deleted_at is null")
	}
	addArg := func(a any) string {
		args = append(args, a)
		return fmt.Sprintf("$%d", len(args))
	}
	if f.Type != "" {
		cond = append(cond, "tc.type = "+addArg(f.Type))
	}
	if f.Priority != "" {
		cond = append(cond, "tc.priority = "+addArg(f.Priority))
	}
	if f.Status != "" {
		cond = append(cond, "tc.status = "+addArg(f.Status))
	}
	if f.AutomationStatus != "" {
		cond = append(cond, "tc.automation_status = "+addArg(f.AutomationStatus))
	}
	if f.FeatureID != "" {
		cond = append(cond, "tc.feature_id = "+addArg(f.FeatureID))
	}
	if f.AreaID != "" {
		cond = append(cond, "f.area_id = "+addArg(f.AreaID))
	}
	if f.FolderID != "" {
		if f.IncludeDescendants {
			cond = append(cond, "tc.folder_id in (with recursive sub(id) as ("+
				"select id from folders where id = "+addArg(f.FolderID)+
				" union all select fl.id from folders fl join sub on fl.parent_id = sub.id) select id from sub)")
		} else {
			cond = append(cond, "tc.folder_id = "+addArg(f.FolderID))
		}
	}
	if f.Tag != "" {
		cond = append(cond, "exists (select 1 from test_case_tags ct join tags t on t.id = ct.tag_id where ct.test_case_id = tc.id and t.name = "+addArg(f.Tag)+")")
	}
	if f.Q != "" {
		q := "%" + f.Q + "%"
		ph := addArg(q)
		cond = append(cond, "(tc.title ilike "+ph+" or tc.public_id ilike "+ph+" or tc.description ilike "+ph+
			" or exists(select 1 from test_steps s where s.test_case_id = tc.id and (s.action ilike "+ph+" or s.expected ilike "+ph+")))")
	}
	limit := f.Limit
	if limit <= 0 {
		limit = 200
	}
	q := `
		select tc.id::text, tc.project_id::text, p.key, p.name,
		       tc.feature_id::text, f.name, a.id::text, a.name, a.key,
		       tc.public_id, tc.sequence_num, tc.title, tc.description, tc.preconditions,
		       tc.final_expected, tc.test_data_notes, tc.type, tc.priority, tc.status,
		       tc.automation_status, tc.automation_framework, tc.automation_ref, tc.automation_repo_url,
		       tc.automation_last_reviewed_at, tc.jira_keys, tc.version, tc.created_at, tc.updated_at, tc.deleted_at,
		       cu.name, uu.name,
		       coalesce((select array_agg(t.name order by t.name) from test_case_tags ct join tags t on t.id = ct.tag_id where ct.test_case_id = tc.id), '{}') as tags,
		       (select count(*) from test_case_data_rows dr where dr.test_case_id = tc.id) as data_row_count
		from test_cases tc
		join features f on f.id = tc.feature_id
		join areas a on a.id = f.area_id
		join projects p on p.id = tc.project_id
		join users cu on cu.id = tc.created_by_id
		join users uu on uu.id = tc.updated_by_id
		where ` + strings.Join(cond, " and ") + `
		order by tc.sequence_num desc
		limit ` + fmt.Sprintf("%d", limit)
	rows, err := s.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TestCaseLite{}
	for rows.Next() {
		var t TestCaseLite
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.ProjectKey, &t.ProjectName,
			&t.FeatureID, &t.FeatureName, &t.AreaID, &t.AreaName, &t.AreaKey,
			&t.PublicID, &t.SequenceNum, &t.Title, &t.Description, &t.Preconditions,
			&t.FinalExpected, &t.TestDataNotes, &t.Type, &t.Priority, &t.Status,
			&t.AutomationStatus, &t.AutomationFramework, &t.AutomationRef, &t.AutomationRepoURL,
			&t.AutomationLastReviewedAt, &t.JiraKeys, &t.Version, &t.CreatedAt, &t.UpdatedAt, &t.DeletedAt,
			&t.CreatedByName, &t.UpdatedByName, &t.Tags, &t.DataRowCount); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// SearchCases — a global search across all projects.
func (s *Store) SearchCases(ctx context.Context, query string, limit int) ([]TestCaseLite, error) {
	if query == "" {
		return []TestCaseLite{}, nil
	}
	if limit <= 0 {
		limit = 50
	}
	q := "%" + query + "%"
	rows, err := s.Pool.Query(ctx, `
		select tc.id::text, tc.project_id::text, p.key, p.name,
		       tc.feature_id::text, f.name, a.id::text, a.name, a.key,
		       tc.public_id, tc.sequence_num, tc.title, tc.description, tc.preconditions,
		       tc.final_expected, tc.test_data_notes, tc.type, tc.priority, tc.status,
		       tc.automation_status, tc.automation_framework, tc.automation_ref, tc.automation_repo_url,
		       tc.automation_last_reviewed_at, tc.jira_keys, tc.version, tc.created_at, tc.updated_at, tc.deleted_at,
		       cu.name, uu.name,
		       coalesce((select array_agg(t.name order by t.name) from test_case_tags ct join tags t on t.id = ct.tag_id where ct.test_case_id = tc.id), '{}') as tags,
		       (select count(*) from test_case_data_rows dr where dr.test_case_id = tc.id) as data_row_count
		from test_cases tc
		join features f on f.id = tc.feature_id
		join areas a on a.id = f.area_id
		join projects p on p.id = tc.project_id
		join users cu on cu.id = tc.created_by_id
		join users uu on uu.id = tc.updated_by_id
		where tc.deleted_at is null
		  and (tc.title ilike $1 or tc.public_id ilike $1 or tc.description ilike $1
		       or exists (select 1 from test_steps s where s.test_case_id = tc.id and (s.action ilike $1 or s.expected ilike $1))
		       or exists (select 1 from test_case_tags ct join tags t on t.id = ct.tag_id where ct.test_case_id = tc.id and t.name ilike $1))
		order by tc.updated_at desc
		limit $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TestCaseLite{}
	for rows.Next() {
		var t TestCaseLite
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.ProjectKey, &t.ProjectName,
			&t.FeatureID, &t.FeatureName, &t.AreaID, &t.AreaName, &t.AreaKey,
			&t.PublicID, &t.SequenceNum, &t.Title, &t.Description, &t.Preconditions,
			&t.FinalExpected, &t.TestDataNotes, &t.Type, &t.Priority, &t.Status,
			&t.AutomationStatus, &t.AutomationFramework, &t.AutomationRef, &t.AutomationRepoURL,
			&t.AutomationLastReviewedAt, &t.JiraKeys, &t.Version, &t.CreatedAt, &t.UpdatedAt, &t.DeletedAt,
			&t.CreatedByName, &t.UpdatedByName, &t.Tags, &t.DataRowCount); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) GetTestCase(ctx context.Context, id string) (*domain.TestCase, error) {
	var t domain.TestCase
	err := s.Pool.QueryRow(ctx, `
		select tc.id::text, tc.project_id::text, p.key, p.name,
		       tc.feature_id::text, f.name, a.id::text, a.name, a.key,
		       tc.public_id, tc.sequence_num, tc.title, tc.description, tc.preconditions,
		       tc.final_expected, tc.test_data_notes, tc.type, tc.priority, tc.status,
		       tc.automation_status, tc.automation_framework, tc.automation_ref, tc.automation_repo_url,
		       tc.automation_last_reviewed_at, tc.jira_keys, tc.version, tc.created_at, tc.updated_at, tc.deleted_at,
		       cu.name, uu.name,
		       coalesce((select array_agg(t.name order by t.name) from test_case_tags ct join tags t on t.id = ct.tag_id where ct.test_case_id = tc.id), '{}') as tags
		from test_cases tc
		join features f on f.id = tc.feature_id
		join areas a on a.id = f.area_id
		join projects p on p.id = tc.project_id
		join users cu on cu.id = tc.created_by_id
		join users uu on uu.id = tc.updated_by_id
		where tc.id = $1`, id,
	).Scan(&t.ID, &t.ProjectID, &t.ProjectKey, &t.ProjectName,
		&t.FeatureID, &t.FeatureName, &t.AreaID, &t.AreaName, &t.AreaKey,
		&t.PublicID, &t.SequenceNum, &t.Title, &t.Description, &t.Preconditions,
		&t.FinalExpected, &t.TestDataNotes, &t.Type, &t.Priority, &t.Status,
		&t.AutomationStatus, &t.AutomationFramework, &t.AutomationRef, &t.AutomationRepoURL,
		&t.AutomationLastReviewedAt, &t.JiraKeys, &t.Version, &t.CreatedAt, &t.UpdatedAt, &t.DeletedAt,
		&t.CreatedByName, &t.UpdatedByName, &t.Tags)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	steps, err := s.loadSteps(ctx, id)
	if err != nil {
		return nil, err
	}
	t.Steps = steps
	params, rows, err := s.loadParamsRows(ctx, id)
	if err != nil {
		return nil, err
	}
	t.Parameters = params
	t.DataRows = rows
	return &t, nil
}

func (s *Store) loadSteps(ctx context.Context, caseID string) ([]domain.TestStep, error) {
	rows, err := s.Pool.Query(ctx, `select id::text, step_order, action, expected from test_steps where test_case_id = $1 order by step_order`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.TestStep{}
	for rows.Next() {
		var s domain.TestStep
		if err := rows.Scan(&s.ID, &s.Order, &s.Action, &s.Expected); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (s *Store) loadParamsRows(ctx context.Context, caseID string) ([]domain.TestCaseParam, []domain.TestCaseDataRow, error) {
	prows, err := s.Pool.Query(ctx, `select name, param_order from test_case_params where test_case_id = $1 order by param_order`, caseID)
	if err != nil {
		return nil, nil, err
	}
	params := []domain.TestCaseParam{}
	for prows.Next() {
		var p domain.TestCaseParam
		if err := prows.Scan(&p.Name, &p.Order); err != nil {
			prows.Close()
			return nil, nil, err
		}
		params = append(params, p)
	}
	prows.Close()
	drows, err := s.Pool.Query(ctx, `select row_order, label, values_json from test_case_data_rows where test_case_id = $1 order by row_order`, caseID)
	if err != nil {
		return nil, nil, err
	}
	dataRows := []domain.TestCaseDataRow{}
	for drows.Next() {
		var d domain.TestCaseDataRow
		var values map[string]string
		var raw []byte
		if err := drows.Scan(&d.Order, &d.Label, &raw); err != nil {
			drows.Close()
			return nil, nil, err
		}
		if err := json.Unmarshal(raw, &values); err != nil {
			drows.Close()
			return nil, nil, err
		}
		d.Values = values
		dataRows = append(dataRows, d)
	}
	drows.Close()
	return params, dataRows, nil
}

// CreateTestCase saves a new case + its steps/params/data rows + first version.
func (s *Store) CreateTestCase(ctx context.Context, in domain.TestCaseInput, userID string) (*domain.TestCase, error) {
	in.Title = strings.TrimSpace(in.Title)
	if len(in.Title) < 2 {
		return nil, fmt.Errorf("title too short")
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var projectKey, areaKey string
	if err := tx.QueryRow(ctx, `select p.key, a.key from projects p join features f on true and f.id = $2 join areas a on a.id = f.area_id where p.id = $1`,
		in.ProjectID, in.FeatureID).Scan(&projectKey, &areaKey); err != nil {
		return nil, fmt.Errorf("invalid project/feature: %w", err)
	}

	var nextSeq int
	if err := tx.QueryRow(ctx, `select coalesce(max(sequence_num), 0) + 1 from test_cases where project_id = $1`, in.ProjectID).Scan(&nextSeq); err != nil {
		return nil, err
	}
	publicID := fmt.Sprintf("%s-%s-%04d", projectKey, areaKey, nextSeq)
	caseID, err := insertTestCase(ctx, tx, in, publicID, nextSeq, userID)
	if err != nil {
		return nil, err
	}
	if err := writeStepsParamsRows(ctx, tx, caseID, in); err != nil {
		return nil, err
	}
	if err := writeTags(ctx, tx, caseID, in.Tags); err != nil {
		return nil, err
	}
	if err := writeVersion(ctx, tx, caseID, 1, in, userID); err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, tx, userID, "test_case.create", "TestCase", caseID, nil, map[string]any{"title": in.Title, "publicId": publicID}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetTestCase(ctx, caseID)
}

func (s *Store) UpdateTestCase(ctx context.Context, id string, in domain.TestCaseInput, userID string) (*domain.TestCase, error) {
	in.Title = strings.TrimSpace(in.Title)
	if len(in.Title) < 2 {
		return nil, fmt.Errorf("title too short")
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var version int
	if err := tx.QueryRow(ctx, `select version from test_cases where id = $1`, id).Scan(&version); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	newVersion := version + 1
	if _, err := tx.Exec(ctx, `delete from test_steps where test_case_id = $1`, id); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `delete from test_case_params where test_case_id = $1`, id); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `delete from test_case_data_rows where test_case_id = $1`, id); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `delete from test_case_tags where test_case_id = $1`, id); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `
		update test_cases set
			feature_id = $1, title = $2, description = nullif($3,''), preconditions = nullif($4,''),
			final_expected = nullif($5,''), test_data_notes = nullif($6,''), type = $7, priority = $8, status = $9,
			automation_status = $10, automation_framework = nullif($11,''), automation_ref = nullif($12,''),
			automation_repo_url = nullif($13,''), jira_keys = nullif($14,''), updated_by_id = $15,
			version = $16, updated_at = now()
		where id = $17`,
		in.FeatureID, in.Title, in.Description, in.Preconditions, in.FinalExpected, in.TestDataNotes,
		in.Type, in.Priority, in.Status, in.AutomationStatus, in.AutomationFramework, in.AutomationRef,
		in.AutomationRepoURL, in.JiraKeys, userID, newVersion, id); err != nil {
		return nil, err
	}
	if err := writeStepsParamsRows(ctx, tx, id, in); err != nil {
		return nil, err
	}
	if err := writeTags(ctx, tx, id, in.Tags); err != nil {
		return nil, err
	}
	if err := writeVersion(ctx, tx, id, newVersion, in, userID); err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, tx, userID, "test_case.update", "TestCase", id, nil, map[string]any{"title": in.Title}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetTestCase(ctx, id)
}

func (s *Store) SoftDeleteTestCase(ctx context.Context, id string, deleted bool) error {
	if deleted {
		_, err := s.Pool.Exec(ctx, `update test_cases set deleted_at = now(), updated_at = now() where id = $1`, id)
		return err
	}
	_, err := s.Pool.Exec(ctx, `update test_cases set deleted_at = null, updated_at = now() where id = $1`, id)
	return err
}

// DuplicateTestCase clones a case in the same project/feature.
func (s *Store) DuplicateTestCase(ctx context.Context, srcID, userID string) (*domain.TestCase, error) {
	src, err := s.GetTestCase(ctx, srcID)
	if err != nil {
		return nil, err
	}
	in := domain.TestCaseInput{
		ProjectID: src.ProjectID, FeatureID: src.FeatureID,
		Title:               src.Title + " (copy)",
		Description:         deref(src.Description),
		Preconditions:       deref(src.Preconditions),
		FinalExpected:       deref(src.FinalExpected),
		TestDataNotes:       deref(src.TestDataNotes),
		Type:                src.Type,
		Priority:            src.Priority,
		Status:              "draft",
		AutomationStatus:    src.AutomationStatus,
		AutomationFramework: deref(src.AutomationFramework),
		AutomationRef:       deref(src.AutomationRef),
		AutomationRepoURL:   deref(src.AutomationRepoURL),
		JiraKeys:            deref(src.JiraKeys),
		Tags:                src.Tags,
		Steps:               src.Steps,
		Parameters:          src.Parameters,
		DataRows:            src.DataRows,
	}
	return s.CreateTestCase(ctx, in, userID)
}

// BulkUpdateCases applies a single metadata change (priority, status,
// automation status, folder move, or soft delete/restore) to many cases in
// one transaction and writes one audit row.  These are lightweight metadata
// edits: unlike UpdateTestCase they do not bump the case version or write a
// test_case_versions snapshot, since no step/parameter content changes.
// Returns the number of rows affected.
func (s *Store) BulkUpdateCases(ctx context.Context, req domain.BulkCaseRequest, userID string) (int, error) {
	if len(req.CaseIDs) == 0 {
		return 0, fmt.Errorf("no cases selected")
	}
	if len(req.CaseIDs) > 1000 {
		return 0, fmt.Errorf("too many cases in one request (max 1000)")
	}

	// Tag add/remove touch the test_case_tags join table rather than a column
	// on test_cases, so they take their own path.
	if req.Op == "addTag" || req.Op == "removeTag" {
		return s.bulkTag(ctx, req, userID)
	}

	var setClause string
	var value any
	switch req.Op {
	case "priority":
		if !isOneOf(req.Value, "critical", "high", "medium", "low") {
			return 0, fmt.Errorf("invalid priority %q", req.Value)
		}
		setClause, value = "priority = $1", req.Value
	case "status":
		if !isOneOf(req.Value, "draft", "active", "deprecated") {
			return 0, fmt.Errorf("invalid status %q", req.Value)
		}
		setClause, value = "status = $1", req.Value
	case "automation":
		if !isOneOf(req.Value, "not_automated", "partial", "full") {
			return 0, fmt.Errorf("invalid automation status %q", req.Value)
		}
		setClause, value = "automation_status = $1", req.Value
	case "move":
		if strings.TrimSpace(req.Value) == "" {
			return 0, fmt.Errorf("move requires a target folder id")
		}
		setClause, value = "folder_id = $1", req.Value
	case "delete":
		setClause, value = "deleted_at = now()", nil
	case "restore":
		setClause, value = "deleted_at = null", nil
	default:
		return 0, fmt.Errorf("unknown bulk op %q", req.Op)
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	// $1 is the op value (when present); the case-id array and actor are the
	// trailing params so the WHERE clause is stable across ops.
	args := []any{}
	idsPos := 1
	if value != nil {
		args = append(args, value)
		idsPos = 2
	}
	args = append(args, req.CaseIDs, userID)
	sql := fmt.Sprintf(
		`update test_cases set %s, updated_at = now(), updated_by_id = $%d where id = any($%d::uuid[])`,
		setClause, idsPos+1, idsPos)
	tag, err := tx.Exec(ctx, sql, args...)
	if err != nil {
		return 0, err
	}
	affected := int(tag.RowsAffected())

	// entity_id is non-null; record the first selected case as representative
	// and keep the full op/count in the audit payload.
	if err := writeAudit(ctx, tx, userID, "test_case.bulk_update", "TestCase", req.CaseIDs[0],
		nil, map[string]any{"op": req.Op, "value": req.Value, "count": affected, "caseIds": req.CaseIDs}); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return affected, nil
}

// bulkTag adds or removes one tag across many cases in a single transaction.
func (s *Store) bulkTag(ctx context.Context, req domain.BulkCaseRequest, userID string) (int, error) {
	tag := strings.TrimSpace(req.Value)
	if tag == "" {
		return 0, fmt.Errorf("tag name required")
	}
	if len(tag) > 40 {
		return 0, fmt.Errorf("tag too long")
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var affected int
	if req.Op == "addTag" {
		var tagID string
		if err := tx.QueryRow(ctx, `
			insert into tags(name) values($1) on conflict(name) do update set name = excluded.name
			returning id::text`, tag).Scan(&tagID); err != nil {
			return 0, err
		}
		tagResult, err := tx.Exec(ctx, `
			insert into test_case_tags(test_case_id, tag_id)
			select id, $1 from test_cases where id = any($2::uuid[])
			on conflict do nothing`, tagID, req.CaseIDs)
		if err != nil {
			return 0, err
		}
		affected = int(tagResult.RowsAffected())
	} else { // removeTag
		tagResult, err := tx.Exec(ctx, `
			delete from test_case_tags
			where test_case_id = any($1::uuid[])
			  and tag_id = (select id from tags where name = $2)`, req.CaseIDs, tag)
		if err != nil {
			return 0, err
		}
		affected = int(tagResult.RowsAffected())
	}

	// Bump updated_at/updated_by on the touched cases so the change is visible.
	if _, err := tx.Exec(ctx, `update test_cases set updated_at = now(), updated_by_id = $1 where id = any($2::uuid[])`,
		userID, req.CaseIDs); err != nil {
		return 0, err
	}
	if err := writeAudit(ctx, tx, userID, "test_case.bulk_update", "TestCase", req.CaseIDs[0],
		nil, map[string]any{"op": req.Op, "value": tag, "count": affected, "caseIds": req.CaseIDs}); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return affected, nil
}

func isOneOf(v string, allowed ...string) bool {
	for _, a := range allowed {
		if v == a {
			return true
		}
	}
	return false
}

// helpers below

func insertTestCase(ctx context.Context, tx pgx.Tx, in domain.TestCaseInput, publicID string, seq int, userID string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `
		insert into test_cases(project_id,feature_id,folder_id,public_id,sequence_num,title,description,preconditions,
			final_expected,test_data_notes,type,priority,status,automation_status,automation_framework,
			automation_ref,automation_repo_url,jira_keys,created_by_id,updated_by_id)
		values($1,$2,$3,$4,$5,$6,nullif($7,''),nullif($8,''),nullif($9,''),nullif($10,''),
		       $11,$12,$13,$14,nullif($15,''),nullif($16,''),nullif($17,''),nullif($18,''),$19,$19)
		returning id::text`,
		in.ProjectID, in.FeatureID, in.FolderID, publicID, seq, in.Title, in.Description, in.Preconditions,
		in.FinalExpected, in.TestDataNotes, in.Type, in.Priority, in.Status, in.AutomationStatus,
		in.AutomationFramework, in.AutomationRef, in.AutomationRepoURL, in.JiraKeys, userID,
	).Scan(&id)
	return id, err
}

func writeStepsParamsRows(ctx context.Context, tx pgx.Tx, caseID string, in domain.TestCaseInput) error {
	for i, s := range in.Steps {
		if _, err := tx.Exec(ctx, `insert into test_steps(test_case_id,step_order,action,expected) values($1,$2,$3,$4)`,
			caseID, i, s.Action, s.Expected); err != nil {
			return err
		}
	}
	for i, p := range in.Parameters {
		if _, err := tx.Exec(ctx, `insert into test_case_params(test_case_id,name,param_order) values($1,$2,$3)`,
			caseID, p.Name, i); err != nil {
			return err
		}
	}
	for i, r := range in.DataRows {
		raw, err := json.Marshal(r.Values)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `insert into test_case_data_rows(test_case_id,row_order,label,values_json) values($1,$2,$3,$4)`,
			caseID, i, r.Label, raw); err != nil {
			return err
		}
	}
	return nil
}

func writeTags(ctx context.Context, tx pgx.Tx, caseID string, tags []string) error {
	for _, name := range tags {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		var tagID string
		if err := tx.QueryRow(ctx, `
			insert into tags(name) values($1) on conflict(name) do update set name = excluded.name
			returning id::text`, name).Scan(&tagID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `insert into test_case_tags(test_case_id,tag_id) values($1,$2) on conflict do nothing`,
			caseID, tagID); err != nil {
			return err
		}
	}
	return nil
}

func writeVersion(ctx context.Context, tx pgx.Tx, caseID string, version int, in domain.TestCaseInput, userID string) error {
	raw, err := json.Marshal(in)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `insert into test_case_versions(test_case_id,version,snapshot_json,changed_by_id) values($1,$2,$3,$4)`,
		caseID, version, raw, userID)
	return err
}

func writeAudit(ctx context.Context, tx pgx.Tx, actorID, action, entity, entityID string, before, after map[string]any) error {
	var beforeJSON, afterJSON []byte
	if before != nil {
		b, _ := json.Marshal(before)
		beforeJSON = b
	}
	if after != nil {
		b, _ := json.Marshal(after)
		afterJSON = b
	}
	_, err := tx.Exec(ctx, `insert into audit_logs(actor_id,action,entity,entity_id,before_json,after_json) values($1,$2,$3,$4,$5,$6)`,
		actorID, action, entity, entityID, beforeJSON, afterJSON)
	return err
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func shortKey(s string) string {
	cleaned := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ' ' {
			return r
		}
		return -1
	}, s)
	cleaned = strings.TrimSpace(cleaned)
	if cleaned == "" {
		return "X"
	}
	words := strings.Fields(cleaned)
	if len(words) == 1 {
		w := strings.ToUpper(words[0])
		if len(w) > 4 {
			return w[:4]
		}
		return w
	}
	var b strings.Builder
	for _, w := range words {
		if len(w) > 0 {
			b.WriteByte(w[0])
		}
	}
	out := strings.ToUpper(b.String())
	if len(out) > 4 {
		out = out[:4]
	}
	return out
}

// ─── folders (recursive tree) ────────────────────────────────────────────────

// CreateFolder inserts a folder.  When ParentID is nil the folder is at the
// project root.  Names are unique under the same parent.
func (s *Store) CreateFolder(ctx context.Context, in domain.CreateFolderInput) (*domain.Folder, error) {
	in.Name = strings.TrimSpace(in.Name)
	if len(in.Name) < 1 {
		return nil, fmt.Errorf("name required")
	}
	var maxOrd int
	if in.ParentID == nil {
		_ = s.Pool.QueryRow(ctx, `select coalesce(max(display_order), -1) from folders where project_id = $1 and parent_id is null`, in.ProjectID).Scan(&maxOrd)
	} else {
		_ = s.Pool.QueryRow(ctx, `select coalesce(max(display_order), -1) from folders where project_id = $1 and parent_id = $2`, in.ProjectID, *in.ParentID).Scan(&maxOrd)
	}
	var desc *string
	if d := strings.TrimSpace(in.Description); d != "" {
		desc = &d
	}
	var f domain.Folder
	err := s.Pool.QueryRow(ctx, `
		insert into folders(project_id, parent_id, name, description, display_order)
		values($1, $2, $3, $4, $5)
		returning id::text, project_id::text, parent_id::text, name, description, display_order, archived, created_at, updated_at`,
		in.ProjectID, in.ParentID, in.Name, desc, maxOrd+1,
	).Scan(&f.ID, &f.ProjectID, &f.ParentID, &f.Name, &f.Description, &f.DisplayOrder, &f.Archived, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// EnsureFolderPath creates the chain of folders needed to land at `segments`
// under `projectID`, returning the leaf folder id.  Idempotent: re-running
// against the same path is a no-op.  Used by the importer.
func (s *Store) EnsureFolderPath(ctx context.Context, projectID string, segments []string) (string, error) {
	var parentID *string
	for _, raw := range segments {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		// Look up an existing folder under this parent with this name.
		var id string
		var err error
		if parentID == nil {
			err = s.Pool.QueryRow(ctx,
				`select id::text from folders where project_id = $1 and parent_id is null and name = $2`,
				projectID, name).Scan(&id)
		} else {
			err = s.Pool.QueryRow(ctx,
				`select id::text from folders where project_id = $1 and parent_id = $2 and name = $3`,
				projectID, *parentID, name).Scan(&id)
		}
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				return "", err
			}
			f, err := s.CreateFolder(ctx, domain.CreateFolderInput{
				ProjectID: projectID, ParentID: parentID, Name: name,
			})
			if err != nil {
				return "", err
			}
			id = f.ID
		}
		copyID := id
		parentID = &copyID
	}
	if parentID == nil {
		return "", fmt.Errorf("no segments")
	}
	return *parentID, nil
}

// FolderTree returns the recursive tree for a project, with cumulative
// case counts (including descendants) at every node.  Top-level nodes are
// the slice's elements; each node's Children is recursively populated.
func (s *Store) FolderTree(ctx context.Context, projectID string, includeArchived bool) ([]*domain.FolderNode, error) {
	archivedCond := "and f.archived = false"
	if includeArchived {
		archivedCond = ""
	}
	rows, err := s.Pool.Query(ctx, `
		select id::text, project_id::text, parent_id::text, name, description,
		       display_order, archived, created_at, updated_at,
		       (select count(*) from test_cases tc
		           where tc.folder_id = f.id and tc.deleted_at is null) as own_count
		from folders f
		where f.project_id = $1 `+archivedCond+`
		order by f.display_order, f.name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	all := []*domain.FolderNode{}
	for rows.Next() {
		var n domain.FolderNode
		if err := rows.Scan(&n.ID, &n.ProjectID, &n.ParentID, &n.Name, &n.Description,
			&n.DisplayOrder, &n.Archived, &n.CreatedAt, &n.UpdatedAt, &n.OwnCount); err != nil {
			return nil, err
		}
		n.CaseCount = n.OwnCount
		n.Children = []*domain.FolderNode{}
		all = append(all, &n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byID := make(map[string]*domain.FolderNode, len(all))
	for _, n := range all {
		byID[n.ID] = n
	}
	roots := []*domain.FolderNode{}
	for _, n := range all {
		if n.ParentID == nil {
			roots = append(roots, n)
			continue
		}
		if p, ok := byID[*n.ParentID]; ok {
			p.Children = append(p.Children, n)
		} else {
			roots = append(roots, n) // orphan — surface at root
		}
	}

	// roll up cumulative counts: child counts add to ancestors.  Walk the
	// tree post-order so a node has its descendants' totals before its
	// ancestor reads it.
	var rollup func(n *domain.FolderNode) int
	rollup = func(n *domain.FolderNode) int {
		total := n.CaseCount
		for _, c := range n.Children {
			total += rollup(c)
		}
		n.CaseCount = total
		return total
	}
	for _, r := range roots {
		rollup(r)
	}
	return roots, nil
}

// RenameFolder updates a folder's name.  Returns ErrNotFound when the folder
// doesn't exist, and a friendly error when the new name collides with a
// sibling (the partial unique indexes enforce uniqueness under a parent).
func (s *Store) RenameFolder(ctx context.Context, id, name, userID string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("name required")
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	ct, err := tx.Exec(ctx, `update folders set name = $1, updated_at = now() where id = $2`, name, id)
	if err != nil {
		return friendlyFolderErr(err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := writeAudit(ctx, tx, userID, "folder.update", "Folder", id, nil, map[string]any{"name": name}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetFolderArchived flips the archived flag on a folder *and all of its
// descendants*.  Archiving cascades so the subtree hides/shows as a unit —
// the tree query filters archived folders out by default, and a half-hidden
// branch (archived parent, live children surfacing as orphans) would be
// confusing.
func (s *Store) SetFolderArchived(ctx context.Context, id string, archived bool, userID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	ct, err := tx.Exec(ctx, `
		with recursive sub(id) as (
			select id from folders where id = $1
			union all
			select f.id from folders f join sub on f.parent_id = sub.id
		)
		update folders set archived = $2, updated_at = now()
		where id in (select id from sub)`, id, archived)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	action := "folder.archive"
	if !archived {
		action = "folder.unarchive"
	}
	if err := writeAudit(ctx, tx, userID, action, "Folder", id, nil, map[string]any{"affected": ct.RowsAffected()}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// MoveFolder reparents a folder.  A nil targetParentID moves it to the project
// root.  The new parent must be in the same project and must not be the folder
// itself or any of its descendants (which would create a cycle).  The folder is
// placed at the end of its new sibling list.
func (s *Store) MoveFolder(ctx context.Context, id string, targetParentID *string, userID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var projID string
	if err := tx.QueryRow(ctx, `select project_id::text from folders where id = $1`, id).Scan(&projID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	if targetParentID != nil {
		if *targetParentID == id {
			return fmt.Errorf("cannot move a folder into itself")
		}
		var parentProj string
		if err := tx.QueryRow(ctx, `select project_id::text from folders where id = $1`, *targetParentID).Scan(&parentProj); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("target folder not found")
			}
			return err
		}
		if parentProj != projID {
			return fmt.Errorf("cannot move a folder across projects")
		}
		// Reject if the target is a descendant of the folder being moved.
		var cycle bool
		if err := tx.QueryRow(ctx, `
			with recursive sub(id) as (
				select id from folders where id = $1
				union all
				select f.id from folders f join sub on f.parent_id = sub.id
			)
			select exists(select 1 from sub where id = $2)`, id, *targetParentID).Scan(&cycle); err != nil {
			return err
		}
		if cycle {
			return fmt.Errorf("cannot move a folder into its own subtree")
		}
	}

	var maxOrd int
	if targetParentID == nil {
		_ = tx.QueryRow(ctx, `select coalesce(max(display_order), -1) from folders where project_id = $1 and parent_id is null`, projID).Scan(&maxOrd)
	} else {
		_ = tx.QueryRow(ctx, `select coalesce(max(display_order), -1) from folders where project_id = $1 and parent_id = $2`, projID, *targetParentID).Scan(&maxOrd)
	}

	if _, err := tx.Exec(ctx, `update folders set parent_id = $1, display_order = $2, updated_at = now() where id = $3`,
		targetParentID, maxOrd+1, id); err != nil {
		return friendlyFolderErr(err)
	}
	if err := writeAudit(ctx, tx, userID, "folder.move", "Folder", id, nil, map[string]any{"parentId": deref(targetParentID)}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ReorderFolder swaps a folder's display_order with the adjacent sibling in the
// given direction ("up" or "down").  Siblings share the same parent (which may
// be the root, i.e. parent_id is null).  A move past the end is a no-op.
func (s *Store) ReorderFolder(ctx context.Context, id, direction, userID string) error {
	if direction != "up" && direction != "down" {
		return fmt.Errorf("direction must be up or down")
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var projID string
	var parentID *string
	var ord int
	if err := tx.QueryRow(ctx, `select project_id::text, parent_id::text, display_order from folders where id = $1`, id).Scan(&projID, &parentID, &ord); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	op, dir := "<", "desc"
	if direction == "down" {
		op, dir = ">", "asc"
	}
	// `is not distinct from` so a NULL parent matches NULL parents.
	var nbrID string
	var nbrOrd int
	err = tx.QueryRow(ctx,
		fmt.Sprintf(`select id::text, display_order from folders
			where project_id = $1 and parent_id is not distinct from $2 and display_order %s $3
			order by display_order %s limit 1`, op, dir),
		projID, parentID, ord).Scan(&nbrID, &nbrOrd)
	if errors.Is(err, pgx.ErrNoRows) {
		return tx.Rollback(ctx) // already at the edge — no-op
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `update folders set display_order = $1 where id = $2`, nbrOrd, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `update folders set display_order = $1 where id = $2`, ord, nbrID); err != nil {
		return err
	}
	if err := writeAudit(ctx, tx, userID, "folder.reorder", "Folder", id, nil, map[string]any{"direction": direction}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// friendlyFolderErr turns the partial-unique-index violation on folder names
// into a message the UI can show verbatim.
func friendlyFolderErr(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return fmt.Errorf("a folder with that name already exists here")
	}
	return err
}

// ─── runs ────────────────────────────────────────────────────────────────────

// RunListFilter narrows the runs list.  An empty field means "no filter on
// this dimension".
type RunListFilter struct {
	ProjectID  string
	OnlyActive bool
	Status     string // exact status match (draft/in_progress/blocked/completed/aborted)
	Query      string // case-insensitive match across name/build/milestone/environment
}

// ListRuns lists runs for a project (or all projects when projectID is "").
// Retained for callers that only need the active toggle.
func (s *Store) ListRuns(ctx context.Context, projectID string, onlyActive bool) ([]domain.TestRun, error) {
	return s.ListRunsFiltered(ctx, RunListFilter{ProjectID: projectID, OnlyActive: onlyActive})
}

// ListRunsFiltered lists runs with optional status / text filters applied.
func (s *Store) ListRunsFiltered(ctx context.Context, f RunListFilter) ([]domain.TestRun, error) {
	args := []any{}
	cond := []string{}
	add := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	if f.ProjectID != "" {
		cond = append(cond, "r.project_id = "+add(f.ProjectID))
	}
	if f.OnlyActive {
		cond = append(cond, "r.status in ('draft','in_progress','blocked')")
	}
	if f.Status != "" {
		cond = append(cond, "r.status = "+add(f.Status))
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		p := add("%" + q + "%")
		cond = append(cond, "(r.name ilike "+p+" or coalesce(r.build,'') ilike "+p+
			" or coalesce(r.milestone,'') ilike "+p+" or coalesce(r.environment,'') ilike "+p+")")
	}
	where := ""
	if len(cond) > 0 {
		where = "where " + strings.Join(cond, " and ")
	}
	q := `select r.id::text, r.project_id::text, p.name, r.parent_run_id::text, pr.name,
	       r.name, r.description, r.environment, r.build, r.milestone, r.status, r.abort_reason,
	       r.owner_id::text, u.name, r.planned_start, r.planned_end, r.actual_start, r.actual_end,
	       r.notes, r.created_at, r.updated_at,
	       coalesce((select count(*) from test_executions e where e.run_id = r.id), 0)::int as total,
	       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'pass'), 0)::int as pass,
	       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'fail'), 0)::int as fail,
	       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'blocked'), 0)::int as blocked,
	       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'skipped'), 0)::int as skipped,
	       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'not_run'), 0)::int as not_run
	   from test_runs r
	   join projects p on p.id = r.project_id
	   join users u on u.id = r.owner_id
	   left join test_runs pr on pr.id = r.parent_run_id ` + where + `
	   order by r.created_at desc`
	rows, err := s.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.TestRun{}
	for rows.Next() {
		var r domain.TestRun
		if err := rows.Scan(&r.ID, &r.ProjectID, &r.ProjectName, &r.ParentRunID, &r.ParentRunName,
			&r.Name, &r.Description, &r.Environment, &r.Build, &r.Milestone, &r.Status, &r.AbortReason,
			&r.OwnerID, &r.OwnerName, &r.PlannedStart, &r.PlannedEnd, &r.ActualStart, &r.ActualEnd,
			&r.Notes, &r.CreatedAt, &r.UpdatedAt,
			&r.Counts.Total, &r.Counts.Pass, &r.Counts.Fail, &r.Counts.Blocked, &r.Counts.Skipped, &r.Counts.NotRun); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) GetRun(ctx context.Context, id string) (*domain.TestRun, error) {
	runs, err := s.runsByIDs(ctx, []string{id})
	if err != nil {
		return nil, err
	}
	if len(runs) == 0 {
		return nil, ErrNotFound
	}
	return &runs[0], nil
}

func (s *Store) runsByIDs(ctx context.Context, ids []string) ([]domain.TestRun, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := s.Pool.Query(ctx, `
		select r.id::text, r.project_id::text, p.name, r.parent_run_id::text, pr.name,
		       r.name, r.description, r.environment, r.build, r.milestone, r.status, r.abort_reason,
		       r.owner_id::text, u.name, r.planned_start, r.planned_end, r.actual_start, r.actual_end,
		       r.notes, r.created_at, r.updated_at,
		       coalesce((select count(*) from test_executions e where e.run_id = r.id), 0)::int,
		       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'pass'), 0)::int,
		       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'fail'), 0)::int,
		       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'blocked'), 0)::int,
		       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'skipped'), 0)::int,
		       coalesce((select count(*) from test_executions e where e.run_id = r.id and e.result = 'not_run'), 0)::int
		from test_runs r
		join projects p on p.id = r.project_id
		join users u on u.id = r.owner_id
		left join test_runs pr on pr.id = r.parent_run_id
		where r.id = any($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.TestRun{}
	for rows.Next() {
		var r domain.TestRun
		if err := rows.Scan(&r.ID, &r.ProjectID, &r.ProjectName, &r.ParentRunID, &r.ParentRunName,
			&r.Name, &r.Description, &r.Environment, &r.Build, &r.Milestone, &r.Status, &r.AbortReason,
			&r.OwnerID, &r.OwnerName, &r.PlannedStart, &r.PlannedEnd, &r.ActualStart, &r.ActualEnd,
			&r.Notes, &r.CreatedAt, &r.UpdatedAt,
			&r.Counts.Total, &r.Counts.Pass, &r.Counts.Fail, &r.Counts.Blocked, &r.Counts.Skipped, &r.Counts.NotRun); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// CreateRun snapshots the selected cases and creates one execution per data row.
func (s *Store) CreateRun(ctx context.Context, in domain.CreateRunInput, ownerID string) (*domain.TestRun, error) {
	if len(in.CaseIDs) == 0 {
		return nil, fmt.Errorf("no test cases selected")
	}
	in.Name = strings.TrimSpace(in.Name)
	if len(in.Name) < 2 {
		return nil, fmt.Errorf("name too short")
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var runID string
	plannedStart := parseDate(in.PlannedStart)
	plannedEnd := parseDate(in.PlannedEnd)
	err = tx.QueryRow(ctx, `
		insert into test_runs(project_id,name,description,environment,build,milestone,owner_id,planned_start,planned_end,status)
		values($1,$2,nullif($3,''),nullif($4,''),nullif($5,''),nullif($6,''),$7,$8,$9,'draft')
		returning id::text`,
		in.ProjectID, in.Name, in.Description, in.Environment, in.Build, in.Milestone, ownerID, plannedStart, plannedEnd,
	).Scan(&runID)
	if err != nil {
		return nil, err
	}
	for _, caseID := range in.CaseIDs {
		if err := snapshotAndQueue(ctx, tx, runID, caseID); err != nil {
			return nil, err
		}
	}
	if err := writeAudit(ctx, tx, ownerID, "run.create", "TestRun", runID, nil, map[string]any{"name": in.Name, "caseCount": len(in.CaseIDs)}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetRun(ctx, runID)
}

func snapshotAndQueue(ctx context.Context, tx pgx.Tx, runID, caseID string) error {
	var c struct {
		PublicID, Title                                              string
		Description, Preconditions, FinalExpected                    *string
		Type, Priority                                               string
		Version                                                      int
	}
	if err := tx.QueryRow(ctx, `select public_id,title,description,preconditions,final_expected,type,priority,version from test_cases where id = $1`, caseID).
		Scan(&c.PublicID, &c.Title, &c.Description, &c.Preconditions, &c.FinalExpected, &c.Type, &c.Priority, &c.Version); err != nil {
		return err
	}
	steps, err := queryStepsTx(ctx, tx, caseID)
	if err != nil {
		return err
	}
	params, err := queryParamsTx(ctx, tx, caseID)
	if err != nil {
		return err
	}
	dataRows, err := queryDataRowsTx(ctx, tx, caseID)
	if err != nil {
		return err
	}
	snapshot := map[string]any{"steps": steps, "parameters": params, "dataRows": dataRows}
	raw, _ := json.Marshal(snapshot)
	var snapID string
	if err := tx.QueryRow(ctx, `
		insert into run_snapshot_cases(run_id,test_case_id,public_id,title,description,preconditions,
			final_expected,type,priority,snapshot_json,version)
		values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		returning id::text`,
		runID, caseID, c.PublicID, c.Title, c.Description, c.Preconditions, c.FinalExpected, c.Type, c.Priority, raw, c.Version,
	).Scan(&snapID); err != nil {
		return err
	}
	if len(dataRows) == 0 {
		_, err = tx.Exec(ctx, `insert into test_executions(run_id,snapshot_case_id,result) values($1,$2,'not_run')`, runID, snapID)
		return err
	}
	for _, r := range dataRows {
		order := asInt(r["order"])
		label := r["label"]
		if label == nil {
			label = fmt.Sprintf("Row %d", order+1)
		}
		_, err := tx.Exec(ctx, `insert into test_executions(run_id,snapshot_case_id,data_row_index,data_row_label,result) values($1,$2,$3,$4,'not_run')`,
			runID, snapID, order, label)
		if err != nil {
			return err
		}
	}
	return nil
}

func queryStepsTx(ctx context.Context, tx pgx.Tx, caseID string) ([]map[string]any, error) {
	rows, err := tx.Query(ctx, `select step_order, action, expected from test_steps where test_case_id = $1 order by step_order`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var ord int
		var act, exp string
		if err := rows.Scan(&ord, &act, &exp); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"order": ord, "action": act, "expected": exp})
	}
	return out, rows.Err()
}
func queryParamsTx(ctx context.Context, tx pgx.Tx, caseID string) ([]map[string]any, error) {
	rows, err := tx.Query(ctx, `select name, param_order from test_case_params where test_case_id = $1 order by param_order`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var name string
		var ord int
		if err := rows.Scan(&name, &ord); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"name": name, "order": ord})
	}
	return out, rows.Err()
}
func queryDataRowsTx(ctx context.Context, tx pgx.Tx, caseID string) ([]map[string]any, error) {
	rows, err := tx.Query(ctx, `select row_order, label, values_json from test_case_data_rows where test_case_id = $1 order by row_order`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var ord int
		var label *string
		var raw []byte
		if err := rows.Scan(&ord, &label, &raw); err != nil {
			return nil, err
		}
		var values map[string]string
		_ = json.Unmarshal(raw, &values)
		out = append(out, map[string]any{"order": ord, "label": label, "values": values})
	}
	return out, rows.Err()
}

// asInt accepts either int (from in-process snapshots) or float64 (from
// JSON-decoded payloads) and returns int.  Belt and braces — the same map is
// produced by tx queries (int) and json.Unmarshal (float64), and the caller
// can't always tell them apart.
func asInt(v any) int {
	switch x := v.(type) {
	case int:
		return x
	case int32:
		return int(x)
	case int64:
		return int(x)
	case float64:
		return int(x)
	case float32:
		return int(x)
	}
	return 0
}

func parseDate(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil
	}
	return &t
}

func (s *Store) SetRunStatus(ctx context.Context, id, status, abortReason string) error {
	now := time.Now()
	switch status {
	case "in_progress":
		_, err := s.Pool.Exec(ctx, `update test_runs set status = $1, actual_start = coalesce(actual_start, $2), updated_at = now() where id = $3`, status, now, id)
		return err
	case "completed":
		_, err := s.Pool.Exec(ctx, `update test_runs set status = $1, actual_end = $2, updated_at = now() where id = $3`, status, now, id)
		return err
	case "aborted":
		reason := abortReason
		if reason == "" {
			reason = "Aborted"
		}
		_, err := s.Pool.Exec(ctx, `update test_runs set status = $1, abort_reason = $2, actual_end = $3, updated_at = now() where id = $4`, status, reason, now, id)
		return err
	default:
		_, err := s.Pool.Exec(ctx, `update test_runs set status = $1, updated_at = now() where id = $2`, status, id)
		return err
	}
}

// CloneRun + ReRunFailed share a lot of logic.
func (s *Store) CloneRun(ctx context.Context, srcID, ownerID string) (*domain.TestRun, error) {
	return s.copyRun(ctx, srcID, ownerID, false)
}
func (s *Store) ReRunFailed(ctx context.Context, srcID, ownerID string) (*domain.TestRun, error) {
	return s.copyRun(ctx, srcID, ownerID, true)
}

func (s *Store) copyRun(ctx context.Context, srcID, ownerID string, onlyFailed bool) (*domain.TestRun, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var src struct {
		ProjectID, Name, Env, Build, Milestone, Description string
	}
	if err := tx.QueryRow(ctx, `select project_id::text, name, coalesce(environment,''), coalesce(build,''), coalesce(milestone,''), coalesce(description,'') from test_runs where id = $1`, srcID).
		Scan(&src.ProjectID, &src.Name, &src.Env, &src.Build, &src.Milestone, &src.Description); err != nil {
		return nil, err
	}
	suffix := " (clone)"
	parent := (*string)(nil)
	if onlyFailed {
		suffix = " — re-run failed"
		parent = &srcID
	}
	var newRunID string
	if err := tx.QueryRow(ctx, `
		insert into test_runs(project_id,parent_run_id,name,description,environment,build,milestone,owner_id,status)
		values($1,$2,$3,nullif($4,''),nullif($5,''),nullif($6,''),nullif($7,''),$8,'draft')
		returning id::text`,
		src.ProjectID, parent, src.Name+suffix, src.Description, src.Env, src.Build, src.Milestone, ownerID,
	).Scan(&newRunID); err != nil {
		return nil, err
	}

	// pull source executions (filtered if onlyFailed)
	cond := ""
	if onlyFailed {
		cond = " and e.result in ('fail','blocked')"
	}
	rows, err := tx.Query(ctx, `
		select sc.id::text, sc.test_case_id::text, sc.public_id, sc.title, sc.description, sc.preconditions,
		       sc.final_expected, sc.type, sc.priority, sc.snapshot_json, sc.version,
		       e.data_row_index, e.data_row_label
		from run_snapshot_cases sc
		join test_executions e on e.snapshot_case_id = sc.id
		where sc.run_id = $1 `+cond, srcID)
	if err != nil {
		return nil, err
	}
	type rowRec struct {
		snapID, caseID, publicID, title, typ, prio string
		desc, prec, fexp                           *string
		snap                                       []byte
		version                                    int
		dataRowIndex                               *int
		dataRowLabel                               *string
	}
	var srcRows []rowRec
	for rows.Next() {
		var r rowRec
		if err := rows.Scan(&r.snapID, &r.caseID, &r.publicID, &r.title, &r.desc, &r.prec, &r.fexp, &r.typ, &r.prio,
			&r.snap, &r.version, &r.dataRowIndex, &r.dataRowLabel); err != nil {
			rows.Close()
			return nil, err
		}
		srcRows = append(srcRows, r)
	}
	rows.Close()

	// group by snapshot id; create a new snapshot row per group.
	type group struct {
		row      rowRec
		dataRows []rowRec
	}
	groups := map[string]*group{}
	order := []string{}
	for _, r := range srcRows {
		g, ok := groups[r.snapID]
		if !ok {
			g = &group{row: r}
			groups[r.snapID] = g
			order = append(order, r.snapID)
		}
		g.dataRows = append(g.dataRows, r)
	}
	for _, k := range order {
		g := groups[k]
		var newSnapID string
		if err := tx.QueryRow(ctx, `
			insert into run_snapshot_cases(run_id,test_case_id,public_id,title,description,preconditions,final_expected,type,priority,snapshot_json,version)
			values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			returning id::text`,
			newRunID, g.row.caseID, g.row.publicID, g.row.title, g.row.desc, g.row.prec, g.row.fexp, g.row.typ, g.row.prio, g.row.snap, g.row.version,
		).Scan(&newSnapID); err != nil {
			return nil, err
		}
		// In clone mode, the source has every execution row already, so use those as the seed.
		// In re-run mode, only failed/blocked rows came back — same seed approach.
		seen := map[string]bool{}
		for _, dr := range g.dataRows {
			key := "no"
			if dr.dataRowIndex != nil {
				key = fmt.Sprintf("%d", *dr.dataRowIndex)
			}
			if seen[key] {
				continue
			}
			seen[key] = true
			if dr.dataRowIndex == nil {
				if _, err := tx.Exec(ctx, `insert into test_executions(run_id,snapshot_case_id,result) values($1,$2,'not_run')`, newRunID, newSnapID); err != nil {
					return nil, err
				}
			} else {
				if _, err := tx.Exec(ctx, `insert into test_executions(run_id,snapshot_case_id,data_row_index,data_row_label,result) values($1,$2,$3,$4,'not_run')`,
					newRunID, newSnapID, *dr.dataRowIndex, dr.dataRowLabel); err != nil {
					return nil, err
				}
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetRun(ctx, newRunID)
}

// ─── executions ──────────────────────────────────────────────────────────────

// ListExecutions for a run with snapshot details + attempts.
func (s *Store) ListExecutions(ctx context.Context, runID string) ([]domain.Execution, error) {
	rows, err := s.Pool.Query(ctx, `
		select e.id::text, e.run_id::text, e.snapshot_case_id::text, e.data_row_index, e.data_row_label,
		       e.result, e.executed_by_id::text, u.name, e.executed_at, e.duration_seconds,
		       e.env_override, e.build_override, e.comments, e.jira_defect_keys, e.step_results_json, e.updated_at,
		       sc.public_id, sc.test_case_id::text, sc.title, sc.description, sc.preconditions,
		       sc.final_expected, sc.type, sc.priority, sc.snapshot_json, sc.version
		from test_executions e
		join run_snapshot_cases sc on sc.id = e.snapshot_case_id
		left join users u on u.id = e.executed_by_id
		where e.run_id = $1
		order by sc.public_id, e.data_row_index nulls first`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Execution{}
	for rows.Next() {
		var e domain.Execution
		var raw []byte
		var stepRaw []byte
		if err := rows.Scan(&e.ID, &e.RunID, &e.SnapshotCaseID, &e.DataRowIndex, &e.DataRowLabel,
			&e.Result, &e.ExecutedByID, &e.ExecutedByName, &e.ExecutedAt, &e.DurationSeconds,
			&e.EnvOverride, &e.BuildOverride, &e.Comments, &e.JiraDefectKeys, &stepRaw, &e.UpdatedAt,
			&e.SnapshotCase.PublicID, &e.SnapshotCase.TestCaseID, &e.SnapshotCase.Title, &e.SnapshotCase.Description,
			&e.SnapshotCase.Preconditions, &e.SnapshotCase.FinalExpected, &e.SnapshotCase.Type,
			&e.SnapshotCase.Priority, &raw, &e.SnapshotCase.Version); err != nil {
			return nil, err
		}
		e.SnapshotCase.ID = e.SnapshotCaseID
		e.StepResults = []domain.StepResult{}
		if len(stepRaw) > 0 {
			_ = json.Unmarshal(stepRaw, &e.StepResults)
		}
		var snap struct {
			Steps []struct {
				Order    int    `json:"order"`
				Action   string `json:"action"`
				Expected string `json:"expected"`
			} `json:"steps"`
			Parameters []domain.TestCaseParam   `json:"parameters"`
			DataRows   []domain.TestCaseDataRow `json:"dataRows"`
		}
		_ = json.Unmarshal(raw, &snap)
		for _, st := range snap.Steps {
			e.SnapshotCase.Steps = append(e.SnapshotCase.Steps, domain.TestStep{Order: st.Order, Action: st.Action, Expected: st.Expected})
		}
		e.SnapshotCase.Parameters = snap.Parameters
		e.SnapshotCase.DataRows = snap.DataRows
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}
	ids := make([]string, len(out))
	idx := map[string]int{}
	for i, e := range out {
		ids[i] = e.ID
		idx[e.ID] = i
		out[i].Attempts = []domain.ExecutionAttempt{}
	}
	arows, err := s.Pool.Query(ctx, `
		select ea.execution_id::text, ea.attempt_num, ea.result, u.name, ea.executed_at, ea.comments, ea.duration_seconds
		from execution_attempts ea
		left join users u on u.id = ea.executed_by_id
		where ea.execution_id = any($1)
		order by ea.attempt_num`, ids)
	if err != nil {
		return nil, err
	}
	defer arows.Close()
	for arows.Next() {
		var execID string
		var a domain.ExecutionAttempt
		if err := arows.Scan(&execID, &a.AttemptNum, &a.Result, &a.ExecutedByName, &a.ExecutedAt, &a.Comments, &a.DurationSeconds); err != nil {
			return nil, err
		}
		i := idx[execID]
		out[i].Attempts = append(out[i].Attempts, a)
	}
	return out, nil
}

func (s *Store) RecordExecution(ctx context.Context, id string, in domain.RecordExecutionInput, userID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var prev struct {
		Result          string
		ExecutedByID    *string
		ExecutedAt      *time.Time
		Comments        *string
		DurationSeconds *int
		RunID           string
	}
	if err := tx.QueryRow(ctx, `select e.result, e.executed_by_id::text, e.executed_at, e.comments, e.duration_seconds, e.run_id::text from test_executions e where e.id = $1`, id).
		Scan(&prev.Result, &prev.ExecutedByID, &prev.ExecutedAt, &prev.Comments, &prev.DurationSeconds, &prev.RunID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	// If there was a prior result, push it into history.
	if prev.Result != "not_run" {
		var attemptCount int
		_ = tx.QueryRow(ctx, `select count(*) from execution_attempts where execution_id = $1`, id).Scan(&attemptCount)
		var execAt = time.Now()
		if prev.ExecutedAt != nil {
			execAt = *prev.ExecutedAt
		}
		if _, err := tx.Exec(ctx, `
			insert into execution_attempts(execution_id,attempt_num,result,executed_by_id,executed_at,comments,duration_seconds)
			values($1,$2,$3,$4,$5,$6,$7)`,
			id, attemptCount+1, prev.Result, prev.ExecutedByID, execAt, prev.Comments, prev.DurationSeconds); err != nil {
			return err
		}
	}
	var executedAt *time.Time
	if in.Result != "not_run" {
		now := time.Now()
		executedAt = &now
	}
	// Normalise + serialise the per-step checklist.  nil/empty → SQL NULL.
	var stepResultsJSON []byte
	if cleaned := cleanStepResults(in.StepResults); len(cleaned) > 0 {
		b, err := json.Marshal(cleaned)
		if err != nil {
			return err
		}
		stepResultsJSON = b
	}
	if _, err := tx.Exec(ctx, `
		update test_executions set
			result = $1,
			executed_by_id = $2,
			executed_at = $3,
			duration_seconds = $4,
			comments = nullif($5,''),
			jira_defect_keys = nullif($6,''),
			env_override = nullif($7,''),
			build_override = nullif($8,''),
			step_results_json = $9,
			updated_at = now()
		where id = $10`,
		in.Result, userID, executedAt, in.DurationSeconds, in.Comments, in.JiraDefectKeys, in.EnvOverride, in.BuildOverride, stepResultsJSON, id); err != nil {
		return err
	}
	if in.Result != "not_run" {
		// promote run to in_progress if it was draft
		if _, err := tx.Exec(ctx, `update test_runs set status = 'in_progress', actual_start = coalesce(actual_start, now()), updated_at = now() where id = $1 and status = 'draft'`, prev.RunID); err != nil {
			return err
		}
	}
	if err := writeAudit(ctx, tx, userID, "execution.update", "TestExecution", id, nil, map[string]any{"result": in.Result}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// cleanStepResults drops untriaged entries and rejects results outside the
// allowed set so junk never reaches step_results_json.
func cleanStepResults(in []domain.StepResult) []domain.StepResult {
	out := []domain.StepResult{}
	for _, sr := range in {
		if sr.Result == "pass" || sr.Result == "fail" {
			out = append(out, domain.StepResult{Order: sr.Order, Result: sr.Result})
		}
	}
	return out
}

// ─── audit logs ──────────────────────────────────────────────────────────────

func (s *Store) RecentAudit(ctx context.Context, limit int) ([]domain.AuditLog, error) {
	if limit <= 0 {
		limit = 25
	}
	rows, err := s.Pool.Query(ctx, `
		select a.id::text, a.action, a.entity, a.entity_id::text, u.name, a.created_at
		from audit_logs a
		left join users u on u.id = a.actor_id
		order by a.created_at desc
		limit $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.AuditLog{}
	for rows.Next() {
		var a domain.AuditLog
		if err := rows.Scan(&a.ID, &a.Action, &a.Entity, &a.EntityID, &a.ActorName, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ─── reports ─────────────────────────────────────────────────────────────────

type ReportPayload struct {
	TotalCases       int `json:"totalCases"`
	AutomatedCount   int `json:"automatedCount"`
	AutomationPct    int `json:"automationPct"`
	AreaCoverage     []AreaCoverage     `json:"areaCoverage"`
	Candidates       []Candidate        `json:"candidates"`
	TopFailing       []TopFailing       `json:"topFailing"`
	StaleAutomation  []TestCaseLite     `json:"staleAutomation"`
	StaleManual      []StaleManual      `json:"staleManual"`
	RecentlyExecuted int                `json:"recentlyExecuted"`
}

type AreaCoverage struct {
	AreaID         string `json:"areaId"`
	Key            string `json:"key"`
	Name           string `json:"name"`
	Total          int    `json:"total"`
	Automated      int    `json:"automated"`
	AutomationPct  int    `json:"automationPct"`
}

type Candidate struct {
	Case     TestCaseLite `json:"case"`
	Runs     int          `json:"runs"`
	Fails    int          `json:"fails"`
	FailPct  int          `json:"failPct"`
	Score    int          `json:"score"`
}

type TopFailing struct {
	Case  TestCaseLite `json:"case"`
	Count int          `json:"count"`
}

type StaleManual struct {
	Case      TestCaseLite `json:"case"`
	LastRunAt *time.Time   `json:"lastRunAt"`
}

func (s *Store) ProjectReport(ctx context.Context, projectID string) (*ReportPayload, error) {
	cases, err := s.ListTestCases(ctx, CaseListFilter{ProjectID: projectID, Limit: 5000})
	if err != nil {
		return nil, err
	}
	rep := &ReportPayload{}
	rep.TotalCases = len(cases)
	caseByID := map[string]TestCaseLite{}
	for _, c := range cases {
		caseByID[c.ID] = c
		if c.AutomationStatus == "full" || c.AutomationStatus == "partial" {
			rep.AutomatedCount++
		}
	}
	if rep.TotalCases > 0 {
		rep.AutomationPct = rep.AutomatedCount * 100 / rep.TotalCases
	}
	// area coverage
	areaMap := map[string]*AreaCoverage{}
	for _, c := range cases {
		a, ok := areaMap[c.AreaID]
		if !ok {
			a = &AreaCoverage{AreaID: c.AreaID, Key: c.AreaKey, Name: c.AreaName}
			areaMap[c.AreaID] = a
		}
		a.Total++
		if c.AutomationStatus == "full" || c.AutomationStatus == "partial" {
			a.Automated++
		}
	}
	for _, a := range areaMap {
		if a.Total > 0 {
			a.AutomationPct = a.Automated * 100 / a.Total
		}
		rep.AreaCoverage = append(rep.AreaCoverage, *a)
	}
	// run/fail counts per case (across all runs for project)
	runRows, err := s.Pool.Query(ctx, `
		select sc.test_case_id::text, e.result, e.executed_at
		from test_executions e
		join run_snapshot_cases sc on sc.id = e.snapshot_case_id
		join test_runs r on r.id = e.run_id
		where r.project_id = $1`, projectID)
	if err != nil {
		return nil, err
	}
	type stat struct {
		runs, fails int
		lastExec    *time.Time
	}
	stats := map[string]*stat{}
	for runRows.Next() {
		var caseID, result string
		var execAt *time.Time
		if err := runRows.Scan(&caseID, &result, &execAt); err != nil {
			runRows.Close()
			return nil, err
		}
		st, ok := stats[caseID]
		if !ok {
			st = &stat{}
			stats[caseID] = st
		}
		if result != "not_run" {
			st.runs++
			if execAt != nil && (st.lastExec == nil || execAt.After(*st.lastExec)) {
				st.lastExec = execAt
			}
		}
		if result == "fail" {
			st.fails++
		}
	}
	runRows.Close()

	// candidates
	priorityWeight := map[string]int{"critical": 4, "high": 3, "medium": 2, "low": 1}
	for _, c := range cases {
		if c.AutomationStatus != "not_automated" || c.Status != "active" {
			continue
		}
		st := stats[c.ID]
		var runs, fails int
		if st != nil {
			runs = st.runs
			fails = st.fails
		}
		failPct := 0
		if runs > 0 {
			failPct = fails * 100 / runs
		}
		stepLoad := len(c.Steps)
		if stepLoad > 10 {
			stepLoad = 10
		}
		score := priorityWeight[c.Priority]*25 + clamp(runs, 20)*4 + (failPct*60)/100 + (stepLoad*15)/10
		rep.Candidates = append(rep.Candidates, Candidate{Case: c, Runs: runs, Fails: fails, FailPct: failPct, Score: score})
	}
	sortByScoreDesc(rep.Candidates)
	if len(rep.Candidates) > 20 {
		rep.Candidates = rep.Candidates[:20]
	}

	// top failing in last 90d
	since := time.Now().AddDate(0, 0, -90)
	failRows, err := s.Pool.Query(ctx, `
		select sc.test_case_id::text, count(*) as c
		from test_executions e
		join run_snapshot_cases sc on sc.id = e.snapshot_case_id
		join test_runs r on r.id = e.run_id
		where r.project_id = $1 and e.result = 'fail' and e.executed_at >= $2
		group by sc.test_case_id
		order by c desc
		limit 20`, projectID, since)
	if err != nil {
		return nil, err
	}
	for failRows.Next() {
		var cid string
		var count int
		if err := failRows.Scan(&cid, &count); err != nil {
			failRows.Close()
			return nil, err
		}
		if c, ok := caseByID[cid]; ok {
			rep.TopFailing = append(rep.TopFailing, TopFailing{Case: c, Count: count})
		}
	}
	failRows.Close()

	// stale automation: automation_last_reviewed_at older than 90d
	for _, c := range cases {
		if c.AutomationStatus == "not_automated" {
			continue
		}
		if c.AutomationLastReviewedAt == nil || c.AutomationLastReviewedAt.Before(since) {
			rep.StaleAutomation = append(rep.StaleAutomation, c)
		}
	}
	if len(rep.StaleAutomation) > 15 {
		rep.StaleAutomation = rep.StaleAutomation[:15]
	}

	// stale manual: not run in 60d
	since60 := time.Now().AddDate(0, 0, -60)
	for _, c := range cases {
		if c.AutomationStatus != "not_automated" || c.Status != "active" {
			continue
		}
		var lastExec *time.Time
		if st, ok := stats[c.ID]; ok {
			lastExec = st.lastExec
		}
		if lastExec == nil || lastExec.Before(since60) {
			rep.StaleManual = append(rep.StaleManual, StaleManual{Case: c, LastRunAt: lastExec})
		}
	}
	if len(rep.StaleManual) > 20 {
		rep.StaleManual = rep.StaleManual[:20]
	}

	// recently executed = number of cases with at least one non-not_run exec
	for _, st := range stats {
		if st.lastExec != nil {
			rep.RecentlyExecuted++
		}
	}
	return rep, nil
}

func clamp(v, max int) int {
	if v > max {
		return max
	}
	return v
}

func sortByScoreDesc(c []Candidate) {
	for i := 1; i < len(c); i++ {
		for j := i; j > 0 && c[j].Score > c[j-1].Score; j-- {
			c[j], c[j-1] = c[j-1], c[j]
		}
	}
}
