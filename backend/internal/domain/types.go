package domain

import "time"

// User
type User struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	Role      string  `json:"role"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

// Attachment is a file linked to a test case or execution. The List/metadata
// form omits the bytes; the blob is fetched separately for download.
type Attachment struct {
	ID             string    `json:"id"`
	EntityType     string    `json:"entityType"`
	EntityID       string    `json:"entityId"`
	Filename       string    `json:"filename"`
	ContentType    string    `json:"contentType"`
	SizeBytes      int       `json:"sizeBytes"`
	UploadedByName string    `json:"uploadedByName"`
	CreatedAt      time.Time `json:"createdAt"`
}

// CreateAttachmentInput carries an upload; Data is standard base64.
type CreateAttachmentInput struct {
	EntityType  string `json:"entityType"`
	EntityID    string `json:"entityId"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Data        string `json:"data"`
}

// ProjectMember is a user's membership of a project, with their project role.
type ProjectMember struct {
	UserID    string    `json:"userId"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"` // admin | editor | viewer
	AvatarURL *string   `json:"avatarUrl,omitempty"`
	IsOwner   bool      `json:"isOwner"`
	CreatedAt time.Time `json:"createdAt"`
}

// AddMemberInput adds (or re-roles) a member by email.
type AddMemberInput struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// TemplateBody is the reusable subset of a test case that a template carries.
// It mirrors the content fields of TestCaseInput, omitting anything
// project-scoped (folder/feature, public id, automation linkage).
type TemplateBody struct {
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	Preconditions string          `json:"preconditions"`
	FinalExpected string          `json:"finalExpected"`
	TestDataNotes string          `json:"testDataNotes"`
	Type          string          `json:"type"`
	Priority      string          `json:"priority"`
	Tags          []string        `json:"tags"`
	Steps         []TestStep      `json:"steps"`
	Parameters    []TestCaseParam `json:"parameters"`
}

// Template is a named, project-agnostic scaffold for a test case.
type Template struct {
	ID            string       `json:"id"`
	Name          string       `json:"name"`
	Description   string       `json:"description"`
	Body          TemplateBody `json:"body"`
	CreatedByName string       `json:"createdByName"`
	CreatedAt     time.Time    `json:"createdAt"`
	UpdatedAt     time.Time    `json:"updatedAt"`
}

type CreateTemplateInput struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Body        TemplateBody `json:"body"`
}

// RelatedCase is a "see also" link target as shown on a case detail page.
type RelatedCase struct {
	ID           string `json:"id"`
	PublicID     string `json:"publicId"`
	Title        string `json:"title"`
	Status       string `json:"status"`
	Priority     string `json:"priority"`
	RelationType string `json:"relationType"`
}

