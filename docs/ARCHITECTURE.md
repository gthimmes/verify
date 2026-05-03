# Architecture

Verify is a two-process system:

- A **Go HTTP service** that owns the schema, validation, and business logic. It exposes a versioned REST API at `/api/v1`.
- A **Next.js app** that renders the UI. Server Components fetch from the Go API. Server Actions Zod-validate form input and proxy to the same API.

There is no shared database connection between the two. The Next.js process does not depend on `pg`, `prisma`, or any other Postgres client. If you swap the UI tomorrow (mobile app, CLI, another web framework) the API contract is the only thing you have to honor.

This document captures the load-bearing decisions. For *how to add a feature* read [AGENTS.md](../AGENTS.md). For *what's coming* read [ROADMAP.md](./ROADMAP.md).

## Domain model

```
User ─┐
      ├── project_members ─── projects ── areas ── features ── test_cases ── test_steps
      │                                                            │       ── test_case_params
      │                                                            │       ── test_case_data_rows
      │                                                            │       ── test_case_tags ── tags
      │                                                            │       ── test_case_versions
      │                       │
      │                       └── test_runs ── run_snapshot_cases ── test_executions ── execution_attempts
      └── audit_logs
```

Highlights:

- **Public IDs** are derived: `{projects.key}-{areas.key}-{test_cases.sequence_num padded to 4}`. The sequence is **project-scoped**, the area code is a hint baked into the ID.
- **Soft delete** lives only on `projects` and `test_cases`. Areas, features, runs, and executions use archive flags or status fields.
- **Run snapshot** is the most-important shape decision. `run_snapshot_cases.snapshot_json` is a frozen `jsonb` of `{steps, parameters, dataRows}` at the moment the run was created. The corresponding case version is recorded so we can reconstruct *which* version was tested. Live edits to a `test_cases` row never reach back into a run.
- **Parameterized executions are 1-per-row.** `test_executions.data_row_index` (nullable) is unique per `(run, snapshot_case, data_row_index)` thanks to a partial unique index that also keeps the no-row variant unique.
- **Audit** rows are write-only and live in their own table. They aren't joined into the read paths — they're surfaced via a dedicated /admin view.
- **JSON columns** are `jsonb`, not `json`. The few queries that aggregate snapshot data use `jsonb_build_object` to construct payloads server-side and return them as a single column to the Go store.

## Request lifecycle

A typical mutation:

1. User submits a form in a Server or Client Component.
2. Form posts to a Server Action (`src/app/actions/<entity>.ts`).
3. The action Zod-parses the form, then calls `api.x(...)` — a function in `src/lib/api.ts` that does `fetch` against the Go service.
4. The Go handler decodes JSON, calls a method on `*store.Store`, runs SQL inside a `pgx.Tx` when more than one write is involved, writes an `audit_logs` row, and returns a typed response.
5. The Server Action calls `revalidatePath(...)` for every page that shows the data and either returns a `FormState` or `redirect`s the client.
6. Next.js re-renders the affected pages on next navigation.

Reads avoid Next.js's `cacheComponents`. Every page that shows mutable data has `export const dynamic = "force-dynamic"` so revalidation is unambiguous and the Go service is hit every time.

## Module layout

### Go service

```
backend/
├── cmd/
│   ├── server/main.go              # HTTP entrypoint
│   └── seed/main.go + fixtures.go  # demo data CLI
└── internal/
    ├── api/
    │   ├── router.go               # chi mounting, middleware, decode/encode helpers
    │   └── handlers.go             # every HTTP handler in one file
    ├── db/
    │   ├── db.go                   # connect + embedded migration runner
    │   └── migrations/0001_init.sql
    ├── domain/types.go             # JSON request/response shapes
    └── store/store.go              # every query, transaction-aware
```

The single rule: **the API is the surface; the store is the implementation.** Handlers don't write SQL, the store doesn't speak HTTP, and `domain` is just shared shapes.

### Next.js app

```
src/
├── app/
│   ├── layout.tsx                  # global shell
│   ├── actions/                    # Server Actions (mutations)
│   ├── page.tsx, runs/, search/, admin/
│   └── projects/[projectId]/...
├── components/
│   ├── shell/, ui/                 # primitives
│   ├── projects/, runs/, testcases/ # feature-scoped components
└── lib/
    ├── api.ts                      # the *only* place that calls the Go API
    ├── auth.ts                     # UI-only current-user stub
    └── utils.ts
```

`src/lib/api.ts` is intentionally the chokepoint. Everywhere else in `src/` should import the typed `api` object from there. If a new screen needs data not yet exposed by the Go service, the right move is to add an endpoint, then add an `api.x()` method, then write the screen — never `fetch('http://localhost:4000/...')` from a page directly.

## Why these choices

