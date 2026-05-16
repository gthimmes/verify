-- 0002 — folder tree.
--
-- Replaces the rigid Area > Feature 2-level model with a recursive folders
-- table.  Each folder belongs to a project and may have a parent folder.
-- Test cases now point at a folder.
--
-- Strategy: add the new tables/columns alongside the old ones, backfill,
-- then leave the old tables in place for now so existing screens keep
-- working.  A later migration will drop areas/features once every screen
-- reads from folders.

create table if not exists folders (
    id            uuid primary key default gen_random_uuid(),
    project_id    uuid not null references projects(id) on delete cascade,
    parent_id     uuid references folders(id) on delete cascade,
    name          text not null,
    description   text,
    display_order int not null default 0,
    archived      boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists folders_project_idx on folders(project_id);
create index if not exists folders_parent_idx on folders(parent_id);

-- Postgres treats nulls as distinct in a normal unique constraint, so two
-- top-level folders with the same name would slip through.  These two
-- partial indexes give us "name unique under the same parent (incl. null)".
create unique index if not exists folders_unique_name_under_parent
    on folders(project_id, parent_id, name) where parent_id is not null;
create unique index if not exists folders_unique_name_at_root
    on folders(project_id, name) where parent_id is null;

alter table test_cases add column if not exists folder_id uuid references folders(id);
create index if not exists test_cases_folder_idx on test_cases(folder_id);

-- Backfill: every (area, feature) pair becomes (parent folder, child folder).
-- Order:
--   1) create one folder per area (parent_id = null)
--   2) create one folder per feature, parent_id = the area's folder
--   3) point each test case at its feature's folder
do $$
begin
    -- areas → top-level folders
    insert into folders (id, project_id, parent_id, name, description, display_order, archived, created_at, updated_at)
    select id, project_id, null, name, description, display_order, archived, created_at, updated_at
    from areas
    on conflict do nothing;

    -- features → child folders.  We reuse the feature's id as the folder id
    -- so test_cases.feature_id maps cleanly to test_cases.folder_id.
    insert into folders (id, project_id, parent_id, name, description, display_order, archived, created_at, updated_at)
    select f.id, a.project_id, f.area_id, f.name, f.description, f.display_order, f.archived, f.created_at, f.updated_at
    from features f
    join areas a on a.id = f.area_id
    on conflict do nothing;

    -- link existing test cases
    update test_cases set folder_id = feature_id where folder_id is null;
end$$;
