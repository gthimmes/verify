# Test Case Management System — Requirements

## 1. Overview

A lightweight system for organizing, executing, and tracking **manual** test cases. The tool also tracks automation metadata — what's automated, where the test lives, in what framework — so we can see coverage and identify the best candidates to automate next.

**v1 is manual-only.** Automated tests continue to run in their existing CI pipelines, separate from this tool. v1's job is to be the system of record for the manual test catalog and execution history, and to surface intelligence about where automation should go next.

**Future state**: this tool eventually runs automated tests directly. The schema in v1 (automation reference, framework, owner) is designed to extend cleanly into that capability without rework.

Primary users:

- QA engineers authoring and executing manual test cases
- Engineers and EMs reviewing automation coverage to decide what to automate next
- PMs and EMs reviewing run results and quality trends

## 2. Domain Model

Hierarchy:

```
Project
└── Area              (e.g. Payments, Calendar, Auth)
    └── Feature       (e.g. Recurring Payments, Refunds)
        └── Test Case
```

Execution:

```
Test Run             (snapshot of selected test cases for a project, at a moment in time)
└── Test Execution   (one per case, or one per data row for parameterized cases)
```

A **Test Case** is the definition (the spec). A **Test Execution** is one specific attempt at running that case as part of a Test Run.

## 3. Functional Requirements

### 3.1 Projects

- Users can create, rename, and archive projects.
- A project has: name, description (optional), owner, status (active/archived), created/updated metadata.
- Archived projects are read-only and hidden from default views but accessible via filter.
- Each project has its own set of areas, features, test cases, and test runs. No cross-project sharing in v1.

### 3.2 Areas and Features

- Areas are the top-level grouping inside a project (e.g. Payments, Calendar). A project can have many areas.
- Features live inside areas (e.g. Calendar > Recurring Events). A feature belongs to exactly one area.
- Both areas and features support: name, description, display order, archived flag.
- Users can move features between areas. Moving must preserve all child test cases and their history.
- Users can reorder areas and features via drag-and-drop or explicit ordering field.

### 3.3 Test Cases

Each test case has the following fields:

**Identification**

- Auto-generated, human-readable ID scoped to project (e.g. `ACM-PAY-0042`)
- Title (required)
- Feature (required, sets the area implicitly)

**Definition**

- Description / objective
- Preconditions (free text or markdown)
- Steps: ordered list, each step has an action and an expected result
- Final expected result (overall, optional if covered by step expectations)
- Test data notes (optional, free-form; see 3.3.1 for structured parameterization)

**Classification**

- Type: functional, regression, smoke, integration, exploratory, performance, security, accessibility (extensible list)
- Priority: critical, high, medium, low
- Tags / labels: free-form, multi-select
- Status: draft, active, deprecated

**Automation metadata** (tracked, not executed in v1)

- Automation status: not automated, partially automated, fully automated
- Automation framework: free-text or enum (e.g. Cypress, Playwright, JUnit, Pytest, Postman, k6) — extensible
- Automation reference: path or URL to the test in source control (e.g. `apps/web-e2e/src/payments/refund.cy.ts`) plus optional repo link
- Automation owner (user)
- Last reviewed date: when this metadata was last verified accurate (because automation references go stale)
- Manual fields only — populated by humans editing the case. No CI integration in v1.

**Linkage and assets**

- Linked requirements / tickets (Jira issue keys; URL fallback)
- Attachments: images, files, up to a per-attachment size limit
- Linked related test cases (optional; "see also")

**Audit**

- Created by, created at
- Updated by, updated at
- Version number (incremented on edit)
- Change history: who changed what, when (full diff for steps and expected results)

**Operations**

- Bulk edit (tags, priority, status, automation status) across selected cases
- Bulk move between features
- Duplicate / clone
- Soft delete with restore window (30 days)

#### 3.3.1 Parameterized Test Cases (Data Sets)

Some test cases need to be run against multiple input variations (e.g. "refund a payment" run against credit card, ACH, wire, and gift card). The model:

