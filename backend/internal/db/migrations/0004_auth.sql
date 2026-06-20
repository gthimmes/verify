-- 0004 — real authentication (Google OIDC).
--
-- Adds the columns needed to link a user to a Google identity and a sessions
-- table that backs the opaque session tokens the web layer stores in an
-- httpOnly cookie.  The demo-user bootstrap stays in place; sessions are
-- additive until enforcement is switched on.

alter table users add column if not exists google_sub  text;
alter table users add column if not exists avatar_url   text;
alter table users add column if not exists last_login_at timestamptz;

-- One Google account maps to at most one user.  Partial unique index so the
-- many existing rows with a null google_sub don't collide.
create unique index if not exists users_google_sub_unique
    on users(google_sub) where google_sub is not null;

create table if not exists sessions (
    token       text primary key,
    user_id     uuid not null references users(id) on delete cascade,
    user_agent  text,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null
);
create index if not exists sessions_user_idx on sessions(user_id);
create index if not exists sessions_expires_idx on sessions(expires_at);
