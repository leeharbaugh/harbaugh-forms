-- Link fields to field_resolvers catalog (nullable FK, backward-compatible backfill).
-- Does not modify fields.source_type, source_path, resolver_key, or fallback_value.
-- Does not touch field_instances, form_field_mappings, field_instance_mappings,
-- packet_forms, or agreement tables.

alter table public.fields
  add column if not exists field_resolver_id uuid
    references public.field_resolvers (id) on delete set null;

create index if not exists fields_field_resolver_id_idx
  on public.fields (field_resolver_id)
  where status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Backfill: map existing source_type / source_path / resolver_key → catalog
-- Priority: custom_resolver.resolver_key > typed source_path > settings paths
-- ---------------------------------------------------------------------------

with resolver_lookup as (
  select id, lower(resolver_key) as resolver_key
  from public.field_resolvers
  where status = 'ACTIVE'
),
field_resolver_match as (
  select
    f.id as field_id,
    coalesce(
      rl_custom.id,
      case
        when f.source_type = 'packet_property' then
          case lower(trim(f.source_path))
            when 'full_address' then rl_prop_full.id
            when 'address_city_state_zip' then rl_prop_cs.id
            when 'address' then rl_prop_full.id
            when 'property_address' then rl_prop_full.id
            else null
          end
        else null
      end,
      case
        when f.source_type = 'packet_contact' then
          case lower(trim(f.source_path))
            when 'buyer_1.full_name' then rl_b1.id
            when 'buyer_2.full_name' then rl_b2.id
            when 'seller_1.full_name' then rl_s1.id
            when 'seller_2.full_name' then rl_s2.id
            else null
          end
        else null
      end,
      case
        when f.source_type = 'settings_agent'
         and lower(trim(f.source_path)) = 'agent_full_name'
          then rl_agent.id
        when f.source_type = 'settings_brokerage'
         and lower(trim(f.source_path)) = 'broker_full_name'
          then rl_broker.id
        else null
      end
    ) as field_resolver_id
  from public.fields f
  left join resolver_lookup rl_custom
    on f.source_type = 'custom_resolver'
   and lower(trim(f.resolver_key)) = rl_custom.resolver_key
  left join resolver_lookup rl_prop_full
    on rl_prop_full.resolver_key = 'property_full_address'
  left join resolver_lookup rl_prop_cs
    on rl_prop_cs.resolver_key = 'property_city_state_zip'
  left join resolver_lookup rl_b1
    on rl_b1.resolver_key = 'buyer_1_full_name'
  left join resolver_lookup rl_b2
    on rl_b2.resolver_key = 'buyer_2_full_name'
  left join resolver_lookup rl_s1
    on rl_s1.resolver_key = 'seller_1_full_name'
  left join resolver_lookup rl_s2
    on rl_s2.resolver_key = 'seller_2_full_name'
  left join resolver_lookup rl_agent
    on rl_agent.resolver_key = 'agent_full_name'
  left join resolver_lookup rl_broker
    on rl_broker.resolver_key = 'broker_full_name'
  where f.status = 'ACTIVE'
    and f.source_type in (
      'custom_resolver',
      'packet_property',
      'packet_contact',
      'settings_agent',
      'settings_brokerage'
    )
)
update public.fields f
set
  field_resolver_id = frm.field_resolver_id,
  update_date = now()
from field_resolver_match frm
where f.id = frm.field_id
  and frm.field_resolver_id is not null
  and f.field_resolver_id is distinct from frm.field_resolver_id;

-- ---------------------------------------------------------------------------
-- Validation queries (run manually after apply; see also
-- supabase/notes/field_resolvers_validation_queries.sql)
-- ---------------------------------------------------------------------------
--
-- -- Seed count (expect 9):
-- select count(*) from public.field_resolvers where status = 'ACTIVE';
--
-- -- Backfill coverage by catalog entry:
-- select fr.resolver_key, count(f.id) as linked_field_count
-- from public.field_resolvers fr
-- left join public.fields f on f.field_resolver_id = fr.id and f.status = 'ACTIVE'
-- where fr.status = 'ACTIVE'
-- group by fr.resolver_key order by fr.resolver_key;
--
-- -- Orphan FK check (expect 0 rows):
-- select f.id, f.field_key, f.field_resolver_id
-- from public.fields f
-- left join public.field_resolvers fr on fr.id = f.field_resolver_id
-- where f.field_resolver_id is not null and fr.id is null;
--
-- -- field_instances safety (override count should match pre-migration baseline):
-- select count(*) filter (where is_override = true) from public.field_instances
-- where status = 'ACTIVE';
