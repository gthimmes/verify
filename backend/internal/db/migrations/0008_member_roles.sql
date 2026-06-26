-- Per-project membership & roles for authorization.
--
-- project_members already exists (0001_init.sql) with (project_id, user_id,
-- role).  This migration normalizes it for role-based access control:
--   * adds created_at so the members UI can show when someone was added;
--   * narrows legacy roles to the three the app now understands.
--
-- Roles (rank): admin > editor > viewer.  Legacy 'tester'/'member' rows are
-- migrated to 'editor' (they could author/execute but not administer).
alter table project_members add column if not exists created_at timestamptz not null default now();

update project_members set role = 'editor' where role in ('tester', 'member');
update project_members set role = 'viewer' where role not in ('admin', 'editor', 'viewer');

create index if not exists project_members_user_idx on project_members(user_id);
