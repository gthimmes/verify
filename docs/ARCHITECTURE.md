# Architecture

Verify is a small server-rendered web app over a relational schema. There are intentionally no separate API tier, no client-side data store, and no background workers. The split is:

- **Server Components** read the database and render HTML.
- **Server Actions** mutate the database, write audit rows, revalidate paths.
- **Client Components** are surgical: forms with multi-step state (TestCaseForm), modals (Dialog), and the run-execution row that does optimistic record-and-save.
- **Prisma** is the single point of contact with SQLite via the better-sqlite3 driver adapter. There is no second persistence layer.

This document captures the load-bearing decisions. For *how to add a feature* read [AGENTS.md](../AGENTS.md). For *what's coming* read [ROADMAP.md](./ROADMAP.md).

## Domain model

```
User ─┐
      ├── ProjectMember ─── Project ── Area ── Feature ── TestCase ── TestStep
      │                                                       │      ── TestCaseParam
      │                                                       │      ── TestCaseDataRow
      │                                                       │      ── TestCaseTag ── Tag
      │                                                       │      ── TestCaseRelation
      │                                                       │      ── TestCaseVersion
      │                                                       └── Attachment
      │                       │
      │                       ├── TestRun ── RunSnapshotCase ── TestExecution ── ExecutionAttempt
      │                       │                              ── Attachment
      │                       └── TestCaseTemplate
      └── AuditLog
```

Highlights:

- **Public IDs** are derived: `{Project.key}-{Area.key}-{TestCase.sequenceNum padded to 4}`. The sequence is **project-scoped**, the area code is a hint. This means a case keeps its ID if it moves to a different feature inside the same area, but gets a new ID across project moves (we don't support moves across projects in v1).
- **Soft delete** lives only on `Project` and `TestCase`. Areas, features, runs, and executions are not soft-deletable in v1; archive flags cover the same use case for the hierarchy entities.
- **Run snapshot** is the single most-important shape decision. `RunSnapshotCase.snapshotJson` is a frozen JSON of `{steps, parameters, dataRows}` at the moment the run was created. The corresponding `TestCase.version` is also recorded so we can reconstruct *which* version was tested. Live edits to a `TestCase` never reach back into a run.
- **Parameterized executions** are 1-per-row. The schema uses `TestExecution.dataRowIndex` (nullable) and a denormalized `dataRowLabel` so executions can be enumerated and grouped without touching the snapshot blob.
- **Audit** rows are write-only and live in their own table. They are not joined into the read paths — they're surfaced via a dedicated /admin view today.

## Request lifecycle

A typical mutation:

1. User submits a form in a Client Component or Server Component.
2. Form posts to a Server Action (`src/app/actions/<entity>.ts`).
3. Action zod-parses the form, calls `requireUser()`, runs Prisma writes inside a transaction, writes an `AuditLog` row, calls `revalidatePath` on every affected page.
4. Action returns a `FormState` for `useActionState`-driven forms, or `redirect`s to the destination for create flows.
5. Next.js re-renders the affected pages on next navigation; client components hold their state until they're remounted.

Reads avoid `cacheComponents`. Every page that shows mutable data has `export const dynamic = "force-dynamic"` so revalidation is unambiguous. Static pages would be a nice optimization but the dataset is small enough that re-rendering is fast.

## File organization

The single rule: **paths in `src/app/` mirror URLs**. There are no routing aliases, no layout cascades beyond the root layout, no parallel routes. If a feature needs nested layouts later (sidebars per project, etc.), introduce them then.

`src/components/` mirrors features:

- `ui/` — reusable primitives. Add to here only when used by 2+ features.
- `projects/`, `testcases/`, `runs/` — feature-scoped components. They can import from `ui/` but not from each other.
- `shell/` — global chrome (header, footer bits).

`src/lib/` is small on purpose:

- `prisma.ts` — Prisma client singleton with adapter wired up. Don't import the generator output directly anywhere else.
- `auth.ts` — current user stub. v1 is single-user; switch to a real session when SSO ships.
- `utils.ts` — pure helpers (cn, date formatting, key generation, padding).

`src/generated/prisma/` is generator output. Treat it as artifact: don't edit, don't import its types except via `@/lib/prisma`'s re-exports.

## Why these choices

- **No tRPC, no API tier.** Server Actions cover every mutation we have today. A REST surface ships when the spec needs one (the spec lists "REST API" under integrations — that ships in v2).
- **No state library.** Forms drive their own state with `useState` and `useActionState`. Server-rendered pages drive everything else. URL search params hold filters and pagination. There is nothing global that would justify Zustand or Redux.
- **No background workers.** v1 has no scheduled work — automation isn't run from this tool, notifications aren't sent. When v2 brings either, the right place is a route handler under `src/app/api/jobs/` plus a separate process that hits it on a cron, not a long-running daemon embedded in the app.
- **SQLite + better-sqlite3.** Throughput is plenty for the year-1 scale (2K cases, 500-case runs). When we outgrow it, the migration is to swap the adapter and rewrite the few places that lean on SQLite-isms (currently zero).
- **Hand-rolled UI primitives.** shadcn would be fine. We didn't use it because the components we needed are small and the CLI is interactive — not a fit for an end-to-end automated build. The components themselves follow shadcn-shaped APIs (Button variant/size, Card/CardHeader/CardBody, Dialog open/onOpenChange) so the swap is easy if/when it pays off.

## Performance shape

- List views (cases, runs) take 200 results max. Pagination is a v1.x improvement; today the page is single-fetch.
- The Reports page is the heaviest read — it groups executions and joins back to live cases. It's still well under a second on the seed data.
- Server actions all use `prisma.$transaction` for multi-write paths to keep race conditions out.
- The Test Case form ships a meaningful amount of JS because it's interactive (steps reorder, params add/remove, data rows). It's still under 50KB gzipped.

## What's intentionally not done in v1

- Real auth (the user is mocked).
- Email/Slack notifications.
- File attachments (the schema is there; no upload UI).
- Templates UI (the schema is there; admin-only path is reserved).
- BDD/Gherkin authoring.
- Multi-org tenancy.
- WebSocket-driven live progress on the run execution page (page revalidation covers it for now).

These are listed in [ROADMAP.md](./ROADMAP.md) with rough order.
