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
backend/                           # Go service
├── cmd/server/main.go              # HTTP entrypoint (:4000)
├── cmd/seed/main.go                # demo data CLI
│   └── fixtures.go                 # the actual seed data
├── internal/
│   ├── api/router.go               # chi setup, middleware
│   ├── api/handlers.go             # every HTTP handler in one file
│   ├── db/db.go                    # connect + migration runner
│   ├── db/migrations/0001_init.sql # canonical schema
│   ├── domain/types.go             # request/response shapes
│   └── store/store.go              # every SQL query
├── go.mod / go.sum

src/                                # Next.js (UI only)
├── app/
│   ├── layout.tsx                  # global shell
│   ├── page.tsx                    # /  — projects list
│   ├── runs/page.tsx               # cross-project active runs
│   ├── search/page.tsx             # global search
│   ├── admin/page.tsx              # cross-project rollups + audit log
│   ├── actions/                    # Server Actions — proxy to Go API
│   │   ├── projects.ts
│   │   ├── areas.ts
│   │   ├── features.ts
│   │   ├── testCases.ts
│   │   ├── testRuns.ts
│   │   └── executions.ts
│   └── projects/[projectId]/...    # per-project routes
├── components/
│   ├── shell/CommandKLink.tsx      # ⌘K shortcut
│   ├── ui/                         # primitives
│   ├── projects/                   # project-level dialogs and menus
│   ├── testcases/TestCaseForm.tsx  # client form with steps + params + data rows
│   └── runs/                       # NewRunForm, RunStatusActions, ExecutionRow
└── lib/
    ├── api.ts                      # the only place that fetches the Go API
    ├── auth.ts                     # current-user stub (UI only)
    └── utils.ts                    # cn, formatDate, etc.

docs/
├── spec.md                         # original product spec
├── ARCHITECTURE.md                 # how the system fits together
├── ROADMAP.md                      # v1 → v2 roadmap
├── AGENTS_AI_DESIGN.md             # the AI seams
└── media/demo-tour.webm            # latest recorded demo

tests/e2e/                          # Playwright golden-path tests
docker-compose.yml                  # Postgres 16
playwright.config.ts
```

## Conventions

- **All persistence lives in Go.** The Next.js app **never** opens a database connection. If you find yourself reaching for `pg`, `prisma`, or `better-sqlite3` in `src/`, stop — extend the Go API and call it from `src/lib/api.ts` instead.
- **Server Actions are thin proxies.** Files in `src/app/actions/*.ts` Zod-validate input and forward to the matching Go endpoint. They're allowed to do `revalidatePath` and `redirect` after the API call returns. They are not allowed to do business logic.
- **Reads happen in Server Components.** Pages `await api.x(...)`. No useEffect-fetching from client components.
- **Public test IDs are stable, project-scoped.** Format `{PROJECT_KEY}-{AREA_KEY}-{4-digit-seq}`. The sequence is project-level, not area-level.
- **Soft delete is `deleted_at`.** Default queries filter it out. Restore by nulling.
- **Test runs are snapshots.** A `run_snapshot_cases` row freezes title, steps, parameters, data rows, and version at run creation. Editing the live `test_cases` row later doesn't reach back.
- **Parameterized executions are 1-per-row.** Each `test_case_data_rows` produces its own `test_executions` (with `data_row_index`).
- **Init slices to non-nil.** Go nil slices encode as JSON `null`. The UI iterates over arrays, so the Go store always returns `[]X{}` not `nil`. If you add a new list endpoint, do the same.
- **No emoji in UI copy** unless the user explicitly asks.

## How to add a feature

1. **Schema change?** Add a numbered file in `backend/internal/db/migrations/` (e.g. `0002_add_attachments.sql`). The migration runner picks them up automatically on next server start.
2. **Domain shape?** Add or extend a struct in `backend/internal/domain/types.go`. Mirror the JSON tags on the TS side in `src/lib/api.ts`.
3. **Backend logic** — add a method on `*store.Store`, then a handler in `backend/internal/api/handlers.go`, then a route in `router.go`.
4. **API client** — add a function on the `api` object in `src/lib/api.ts`. Do **not** call `fetch` directly elsewhere.
5. **UI** — server component for reads, client component for interactivity. Use `src/components/ui/`. Add `data-testid` attributes when adding new flows so Playwright can target them.
6. **Audit** — write to the `audit_logs` table from the store layer for any user-visible mutation.
7. **Test** — add a Playwright test in `tests/e2e/` and run `npm run e2e`.

## AI seams (v2 onward)

Even though v1 ships with no AI features, the architecture is *designed* for them. See `docs/AGENTS_AI_DESIGN.md` for the full plan. In short:

- **Test case authoring assist.** Generate steps from a one-line title. Hook point: `actions/testCases.ts::draftFromPrompt(prompt)` calling a `internal/ai/draftcase` Go package. The form already supports edit-on-save so a draft can be pre-filled.
- **Automation candidates ranking.** `store.ProjectReport` already computes a heuristic score. The UI shows it; replacing the score with a model-based ranking is one function swap.
- **Failure clustering.** `test_executions.comments` + `jira_defect_keys` are the inputs. Add a `test_execution_embeddings` table when ready.
- **Natural-language run filter.** `/cases` accepts URL filters; an LLM can parse `?nl=` into the same filter URL.
- **Stale-automation triage.** `automation_last_reviewed_at` is the trigger; an agent can diff the referenced source against the case definition.

When you add an AI feature: keep the model call behind a thin Go module (`backend/internal/ai/<feature>/...`), pass typed inputs, return typed outputs, never let raw model strings reach the database. Always log to `audit_logs` with `action: "ai.<feature>"`.

## Things to avoid

- Don't enable Next.js `cacheComponents`. The data is dynamic per-mutation; explicit `dynamic = "force-dynamic"` per page is intentional.
- Don't reach for `prisma`, `drizzle`, or any other ORM. The Go service is the single source of truth.
- Don't introduce a state-management library (Redux, Zustand, etc.). Server actions + URL state cover everything.
- Don't add a custom field system to test cases. v1 is intentionally not configurable per-project.

## Useful commands

```sh
# Database
docker compose up -d postgres
docker compose down

# Backend
cd backend
go run ./cmd/server          # API on :4000 (auto-applies migrations)
go run ./cmd/seed            # wipes and reseeds demo data

# Frontend
npm run dev                  # next dev on :3000

# Tests
npm run e2e                  # Playwright golden paths
npm run e2e:demo             # records video into docs/media/
```
