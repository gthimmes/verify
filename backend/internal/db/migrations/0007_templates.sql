-- Reusable test-case templates.  A template is a named, project-agnostic
-- scaffold for a test case: it carries the reusable *content* (description,
-- preconditions, steps, parameters, classification) but nothing project-scoped
-- (no folder/feature, no public id).  The new-case form offers them as a
-- picker that prefills the form; saving still creates a normal test case.
--
-- The body is stored as a single jsonb blob so the shape can evolve with the
-- TestCaseInput subset without a migration per field.
create table test_case_templates (
    id            uuid primary key default gen_random_uuid(),
    name          text        not null,
    description   text        not null default '',
    body          jsonb       not null default '{}'::jsonb,
    created_by_id uuid        references users(id),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create unique index test_case_templates_name_key on test_case_templates (lower(name));
