-- 0003 — saved filters.
--
-- Lets a user save a named set of /cases (and, later, /runs) filter
-- parameters and reload them with one click.  A filter is owned by the user
-- who created it; setting `shared` makes it visible to everyone on the
-- project so teams can standardise on a common set of views.

create table if not exists saved_filters (
    id          uuid primary key default gen_random_uuid(),
    project_id  uuid not null references projects(id) on delete cascade,
    owner_id    uuid references users(id),
    name        text not null,
    scope       text not null default 'cases',
    query_json  jsonb not null default '{}'::jsonb,
    shared      boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists saved_filters_project_idx on saved_filters(project_id, scope);

-- A user can't have two filters with the same name in the same scope; reusing
-- the name overwrites the stored query (upsert in the store layer).
create unique index if not exists saved_filters_unique_name
    on saved_filters(project_id, owner_id, scope, name);
