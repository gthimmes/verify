-- 0005 — test case relations ("see also" links).
--
-- Symmetric links between two cases in the same project.  Stored as a single
-- directed row, but treated as undirected: the unique index on the normalized
-- (least, greatest) pair prevents both A→B and B→A from existing, and queries
-- union over both columns so a case sees the link regardless of which side it
-- was created from.

create table if not exists test_case_relations (
    id             uuid primary key default gen_random_uuid(),
    source_case_id uuid not null references test_cases(id) on delete cascade,
    target_case_id uuid not null references test_cases(id) on delete cascade,
    relation_type  text not null default 'related',
    created_by_id  uuid references users(id),
    created_at     timestamptz not null default now(),
    check (source_case_id <> target_case_id)
);

-- One link per unordered pair, regardless of direction.
create unique index if not exists test_case_relations_pair
    on test_case_relations(least(source_case_id, target_case_id), greatest(source_case_id, target_case_id));
create index if not exists test_case_relations_source_idx on test_case_relations(source_case_id);
create index if not exists test_case_relations_target_idx on test_case_relations(target_case_id);
