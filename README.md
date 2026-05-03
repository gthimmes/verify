# Verify

A lightweight test-case management system for organizing, executing, and tracking **manual** test cases. Verify also tracks which cases are automated, in what framework, and where they live so teams can see coverage and decide what to automate next.

> **v1 is manual-only.** Automated tests run in their existing CI pipelines. Verify is the system of record for the manual catalog and execution history. The schema is shaped so v2 can run automated tests directly without rework.

## Architecture

```
┌──────────────────┐    HTTP/JSON    ┌──────────────────────┐    SQL    ┌──────────────┐
│  Next.js (UI)    │ ──────────────▶ │  Go API (chi + pgx)  │ ────────▶ │  Postgres 16 │
│  port 3000       │                  │  port 4000           │           │  port 5432   │
└──────────────────┘                  └──────────────────────┘           └──────────────┘
```

The Go service owns all data and validation. The Next.js app is a thin BFF: server components fetch from `/api/v1/...` and server actions proxy form posts back to the same endpoints.

## What's in v1

- Projects → Areas → Features → Test Cases hierarchy with auto-generated public IDs (`ACM-PAY-0042`).
- Full test-case authoring: steps, preconditions, classification, **automation metadata**, parameterized data sets, tags, Jira links, change history.
- Test runs as **frozen snapshots** of selected cases at a moment in time. Re-run failed subsets. Clone runs. Track environment, build, milestone.
- Test execution UI with quick pass/fail/blocked/skipped, comments, defect linking, attempt history, full step rendering with `{{parameter}}` interpolation.
- Reports: automation candidates (ranked), coverage by area, top-failing, stale automation metadata, stale manual cases.
- Global search across IDs, titles, descriptions, steps, and tags.
- Audit log of every mutating action.

## Stack

- **Frontend**: Next.js 16 (App Router, Server Components, Server Actions), TypeScript strict, Tailwind v4
- **Backend**: Go 1.26 with chi (router) and pgx/v5 (Postgres driver)
- **Database**: Postgres 16 (Docker)
- **Tests**: Playwright + video

## Quick start

```sh
# 1. Postgres
docker compose up -d postgres

# 2. Go API + migrations + seed
cd backend
go run ./cmd/seed     # also runs migrations
go run ./cmd/server   # listens on :4000

# 3. Next.js (in another shell)
cd ..
npm install
npm run dev           # http://localhost:3000
```

The seed creates two projects (`Acme Storefront`, `Acme Internal Tools`), 27 test cases (some parameterized), and four runs (one completed, one in progress, one draft, one for the internal project). Open the home page and click around — every link should work and tell a story.

## npm scripts

| script | what |
| --- | --- |
| `npm run dev` | Start Next.js on :3000 |
| `npm run db:up` | Bring up Postgres in Docker |
| `npm run api` | Start the Go API on :4000 |
| `npm run seed` | Wipe + reseed the database |
| `npm run lint` | ESLint (incl. architecture boundary rules) |
| `npm run test:go` | Run the full Go test suite (`-p 1 -race`) |
| `npm run test:go:cover` | Same with coverage profile |
| `npm run e2e` | Playwright golden-paths |
| `npm run e2e:demo` | Record `docs/media/demo-tour.webm` |
| `npm test` | lint → Go tests → Playwright (the everything button) |

## Tests

The suite is designed so big changes are safe:

- **Migration tests** assert the schema shape and that migrations are idempotent.
- **Store integration tests** hit a real `verify_test` Postgres and cover every store method, including audit-log writes.
- **HTTP handler tests** exercise every route with `httptest`.
- **API contract test** does a full round-trip across every entity — catches field-renames before the UI sees them.
- **Architecture-boundary tests** enforce the rules in `docs/ARCHITECTURE.md` (handlers don't import pgx, store doesn't import http, only `src/lib/api.ts` calls `fetch`, etc.).
- **Playwright** runs the golden user paths and the API contract from the UI side. A `globalSetup` re-seeds the DB before every run.

One-time setup:
```sh
docker compose up -d postgres
docker exec verify-postgres psql -U verify -d verify \
  -c "create database verify_test;"
```

Then:
```sh
npm test
```

CI runs the same checks on every push — see `.github/workflows/ci.yml`.

## Where to look in the source

- `backend/internal/db/migrations/0001_init.sql` — full schema (Postgres dialect)
- `backend/internal/store/store.go` — every SQL query
- `backend/internal/api/router.go` — REST surface
- `backend/cmd/seed/main.go` — demo seeder
- `src/lib/api.ts` — typed client used by every Next.js page
- `src/app/projects/[projectId]/` — per-project routes
- `src/components/runs/ExecutionRow.tsx` — the test-execution unit
- `src/components/testcases/TestCaseForm.tsx` — the test-case authoring form
- `docs/spec.md` — the product spec this implementation traces to
- `docs/ARCHITECTURE.md` — how the system fits together
- `docs/ROADMAP.md` — what's next, including AI features
- `docs/AGENTS_AI_DESIGN.md` — the AI seams reserved for v2
- `AGENTS.md` — agent-facing rules for working in this repo

## Why "AI-driven" with no AI features

The user asked for an AI-driven application but explicitly without AI features for v1. The interpretation: build the foundation so AI features slot in without rework. Concretely:

- Steps and expected results are first-class fields, not blobs of markdown — generators and graders can target them.
- Automation candidates use a deterministic score; replacing it with a model is a one-line swap in `backend/internal/store/store.go`.
- The execution model carries comments + linked defects, which are the natural input to a failure-clustering pipeline.
- Search is URL-driven (`q`, `tag`, `priority`...) so a `nl=` query can be parsed by an LLM into structured filters.
- Every mutation goes through one of two typed paths (Go HTTP handler or Next.js Server Action), so model-driven actions get the same validation path.

The full plan lives in [`docs/AGENTS_AI_DESIGN.md`](docs/AGENTS_AI_DESIGN.md).
