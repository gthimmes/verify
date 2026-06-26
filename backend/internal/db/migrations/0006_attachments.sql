-- 0006 — attachments.
--
-- Files (screenshots, logs, docs) attached to a test case or an execution.
-- Polymorphic by (entity_type, entity_id): no FK, so a single table serves
-- both. v1 stores bytes inline as bytea; a later migration can move large
-- blobs to object storage and keep only a pointer here.

create table if not exists attachments (
    id             uuid primary key default gen_random_uuid(),
    entity_type    text not null check (entity_type in ('test_case', 'execution')),
    entity_id      uuid not null,
    filename       text not null,
    content_type   text not null,
    size_bytes     integer not null,
    data           bytea not null,
    uploaded_by_id uuid references users(id),
    created_at     timestamptz not null default now()
);
create index if not exists attachments_entity_idx on attachments(entity_type, entity_id);
