<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Verify — agent guide

This file orients an AI agent (Claude, Cursor, Codex, etc.) working on Verify, a manual test-case management system. **Read this whole file before writing code.**

## What this app is

A lightweight, AI-driven (in *architecture*, not in shipped features) system for organizing, executing, and tracking **manual** test cases. The data layer is intentionally a Go service over Postgres so the UI stays thin and AI features can be added behind well-defined seams without rework. Today there are no AI features shipped — v1's mandate was to nail the test catalog and execution flow first.

The full product spec lives in `docs/spec.md`. Treat it as the source of truth for behavior. This file is the source of truth for **how to build** in this repo.

## Stack at a glance

- **Frontend**: Next.js 16 (App Router, Server Components, Server Actions). Not the Next.js you know — see the warning above. When in doubt, read `node_modules/next/dist/docs/`.
- **Frontend language / styling**: TypeScript strict, Tailwind v4 (PostCSS plugin), no shadcn — primitives are hand-rolled in `src/components/ui/`.
- **Backend**: Go (1.26+), `chi` for HTTP routing, `pgx/v5` for Postgres, `embed` for shipping migrations as part of the binary. No ORM — raw SQL with positional parameters.
- **Database**: Postgres 16 in Docker (`docker compose up -d postgres`). Connection string via `DATABASE_URL`.
- **Validation**: Zod on the frontend (server actions), hand-rolled in Go for the API.
- **E2E**: Playwright with video recording.

## Where things live

```
backend/                              # Go service
├── cmd/
│   ├── server/main.go                 # HTTP entrypoint (:4000)
│   ├── seed/main.go + fixtures.go     # demo data CLI (idempotent by default)
│   └── import-testiny/main.go         # Testiny xlsx importer CLI
└── internal/
    ├── api/router.go                  # chi setup, middleware
    ├── api/handlers.go                # every HTTP handler in one file
    ├── db/db.go                       # connect + embedded migration runner
    ├── db/migrations/
    │   ├── 0001_init.sql              # initial schema
    │   └── 0002_folders.sql           # recursive folder tree
    ├── domain/types.go                # JSON request/response shapes
    ├── importer/                      # Testiny xlsx parser + apply driver
    │   ├── folder.go, mappers.go, steps.go, reader.go, driver.go, report.go
    │   └── testdata/fixture.xlsx      # synthetic Testiny-shaped fixture
    └── store/store.go                 # every query, transaction-aware

src/                                   # Next.js (UI only)
├── app/
│   ├── layout.tsx                     # global shell
│   ├── page.tsx, runs/, search/, admin/
│   ├── actions/                       # Server Actions — proxy to Go API
│   └── projects/[projectId]/...       # per-project routes (cases page renders FolderTree)
├── components/
│   ├── shell/, ui/                    # primitives
│   ├── projects/                      # FolderTree (sidebar), area/feature dialogs
│   ├── testcases/TestCaseForm.tsx     # client form with steps + params + data rows
│   └── runs/                          # NewRunForm, RunStatusActions, ExecutionRow
└── lib/
    ├── api.ts                         # the *only* place that calls the Go API
    ├── auth.ts                        # UI-only current-user stub
    └── utils.ts

docs/
├── spec.md                            # original product spec
├── ARCHITECTURE.md                    # how the system fits together
├── ROADMAP.md                         # v1 → v2 roadmap
├── AGENTS_AI_DESIGN.md                # the AI seams
└── media/demo-tour.webm               # recorded demo

tests/e2e/                             # Playwright specs
├── _setup/globalSetup.ts              # API health + opt-in seed (PW_RESEED)
├── golden-paths.spec.ts               # six core flows (needs demo data)
├── api-contract.spec.ts               # field-shape contract
├── folder-tree.spec.ts                # sidebar walking (works against any seeded project)
├── import-flow.spec.ts                # importer E2E against fixture.xlsx
└── demo-tour.spec.ts                  # records docs/media/demo-tour.webm

docker-compose.yml                     # Postgres 16
playwright.config.ts
```

## Conventions

