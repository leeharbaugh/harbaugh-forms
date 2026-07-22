-- Consolidate HOA storage onto public.property_hoas and retire redundant
-- direct HOA columns on public.properties.
--
-- Approved product decision (Lee, 2026-07-22):
--   * property_hoas remains the authoritative multi-HOA-capable store;
--   * the Property screen continues to expose one simple HOA record;
--   * that UI reads/writes the first ACTIVE property_hoas row
--     (temporary convention: order by create_date, then id);
--   * properties.hoa_name / hoa_phone / hoa_management_company are redundant;
--   * current development values in those columns are disposable test data
--     and are not backfilled;
--   * packet field instances, mappings, defaults, and owner isolation are
--     preserved.
--
-- This migration:
--   1. Redirects the two ACTIVE packet_property fields that read
--      properties.hoa_name onto the existing property_hoa_name custom resolver;
--   2. Drops only the three proven-redundant properties columns;
--   3. Asserts property_hoas schema/indexes/RLS remain intact;
--   4. Does not backfill, does not hard-delete HOA rows, and does not touch
--      packet instances or field defaults.
--
-- Retained on properties (not HOA-record duplicates):
--   has_hoa, hoa_contact_name, hoa_email, hoa_website,
--   hoa_dues_amount, hoa_dues_frequency.

do $$
declare
  v_missing text;
  v_pending integer;
  v_converted integer;
  v_hoa_table_ok boolean;
  v_rls_ok boolean;
  v_policy_count integer;
  v_index_count integer;
