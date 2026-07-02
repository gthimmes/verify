-- Retire the legacy area/feature hierarchy in favour of folders (canonical
-- since 0002). Guarantee every case has a folder, then drop feature_id and the
-- areas/features tables.
insert into folders (id, project_id, parent_id, name, description, display_order, archived, created_at, updated_at)
select id, project_id, null, name, description, display_order, archived, created_at, updated_at
from areas on conflict (id) do nothing;

insert into folders (id, project_id, parent_id, name, description, display_order, archived, created_at, updated_at)
select f.id, a.project_id, f.area_id, f.name, f.description, f.display_order, f.archived, f.created_at, f.updated_at
from features f join areas a on a.id = f.area_id on conflict (id) do nothing;

update test_cases set folder_id = feature_id where folder_id is null;
alter table test_cases alter column folder_id set not null;
alter table test_cases drop constraint if exists test_cases_feature_id_fkey;
drop index if exists test_cases_feature_idx;
alter table test_cases drop column if exists feature_id;
drop table if exists features;
drop table if exists areas;
