# Roadmap

This is what didn't ship in v1 and the order it should arrive in. The spec (`docs/spec.md`) drives feature priorities; the AI seams are described separately in `AGENTS_AI_DESIGN.md`. The architecture rules and enforcement gaps are tracked in `ARCHITECTURE.md`.

## What's already shipped

For reference (so future roadmap items don't accidentally re-list these):

- Postgres + Go API + Next.js UI, with the boundary tests + ESLint rules enforcing the split.
- Migration runner (`internal/db`) with `0001_init.sql` (full domain) and `0002_folders.sql` (recursive folder tree).
- **Folder tree** as the canonical hierarchy. Recursive `folders` table; legacy `areas`/`features` retained for backwards compatibility.
- **Testiny xlsx importer** (`backend/cmd/import-testiny`) that preserves the full folder structure of a source export.
- **Sidebar folder tree** in the cases page, with rolled-up case counts and click-to-filter.
- Test coverage: store integration tests, HTTP handler tests, API contract round-trip, importer parser + driver tests, architecture-boundary tests, migration-shape tests, Playwright golden paths + folder tree + import flow.
- Seed CLI is **idempotent and non-destructive by default**; Playwright `globalSetup` does not auto-wipe.
- GitHub Actions CI: Go (vet + test against a Postgres service), Next.js (lint + build), Playwright (against a built app + real Go API + Postgres).
- Type-enum extensions (`acceptance`, `compatibility`, `other`) with a contract test.
- **CSV export** of run results and the filtered case list (synchronous Go endpoints + Next route handlers + download affordances).
- **Bulk operations** on cases: set priority/status/automation, move to folder, soft delete/restore — applied to up to 1000 cases in one audited transaction, driven by a select-all toolbar on `/cases`.
- **Saved filters** (`saved_filters` table): name + reload the current `/cases` filter set; mark `shared` for project-wide visibility; owner-only delete.
- **Version history viewer**: surfaces `test_case_versions` as a per-case timeline with a field-level diff against each predecessor.
- **Step-level results**: per-step pass/fail checklist during execution, persisted in `test_executions.step_results_json`.
- **Folder management**: rename, create, move (cycle-checked), reorder, and cascade archive/unarchive folders from the cases sidebar.

## v1.x — fill the gaps the spec already signed off on

1. **Real authentication.** Today `src/lib/auth.ts` is a UI stub and the Go API auto-bootstraps a `demo@verify.local` user on every request. Next: SSO via SAML or OIDC, with the scoped per-project roles already supported by the `project_members.role` column.
2. **Imported authors.** The Testiny importer currently discards the `Owner`/`Created by`/`Modified by` strings. When auth ships, add a flag that upserts users by name (or by email if available) so attribution survives the import.
3. **Attachments UI.** Migration for the `attachments` table + an upload widget on case detail and execution rows.
4. **Templates UI.** Migration for `test_case_templates` + an `/admin/templates` CRUD + a template picker on the new-case form.
5. **Notifications.** Email + in-app for assignment, run completion, defect linked to your case, comment mention. Needs the v2 job runner.
6. **CSV / PDF export.** ✅ CSV shipped (per-run results + filtered case list, synchronous Go endpoints). PDF still pending — queue it through the v2 job runner.
7. **Saved filters.** ✅ Shipped for `/cases` (`saved_filters` table + endpoints + save/load UI, with a `shared` flag). Still to do: extend to `/runs`.
8. **Step-level results.** ✅ Shipped: per-step pass/fail toggles on the run-execution row, persisted to `test_executions.step_results_json` and surfaced as a "N pass, M fail" summary.
9. **Bulk operations.** ✅ Shipped: bulk priority/status/automation edit, move between folders, soft delete/restore, and add/remove tag on `/cases`.
10. **Folder management.** ✅ Rename, create (root + subfolder), archive/unarchive (cascades to the subtree; hidden by default with a "Show archived" toggle), move to another parent (cycle-checked) and reorder among siblings — all from the cases sidebar "⋯" menu, audited in the Go store. Still to do: true drag-and-drop reordering (the current UI uses up/down + move-to-parent).
11. **Test case relations and version history viewer.** ✅ Version diff viewer shipped (per-case timeline + field-level diff off `test_case_versions`). Still to do: `test_case_relations` (see-also links) schema + UI.
12. **Drop legacy areas/features tables** after the new-case form and run-creation flow are migrated to use folders directly (currently both still pass a synthesised `feature_id` to satisfy a not-null FK).

## v1.x — testing & architecture hardening

Items that have **not** been done yet (the tier-1 items are mostly shipped; these are the leftovers):

1. **Generated API types.** Replace the hand-mirrored shapes in `src/lib/api.ts` with types generated from `domain/types.go` (via `tygo` or an OpenAPI emit). Single source of truth for the contract.
2. **Frontend component tests.** Vitest on the high-state components: `TestCaseForm`, `NewRunForm`, `ExecutionRow`. Server-action unit tests for Zod parsers.
3. **Lint + format gates.** `golangci-lint` config + run in CI; pre-commit hook that runs `gofmt`, `goimports`, `eslint --max-warnings 0`, `tsc --noEmit`.
4. **Accessibility smoke test.** `@axe-core/playwright` on each main page (the spec requires WCAG 2.1 AA).
5. **Coverage thresholds** in CI (e.g., fail under 60% on `internal/store`).
6. **A separate test database per package** (or a transactional-rollback test harness) so `-p 1` is no longer required.

## v2 — the killer feature set

The whole point of capturing automation metadata in a manual-first tool is to set up v2:

1. **Run automated tests directly from Verify.** Pluggable runners (Playwright, Cypress, Pytest) backed by a Go job runner (separate binary in `backend/cmd/<job>/main.go`, reading work from a `jobs` table). The `automation_framework` and `automation_ref` fields already point at the right test.
2. **CI integration.** Webhook endpoint that accepts JUnit-shaped reports and creates `test_executions` rows in matching runs. The `run_snapshot_cases` model handles versioning automatically.
3. **Public read API + webhooks.** The internal API at `/api/v1` becomes a documented public surface; add token auth, rate limits, and an OpenAPI spec. Webhooks fire on run state changes.
4. **Jira deeper integration.** v2 creates defects from a failed execution and pulls coverage onto the Jira issue.
5. **SSO and SCIM.** Org-level admin to manage users, integrations, and templates.
6. **Native AI features.** See `AGENTS_AI_DESIGN.md`.

## v3+ — speculative

- Mobile apps (the spec keeps responsive web for v1).
- BDD / Gherkin authoring inside the tool.
- Capacity / scheduling for testers (who's free, who's overloaded).
- Multi-tenant SaaS billing.
- Custom field definitions per project.

## Operational follow-ups

- Move attachments off inline base64 to object storage once the table ships.
- Connection pooling: add `pgbouncer` in front of Postgres when concurrent runs grow.
- Stand up a separate read replica for the reports queries when the Reports page exceeds 2s p95.
- Backups: nightly `pg_dump` to object storage with retention.
- Observability: structured request logging on the Go API, plus a `/metrics` endpoint exposing Prometheus counters for executions, mutations, and AI calls (when those land).
- Dependabot / Renovate for both the Go module and `package.json`.
- `CODEOWNERS` so SQL changes route to a reviewer who reads SQL.
