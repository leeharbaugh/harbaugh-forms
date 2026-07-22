-- Remove abandoned public.contract_details architecture.
--
-- Prior conversion (20260721190000) already made the 64 ACTIVE catalog fields
-- that used source_type = 'contract_details' into manual_only. This migration
-- completes the deletion phase Lee approved on 2026-07-22:
--   * drop the empty contract_details table and its policies/triggers/indexes;
--   * remove 'contract_details' from fields_source_type_check;
--   * convert the 6 ACTIVE custom_resolver fields that only read the empty
--     table (survey-option / effective day-month-year helpers) to manual_only
--     so catalog rows are not stranded after resolver code is deleted;
--   * preserve mappings, coordinates, defaults, and packet field instances.
--
-- Historical migrations that created the table remain intact.
-- Does not touch listing_agreement_details.

do $$
declare
  v_row_count integer;
  v_source_type_fields integer;
  v_instance_refs integer;
  v_custom_pending integer;
  v_custom_converted integer;
  v_missing text;
begin
  -- -----------------------------------------------------------------------
  -- Preconditions
  -- -----------------------------------------------------------------------
  if to_regclass('public.contract_details') is null then
    -- Idempotent path: table already gone. Still enforce catalog invariants.
    if exists (
      select 1
      from public.fields
      where source_type = 'contract_details'
    ) then
      raise exception
        'remove_contract_details_architecture: table already dropped but fields still use source_type = contract_details';
    end if;

    -- Ensure check constraint no longer allows contract_details if present.
    if exists (
      select 1
      from pg_constraint
      where conname = 'fields_source_type_check'
        and pg_get_constraintdef(oid) like '%contract_details%'
    ) then
      alter table public.fields drop constraint fields_source_type_check;
      alter table public.fields
        add constraint fields_source_type_check
        check (
          source_type is null
          or source_type = any (
            array[
              'settings_agent'::text,
              'settings_brokerage'::text,
              'packet_contact'::text,
              'packet_property'::text,
              'packet'::text,
              'buyer_rep_details'::text,
              'listing_agreement_details'::text,
              'representation_agreement'::text,
              'static_default'::text,
              'custom_resolver'::text,
              'manual_only'::text,
              'packet_instance'::text
            ]
          )
        );
    end if;

    return;
  end if;

  select count(*)::integer into v_row_count from public.contract_details;
  if v_row_count <> 0 then
    raise exception
      'remove_contract_details_architecture refused: contract_details has % row(s); expected 0',
      v_row_count;
  end if;

  select count(*)::integer
  into v_source_type_fields
  from public.fields
  where source_type = 'contract_details';

  if v_source_type_fields <> 0 then
    raise exception
      'remove_contract_details_architecture refused: % field(s) still have source_type = contract_details',
      v_source_type_fields;
  end if;

  select count(*)::integer
  into v_instance_refs
  from public.field_instances
  where source = 'contract_details';

  if v_instance_refs <> 0 then
    raise exception
      'remove_contract_details_architecture refused: % field_instance(s) have source = contract_details',
      v_instance_refs;
  end if;

  -- -----------------------------------------------------------------------
  -- Convert table-dependent custom_resolver fields to manual_only.
  -- These six ACTIVE fields only resolve via context.contractDetails, which
  -- has always been null with zero table rows.
  -- -----------------------------------------------------------------------
  select count(*)::integer
  into v_custom_pending
  from public.fields
  where id in (
      '14be03f8-b259-4b23-bda3-ebe2c92c238c', -- contract_survey_option_1
      '45243a76-65e6-4c41-8f46-94a8e4dae74a', -- contract_survey_option_2
      '63332f49-28a0-475b-8f91-fe3e25469b06', -- contract_survey_option_3
      '6ecc9d0d-b686-485b-a843-52b6a823a5d3', -- contract_effective_day
      '962653cf-db0a-436a-ae79-4056b5e800ea', -- contract_effective_month
      'bb7c7355-bfa7-47ae-85b6-70234ef2a218'  -- contract_effective_year
    )
    and status = 'ACTIVE'
    and source_type = 'custom_resolver'
    and resolver_key in (
      'contract_survey_option_seller_existing',
      'contract_survey_option_buyer_new',
      'contract_survey_option_seller_new',
      'contract_effective_day',
      'contract_effective_month',
      'contract_effective_year'
    );

  update public.fields
  set
    source_type = 'manual_only',
    source_path = null,
    resolver_key = null
  where id in (
      '14be03f8-b259-4b23-bda3-ebe2c92c238c',
      '45243a76-65e6-4c41-8f46-94a8e4dae74a',
      '63332f49-28a0-475b-8f91-fe3e25469b06',
      '6ecc9d0d-b686-485b-a843-52b6a823a5d3',
      '962653cf-db0a-436a-ae79-4056b5e800ea',
      'bb7c7355-bfa7-47ae-85b6-70234ef2a218'
    )
    and status = 'ACTIVE'
    and source_type = 'custom_resolver'
    and resolver_key in (
      'contract_survey_option_seller_existing',
      'contract_survey_option_buyer_new',
      'contract_survey_option_seller_new',
      'contract_effective_day',
      'contract_effective_month',
      'contract_effective_year'
    );

  get diagnostics v_custom_converted = row_count;

  if v_custom_pending > 0 and v_custom_converted <> v_custom_pending then
    raise exception
      'remove_contract_details_architecture custom-resolver conversion mismatch: pending=%, converted=%',
      v_custom_pending,
      v_custom_converted;
  end if;

  if exists (
    select 1
    from public.fields
    where id in (
        '14be03f8-b259-4b23-bda3-ebe2c92c238c',
        '45243a76-65e6-4c41-8f46-94a8e4dae74a',
        '63332f49-28a0-475b-8f91-fe3e25469b06',
        '6ecc9d0d-b686-485b-a843-52b6a823a5d3',
        '962653cf-db0a-436a-ae79-4056b5e800ea',
        'bb7c7355-bfa7-47ae-85b6-70234ef2a218'
      )
      and status = 'ACTIVE'
      and not (
        source_type = 'manual_only'
        and source_path is null
        and resolver_key is null
      )
  ) then
    raise exception
      'remove_contract_details_architecture failed: converted custom-resolver fields do not match manual_only shape';
  end if;

  -- -----------------------------------------------------------------------
  -- Shrink fields_source_type_check (remove contract_details).
  -- -----------------------------------------------------------------------
  alter table public.fields drop constraint if exists fields_source_type_check;
  alter table public.fields
    add constraint fields_source_type_check
    check (
      source_type is null
      or source_type = any (
        array[
          'settings_agent'::text,
          'settings_brokerage'::text,
          'packet_contact'::text,
          'packet_property'::text,
          'packet'::text,
          'buyer_rep_details'::text,
          'listing_agreement_details'::text,
          'representation_agreement'::text,
          'static_default'::text,
          'custom_resolver'::text,
          'manual_only'::text,
          'packet_instance'::text
        ]
      )
    );

  -- -----------------------------------------------------------------------
  -- Drop table-specific policies / trigger, then the table (no CASCADE).
  -- Indexes and table constraints are removed with the table.
  -- Shared public.set_update_date() is retained.
  -- -----------------------------------------------------------------------
  drop policy if exists "contract_details_select" on public.contract_details;
  drop policy if exists "contract_details_insert" on public.contract_details;
  drop policy if exists "contract_details_update" on public.contract_details;
  drop policy if exists "contract_details_authenticated_all" on public.contract_details;

  drop trigger if exists contract_details_set_update_date on public.contract_details;

  drop table public.contract_details;

  -- -----------------------------------------------------------------------
  -- Postconditions
  -- -----------------------------------------------------------------------
  if to_regclass('public.contract_details') is not null then
    raise exception
      'remove_contract_details_architecture postcondition failed: contract_details still exists';
  end if;

  if exists (
    select 1 from public.fields where source_type = 'contract_details'
  ) then
    raise exception
      'remove_contract_details_architecture postcondition failed: fields still reference contract_details';
  end if;

  if exists (
    select 1 from public.field_instances where source = 'contract_details'
  ) then
    raise exception
      'remove_contract_details_architecture postcondition failed: field_instances still reference contract_details';
  end if;

  -- Shared helper must remain.
  if to_regprocedure('public.set_update_date()') is null then
    raise exception
      'remove_contract_details_architecture postcondition failed: shared set_update_date() missing';
  end if;

  -- Unrelated core tables must remain.
  select string_agg(expected.table_name, ', ' order by expected.table_name)
  into v_missing
  from (
    values
      ('fields'),
      ('field_instances'),
      ('packets'),
      ('properties'),
      ('listing_agreement_details'),
      ('buyer_rep_details'),
      ('property_hoas')
  ) as expected(table_name)
  where to_regclass(format('public.%I', expected.table_name)) is null;

  if v_missing is not null then
    raise exception
      'remove_contract_details_architecture postcondition failed: unrelated tables missing: %',
      v_missing;
  end if;
end $$;