begin
  -- -----------------------------------------------------------------------
  -- Strict schema preconditions for the columns we are about to drop.
  -- -----------------------------------------------------------------------
  select string_agg(expected.column_name, ', ' order by expected.column_name)
  into v_missing
  from (
    values
      ('hoa_name'),
      ('hoa_phone'),
      ('hoa_management_company')
  ) as expected(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'properties'
   and c.column_name = expected.column_name
  where c.column_name is null;

  if v_missing is not null then
    raise exception
      'consolidate_property_hoa_storage precondition failed: missing properties columns: %',
      v_missing;
  end if;

  -- property_hoas must already exist with the expected core columns.
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'property_hoas'
  )
  into v_hoa_table_ok;

  if not v_hoa_table_ok then
    raise exception
      'consolidate_property_hoa_storage precondition failed: public.property_hoas is missing';
  end if;

  select string_agg(expected.column_name, ', ' order by expected.column_name)
  into v_missing
  from (
    values
      ('id'),
      ('property_id'),
      ('status'),
      ('hoa_name'),
      ('hoa_phone'),
      ('management_company_name'),
      ('management_company_phone'),
      ('management_company_email'),
      ('notes')
  ) as expected(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'property_hoas'
   and c.column_name = expected.column_name
  where c.column_name is null;

  if v_missing is not null then
    raise exception
      'consolidate_property_hoa_storage precondition failed: property_hoas missing columns: %',
      v_missing;
  end if;

  -- -----------------------------------------------------------------------
  -- Redirect ACTIVE catalog fields that still read properties.hoa_name.
  -- Field IDs verified against harbaugh-forms-dev on 2026-07-22.
  -- -----------------------------------------------------------------------
  select count(*)::integer
  into v_pending
  from public.fields
  where id in (
      '20392b1b-ef65-4eef-a664-1a0bf49d16fe', -- HOA_ASSOCIATION_NAME
      '70acefff-d8fe-495b-96c4-3d675b900911'  -- txr_2001_hoa_name
    )
    and status = 'ACTIVE'
    and source_type = 'packet_property'
    and source_path = 'hoa_name'
    and resolver_key is null;

  update public.fields
  set
    source_type = 'custom_resolver',
    source_path = null,
    resolver_key = 'property_hoa_name'
  where id in (
      '20392b1b-ef65-4eef-a664-1a0bf49d16fe',
      '70acefff-d8fe-495b-96c4-3d675b900911'
    )
    and status = 'ACTIVE'
    and source_type = 'packet_property'
    and source_path = 'hoa_name'
    and resolver_key is null;

  get diagnostics v_converted = row_count;

  if v_pending > 0 and v_converted <> v_pending then
    raise exception
      'consolidate_property_hoa_storage field redirect mismatch: pending=%, converted=%',
      v_pending,
      v_converted;
  end if;

  -- Idempotent: after the first run, pending is 0 and converted is 0.
  -- Fail if any of the two fields still read properties.hoa_name.
  if exists (
    select 1
    from public.fields
    where id in (
        '20392b1b-ef65-4eef-a664-1a0bf49d16fe',
        '70acefff-d8fe-495b-96c4-3d675b900911'
      )
      and status = 'ACTIVE'
      and not (
        source_type = 'custom_resolver'
        and source_path is null
        and resolver_key = 'property_hoa_name'
      )
  ) then
    raise exception
      'consolidate_property_hoa_storage failed: redirected HOA fields do not match expected custom_resolver/property_hoa_name shape';
  end if;

  -- No remaining ACTIVE fields may read the retired packet_property paths.
  if exists (
    select 1
    from public.fields
    where status = 'ACTIVE'
      and source_type = 'packet_property'
      and source_path in ('hoa_name', 'hoa_phone', 'hoa_management_company')
  ) then
    raise exception
      'consolidate_property_hoa_storage failed: ACTIVE packet_property fields still reference retired HOA columns';
  end if;

  -- -----------------------------------------------------------------------
  -- Drop redundant properties columns (no backfill).
  -- -----------------------------------------------------------------------
  alter table public.properties
    drop column if exists hoa_name,
    drop column if exists hoa_phone,
    drop column if exists hoa_management_company;

  -- -----------------------------------------------------------------------
  -- Postconditions: property_hoas intact; retired columns gone; retained
  -- property-level HOA attributes still present.
  -- -----------------------------------------------------------------------
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'properties'
      and column_name in ('hoa_name', 'hoa_phone', 'hoa_management_company')
  ) then
    raise exception
      'consolidate_property_hoa_storage postcondition failed: retired properties HOA columns still exist';
  end if;

  select string_agg(expected.column_name, ', ' order by expected.column_name)
  into v_missing
  from (
    values
      ('has_hoa'),
      ('hoa_contact_name'),
      ('hoa_email'),
      ('hoa_website'),
      ('hoa_dues_amount'),
      ('hoa_dues_frequency')
  ) as expected(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'properties'
   and c.column_name = expected.column_name
  where c.column_name is null;

  if v_missing is not null then
    raise exception
      'consolidate_property_hoa_storage postcondition failed: retained properties HOA columns missing: %',
      v_missing;
  end if;

  select c.relrowsecurity
  into v_rls_ok
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'property_hoas';

  if v_rls_ok is distinct from true then
    raise exception
      'consolidate_property_hoa_storage postcondition failed: property_hoas RLS is not enabled';
  end if;

  select count(*)::integer
  into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'property_hoas'
    and policyname in (
      'property_hoas_select',
      'property_hoas_insert',
      'property_hoas_update'
    );

  if v_policy_count <> 3 then
    raise exception
      'consolidate_property_hoa_storage postcondition failed: expected 3 property_hoas RLS policies, found %',
      v_policy_count;
  end if;

  select count(*)::integer
  into v_index_count
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'property_hoas'
    and indexname in (
      'property_hoas_pkey',
      'property_hoas_property_id_idx',
      'property_hoas_status_idx',
      'property_hoas_property_hoa_name_active_uidx'
    );

  if v_index_count <> 4 then
    raise exception
      'consolidate_property_hoa_storage postcondition failed: expected 4 property_hoas indexes, found %',
      v_index_count;
  end if;
end $$;