// GoogleProfile is the subset of Google's userinfo we persist on login.
type GoogleProfile struct {
	Sub     string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

// Project
type Project struct {
	ID          string     `json:"id"`
	Key         string     `json:"key"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	Status      string     `json:"status"`
	OwnerID     string     `json:"ownerId"`
	OwnerName   string     `json:"ownerName"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	DeletedAt   *time.Time `json:"deletedAt"`
}

// ProjectSummary is what the dashboard cards show.
type ProjectSummary struct {
	Project
	TestCaseCount  int `json:"testCaseCount"`
	FolderCount    int `json:"folderCount"`
	RunCount       int `json:"runCount"`
	ActiveRunCount int `json:"activeRunCount"`
	AutomatedCount int `json:"automatedCount"`
}

type CreateProjectInput struct {
	Name        string `json:"name"`
	Key         string `json:"key"`
	Description string `json:"description"`
}

// Folder is one node of the recursive folder tree.  Test cases belong to a
// folder; folders belong to a project and (optionally) a parent folder.
type Folder struct {
	ID           string    `json:"id"`
	ProjectID    string    `json:"projectId"`
	ParentID     *string   `json:"parentId"`
	Name         string    `json:"name"`
	Description  *string   `json:"description"`
	DisplayOrder int       `json:"displayOrder"`
	Archived     bool      `json:"archived"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// FolderNode is the tree-shaped form returned by /folders.
//   - OwnCount   = cases directly in this folder (matches what the table
//                  shows when the user clicks the folder)
//   - CaseCount  = OwnCount + every descendant's OwnCount, rolled up
type FolderNode struct {
	Folder
	OwnCount  int           `json:"ownCount"`
	CaseCount int           `json:"caseCount"`
	Children  []*FolderNode `json:"children"`
}

type CreateFolderInput struct {
	ProjectID   string  `json:"projectId"`
	ParentID    *string `json:"parentId"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
}

// TestStep / Param / DataRow
type TestStep struct {
	ID       string `json:"id"`
	Order    int    `json:"order"`
	Action   string `json:"action"`
	Expected string `json:"expected"`
}
type TestCaseParam struct {
	Name  string `json:"name"`
	Order int    `json:"order"`
}
type TestCaseDataRow struct {
	Order  int               `json:"order"`
	Label  *string           `json:"label"`
	Values map[string]string `json:"values"`
}

// TestCase (full).
type TestCase struct {
	ID                       string     `json:"id"`
	ProjectID                string     `json:"projectId"`
	ProjectKey               string     `json:"projectKey"`
	ProjectName              string     `json:"projectName"`
	FolderID                 string     `json:"folderId"`
	FolderName               string     `json:"folderName"`
	FolderPath               string     `json:"folderPath"`
	PublicID                 string     `json:"publicId"`
	SequenceNum              int        `json:"sequenceNum"`
	Title                    string     `json:"title"`
	Description              *string    `json:"description"`
	Preconditions            *string    `json:"preconditions"`
	FinalExpected            *string    `json:"finalExpected"`
	TestDataNotes            *string    `json:"testDataNotes"`
	Type                     string     `json:"type"`
	Priority                 string     `json:"priority"`
	Status                   string     `json:"status"`
	AutomationStatus         string     `json:"automationStatus"`
	AutomationFramework      *string    `json:"automationFramework"`
	AutomationRef            *string    `json:"automationRef"`
	AutomationRepoURL        *string    `json:"automationRepoUrl"`
	AutomationLastReviewedAt *time.Time `json:"automationLastReviewedAt"`
	JiraKeys                 *string    `json:"jiraKeys"`
	Version                  int        `json:"version"`
	CreatedAt                time.Time  `json:"createdAt"`
	UpdatedAt                time.Time  `json:"updatedAt"`
	DeletedAt                *time.Time `json:"deletedAt"`
	CreatedByName            string     `json:"createdByName"`
	UpdatedByName            string     `json:"updatedByName"`
	Tags                     []string   `json:"tags"`
	Steps                    []TestStep `json:"steps"`
	Parameters               []TestCaseParam   `json:"parameters"`
	DataRows                 []TestCaseDataRow `json:"dataRows"`
}

// TestCaseInput — payload for create + update.
type TestCaseInput struct {
	ProjectID           string            `json:"projectId"`
	FolderID            string            `json:"folderId"`
	Title               string            `json:"title"`
	Description         string            `json:"description"`
	Preconditions       string            `json:"preconditions"`
	FinalExpected       string            `json:"finalExpected"`
	TestDataNotes       string            `json:"testDataNotes"`
	Type                string            `json:"type"`
	Priority            string            `json:"priority"`
	Status              string            `json:"status"`
	AutomationStatus    string            `json:"automationStatus"`
	AutomationFramework string            `json:"automationFramework"`
	AutomationRef       string            `json:"automationRef"`
	AutomationRepoURL   string            `json:"automationRepoUrl"`
	JiraKeys            string            `json:"jiraKeys"`
	Tags                []string          `json:"tags"`
	Steps               []TestStep        `json:"steps"`
	Parameters          []TestCaseParam   `json:"parameters"`
	DataRows            []TestCaseDataRow `json:"dataRows"`
}

// BulkCaseRequest applies one metadata change to many cases at once.
// Op is one of: "priority", "status", "automation", "move", "delete",
// "restore".  Value carries the target enum value (priority/status/automation)
// or the destination folder id (move); it is ignored for delete/restore.
type BulkCaseRequest struct {
	CaseIDs []string `json:"caseIds"`
	Op      string   `json:"op"`
	Value   string   `json:"value"`
}

// BulkCaseResult reports how many cases were affected.
type BulkCaseResult struct {
	Updated int `json:"updated"`
}

// CaseVersionMeta is one row of a test case's edit history (no snapshot body).
type CaseVersionMeta struct {
	Version       int       `json:"version"`
	ChangedByName string    `json:"changedByName"`
	ChangedAt     time.Time `json:"changedAt"`
}

// CaseVersion is a single historical version including the frozen snapshot of
// the case content at that version.
type CaseVersion struct {
	CaseVersionMeta
	Snapshot TestCaseInput `json:"snapshot"`
}

// TestRun
type TestRun struct {
	ID            string     `json:"id"`
	ProjectID     string     `json:"projectId"`
	ProjectName   string     `json:"projectName"`
	ParentRunID   *string    `json:"parentRunId"`
	ParentRunName *string    `json:"parentRunName"`
	Name          string     `json:"name"`
	Description   *string    `json:"description"`
	Environment   *string    `json:"environment"`
	Build         *string    `json:"build"`
	Milestone     *string    `json:"milestone"`
	Status        string     `json:"status"`
	AbortReason   *string    `json:"abortReason"`
	OwnerID       string     `json:"ownerId"`
	OwnerName     string     `json:"ownerName"`
	PlannedStart  *time.Time `json:"plannedStart"`
	PlannedEnd    *time.Time `json:"plannedEnd"`
	ActualStart   *time.Time `json:"actualStart"`
	ActualEnd     *time.Time `json:"actualEnd"`
	Notes         *string    `json:"notes"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	Counts        ResultCounts `json:"counts"`
}

type ResultCounts struct {
	Total   int `json:"total"`
	Pass    int `json:"pass"`
	Fail    int `json:"fail"`
	Blocked int `json:"blocked"`
	Skipped int `json:"skipped"`
	NotRun  int `json:"notRun"`
}

type CreateRunInput struct {
	ProjectID    string   `json:"projectId"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Environment  string   `json:"environment"`
	Build        string   `json:"build"`
	Milestone    string   `json:"milestone"`
	PlannedStart string   `json:"plannedStart"`
	PlannedEnd   string   `json:"plannedEnd"`
	CaseIDs      []string `json:"caseIds"`
}

// Snapshot of a case as recorded in a run.
type SnapshotCase struct {
	ID            string            `json:"id"`
	TestCaseID    string            `json:"testCaseId"`
	PublicID      string            `json:"publicId"`
	Title         string            `json:"title"`
	Description   *string           `json:"description"`
	Preconditions *string           `json:"preconditions"`
	FinalExpected *string           `json:"finalExpected"`
	Type          string            `json:"type"`
	Priority      string            `json:"priority"`
	Version       int               `json:"version"`
	Steps         []TestStep        `json:"steps"`
	Parameters    []TestCaseParam   `json:"parameters"`
	DataRows      []TestCaseDataRow `json:"dataRows"`
}

type ExecutionAttempt struct {
	AttemptNum      int       `json:"attemptNum"`
	Result          string    `json:"result"`
	ExecutedByName  *string   `json:"executedByName"`
	ExecutedAt      time.Time `json:"executedAt"`
	Comments        *string   `json:"comments"`
	DurationSeconds *int      `json:"durationSeconds"`
}

// StepResult is one row of a per-step pass/fail checklist recorded during
// execution.  Order matches the step's order in the snapshot.
type StepResult struct {
	Order  int    `json:"order"`
	Result string `json:"result"` // "pass" | "fail" | "" (untriaged)
}

type Execution struct {
	ID              string             `json:"id"`
	RunID           string             `json:"runId"`
	SnapshotCaseID  string             `json:"snapshotCaseId"`
	DataRowIndex    *int               `json:"dataRowIndex"`
	DataRowLabel    *string            `json:"dataRowLabel"`
	Result          string             `json:"result"`
	ExecutedByID    *string            `json:"executedById"`
	ExecutedByName  *string            `json:"executedByName"`
	ExecutedAt      *time.Time         `json:"executedAt"`
	DurationSeconds *int               `json:"durationSeconds"`
	EnvOverride     *string            `json:"envOverride"`
	BuildOverride   *string            `json:"buildOverride"`
	Comments        *string            `json:"comments"`
	JiraDefectKeys  *string            `json:"jiraDefectKeys"`
	StepResults     []StepResult       `json:"stepResults"`
	UpdatedAt       time.Time          `json:"updatedAt"`
	SnapshotCase    SnapshotCase       `json:"snapshotCase"`
	Attempts        []ExecutionAttempt `json:"attempts"`
}

// RecordExecutionInput — the payload from the run-execution UI.
type RecordExecutionInput struct {
	Result          string       `json:"result"`
	Comments        string       `json:"comments"`
	DurationSeconds *int         `json:"durationSeconds"`
	JiraDefectKeys  string       `json:"jiraDefectKeys"`
	EnvOverride     string       `json:"envOverride"`
	BuildOverride   string       `json:"buildOverride"`
	StepResults     []StepResult `json:"stepResults"`
}

// SavedFilter is a named, reusable set of list-filter parameters.  Owned by
// the user who created it; `Shared` makes it visible to the whole project.
type SavedFilter struct {
	ID        string            `json:"id"`
	ProjectID string            `json:"projectId"`
	OwnerID   *string           `json:"ownerId"`
	OwnerName string            `json:"ownerName"`
	Name      string            `json:"name"`
	Scope     string            `json:"scope"`
	Query     map[string]string `json:"query"`
	Shared    bool              `json:"shared"`
	CreatedAt time.Time         `json:"createdAt"`
	UpdatedAt time.Time         `json:"updatedAt"`
}

type CreateSavedFilterInput struct {
	ProjectID string            `json:"projectId"`
	Name      string            `json:"name"`
	Scope     string            `json:"scope"`
	Query     map[string]string `json:"query"`
	Shared    bool              `json:"shared"`
}

// AuditLog
type AuditLog struct {
	ID        string    `json:"id"`
	Action    string    `json:"action"`
	Entity    string    `json:"entity"`
	EntityID  string    `json:"entityId"`
	ActorName *string   `json:"actorName"`
	CreatedAt time.Time `json:"createdAt"`
}