- **No tRPC, no shared TypeScript types.** Manually keeping `domain/types.go` aligned with `src/lib/api.ts` is a tiny tax. In return, the API is consumable from anything (curl, mobile, another team's CLI) without a TS toolchain.
- **No ORM in Go.** Raw SQL is short and obvious here. `pgx` gives us strong types via Scan. The schema fits in one file; an ORM would add ceremony without insight.
- **No state library on the client.** Forms drive their own state with `useState` and `useActionState`. Server-rendered pages drive everything else. URL search params hold filters and pagination. There is nothing global that would justify Zustand or Redux.
- **No background workers.** v1 has no scheduled work. When v2 brings notifications or automation execution, the right place is a separate Go binary in `backend/cmd/<job>/main.go`.
- **Postgres + Docker Compose.** SQLite was good for the first prototype; Postgres scales further, supports `jsonb`, and matches what production usually looks like. `docker-compose.yml` is the local-dev contract.
- **Hand-rolled UI primitives.** The components we need are small. shadcn would also be fine; the API surface here mirrors shadcn's so a swap is mechanical.

## Performance shape

- List endpoints cap at ~200 rows by default. The UI paginates by re-querying with stricter filters. A real cursor API ships when we hit the limit in practice.
- The `/projects/{id}/report` endpoint is the heaviest read — it groups every execution for the project and joins back to live cases. Still well under a second on the seed.
- Mutations all use `pgx.Tx` for multi-write paths to keep races out.
- The Test Case form ships a meaningful amount of JS because it's interactive (steps reorder, params add/remove, data rows). Still under 50KB gzipped.

## Boundaries and how they're enforced

The architecture relies on a small number of invariants. Convention alone won't keep them true forever — each invariant below has a corresponding automated check that fails when violated, so a regression shows up as a red CI build, not a runtime crash three months later.

| Invariant | Enforced by |
|---|---|
| The API is the surface; the store is the implementation. | `internal/architecture/boundaries_test.go::TestRule_apiPackageDoesNotImportPgxOrEmbedSQL` — fails if a handler imports pgx or embeds SQL. |
| The store doesn't speak HTTP. | Same file, `TestRule_storeDoesNotImportHTTP` — fails if `internal/store` imports `net/http` or chi. |
| DDL (create/drop/truncate) lives only in `internal/db` (migrations), `cmd/seed`, and `internal/testutil`. | Same file, `TestRule_ddlIsConfinedToMigrationsAndSeed`. |
| Every user-visible mutation writes to `audit_logs`. | Same file, `TestRule_storeWritesAuditForCoreMutations` — checks store.go names every required `action` constant. |
| The Postgres schema matches the canonical list. | `internal/db/db_test.go::TestMigrate_appliesEverySchemaTable` — diffs the live schema against `expectedTables`. |
| Migrations are idempotent. | `internal/db/db_test.go::TestMigrate_isIdempotent`. |
| Critical partial-unique indexes on `test_executions` exist (the parameterized-execution invariant). | `internal/db/db_test.go::TestMigrate_partialUniqueIndexesPresent`. |
| The Next.js app never opens a DB connection. | `eslint.config.mjs` — `no-restricted-imports` blocks `pg`, `better-sqlite3`, `@prisma/*` from `src/`. |
| `src/lib/api.ts` is the only place that calls `fetch()`. | `eslint.config.mjs` — `no-restricted-globals` on every other file in `src/`. |
| Server Actions are the only mutation entry on the UI side. | Convention + the rule above (no other place can post to the API). |

These tests live next to the code they constrain, run on every push (see `.github/workflows/ci.yml`), and read like documentation when you open them. When the architecture *should* change, change the test first; the rules will then guide the diff.

## Test surface

The full test inventory:

| Layer | Where | What it covers |
|---|---|---|
| Migration | `backend/internal/db/db_test.go` | schema shape, idempotency, required indexes |
| Store integration | `backend/internal/store/*_test.go` | every store method against a real Postgres (`verify_test` DB), including audit-log writes, soft delete + restore, snapshot semantics, attempt history |
| HTTP handlers | `backend/internal/api/handlers_test.go` | per-route status + body smoke via `httptest` |
| API contract | `backend/internal/api/contract_test.go` | one full round-trip across every entity (project → area → feature → case → run → execution → report → clone → re-run → soft-delete) — fails first if any field disappears |
| Architecture rules | `backend/internal/architecture/boundaries_test.go` | structural invariants from the table above |
| API contract from UI side | `tests/e2e/api-contract.spec.ts` | Playwright hits the Go API directly and asserts every field `src/lib/api.ts` types depend on |
| E2E golden paths | `tests/e2e/golden-paths.spec.ts` | home → project → cases → run → execute → reports → search |
| Demo tour (recorded video) | `tests/e2e/demo-tour.spec.ts` | guided walkthrough that produces `docs/media/demo-tour.webm` |
| Lint | `eslint.config.mjs` + `go vet` | style + boundary rules |

How to run them locally:

```sh
docker compose up -d postgres            # required for Go tests
docker exec verify-postgres psql -U verify -d verify -c "create database verify_test;" # one-time
cd backend && make test                  # go vet + go test -p 1 -race ./...
cd .. && npm run lint && npm run e2e     # ESLint + Playwright

# Or, the lot:
npm test
```

CI runs the same three jobs (Go, Next.js, Playwright) and uploads coverage + traces on failure.

### Why packages run with `-p 1`

`internal/store` and `internal/api` both connect to the `verify_test` database and call `truncate ... cascade` between tests. Go's default behaviour runs *packages* in parallel, which causes those truncates to race. `-p 1` serializes packages while still running tests inside a package serially. The cost is a few seconds; the benefit is a deterministic suite.

If we ever need parallelism, the right move is one schema (or one DB) per package — the Reset helper already centralizes the truncation logic, so the swap would be local.

## What's intentionally not done in v1

- Real auth (the user is mocked).
- Email/Slack notifications.
- File attachments (the schema design exists; no upload UI).
- Templates UI.
- BDD / Gherkin authoring.
- Multi-org tenancy.
- WebSocket-driven live progress on the run-execution page.

These are listed in [ROADMAP.md](./ROADMAP.md) with rough order.
