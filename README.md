# Verify

A lightweight test-case management system for organizing, executing, and tracking **manual** test cases. Verify also tracks which cases are automated, in what framework, and where they live so teams can see coverage and decide what to automate next.

> **v1 is manual-only.** Automated tests run in their existing CI pipelines. Verify is the system of record for the manual catalog and execution history. The schema is shaped so v2 can run automated tests directly without rework.

## What's in v1

- Projects → Areas → Features → Test Cases hierarchy with auto-generated public IDs (`AIW-PAY-0042`).
- Full test case authoring: steps, preconditions, classification, **automation metadata**, parameterized data sets, tags, Jira links, change history.
- Test runs as **frozen snapshots** of selected cases at a moment in time. Re-run failed subsets. Clone runs. Track environment, build, milestone.
- Test execution UI with quick pass/fail/blocked/skipped, comments, defect linking, attempt history, and full step rendering with `{{parameter}}` interpolation.
- Reports: automation candidates (ranked), coverage by area, top-failing, stale automation metadata, stale manual cases.
- Global search across IDs, titles, descriptions, steps, and tags.
- Audit log of every mutating action.

## Stack

- Next.js 16 (App Router, Server Components, Server Actions)
- TypeScript strict
- Tailwind v4
- Prisma 7 with better-sqlite3 driver adapter
- Zod for validation
- Playwright for E2E + video

## Quick start

```sh
npm install
npx prisma migrate dev --name init     # creates dev.db
npx tsx prisma/seed.ts                  # seeds demo data
npm run dev                             # localhost:3000
```

The seed creates two projects (`Aiwyn Core`, `Aiwyn Internal Tools`), 27 test cases (some parameterized), and four runs (one completed, one in progress, one draft, one for the internal project). Open the home page and click around — every link should work and tell a story.

## Tests

```sh
npm run e2e         # Playwright golden paths
npm run e2e:demo    # records a video tour into test-results/demo-tour/
```

## Where to look in the source

- `prisma/schema.prisma` — domain model (the canonical reference)
- `src/app/actions/` — every mutation
- `src/app/projects/[projectId]/` — the per-project routes
- `src/components/runs/ExecutionRow.tsx` — the test-execution unit
- `src/components/testcases/TestCaseForm.tsx` — the test case authoring form
- `docs/spec.md` — the product specification this implementation traces to
- `docs/ARCHITECTURE.md` — how the system fits together
- `docs/ROADMAP.md` — what's next, including AI features
- `docs/AGENTS_AI_DESIGN.md` — the AI seams reserved for v2
- `AGENTS.md` — agent-facing rules for working in this repo

## Why "AI-driven" with no AI features

The user asked for an AI-driven application but explicitly without AI features for v1. The interpretation: build the foundation so AI features slot in without rework. Concretely:

- Steps and expected results are first-class fields, not blobs of markdown — generators and graders can target them.
- Automation candidates already use a deterministic score; replacing it with a model is a one-line swap.
- The execution model carries comments + linked defects, which are the natural input to a failure-clustering pipeline.
- Search is URL-driven (`q`, `tag`, `priority`...) so a `nl=` query can be parsed by an LLM into structured filters.
- Every mutation goes through a typed server action, so model-driven actions get the same validation path.

The full plan lives in [`docs/AGENTS_AI_DESIGN.md`](docs/AGENTS_AI_DESIGN.md). Nothing in `src/lib/ai/` ships in v1, but the directory is reserved.
