# Architecture

Verify is a two-process system:

- A **Go HTTP service** that owns the schema, validation, and business logic. It exposes a versioned REST API at `/api/v1`.
- A **Next.js app** that renders the UI. Server Components fetch from the Go API. Server Actions Zod-validate form input and proxy to the same API.

There is no shared database connection between the two. The Next.js process does not depend on `pg`, `prisma`, or any other Postgres client. If you swap the UI tomorrow (mobile app, CLI, another web framework) the API contract is the only thing you have to honor.

This document captures the load-bearing decisions. For *how to add a feature* read [AGENTS.md](../AGENTS.md). For *what's coming* read [ROADMAP.md](./ROADMAP.md).

## Domain model

```
User ─┐
      ├── project_members ─── projects ── folders (recursive: self-FK parent_id)
      │                            │           │
      │                            │           └── test_cases ── test_steps
      │                            │                       ── test_case_params
      │                            │                       ── test_case_data_rows
      │                            │                       ── test_case_tags ── tags
      │                            │                       ── test_case_versions
      │                            │
      │                            └── test_runs ── run_snapshot_cases ── test_executions ── execution_attempts
      └── audit_logs
```

The **folders** table is a recursive tree: each row optionally points at a parent (`parent_id` self-FK), unique-per-parent name. Imported Testiny paths fan out into one folder per segment. Legacy `areas` and `features` tables still exist for backwards compatibility with code that hasn't migrated yet, but no new screen should reference them.

Highlights:

- **Public IDs** are derived: `{projects.key}-{areas.key}-{test_cases.sequence_num padded to 4}`. The sequence is **project-scoped**, the area-like code is a hint baked into the ID. (Areas live on as the test_case_id prefix even though the canonical hierarchy is folders — keeps existing imports stable.)
- **Soft delete** lives only on `projects` and `test_cases`.
- **Run snapshot** is the most-important shape decision. `run_snapshot_cases.snapshot_json` is a frozen `jsonb` of `{steps, parameters, dataRows}` at run creation. The corresponding case version is recorded so we can reconstruct *which* version was tested. Live edits to a `test_cases` row never reach back into a run.
- **Parameterized executions are 1-per-row.** `test_executions.data_row_index` is unique per `(run, snapshot_case, data_row_index)` via partial unique indexes that also keep the no-row variant unique.
- **Audit** rows are write-only and live in their own table. Surfaced at /admin.
- **JSON columns** are `jsonb`. The few queries that aggregate snapshot data use `jsonb_build_object` server-side.

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
│   ├── seed/main.go + fixtures.go  # demo data CLI (idempotent by default)
│   └── import-testiny/main.go      # Testiny xlsx importer CLI
└── internal/
    ├── api/
    │   ├── router.go               # chi mounting, middleware, decode/encode helpers
    │   └── handlers.go             # every HTTP handler in one file
    ├── db/
    │   ├── db.go                   # connect + embedded migration runner
    │   ├── migrations/0001_init.sql
    │   └── migrations/0002_folders.sql
    ├── domain/types.go             # JSON request/response shapes
    ├── importer/                   # Testiny xlsx parser + apply driver
    │   ├── folder.go               # path → segments + status (DEPRECATED detection)
    │   ├── mappers.go              # Testiny type / priority → Verify enums
    │   ├── steps.go                # parse `[N]` scenario blocks
    │   ├── reader.go               # xlsx → typed rows
    │   ├── driver.go               # PlanRows + Apply (write to store)
    │   ├── report.go               # human-readable dry-run report
    │   └── testdata/fixture.xlsx   # synthetic fixture used by every test
    ├── store/store.go              # every query, transaction-aware
    └── testutil/testutil.go        # test DB pool + per-test reset
```

The single rule: **the API is the surface; the store is the implementation.** Handlers don't write SQL, the store doesn't speak HTTP, and `domain` is just shared shapes.

### Next.js app

```
src/
├── app/
│   ├── layout.tsx                  # global shell
│   ├── actions/                    # Server Actions (mutations)
│   ├── page.tsx, runs/, search/, admin/
│   └── projects/[projectId]/
│       └── cases/                  # cases page renders FolderTree on the left
├── components/
│   ├── shell/, ui/                 # primitives
│   ├── projects/                   # FolderTree sidebar + area/feature dialogs
│   ├── runs/, testcases/           # feature-scoped components
└── lib/
    ├── api.ts                      # the *only* place that calls the Go API
    ├── auth.ts                     # UI-only current-user stub
    └── utils.ts
