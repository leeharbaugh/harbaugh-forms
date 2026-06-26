-- Field resolvers migration validation queries (manual — not executed by Supabase CLI).
-- Run after applying:
--   20250626120000_field_resolvers_catalog.sql
--   20250626130000_fields_field_resolver_id_backfill.sql
--
-- Capture Phase 0 baseline BEFORE migrations for comparison:
-- select count(*) from public.fields where status = 'ACTIVE';
-- select count(*) from public.field_instances where status = 'ACTIVE';
-- select count(*) from public.field_instances where status = 'ACTIVE' and is_override = true;
-- select count(*) from public.form_field_mappings where status = 'ACTIVE';
-- select count(*) from public.field_instance_mappings where status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- After Migration A (catalog)
-- ---------------------------------------------------------------------------

-- Active resolver count (expect 9)
select count(*) as active_resolver_count
from public.field_resolvers
where status = 'ACTIVE';

-- All seeded keys present
select resolver_key, friendly_name, category, status
from public.field_resolvers
where status = 'ACTIVE'
order by category, resolver_key;

-- Duplicate active keys (expect 0 rows)
select lower(resolver_key), count(*)
from public.field_resolvers
where status = 'ACTIVE'
group by lower(resolver_key)
having count(*) > 1;

-- ---------------------------------------------------------------------------
-- After Migration B (field_resolver_id backfill)
-- ---------------------------------------------------------------------------

-- Backfill coverage by catalog entry
select
  fr.resolver_key,
  count(f.id) as linked_field_count
from public.field_resolvers fr
left join public.fields f
  on f.field_resolver_id = fr.id
 and f.status = 'ACTIVE'
where fr.status = 'ACTIVE'
group by fr.resolver_key
order by fr.resolver_key;

-- Fields with mappable source config but no field_resolver_id (investigate gaps)
select
  f.field_key,
  f.source_type,
  f.source_path,
  f.resolver_key
from public.fields f
where f.status = 'ACTIVE'
  and f.field_resolver_id is null
  and (
    (f.source_type = 'custom_resolver'
     and lower(trim(f.resolver_key)) in ('agent_full_name', 'broker_full_name'))
    or (f.source_type = 'packet_property'
        and lower(trim(f.source_path)) in ('full_address', 'address_city_state_zip', 'address'))
    or (f.source_type = 'packet_contact'
        and lower(trim(f.source_path)) in (
          'buyer_1.full_name', 'buyer_2.full_name',
          'seller_1.full_name', 'seller_2.full_name'
        ))
    or (f.source_type = 'settings_agent'
        and lower(trim(f.source_path)) = 'agent_full_name')
    or (f.source_type = 'settings_brokerage'
        and lower(trim(f.source_path)) = 'broker_full_name')
  )
order by f.field_key;

-- Orphan FK check (expect 0 rows)
select f.id, f.field_key, f.field_resolver_id
from public.fields f
left join public.field_resolvers fr on fr.id = f.field_resolver_id
where f.field_resolver_id is not null
  and fr.id is null;

-- Linked fields still have inline source columns populated
select
  f.field_key,
  fr.resolver_key as catalog_key,
  f.source_type,
  f.source_path,
  f.resolver_key as inline_resolver_key
from public.fields f
join public.field_resolvers fr on fr.id = f.field_resolver_id
where f.status = 'ACTIVE'
order by fr.resolver_key, f.field_key;

-- field_instances safety (compare counts to Phase 0 baseline)
select
  count(*) as total_active_instances,
  count(*) filter (where is_override = true) as override_instances
from public.field_instances
where status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Rollback reference (manual, in order)
-- ---------------------------------------------------------------------------
-- alter table public.fields drop column if exists field_resolver_id;
-- drop table if exists public.field_resolvers cascade;
