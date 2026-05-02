<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Verify — agent guide

This file orients an AI agent (Claude, Cursor, Codex, etc.) working on Verify, a manual test-case management system. Read this whole file before writing code.

## What this app is

A lightweight, AI-driven system for organizing, executing, and tracking **manual** test cases. The entire app is intentionally a thin shell over a well-typed domain model so future AI features can plug in without rework. Today there are no AI features shipped — the v1 mandate was to nail the test catalog and execution flow first. The architecture reserves the seams.

The full product spec lives in `docs/spec.md`. Treat it as the source of truth for behavior. This file is the source of truth for **how to build** in this repo.

## Stack at a glance

- **Next.js 16** (App Router, Server Components, Server Actions). This is **not** the Next.js you know — see the warning above. When in doubt, read `node_modules/next/dist/docs/`.
- **TypeScript strict**.
- **Tailwind v4** (PostCSS plugin), no shadcn — primitives are hand-rolled in `src/components/ui/` because the shadcn CLI is interactive and the components are simple enough to write directly.
- **Prisma 7** with the **better-sqlite3 driver adapter** (Prisma 7 default-engine type `client` requires an adapter). The generator output lands at `src/generated/prisma`. Import the singleton from `@/lib/prisma`, not from the generator path directly.
- **SQLite** at `./dev.db`. Migrations in `prisma/migrations/`. Seed at `prisma/seed.ts` (run with `npx tsx prisma/seed.ts`).
- **Zod** for input validation in server actions.
- **Playwright** for end-to-end tests + video recording.

## Where things live

```
src/
├── app/
│   ├── layout.tsx                       # global shell (header, footer, ⌘K link)
│   ├── page.tsx                         # /  — projects list
│   ├── runs/page.tsx                    # cross-project active runs
│   ├── search/page.tsx                  # global search
│   ├── admin/page.tsx                   # cross-project rollups + audit log
│   ├── actions/                         # server actions (mutations only)
│   │   ├── projects.ts
│   │   ├── areas.ts
│   │   ├── features.ts
│   │   ├── testCases.ts
│   │   ├── testRuns.ts
│   │   └── executions.ts
│   └── projects/[projectId]/
│       ├── page.tsx                     # hierarchy view + KPIs
│       ├── cases/...                    # list / new / [id] / [id]/edit
│       ├── features/[featureId]/...     # bounce → cases?feature=...
│       ├── runs/...                     # list / new / [id] / [id]/execute
│       └── reports/page.tsx             # automation candidates etc.
├── components/
│   ├── shell/CommandKLink.tsx           # ⌘K shortcut
│   ├── ui/                              # primitives — Button, Input, Card, Badge, Dialog, PageHeader
│   ├── projects/                        # project-level dialogs and menus
│   ├── testcases/TestCaseForm.tsx       # client form with steps + params + data rows
│   └── runs/                            # NewRunForm, RunStatusActions, ExecutionRow
├── lib/
│   ├── prisma.ts                        # Prisma singleton (driver adapter wired here)
│   ├── auth.ts                          # CURRENT-USER STUB — swap for real auth in v2
│   └── utils.ts                         # cn, formatDate, shortKey, pad
└── generated/prisma/                    # Prisma generator output (gitignored)
prisma/
├── schema.prisma                        # full domain model
├── migrations/...
└── seed.ts                              # demo dataset (Aiwyn Core + Internal)
docs/
├── spec.md                              # original product spec
├── ARCHITECTURE.md                      # how the system fits together
├── ROADMAP.md                           # v1 → v2 roadmap (AI features included)
└── AGENTS_AI_DESIGN.md                  # the AI seams
tests/e2e/                               # Playwright golden-path tests
playwright.config.ts
```

## Conventions

