# Roadmap

This is what didn't ship in v1 and the order it should arrive in. The spec (`docs/spec.md`) drives priorities; the AI seams are described separately in `AGENTS_AI_DESIGN.md`.

## v1.x — fill the gaps the spec already signed off on

Things called out by the spec that v1 deferred for time:

1. **Real authentication.** Today `src/lib/auth.ts` is a single fixed admin user. Next: SAML or OIDC, scoped per-project roles already in the schema (`ProjectMember.role`).
2. **Attachments UI.** The `Attachment` table accepts inline base64 already; we need an upload widget on `TestCase` and `TestExecution`, plus a small viewer. Object storage migration is a v2 task.
3. **Templates UI.** `TestCaseTemplate` exists; the new-case form needs a template picker, and admins need a CRUD surface (`/admin/templates`).
4. **Notifications.** Email + in-app for assignment, run completion, defect linked to your case, comment mention. Out-of-process job scheduler ships with this.
5. **CSV / PDF export.** Per-run results table → CSV (synchronous server route) and PDF (queued for the same scheduler).
6. **Saved filters.** Schema is in place (`SavedFilter`). UI is "save current filter as", "load saved", in the `/cases` and `/runs` pages.
7. **Step-level results.** Schema field `TestExecution.stepResultsJson` exists; UI hasn't surfaced it yet.
8. **Bulk operations.** Bulk priority/status/automation status edit on `/cases`, bulk move between features.
9. **Reorder via drag-and-drop.** Today areas/features have up/down menu items. Drag-and-drop replaces that.

## v2 — the killer feature set

The whole point of capturing automation metadata in a manual-first tool is to set up v2:

1. **Run automated tests directly from Verify.** Pluggable runners (Playwright, Cypress, Pytest) backed by an out-of-process queue. The `automationFramework` and `automationRef` fields already point at the right test; the schema is ready.
2. **CI integration.** Webhook endpoint that accepts JUnit-shaped reports from CI and creates `TestExecution` rows for the runs they belong to. The `RunSnapshotCase` model handles versioning automatically.
3. **REST API and webhooks.** Public read API across all entities; write endpoints for case authoring and run/execution management; webhooks for run state changes.
4. **Jira deeper integration.** Two-way linking is partial today (we accept Jira keys); v2 creates defects from a failed execution and pulls coverage onto the Jira issue.
5. **SSO and SCIM.** Org-level admin to manage users, integrations, and templates.
6. **Native AI features.** See `AGENTS_AI_DESIGN.md`.

## v3+ — speculative

- Mobile apps (the spec keeps responsive web for v1).
- BDD / Gherkin authoring inside the tool.
- Capacity / scheduling for testers (who's free, who's overloaded).
- Multi-tenant SaaS billing.
- Custom field definitions per project.

## Operational follow-ups

- Move `dev.db` out of repo root into `prisma/dev.db` and update `.gitignore`.
- Add a real CI pipeline that runs `npm run e2e` against the seed.
- Move attachments off inline base64 once we have an object store.
- Add a separate read replica or pgbouncer when we move off SQLite.
