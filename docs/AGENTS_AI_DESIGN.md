# AI design — the seams reserved for v2+

v1 ships **no AI features**. This document is the contract between v1's foundation and the AI features that come next, so future contributors can plug them in without rework.

The bar: every AI feature should be addable as one new server module under `src/lib/ai/`, one server action that calls it, and minimal UI changes. If a proposed feature requires reshaping the schema or rewiring the read paths, **stop and reread this doc** — odds are good there's a seam already.

## Why "AI-driven" matters here

Because the user explicitly didn't want AI features in v1, the design rule was: every place we'd later want a model is already a typed function with a stable contract. The implementation doesn't have to know it'll one day call a model — it just has to give the caller a typed prompt-shaped object.

Concretely:

- **Test cases are structured, not blobs.** Steps and expected results are first-class fields, not markdown soup. A generator can target them with confidence.
- **Run snapshots are immutable.** Models can train on them, score them, embed them, and we won't have to invalidate caches when a live case is edited.
- **Execution comments and defect keys are siblings.** The same row carries qualitative reproduction notes and quantitative pass/fail — exactly what a failure-clustering pipeline wants.
- **Filters are URL-driven.** Anywhere we accept user input (`?q=`, `?priority=`, `?tag=`), an LLM can compose the same URL after parsing natural language.

## The seven seams

### 1. Test case authoring assist
**Goal:** "Generate steps and expected results from this title and short description."
**Where:** `src/components/testcases/TestCaseForm.tsx` already accepts a starting `initial`. Add a button that calls a new server action `actions/testCases.ts::draftFromPrompt(prompt)`. The action calls `src/lib/ai/draftCase.ts` which returns `{title, description, steps, parameters?, dataRows?}`. The form re-renders with the draft preloaded.
**Why it's safe:** The form already supports submitting whatever the user adjusts; the AI step is just a faster cold-start.
**Schema impact:** None.

### 2. Automation candidates ranking
**Goal:** Use a model to rank manual cases that should be automated next.
**Where:** `src/app/projects/[projectId]/reports/page.tsx` already computes a heuristic `score`. Replace the score with a model-based ranking: `src/lib/ai/rankCandidates.ts(cases) → {caseId, score, reason}[]`. The UI already shows a score column; add a tooltip with the model's `reason`.
**Why it's safe:** The current score gives us a fallback when the model is unavailable.
**Schema impact:** Optional — add a `caseRankReason` cache table if we want to avoid recomputing on every page view.

### 3. Failure clustering
**Goal:** "These three failures look like the same root cause."
**Where:** `TestExecution.comments` and `TestExecution.jiraDefectKeys` are the inputs. Add `TestExecutionEmbedding(executionId, vector blob, model name, dimensions)` and an action that recomputes embeddings on `recordExecution`. Cluster on demand via cosine similarity. Surface in the run detail page as a "similar failures" lozenge.
**Why it's safe:** Embeddings are write-after, never blocking the user-facing path. Bad clusters degrade the UI by adding noise but don't corrupt anything.
**Schema impact:** New table.

### 4. Natural-language search
**Goal:** "Show me critical Payments cases that have failed in the last week and aren't automated."
**Where:** `/search` and `/projects/:id/cases` already accept structured query params. Add a `nl=...` param. A new server action `parseNaturalQuery(nl)` returns `{q?, type?, priority?, automation?, tag?, area?, feature?}` and we redirect to the structured URL. No view change.
**Why it's safe:** The structured filter is the source of truth — the NL parse is a translation layer, not a new code path.
**Schema impact:** None.

### 5. Stale-automation triage
**Goal:** Detect drift between an automated test's reference path and its case's definition.
**Where:** Today the report only checks `automationLastReviewedAt`. Add a job that, for each automated case, fetches the test from the linked repo (or accepts an upload), diffs the steps against the case definition, and emits a triage decision: "Review", "Update reference", "Mark partial". Schedule via the v2 job runner; surface on the Reports page as a column.
**Why it's safe:** All recommendations go through a human review step before mutating the case.
**Schema impact:** New `AutomationTriage(caseId, decision, reason, createdAt)` table.

### 6. Test design coverage analyzer
**Goal:** "Your `Refunds` feature has happy-path coverage but no edge cases for partial refunds across instruments."
**Where:** A new page at `/projects/:id/reports/coverage-gaps`. Reads all cases in a feature, sends them to a model with a "what's missing?" prompt, returns suggested case titles + descriptions. Each suggestion is a "Create case from this" button that pre-fills the form (reuses seam #1).
**Why it's safe:** Suggestions never write to the catalog without explicit user confirmation.
**Schema impact:** None.

### 7. Run reviewer / writeup generator
**Goal:** End-of-run summary: "Pass rate 94%. Two regressions in Payments. The auth lockout test was flaky and re-passed on retry — flag for stabilization."
**Where:** New action on `TestRun` page: "Generate review". Calls `src/lib/ai/runReview.ts(runId)` which reads the run, its executions, and the last few runs for trend context. Saves the writeup as a new field on `TestRun.notes` (already in the schema) prefixed with `[ai-review-vN]`. Re-runnable.
**Why it's safe:** It's writing to a notes field a human can edit or wipe.
**Schema impact:** None.

## Cross-cutting rules

- **Always behind a typed function.** No model call lives inline in a Server Component or in a route handler. It lives in `src/lib/ai/<feature>.ts` and the caller passes typed inputs.
- **Always logged.** Every AI invocation writes an `AuditLog` row with `action: "ai.<feature>"` and a snapshot of the inputs (hashed if sensitive) plus the output. The user must be able to see what the AI saw.
- **Always with a fallback.** If the model is unavailable, the feature degrades to a heuristic (rank by score) or returns an empty result with a "model unavailable" hint. We don't crash a page on a third-party outage.
- **Never modify entities silently.** Any AI write to a real entity (case, run, execution) is gated behind explicit user confirmation. The UI should make it obvious that an AI authored the change.
- **Cap costs.** Calls are wrapped in a per-action quota check. The quota lives in `User.aiQuota` (add the field when shipping the first feature).

## What this means for v1 reviewers

- If you see the words "AI" or "model" in v1 source, it's a bug. v1 ships none.
- If you're reviewing a v2 PR, check it follows this layout. AI features that don't sit behind one of the seams above probably need a redesign.