- A test case can optionally define a **parameter schema**: a list of named columns (e.g. `payment_method`, `currency`, `expected_fee`).
- A test case with a parameter schema also defines a **data set**: rows of values, one row per variation.
- Steps and expected results can reference parameters using `{{column_name}}` placeholders, which render with the row's values during execution.
- When the case is included in a run, **each data row produces its own execution record**. The tester sees them as `ACM-PAY-0042 [credit card]`, `ACM-PAY-0042 [ACH]`, etc., and records pass/fail per row.
- Reporting rolls up at both levels: per-row results and per-case aggregate (e.g. "passed 3 of 4 rows").
- Cases without a parameter schema behave as a single execution per run, exactly as in 3.5.
- Data set rows can be added, edited, and deleted at the case level. Existing run snapshots are not retroactively changed (consistent with run snapshot semantics in 3.4).

#### 3.3.2 Test Case Templates

To accelerate authoring and enforce consistency:

- Users with manager or admin role can create **templates** at the project or org level.
- A template is a reusable starting structure: title pattern, prefilled steps, default type/priority, default tags, optional parameter schema, optional preconditions text.
- Examples to seed: CRUD entity, auth flow, payment flow, form validation, permission matrix, accessibility audit, regression smoke.
- When creating a new test case, the user can pick a template; the case is initialized with the template's content but is then independent (no live link).
- Templates can be edited, archived, and shared across projects within an org.

### 3.4 Test Runs

A test run is a snapshot of selected test cases plus the executions performed against them.

**Creation flow**

1. User picks a project.
2. User enters run metadata: name, description (optional), environment (e.g. staging, prod), build or version (free-text or git SHA), milestone (optional), planned start/end dates, default assignee (optional).
3. User is presented with the full hierarchy of areas → features → test cases for that project, with all items checked by default.
4. User can deselect (exclude) at any level: whole areas, whole features, or individual test cases. Counts update live as items are excluded.
5. User can also filter the selection by tag, priority, type, or automation status (e.g. "exclude all fully-automated cases — those run in CI", "include only smoke").
6. On confirm, the run is created with a frozen snapshot of the included test cases at their current version, including their parameter schemas and data sets at that moment. Later edits to a test case do not retroactively change the run.

**Run states**

- Draft (created but not started)
- In progress (first execution recorded)
- Completed (manually marked, or all executions have a non-pending result)
- Blocked (manual flag)
- Aborted (manual flag with reason)

**Run-level fields**

- Status, owner, assignees, environment, build, milestone, planned and actual start/end timestamps, notes.
- Aggregate counts: total, passed, failed, blocked, skipped, not run.

**Operations on runs**

- Add additional test cases to an in-progress run (append-only; original snapshot preserved).
- Re-run a failed subset: spawn a child run prefilled with the failed cases (and the specific failing data rows, for parameterized cases).
- Clone a previous run as a starting point.

### 3.5 Test Execution

Each test case (or each data row of a parameterized case) in a run has exactly one **current** execution record, plus a history of prior attempts within the same run.

**Execution fields**

- Result: pass, fail, blocked, skipped, not run (default)
- Executed by (user)
- Executed at (timestamp; auto on result change)
- Duration (optional, manual entry)
- Environment override (if different from run default)
- Build override (if different from run default)
- Comments / notes (markdown)
- Attachments: screenshots, logs, video
- Linked defects: Jira issue keys with bidirectional linking
- Step-level results (optional but supported): per-step pass/fail and notes for cases where granular tracking matters
- For parameterized cases: which data row this execution corresponds to (read-only)

**Behaviors**

- Re-executing a test in the same run overwrites the current result but pushes the previous attempt into history (visible in a per-execution timeline).
- Marking a test as failed prompts the user to either link an existing defect or create a new one (via Jira integration).

### 3.6 Reporting and Dashboards

**Per run**

- Live progress bar: passed / failed / blocked / skipped / not run, with counts and percentages.
- Pass rate over time as the run progresses.
- Breakdown by area, feature, priority, type, and assignee.
- For parameterized cases: drill-down view showing per-row results.
- List view with filter, sort, and bulk-assign.
- Export run results to CSV and PDF.

**Per project**

- **Coverage view**: total test cases per area, automation rate per area, last-executed timestamp per case.
- **Automation candidates report** (the strategic view — see note below): ranked list of manual test cases that should be automated next, scored on:
  - Execution frequency (how often the case appears in runs)
  - Failure rate (cases that often fail catch real regressions)
  - Priority (critical/high weighted higher)
  - Manual effort proxy (step count, duration)
  - Filterable by area, feature, tag.
