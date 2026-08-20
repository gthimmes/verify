import type { HelpContent } from "help-navigator";

// The in-app help corpus: categories + markdown articles, rendered by the
// help-navigator widget mounted in the root layout.
export const helpContent: HelpContent = {
  categories: [
    {
      id: "getting-started",
      title: "Getting started",
      icon: "🚀",
      description: "Projects, navigation, global search, and appearance.",
    },
    {
      id: "test-cases",
      title: "Test cases",
      icon: "📝",
      description: "Authoring cases: steps, parameters, templates, and history.",
    },
    {
      id: "organizing",
      title: "Organizing the catalog",
      icon: "🗂️",
      description: "The folder tree, filters, saved views, and bulk edits.",
    },
    {
      id: "runs",
      title: "Test runs",
      icon: "🏃",
      description: "Frozen snapshots of cases: creating, cloning, re-running.",
    },
    {
      id: "execution",
      title: "Execution & results",
      icon: "✅",
      description: "Recording pass/fail/blocked/skipped, defects, and attempts.",
    },
    {
      id: "automation",
      title: "Automation & reports",
      icon: "🤖",
      description: "Automation metadata, candidates, coverage, and staleness.",
    },
    {
      id: "admin",
      title: "Administration",
      icon: "🛡️",
      description: "Members & roles, org-wide admin, audit, and importing.",
    },
  ],
  articles: [
    // ---------- Getting started ----------
    {
      id: "verify-tour",
      title: "A two-minute tour of Verify",
      category: "getting-started",
      featured: true,
      tags: ["overview", "tour", "basics"],
      body: `Verify is the system of record for your **manual test catalog** and its execution history — and it tracks which cases are automated so you can decide what to automate next.

The shape of everything:

1. **Projects** own their own catalog, runs, and reports
2. **Folders** organize test cases in a tree of any depth
3. **Test cases** carry steps, preconditions, parameters, and automation metadata
4. **Runs** freeze a snapshot of selected cases at a moment in time
5. **Executions** record pass/fail/blocked/skipped per case (and per data row)
6. **Reports** show coverage, automation candidates, and staleness

## Where to look first

The header navigation: **Projects**, **Active runs**, and **Admin**. Opening the app drops you into your most-recently-updated project's case list.

> Press **F1** anytime to open this help panel, and **⌘K** (or **Ctrl+K**) to search test cases.`,
      related: ["projects-basics", "authoring-cases", "creating-runs"],
    },
    {
      id: "projects-basics",
      title: "Projects: creating, switching, archiving",
      category: "getting-started",
      featured: true,
      tags: ["projects", "key", "switcher", "archive"],
      body: `Each project owns its own test catalog, runs, and reports.

## The project list

**Projects** in the header shows every active project as a card with its case, folder, and run counts plus the automation percentage. (Opening \`/\` with no list view jumps straight to your most-recently-updated project.)

## Creating one

**+ New project** asks for a **Name**, an optional **Key** (max 8 characters, uppercase — auto-generated if blank), and a description. The key prefixes every test ID, like \`ACM-PAY-0042\`.

## Switching and archiving

The **project switcher** next to the logo filters projects by name or key as you type. Archived projects are hidden by default — use **Show archived** on the project list to see them.`,
      related: ["verify-tour", "folder-tree", "members-roles"],
    },
    {
      id: "global-search",
      title: "Global search (Ctrl+K / ⌘K)",
      category: "getting-started",
      tags: ["search", "find", "shortcut", "cmdk"],
      body: `**Search** (top-right, or press **⌘K** / **Ctrl+K**) searches across *every* project — by ID, title, description, steps, or tag.

Try a test ID (\`ACM-PAY-0042\`), a feature word (\`refund\`), or a tag (\`smoke\`).

Each result shows the project key, the case's public ID, its priority and automation status, and the folder path — click through to the case detail.

For searching *within* a project — with priority and automation filters — use the filter bar on the project's Cases page instead.`,
      related: ["finding-filtering", "verify-tour"],
    },
    {
      id: "appearance-account",
      title: "Theme, sign-in, and the demo user",
      category: "getting-started",
      tags: ["theme", "dark", "light", "sign-in", "google"],
      body: `## Dark mode

The theme toggle in the header cycles **system → light → dark**. Your choice persists across reloads and tabs; "system" follows your OS setting live. This help panel follows the app's theme too.

## Signing in

Verify works without an account: every action is attributed to the **demo user** until you sign in. **Sign in with Google** attaches your identity, so audit history and executions carry your name.

Roles (admin / editor / viewer) are assigned per project on the Members page — they take effect when authentication enforcement is enabled.`,
      related: ["members-roles", "admin-audit"],
    },

    // ---------- Test cases ----------
    {
      id: "authoring-cases",
      title: "Authoring a test case",
      category: "test-cases",
      featured: true,
      tags: ["create", "steps", "preconditions", "priority", "type"],
      body: `**+ New test case** (from the project overview or the Cases page) opens the authoring form. Define what to test and how to verify it:

- **Title** and a required **folder** — plus comma-separated **tags** like \`smoke, regression, P0\`
- **Description / objective**, **preconditions**, and **test data notes** — markdown is allowed
- **Steps** — numbered pairs of *Action* and *Expected result*, reorderable, plus an overall **final expected result**
- **Classification** — type (functional, regression, smoke, integration, exploratory, performance, security, accessibility, acceptance, compatibility, other), priority (critical / high / medium / low), and status
- **Automation metadata** — tracked even for manual cases (see *Tracking automation honestly*)
- **Linked Jira keys** — comma-separated, like \`PROJ-123, PROJ-124\`

Use \`{{column_name}}\` inside steps to reference parameters — see *Parameterized cases and data sets*.`,
      related: ["case-parameters", "case-templates", "case-lifecycle"],
    },
    {
      id: "case-parameters",
      title: "Parameterized cases and data sets",
      category: "test-cases",
      featured: true,
      tags: ["parameters", "data", "rows", "interpolation"],
      body: `One case, many variations: give a case a **parameter schema** (columns) and a **data set** (rows), and each row produces its own execution in a run.

## Setting it up

In the authoring form's *Parameter schema & data set* section, add **columns** (rename the default \`column_N\` to something meaningful) and **rows**. Each row gets a free-text **label** — that label shows up as a badge on the execution.

## Using parameters in steps

Write \`{{column_name}}\` inside a step's action or expected result. During execution, the placeholder is replaced with that row's value, so the tester sees concrete data, not templates.

A case with 3 data rows contributes **3 executions** to any run that includes it — the run's selection summary counts this for you.`,
      related: ["authoring-cases", "executing-tests", "creating-runs"],
    },
    {
      id: "case-templates",
      title: "Test case templates",
      category: "test-cases",
      tags: ["templates", "scaffold", "reuse"],
      body: `Templates are **org-wide scaffolds** for new test cases — maintained under **Admin → Manage templates**, reused across every project.

## Authoring templates

A template can carry a default case title (with \`{{param}}\` placeholders), description, preconditions, steps, parameter columns, type, priority, tags, a final expected result, and test data notes.

## Using one

When creating a case, the **Start from a template** picker prefills the form with the template's content — then you adjust from there. Data rows are cleared so each case supplies its own data.

Templates shine for repetitive shapes: a "form validation" template with standard steps, or a "smoke check" scaffold with your team's conventions baked in.`,
      related: ["authoring-cases", "admin-audit"],
    },
    {
      id: "case-lifecycle",
      title: "Case status: draft, active, deprecated",
      category: "test-cases",
      tags: ["status", "draft", "active", "deprecated", "delete", "duplicate"],
      body: `Every case has a **status**:

- **Draft** — being written; not offered when composing a run
- **Active** — the real catalog; only active cases can be added to new runs
- **Deprecated** — kept for history, out of the way

## Duplicate and delete

The case detail page has **Duplicate** (a fast way to author near-identical cases) and **Delete**. Deletes are *soft*: deleted cases move to the archived view and can be **restored** from there — including in bulk.

Old runs are unaffected by any of this: a run holds a frozen snapshot of each case as it was when the run was created.`,
      related: ["authoring-cases", "bulk-editing", "creating-runs"],
    },
    {
      id: "case-detail-extras",
      title: "History, related cases, and attachments",
      category: "test-cases",
      tags: ["history", "versions", "diff", "related", "attachments", "jira"],
      body: `The case detail page carries more than the definition:

## Edit history

Every save creates a **version**. The history page shows a field-level diff per version — old value struck through, new value highlighted — for title, steps, classification, automation metadata, tags, and more. The audit card shows who created and last updated the case.

## Related cases

Link "see-also" cases within the project: **+ Link a case** opens a typeahead by ID or title. Useful for pointing a regression case at the smoke case that covers the same flow.

## Attachments and Jira

Attach screenshots, logs, or reference files directly to the case (images get thumbnails). **Linked Jira keys** show as badges — the case's connection to requirements or known issues.`,
      related: ["authoring-cases", "executing-tests"],
    },

    // ---------- Organizing ----------
    {
      id: "folder-tree",
      title: "The folder tree",
      category: "organizing",
      featured: true,
      tags: ["folders", "tree", "sidebar", "counts", "archive"],
      body: `The Cases page is two panes: the **folder tree** on the left, the case list on the right. Folders nest to any depth.

## Reading the counts

Each folder shows \`own / rolled-up\` counts — cases directly in the folder, and the total including subfolders. Selecting a folder lists its **direct** cases only; drill into subfolders for the rest.

## Managing folders

**+ New** at the top creates a root folder. Each folder's **⋯** menu offers **Rename**, **Add subfolder**, **Move to…** (re-parent anywhere, cycles prevented), **Move up / down** (ordering), and **Archive**. Archived folders hide by default — toggle **Show archived** at the bottom of the tree.

Mirror how your product is organized — \`Payments › One-time payment\`, \`Checkout › Guest\` — so coverage reports by folder read like a map of the product.`,
      related: ["projects-basics", "finding-filtering", "reports-overview"],
    },
    {
      id: "finding-filtering",
      title: "Filtering, saved views, and CSV export",
      category: "organizing",
      tags: ["filters", "saved", "views", "csv", "export", "shared"],
      body: `## The filter bar

On the Cases page, filter by text (\`Search by ID, title, step…\`), **priority**, and **automation status**, then **Apply**. The URL carries the filters, so a filtered view is shareable as a link.

## Saved views

**Save current view** stores the active filter under a name — your saved filters appear as chips above the list. Tick **Shared** to publish a view to the whole project (shared chips carry a ★). The runs list has its own saved filters, same mechanics.

## Export CSV

With any filter active, **Export CSV** downloads exactly the filtered rows — handy for spreadsheets, audits, or a quick review outside the app.`,
      related: ["global-search", "bulk-editing", "folder-tree"],
    },
    {
      id: "bulk-editing",
      title: "Bulk-editing test cases",
      category: "organizing",
      tags: ["bulk", "select", "move", "tags", "restore"],
      body: `Select cases in the list (or the select-all header checkbox) and a bulk toolbar appears:

- **Priority…**, **Status…**, **Automation…** — set the field across the selection
- **Move to…** — re-folder many cases at once
- **+tag / −tag** — add or remove a tag everywhere
- **Delete** — soft-deletes the selection (restorable from the archived view, where the same toolbar offers **Restore**)

Bulk edits pair well with filters: filter to \`Any automation = Not automated\` in one folder, select all, and tag the batch \`automation-backlog\` in one motion.`,
      related: ["finding-filtering", "case-lifecycle"],
    },

    // ---------- Runs ----------
    {
      id: "creating-runs",
      title: "Creating a run",
      category: "runs",
      featured: true,
      tags: ["run", "snapshot", "environment", "build", "milestone"],
      body: `A run is a **frozen snapshot**: the selected cases are copied at their current version, so later edits to the catalog never change what a run measured.

## Run details

Name the run (\`May staging regression\`), and record the context: **environment** (staging, prod, qa-1…), **build / version** (git SHA or semver), **milestone**, and planned start/end dates.

## Choosing cases

All active cases are offered, grouped by folder with folder-level checkboxes. Narrow the selection with filters — search, priority, type, automation status, tag — then **Select all filtered** / **Deselect filtered**.

The **selection summary** shows cases selected and *executions to create* — parameterized cases create one execution per data row. The button confirms it: **Create run with N cases**.`,
      related: ["run-lifecycle", "case-parameters", "executing-tests"],
    },
    {
      id: "run-lifecycle",
      title: "Run lifecycle and progress",
      category: "runs",
      featured: true,
      tags: ["status", "draft", "blocked", "abort", "complete", "progress"],
      body: `Runs move through statuses:

- **Draft** — composed but not started; **Start run** begins it
- **In progress** — executions are being recorded
- **Blocked** — something outside the tests is in the way
- **Completed** — finished; **Aborted** — stopped with a reason (recorded on the run)

## Reading the run page

The **progress bar** stacks pass / fail / blocked / skipped. **Completion** counts executed over total; **pass rate** is pass ÷ (pass + fail) — blocked and skipped don't dilute it. A **breakdown by priority** shows where the failures cluster, and the metadata card keeps environment, build, milestone, and planned vs. actual dates.

**Active runs** in the header lists every draft, in-progress, or blocked run across all projects.`,
      related: ["creating-runs", "rerun-clone", "executing-tests"],
    },
    {
      id: "rerun-clone",
      title: "Cloning runs and re-running failures",
      category: "runs",
      tags: ["clone", "rerun", "failed", "child"],
      body: `Two shortcuts on the run page's **Actions** card:

## Clone as new run

Copies the run's case selection into a fresh draft — the natural way to run the same regression suite against a new build. Update the environment and build fields, then start.

## Re-run failed/blocked

Creates a child run containing **only** the executions that failed or were blocked. The child links back to its parent via **"Re-run of"**, so the retry trail is visible.

The tight loop after a fix lands: re-run failed → execute the short list → pass rate tells you whether the fix held.`,
      related: ["run-lifecycle", "executing-tests"],
    },

    // ---------- Execution ----------
    {
      id: "executing-tests",
      title: "Executing tests",
      category: "execution",
      featured: true,
      tags: ["execute", "pass", "fail", "blocked", "skipped", "steps"],
      body: `**Execute tests** on a run opens the execution list. Filter pills — **All / Incomplete / Pass / Fail / Blocked** — keep the queue focused; *Incomplete* is the "what's left" view.

## Recording a result

Each row has one-click **Pass / Fail / Block / Skip** buttons that record immediately. Expand a row to see the full **snapshot** — preconditions, steps, final expected result — with \`{{parameter}}\` placeholders replaced by that execution's data-row values.

## Per-step results

Inside an expanded row, mark individual steps ✓ or ✕ — the header tallies them ("2 pass, 1 fail of 5"). Step-level marks pinpoint *where* a case broke, not just that it did.`,
      related: ["execution-details", "run-lifecycle", "case-parameters"],
    },
    {
      id: "execution-details",
      title: "Recording results: comments, defects, attempts",
      category: "execution",
      tags: ["comments", "defects", "jira", "attempts", "attachments", "duration"],
      body: `An execution carries more than a status. In the expanded row:

- **Comments** — what you observed, markdown supported
- **Duration (seconds)** — how long the attempt took
- **Linked Jira defects** — like \`PROJ-456\`, tying the failure to the bug
- **Env / build override** — when this one execution ran somewhere different from the run's default
- **Attachments** — screenshots and logs on the execution itself

## Attempt history

Every recorded result is an **attempt** — re-executing doesn't erase the previous outcome. The history list shows \`#attempt — result — when\`, so "failed twice, passed on the third try after the fix" is visible at a glance.`,
      related: ["executing-tests", "rerun-clone"],
    },

    // ---------- Automation & reports ----------
    {
      id: "automation-tracking",
      title: "Tracking automation honestly",
      category: "automation",
      featured: true,
      tags: ["automation", "framework", "reference", "coverage"],
      body: `Verify doesn't *run* automated tests (they live in your CI) — it tracks **which manual cases are automated, where, and how well**, so coverage is visible and decisions are grounded.

## The metadata

On each case:

- **Automation status** — not automated / partially automated / fully automated
- **Framework** — Cypress, Playwright, JUnit, Pytest, Postman, k6, other
- **Reference** — the path or URL of the automated test, like \`apps/web-e2e/src/payments/refund.cy.ts\`
- **Repo URL** and a **last reviewed** date

The form says it best: *"Tracked here, not executed in v1. Keep this honest."* Stale claims are worse than no claims — the reports page flags automation metadata not reviewed in 90+ days.

Project cards, the overview, and Admin all roll this up into an **automation rate**.`,
      related: ["automation-candidates", "reports-overview", "authoring-cases"],
    },
    {
      id: "automation-candidates",
      title: "Automation candidates",
      category: "automation",
      tags: ["candidates", "ranking", "score", "prioritize"],
      body: `The reports page ranks manual cases by **what's most worth automating**, scored from:

- **Execution frequency** — how often the case actually gets run
- **Failure rate** — cases that catch real regressions
- **Priority** — critical paths first
- **Effort** — cheaper automations rank higher

The table shows each candidate's runs, fail %, and score. Work from the top: a high-frequency, high-priority manual case that keeps failing is exactly the one to hand to your automation framework next.

When a case gets automated, update its automation metadata — the candidate list and the automation rate adjust on their own.`,
      related: ["automation-tracking", "reports-overview"],
    },
    {
      id: "reports-overview",
      title: "Reports: coverage and staleness",
      category: "automation",
      tags: ["reports", "coverage", "stale", "failing"],
      body: `**Reports** is the strategic view of a project's catalog:

- **KPIs** — total cases, automation rate, folders covered, cases recently run
- **Automation candidates** — the ranked to-automate list
- **Coverage by folder** — where the catalog is thick or thin, and how automated each top-level folder is
- **Top failing cases (last 90 days)** — the flaky and the broken
- **Stale automation metadata** — marked automated but not reviewed in 90+ days; verify before trusting
- **Stale manual cases** — active cases not run in 60+ days, possibly obsolete or under-tested

The two staleness lists are the catalog's hygiene loop: prune or re-run stale manual cases, re-review stale automation claims.`,
      related: ["automation-candidates", "automation-tracking", "folder-tree"],
    },

    // ---------- Administration ----------
    {
      id: "members-roles",
      title: "Members and roles",
      category: "admin",
      tags: ["members", "roles", "invite", "permissions"],
      body: `Each project has its own members, managed under **Members** (project settings):

- **Admin** — full control: settings, members, and content
- **Editor** — can author cases and execute runs
- **Viewer** — read-only access

## Adding people

Invite by **email** — people are added even before their first sign-in, so you can set a team up ahead of time. The project **owner** badge marks the creator, whose role can't be changed or removed.

Roles take effect when authentication enforcement is enabled; until then they document intent.`,
      related: ["appearance-account", "projects-basics"],
    },
    {
      id: "admin-audit",
      title: "Admin, the audit log, and importing",
      category: "admin",
      tags: ["admin", "audit", "import", "testiny", "activity"],
      body: `**Admin** in the header is the org-wide view:

- **Automation rate by project** — cases, automation %, and active runs per project
- **Recent activity** — the last 25 audit events; every mutating action in Verify (creates, edits, executions, deletes) is recorded with its actor
- **Manage templates** — the org-wide test case scaffolds

## Importing from Testiny

Migrating? The CLI importer ingests a Testiny \`.xlsx\` export and recreates the full folder structure:

\`\`\`
go run ./cmd/import-testiny --xlsx export.xlsx --project-key X --apply
\`\`\`

Default mode is a dry-run; add \`--apply\` to write. Type, priority, and status are mapped onto Verify's enums automatically.`,
      related: ["case-templates", "appearance-account", "members-roles"],
    },
  ],
};
