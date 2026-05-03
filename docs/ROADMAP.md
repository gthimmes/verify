# Roadmap

This is what didn't ship in v1 and the order it should arrive in. The spec (`docs/spec.md`) drives feature priorities; the AI seams are described separately in `AGENTS_AI_DESIGN.md`. The architecture rules and enforcement gaps are tracked in `ARCHITECTURE.md`.

## v1.x — fill the gaps the spec already signed off on

Things called out by the spec that v1 deferred for time. Tables referenced are the Postgres tables in `backend/internal/db/migrations/0001_init.sql`.

1. **Real authentication.** Today `src/lib/auth.ts` is a UI stub and the Go API auto-bootstraps a `demo@verify.local` user on every request. Next: SSO via SAML or OIDC, with the scoped per-project roles already supported by the `project_members.role` column.
2. **Attachments UI.** The schema already has an `attachments` design (referenced by `test_cases` and `test_executions`); the migration didn't create the table because nothing consumes it yet. Add the migration, then an upload widget on the case detail and execution rows.
3. **Templates UI.** Template entity is on the v1.x plan but not yet in the schema. Migration + an `/admin/templates` CRUD + a template picker on the new-case form.
4. **Notifications.** Email + in-app for assignment, run completion, defect linked to your case, comment mention. Needs the v2 job runner (see below).
5. **CSV / PDF export.** Per-run results table → CSV (synchronous Go endpoint) and PDF (queued through the job runner).
6. **Saved filters.** Add a `saved_filters` table + endpoints + "save current filter as" / "load saved" UI on `/cases` and `/runs`.
7. **Step-level results.** Surface the per-step pass/fail UI on the run-execution row; the `test_executions.step_results_json` column exists.
8. **Bulk operations.** Bulk priority/status/automation-status edit on `/cases`, bulk move between features. Endpoint exists in spirit (`PATCH` patterns); UI doesn't.
9. **Reorder via drag-and-drop.** Today areas/features have up/down menu items. Drag-and-drop replaces them.
10. **Test case relations and version history viewer.** `test_case_versions` is written on every save; surface a diff viewer on the case detail page. `test_case_relations` (see-also links) needs both schema and UI.

## v1.x — testing & architecture hardening

Items pulled from the test-automation analysis. These should land alongside the feature work, not after.

1. **Tier-1 test coverage.**
   - Go store integration tests against a Postgres testcontainer (per-method, asserts row + audit shape).
   - Go HTTP handler tests with `httptest` (200 shape, 4xx shape, content-type).
   - Reset DB between Playwright runs (a `globalSetup` that re-seeds, plus per-test isolation).
2. **CI pipeline.** GitHub Actions with three jobs: `go test ./... -race -cover` against a Postgres service, `npm run lint` + `npm run build`, and `npm run e2e` against a built app on a freshly-seeded DB. Branch protection requires green CI before merge.
3. **Generated API types.** Replace the hand-mirrored shapes in `src/lib/api.ts` with types generated from `domain/types.go` (via `tygo` or an OpenAPI emit). Single source of truth for the contract.
4. **Architecture-as-tests.** Small Go + ESLint rules that enforce the boundaries documented in `ARCHITECTURE.md` — UI never imports a DB driver, handlers don't write SQL, audit writes only happen inside the store, server actions are the only mutation entry on the UI side.
5. **Migration tests.** Apply migrations to a fresh DB → assert against a `pg_dump --schema-only` snapshot. Re-apply → no error.
6. **Frontend component tests.** Vitest on the high-state components: `TestCaseForm`, `NewRunForm`, `ExecutionRow`. Server-action unit tests for Zod parsers.
7. **Lint + format gates.** `golangci-lint` config + run in CI; pre-commit hook that runs `gofmt`, `goimports`, `eslint --max-warnings 0`, `tsc --noEmit`.
8. **Playwright stabilization.** Drop the hand-rolled React-fiber hydration check, retries=2 in CI only, replace hardcoded `pause(800ms)` with `expect.toPass`.
9. **Accessibility smoke test.** `@axe-core/playwright` on each main page (the spec requires WCAG 2.1 AA).

## v2 — the killer feature set

The whole point of capturing automation metadata in a manual-first tool is to set up v2:

1. **Run automated tests directly from Verify.** Pluggable runners (Playwright, Cypress, Pytest) backed by a Go job runner (a separate binary in `backend/cmd/<job>/main.go`, reading work from a `jobs` table). The `automation_framework` and `automation_ref` fields already point at the right test.
2. **CI integration.** Webhook endpoint that accepts JUnit-shaped reports and creates `test_executions` rows in matching runs. The `run_snapshot_cases` model handles versioning automatically.
3. **Public read API + webhooks.** The internal API at `/api/v1` becomes a documented public surface; add token auth, rate limits, and an OpenAPI spec. Webhooks fire on run state changes.
4. **Jira deeper integration.** Two-way linking is partial today (we accept Jira keys as strings); v2 creates defects from a failed execution and pulls coverage onto the Jira issue.
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