- **Mutations are server actions.** Files in `src/app/actions/*.ts` start with `'use server'`. They Zod-validate input, perform Prisma writes, write an `AuditLog` row when relevant, then `revalidatePath` and (for create flows) `redirect`. Don't introduce REST/tRPC for in-app mutations.
- **Reads happen in Server Components.** Pages are `async` server components that call `prisma` directly. Don't fetch from a Route Handler when a server component will do.
- **Client Components are minimal.** Only used for interactivity (forms with controlled state, dialogs, optimistic toggles). They live alongside their feature in `src/components/<feature>/`.
- **Public test IDs are stable, project-scoped.** Format `{PROJECT_KEY}-{AREA_KEY}-{4-digit-seq}`. The sequence is project-level, not area-level. The area code is a hint baked into the ID.
- **Soft delete is `deletedAt`.** Default queries filter `deletedAt: null`. Restoration just nulls it again.
- **Test runs are snapshots.** A `RunSnapshotCase` row freezes title, steps, parameters, data rows, and version at run creation. Editing the live `TestCase` later does not change historical runs.
- **Parameterized executions are 1-per-row.** Each `TestCaseDataRow` produces its own `TestExecution` (with `dataRowIndex`). Reporting rolls up at both row and case level.
- **No emoji in UI copy** unless the user explicitly asks. Tooltips and badges are plain text.

## How to add a feature

1. **Domain change?** Edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>`. Prefer additive migrations.
2. **Server action** — add or extend a file in `src/app/actions/`. Validate with Zod. Always:
   - Resolve the current user via `requireUser()`.
   - Mutate inside a Prisma transaction when more than one write is involved.
   - Insert an `AuditLog` row for create/update/delete on user-visible entities.
   - Call `revalidatePath(...)` for every page that shows the data.
3. **Page or component** — server component for reads, client component for interactivity. Use existing primitives in `src/components/ui/`. Add `data-testid` attributes when adding new flows so Playwright can target them.
4. **Test it** — add a Playwright test in `tests/e2e/` and run `npm run e2e`.

## AI seams (v2 onward)

Even though v1 ships with no AI features, the architecture is *designed* for them. See `docs/AGENTS_AI_DESIGN.md` for the full plan. In short:

- **Test case authoring assist.** Generate steps + expected results from a one-line title using `TestCase.description`. Extension point: a server action `actions/testCases.ts` that accepts a prompt and yields a draft case. The form already supports edit-on-save so a draft can be pre-filled.
- **Automation candidates ranking.** The `/projects/:id/reports` page already computes a heuristic score. The component is structured so a model-based score can replace `candidateScores` without changing the UI.
- **Failure clustering on execution.** The `TestExecution.comments` and `jiraDefectKeys` fields are designed to be embedded for similarity search. No embeddings stored yet; add a `TestExecutionEmbedding` table when you ship clustering.
- **Natural-language run filter.** `/projects/:id/cases` uses URL-driven filters (`q`, `tag`, `priority`…). A future `nl=` param can be parsed by an LLM into the same filter set.
- **Stale-automation triage.** The `automationLastReviewedAt` field is the trigger; a future agent reads the diff between automation reference paths and the test-case definition and recommends review actions.

When you add an AI feature: keep the model call behind a thin server module (`src/lib/ai/<feature>.ts`), pass typed inputs, return typed outputs, never let raw model strings reach the database. Always log to `AuditLog` with `action: "ai.<feature>"`.

## Things to avoid

- Don't enable Next.js `cacheComponents`. The data is dynamic per-user and per-mutation; the explicit `dynamic = "force-dynamic"` per page is intentional.
- Don't use the legacy `prisma-client-js` engine (`engineType = "library"`) without the driver adapter — the migration to the new client model is already done and works on Windows.
- Don't reach for an ORM-side cache. Use `revalidatePath` exclusively.
- Don't introduce a state-management library (Redux, Zustand, etc.). Server actions + URL state cover everything.
- Don't add a custom field system to test cases. v1 is intentionally not configurable per-project.

## Useful commands

```sh
# Dev
npm run dev                      # next dev on :3000

# Database
npx prisma migrate dev --name <change>
npx tsx prisma/seed.ts           # wipes and reseeds demo data
npx prisma studio                # GUI

# Tests
npm run e2e                      # Playwright (headless)
npm run e2e:headed               # with browser visible
npm run e2e:demo                 # the "demo tour" that records video for review
```
