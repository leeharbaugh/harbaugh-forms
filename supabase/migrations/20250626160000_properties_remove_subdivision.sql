-- Consolidate subdivision into addition (canonical Texas field name) and drop subdivision.

-- 1. Migrate property data: preserve all subdivision values in addition.
update public.properties
set addition = case
  when coalesce(trim(addition), '') = '' then trim(subdivision)
  when coalesce(trim(subdivision), '') = '' then addition
  when trim(addition) = trim(subdivision) then addition
  else trim(addition) || ' / ' || trim(subdivision)
end
where coalesce(trim(subdivision), '') <> '';

-- 2. Point field catalog mappings at addition instead of subdivision.
update public.fields
set
  source_path = 'addition',
  notes = replace(
    replace(notes, 'packet property subdivision', 'packet property addition'),
    'addition/subdivision',
    'addition'
  ),
  update_date = now()
where status = 'ACTIVE'
  and source_type = 'packet_property'
  and lower(trim(source_path)) = 'subdivision';

-- 3. Drop the duplicate column.
alter table public.properties
  drop column if exists subdivision;