- **All persistence lives in Go.** The Next.js app **never** opens a database connection. If you find yourself reaching for `pg`, `prisma`, or `better-sqlite3` in `src/`, stop — extend the Go API and call it from `src/lib/api.ts` instead.
- **Server Actions are thin proxies.** Files in `src/app/actions/*.ts` Zod-validate input and forward to the matching Go endpoint. They're allowed to do `revalidatePath` and `redirect` after the API call returns. They are not allowed to do business logic.
- **Reads happen in Server Components.** Pages `await api.x(...)`. No useEffect-fetching from client components.
- **Public test IDs are stable, project-scoped.** Format `{PROJECT_KEY}-{AREA_KEY}-{4-digit-seq}`. (Area-key segment is retained from the pre-folders era; new imports keep this format too, deriving the area-like segment from the first folder under the project.)
- **Folders are the canonical hierarchy.** The `folders` table is a recursive tree (`parent_id` self-FK). Test cases reference a folder via `folder_id`. The legacy `areas` / `features` tables still exist for backwards compatibility but new code should use folders.
- **Soft delete is `deleted_at`.** Default queries filter it out. Restore by nulling.
- **Test runs are snapshots.** A `run_snapshot_cases` row freezes title, steps, parameters, data rows, and version at run creation. Editing the live `test_cases` row later doesn't reach back.
- **Parameterized executions are 1-per-row.** Each `test_case_data_rows` produces its own `test_executions` (with `data_row_index`).
- **Init slices to non-nil.** Go nil slices encode as JSON `null`. The UI iterates over arrays, so the Go store always returns `[]X{}` not `nil`. If you add a new list endpoint, do the same.
- **No emoji in UI copy** unless the user explicitly asks.

## Seeding and the importer

The seed CLI is **idempotent by default**. Running it against a populated database does nothing unless you pass `--wipe` (deletes the Acme/Internal demo projects only) or `--wipe-all` (truncates every table — for the test database only).

The Playwright `globalSetup` does **not** invoke the seed unless `PW_RESEED` is set. This means user-imported data (e.g. an FP project from `import-testiny`) is **never** wiped by running tests.

The Testiny importer (`backend/cmd/import-testiny`) preserves the full folder structure of the source export. Folder paths like `"Demo Project > Module A > Drafts"` become three nested folders. No flattening, no project-name root-drop heuristics — the importer is faithful and the test fixture lives at `backend/internal/importer/testdata/fixture.xlsx`.

## How to add a feature

1. **Schema change?** Add a numbered file in `backend/internal/db/migrations/`. The migration runner picks them up on next server start.
2. **Domain shape?** Add or extend a struct in `backend/internal/domain/types.go`. Mirror the JSON tags on the TS side in `src/lib/api.ts`.
3. **Backend logic** — add a method on `*store.Store`, then a handler in `backend/internal/api/handlers.go`, then a route in `router.go`.
4. **API client** — add a function on the `api` object in `src/lib/api.ts`. Do **not** call `fetch` directly elsewhere.
5. **UI** — server component for reads, client component for interactivity. Use `src/components/ui/`. Add `data-testid` attributes when adding new flows so Playwright can target them.
6. **Audit** — write to the `audit_logs` table from the store layer for any user-visible mutation.
7. **Test** — add a Playwright test in `tests/e2e/` and run `npm run e2e`.

## AI seams (v2 onward)

Even though v1 ships with no AI features, the architecture is *designed* for them. See `docs/AGENTS_AI_DESIGN.md` for the full plan. In short:

- **Test case authoring assist.** Generate steps from a one-line title.
- **Automation candidates ranking.** `store.ProjectReport` already computes a heuristic; swap to a model.
- **Failure clustering.** `test_executions.comments` + `jira_defect_keys` are the inputs.
- **Natural-language search.** `/cases` accepts URL filters (`q`, `priority`, `folder`...); an LLM can parse `?nl=` into them.
- **Stale-automation triage.** `automation_last_reviewed_at` is the trigger.

When you add an AI feature: keep the model call behind a thin Go module (`backend/internal/ai/<feature>/...`), pass typed inputs, return typed outputs, never let raw model strings reach the database. Always log to `audit_logs` with `action: "ai.<feature>"`.

## Things to avoid

- Don't enable Next.js `cacheComponents`. The data is dynamic per-mutation; explicit `dynamic = "force-dynamic"` per page is intentional.
- Don't reach for `prisma`, `drizzle`, or any other ORM. The Go service is the single source of truth.
- Don't introduce a state-management library (Redux, Zustand, etc.). Server actions + URL state cover everything.
- Don't add a custom field system to test cases. v1 is intentionally not configurable per-project.
- Don't call the seed CLI with `--wipe` or `--wipe-all` against a database that has user data.

## Useful commands

```sh
# Database
docker compose up -d postgres
docker compose down

# Backend
cd backend
go run ./cmd/server                       # API on :4000 (auto-applies migrations)
go run ./cmd/seed                         # idempotent demo seed
go run ./cmd/import-testiny --xlsx FILE --project-key KEY --apply

# Frontend
npm run dev                               # next dev on :3000

# Tests
npm run e2e                               # Playwright golden paths
npm run e2e:demo                          # records video into docs/media/
PW_RESEED=1 npm run e2e                   # force-seed before running
```