- **Stale automation report**: cases marked automated where the automation reference hasn't been reviewed in N days (configurable). Catches drift between metadata and reality.
- **Stale-case report**: manual cases not executed in N days.
- **Top-failing cases**: highest fail count over a date range.
- Trend: pass rate by run over time, automation rate trend.

**Cross-project (admin)**

- Automation rate by project.
- Active runs across all projects.

> The Automation Candidates report is the strategic feature in v1. The whole point of tracking automation metadata in a manual-first tool is to drive better automation prioritization decisions. This report should get first-class UX treatment, not be buried in a reports menu.

### 3.7 Integrations

**Issue tracker (Jira)**

- Two-way linking between test cases and Jira issues (requirements, stories) and between test executions and Jira defects (bugs).
- Create defects directly from a failed execution; defect inherits run, build, environment, and reproduction notes.
- Show test coverage on a Jira issue: which test cases reference it and their latest status.

**Authentication**

- SSO via SAML or OIDC.
- Service accounts / API tokens for read access and future integrations.

**API**

- REST API covering all entities (projects, areas, features, test cases, runs, executions) with token auth.
- Read-heavy in v1. Write endpoints for case authoring and run/execution management exist but are not the primary interface.
- Webhooks for run state changes (for downstream notifications, dashboards).

**Note**: CI/CD integration to post automated test results into the tool is **out of scope for v1**. It will be the v2 unlock when we move automated execution into this tool. The schema is already designed to support it.

### 3.8 Users, Roles, and Permissions

Roles, scoped per project:

- **Admin**: full control of the project, including settings, templates, and member management.
- **Manager**: create and manage runs, edit test cases and templates, view all reports.
- **Tester**: execute assigned tests, comment, attach files, link defects, edit cases they own.
- **Viewer**: read-only access to test cases, runs, and reports.

Global roles:

- **Org admin**: manage all projects, users, integrations, org-level templates, and global settings.

Notes:

- Users can have different roles across different projects.
- Audit log records all create, update, delete, and execution actions with user and timestamp.

### 3.9 Search and Navigation

- Global search across test cases by ID, title, description, tag, and step content.
- Saved filters per user (e.g. "my failing cases this sprint", "manual smoke cases in Payments").
- Quick navigation by ID (`ACM-PAY-0042` jumps directly).
- Breadcrumbs and persistent left nav for the project hierarchy.

### 3.10 Notifications

- Email and in-app notifications for: assignment to a run, run completion, defect linked to your test case, comment mention.
- Per-user notification preferences.
- Optional Slack integration: post run summaries to a channel on completion.

## 4. Non-Functional Requirements

- **Performance**: list views responsive for projects with up to ~2,000 test cases. Run execution view responsive with up to ~500 cases per run. (Year-1 scale; revisit before v2.)
- **Reliability**: 99.9% monthly availability target.
- **Auditability**: every mutating action logged with actor, timestamp, before/after values for editable fields. Logs retained for at least 1 year.
- **Data retention**: deleted entities recoverable for 30 days. Runs and executions retained indefinitely by default.
- **Accessibility**: meet WCAG 2.1 AA for all primary user flows.
- **Localization**: English only in v1, but copy externalized to support future locales.
- **Security**: encryption at rest and in transit, role-based access control enforced on all API endpoints, SOC 2 controls (access review, audit logging, secret management).

## 5. Out of Scope for v1

Calling these out explicitly so they don't creep in:

- **Automated test execution from this tool** (the v2 killer feature)
- **CI/CD webhook to post automated test results** (deferred with the above)
- BDD / Gherkin authoring inside the tool
- Test case review / approval workflows
- Custom field definitions per project
- Test environments as a managed entity (just free-text in v1)
- Resource and capacity planning for testers
- Mobile native app (responsive web is fine)
- Multi-tenant SaaS billing (assumes single-org deployment for v1)

## 6. Resolved Design Decisions

Captured for the record so the rationale survives:

- **Templates**: included in v1 (3.3.2). Project- and org-level scope, snapshot-on-use (no live link).
- **Automated results**: not posted to this tool in v1. Automation metadata is human-maintained. CI integration ships with v2.
- **Parameterized cases**: modeled as one case with a parameter schema and a data set; each row produces its own execution record in a run (3.3.1). Reporting rolls up at both row and case level.
- **Scale targets**: tuned for year-1 footprint (~2K cases/project, ~500 cases/run). Revisit before v2.
