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

- **Projects → Folders → Test Cases** hierarchy. Folders are a recursive tree of arbitrary depth (rendered as a Testiny-style sidebar with rolled-up case counts).
- Full test-case authoring: steps, preconditions, classification, **automation metadata**, parameterized data sets, tags, Jira links, change history.
- **Testiny .xlsx importer** that preserves the full folder structure of an export (`backend/cmd/import-testiny`).
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

# 2. Go API + migrations
cd backend
go run ./cmd/server           # auto-applies migrations, listens on :4000

# 3. (optional) seed demo data — idempotent, only runs if demos are missing
go run ./cmd/seed             # creates Acme Storefront + Acme Internal Tools

# 4. (optional) import a Testiny .xlsx export
go run ./cmd/import-testiny --xlsx /path/to/export.xlsx \
    --project-key DEMO --create-project --project-name "Demo Project" --apply

# 5. Next.js (in another shell)
cd ..
npm install
npm run dev                   # http://localhost:3000
```

## npm scripts

| script | what |
| --- | --- |
| `npm run dev` | Start Next.js on :3000 |
| `npm run db:up` | Bring up Postgres in Docker |
| `npm run api` | Start the Go API on :4000 |
| `npm run seed` | Idempotently create the demo projects (no-op if present) |
| `npm run lint` | ESLint (incl. architecture boundary rules) |
| `npm run test:go` | Run the full Go test suite (`-p 1`) |
| `npm run test:go:race` | Same with the data-race detector (needs CGO) |
| `npm run test:go:cover` | Same with coverage profile |
| `npm run e2e` | Playwright golden-paths |
| `npm run e2e:demo` | Record `docs/media/demo-tour.webm` |
| `npm test` | lint → Go → Playwright (the everything button) |

## Seed safety

The seed CLI defaults to **idempotent, non-destructive** mode. Running it against a database that already has the demo projects is a no-op:

```sh
go run ./cmd/seed              # default: no-op if demos exist
go run ./cmd/seed --wipe       # delete + re-create Acme/Internal only
go run ./cmd/seed --wipe-all   # DANGEROUS: truncate every table (test DB only)
```

The Playwright `globalSetup.ts` does **not** run the seed by default. Set `PW_RESEED=1`, `PW_RESEED=wipe`, or `PW_RESEED=wipe-all` to opt in.

## Importer

`backend/cmd/import-testiny` ingests a Testiny `.xlsx` export and creates a faithful folder tree, one folder per `>`-separated path segment. It maps Testiny's type/priority/status onto Verify's enums (full mapping in `internal/importer/mappers.go`). Default mode is dry-run; pass `--apply` to write.

```sh
go run ./cmd/import-testiny --xlsx export.xlsx --project-key X
go run ./cmd/import-testiny --xlsx export.xlsx --project-key X --apply
go run ./cmd/import-testiny --xlsx export.xlsx --project-key X --create-project --project-name "New project" --apply
```

A synthetic xlsx fixture at `backend/internal/importer/testdata/fixture.xlsx` exercises every parser branch and is the basis for the importer + folder-tree tests.

## Tests

The suite is designed so big changes are safe:

- **Migration tests** assert the schema shape and that migrations are idempotent.
- **Store integration tests** hit a real `verify_test` Postgres and cover every store method, including audit-log writes.
- **HTTP handler tests** exercise every route with `httptest`.
- **API contract test** does a full round-trip across every entity — catches field-renames before the UI sees them.
- **Importer tests** cover the folder parser, type/priority mappers, step parser, end-to-end driver against the fixture xlsx.
- **Architecture-boundary tests** enforce the rules in `docs/ARCHITECTURE.md` (handlers don't import pgx, store doesn't import http, only `src/lib/api.ts` calls `fetch`, etc.).
- **Playwright** runs golden user paths + the importer flow + the folder tree sidebar.

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

- `backend/internal/db/migrations/` — schema (Postgres dialect)
- `backend/internal/store/store.go` — every SQL query
- `backend/internal/api/router.go` — REST surface
- `backend/internal/importer/` — Testiny xlsx importer (parsers, driver, fixture)
- `backend/cmd/import-testiny/main.go` — importer CLI
- `backend/cmd/seed/main.go` — demo seed CLI (idempotent by default)
- `src/lib/api.ts` — typed client used by every Next.js page
- `src/components/projects/FolderTree.tsx` — Testiny-style folder sidebar
- `src/app/projects/[projectId]/` — per-project routes
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
- Search is URL-driven (`q`, `tag`, `priority`, `folder`...) so a `nl=` query can be parsed by an LLM into structured filters.
- Every mutation goes through one of two typed paths (Go HTTP handler or Next.js Server Action), so model-driven actions get the same validation path.

The full plan lives in [`docs/AGENTS_AI_DESIGN.md`](docs/AGENTS_AI_DESIGN.md).
