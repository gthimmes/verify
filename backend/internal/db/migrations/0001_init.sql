-- Verify domain schema (Postgres dialect)
-- Mirrors the spec in docs/spec.md.

create extension if not exists "pgcrypto";

create table if not exists users (
    id          uuid primary key default gen_random_uuid(),
    email       text not null unique,
    name        text not null,
    role        text not null default 'admin',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists projects (
    id          uuid primary key default gen_random_uuid(),
    key         text not null unique,
    name        text not null,
    description text,
    status      text not null default 'active',
    owner_id    uuid not null references users(id),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    deleted_at  timestamptz
);

create table if not exists project_members (
    id          uuid primary key default gen_random_uuid(),
    project_id  uuid not null references projects(id) on delete cascade,
    user_id     uuid not null references users(id) on delete cascade,
    role        text not null default 'tester',
    unique (project_id, user_id)
);

create table if not exists areas (
    id            uuid primary key default gen_random_uuid(),
    project_id    uuid not null references projects(id) on delete cascade,
    key           text not null,
    name          text not null,
    description   text,
    display_order int not null default 0,
    archived      boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (project_id, key)
);
create index if not exists areas_project_idx on areas(project_id);

create table if not exists features (
    id            uuid primary key default gen_random_uuid(),
    area_id       uuid not null references areas(id) on delete cascade,
    name          text not null,
    description   text,
    display_order int not null default 0,
    archived      boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists features_area_idx on features(area_id);

create table if not exists tags (
    id    uuid primary key default gen_random_uuid(),
    name  text not null unique,
    color text
);

create table if not exists test_cases (
    id                          uuid primary key default gen_random_uuid(),
    project_id                  uuid not null references projects(id) on delete cascade,
    feature_id                  uuid not null references features(id),
    public_id                   text not null,
    sequence_num                int not null,
    title                       text not null,
    description                 text,
    preconditions               text,
    final_expected              text,
    test_data_notes             text,
    type                        text not null default 'functional',
    priority                    text not null default 'medium',
    status                      text not null default 'active',
    automation_status           text not null default 'not_automated',
    automation_framework        text,
    automation_ref              text,
    automation_repo_url         text,
    automation_owner_id         uuid references users(id),
    automation_last_reviewed_at timestamptz,
    jira_keys                   text,
    created_by_id               uuid not null references users(id),
    updated_by_id               uuid not null references users(id),
    version                     int not null default 1,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),
    deleted_at                  timestamptz,
    unique (project_id, public_id)
);
create index if not exists test_cases_project_idx on test_cases(project_id);
create index if not exists test_cases_feature_idx on test_cases(feature_id);

create table if not exists test_steps (
    id           uuid primary key default gen_random_uuid(),
    test_case_id uuid not null references test_cases(id) on delete cascade,
    step_order   int not null,
    action       text not null,
    expected     text not null default ''
);
create index if not exists test_steps_case_idx on test_steps(test_case_id);

create table if not exists test_case_params (
    id           uuid primary key default gen_random_uuid(),
    test_case_id uuid not null references test_cases(id) on delete cascade,
    name         text not null,
    param_order  int not null,
    unique (test_case_id, name)
);

create table if not exists test_case_data_rows (
    id           uuid primary key default gen_random_uuid(),
    test_case_id uuid not null references test_cases(id) on delete cascade,
    row_order    int not null,
    label        text,
    values_json  jsonb not null
);
create index if not exists test_case_data_rows_case_idx on test_case_data_rows(test_case_id);

create table if not exists test_case_tags (
    test_case_id uuid not null references test_cases(id) on delete cascade,
    tag_id       uuid not null references tags(id) on delete cascade,
    primary key (test_case_id, tag_id)
);

create table if not exists test_case_versions (
    id            uuid primary key default gen_random_uuid(),
    test_case_id  uuid not null references test_cases(id) on delete cascade,
    version       int not null,
    snapshot_json jsonb not null,
    changed_by_id uuid not null references users(id),
    changed_at    timestamptz not null default now(),
    unique (test_case_id, version)
);

create table if not exists test_runs (
    id                  uuid primary key default gen_random_uuid(),
    project_id          uuid not null references projects(id) on delete cascade,
    parent_run_id       uuid references test_runs(id),
    name                text not null,
    description         text,
    environment         text,
    build               text,
    milestone           text,
    status              text not null default 'draft',
    abort_reason        text,
    owner_id            uuid not null references users(id),
    default_assignee_id uuid references users(id),
    planned_start       timestamptz,
    planned_end         timestamptz,
    actual_start        timestamptz,
    actual_end          timestamptz,
    notes               text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists test_runs_project_idx on test_runs(project_id);

create table if not exists run_snapshot_cases (
    id             uuid primary key default gen_random_uuid(),
    run_id         uuid not null references test_runs(id) on delete cascade,
    test_case_id   uuid not null references test_cases(id),
    public_id      text not null,
    title          text not null,
    description    text,
    preconditions  text,
    final_expected text,
    type           text not null,
    priority       text not null,
    snapshot_json  jsonb not null,
    version        int not null,
    unique (run_id, test_case_id)
);
create index if not exists run_snapshot_cases_run_idx on run_snapshot_cases(run_id);

create table if not exists test_executions (
    id                  uuid primary key default gen_random_uuid(),
    run_id              uuid not null references test_runs(id) on delete cascade,
    snapshot_case_id    uuid not null references run_snapshot_cases(id) on delete cascade,
    data_row_index      int,
    data_row_label      text,
    result              text not null default 'not_run',
    executed_by_id      uuid references users(id),
    executed_at         timestamptz,
    duration_seconds    int,
    env_override        text,
    build_override      text,
    comments            text,
    jira_defect_keys    text,
    step_results_json   jsonb,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists test_executions_run_idx on test_executions(run_id);
create unique index if not exists test_executions_with_row_uniq
    on test_executions(run_id, snapshot_case_id, data_row_index) where data_row_index is not null;
create unique index if not exists test_executions_no_row_uniq
    on test_executions(run_id, snapshot_case_id) where data_row_index is null;

create table if not exists execution_attempts (
    id              uuid primary key default gen_random_uuid(),
    execution_id    uuid not null references test_executions(id) on delete cascade,
    attempt_num     int not null,
    result          text not null,
    executed_by_id  uuid references users(id),
    executed_at     timestamptz not null,
    comments        text,
    duration_seconds int
);
create index if not exists execution_attempts_exec_idx on execution_attempts(execution_id);

create table if not exists audit_logs (
    id          uuid primary key default gen_random_uuid(),
    actor_id    uuid references users(id),
    action      text not null,
    entity      text not null,
    entity_id   uuid not null,
    before_json jsonb,
    after_json  jsonb,
    created_at  timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on audit_logs(entity, entity_id);
create index if not exists audit_logs_created_idx on audit_logs(created_at);