```

`src/lib/api.ts` is intentionally the chokepoint. Everywhere else in `src/` should import the typed `api` object from there.

## Why these choices

- **No tRPC, no shared TypeScript types.** Manually keeping `domain/types.go` aligned with `src/lib/api.ts` is a tiny tax. In return, the API is consumable from anything (curl, mobile, another team's CLI) without a TS toolchain.
- **No ORM in Go.** Raw SQL is short and obvious here. `pgx` gives us strong types via Scan. The schema fits in two files; an ORM would add ceremony without insight.
- **No state library on the client.** Forms drive their own state with `useState` and `useActionState`. Server-rendered pages drive everything else. URL search params hold filters and pagination.
- **No background workers.** v1 has no scheduled work. When v2 brings notifications or automation execution, the right place is a separate Go binary in `backend/cmd/<job>/main.go`.
- **Postgres + Docker Compose.** SQLite was good for the first prototype; Postgres scales further, supports `jsonb`, and matches what production usually looks like.
- **Hand-rolled UI primitives.** The components we need are small.

## Seed safety and test isolation

The seed CLI (`backend/cmd/seed`) is **idempotent and non-destructive by default**. It only creates the Acme/Internal demo projects if they're missing; it never touches unrelated data. Flags:

| flag | behaviour |
| --- | --- |
| (no flag) | skip if demos already exist; else create them |
| `--wipe` | delete the Acme/Internal demo projects only, then re-create |
| `--wipe-all` | truncate every table in the database (test DB only) |

The Playwright `globalSetup` does **not** invoke the seed unless `PW_RESEED` is set. This means user-imported data (e.g. from `import-testiny`) is never wiped by routine test runs.

The Go test suite uses a separate `verify_test` database and calls `testutil.Reset` per test, which truncates every table. Tests are run with `-p 1` (one package at a time) so packages don't race each other against the shared test database.

## Boundaries and how they're enforced

The architecture relies on a small number of invariants. Convention alone won't keep them true forever — each invariant below has an automated check that fails when violated.

| Invariant | Enforced by |
|---|---|
| The API is the surface; the store is the implementation. | `internal/architecture/boundaries_test.go::TestRule_apiPackageDoesNotImportPgxOrEmbedSQL` |
| The store doesn't speak HTTP. | `TestRule_storeDoesNotImportHTTP` |
| DDL lives only in `internal/db` (migrations), `cmd/seed`, and `internal/testutil`. | `TestRule_ddlIsConfinedToMigrationsAndSeed` |
| Every user-visible mutation writes to `audit_logs`. | `TestRule_storeWritesAuditForCoreMutations` |
| Postgres schema matches the canonical list. | `internal/db/db_test.go::TestMigrate_appliesEverySchemaTable` |
| Migrations are idempotent. | `TestMigrate_isIdempotent` |
| Critical partial-unique indexes on `test_executions`. | `TestMigrate_partialUniqueIndexesPresent` |
| The Next.js app never opens a DB connection. | `eslint.config.mjs` — `no-restricted-imports` |
| `src/lib/api.ts` is the only place that calls `fetch()`. | `eslint.config.mjs` — `no-restricted-globals` |
| Server Actions are the only mutation entry on the UI side. | Convention + the rule above |

When the architecture *should* change, change the test first; the rules will then guide the diff.

## Test surface

| Layer | Where | What it covers |
|---|---|---|
| Migration | `backend/internal/db/db_test.go` | schema shape, idempotency, required indexes |
| Store integration | `backend/internal/store/*_test.go` | every store method, including audit-log writes, soft delete + restore, snapshot semantics, attempt history, folder tree rollup |
| HTTP handlers | `backend/internal/api/handlers_test.go` | per-route status + body smoke via `httptest` |
| API contract | `backend/internal/api/contract_test.go` | one full round-trip across every entity |
| Type-enum contract | `backend/internal/api/type_enum_test.go` | every supported case `type` value round-trips |
| Architecture rules | `backend/internal/architecture/boundaries_test.go` | structural invariants |
| Importer parsers | `backend/internal/importer/{folder,mappers,steps,reader}_test.go` | each parser branch + edge cases |
| Importer driver | `backend/internal/importer/driver_test.go` | plan + apply against the fixture xlsx, idempotency |
| API contract from UI side | `tests/e2e/api-contract.spec.ts` | Playwright hits the Go API directly |
| E2E golden paths | `tests/e2e/golden-paths.spec.ts` | home → project → cases → run → execute → reports → search |
| Folder tree E2E | `tests/e2e/folder-tree.spec.ts` | sidebar rendering, expand/collapse, click-to-filter |
| Import flow E2E | `tests/e2e/import-flow.spec.ts` | runs importer against fixture, asserts UI |
| Team features E2E | `tests/e2e/team-features.spec.ts` | CSV export link, bulk toolbar, saved filters, version history |
| Demo tour | `tests/e2e/demo-tour.spec.ts` | produces `docs/media/demo-tour.webm` |
| Lint | `eslint.config.mjs` + `go vet` | style + boundary rules |

How to run them locally:

```sh
docker compose up -d postgres                      # required for Go tests
docker exec verify-postgres psql -U verify -d verify \
  -c "create database verify_test;"                # one-time
cd backend && make test                            # go vet + go test -p 1 ./...
cd .. && npm run lint && npm run e2e               # ESLint + Playwright

# Or, the lot:
npm test
```

CI runs the same three jobs (Go, Next.js, Playwright) and uploads coverage + traces on failure.

### Why packages run with `-p 1`

`internal/store` and `internal/api` both connect to the `verify_test` database and call `truncate ... cascade` between tests. Go's default behaviour runs *packages* in parallel, which causes those truncates to race. `-p 1` serializes packages while still running tests inside a package serially.

## What's intentionally not done in v1

- Real auth (the user is mocked).
- Email/Slack notifications.
- File attachments (the schema design exists; no upload UI).
- Templates UI.
- BDD / Gherkin authoring.
- Multi-org tenancy.
- WebSocket-driven live progress on the run-execution page.
- Drop of legacy `areas` / `features` tables — they coexist with `folders` until every screen has migrated.

These are listed in [ROADMAP.md](./ROADMAP.md) with rough order.
