-- Remove obsolete brokerage_settings.default_* preference columns.
--
-- Created in 20250608120000_initial_schema.sql before scoped field_defaults.
-- Live checks (2026-07-22) confirmed:
--   * zero TypeScript readers/writers for these columns;
--   * zero catalog fields with matching source_path;
--   * Settings UI only reads/writes genuine profile fields;
--   * SETTINGS_BROKERAGE_SOURCE_PATHS has no default_* entries;
--   * preferences now live in Personal/Organization field_defaults.
--
-- Does not alter surviving brokerage identity/profile values.
-- Historical migrations remain intact.

do $$
declare
  v_missing text;
  v_field_refs integer;
  v_cols_remaining integer;
begin
  if to_regclass('public.brokerage_settings') is null then
    raise exception
      'remove_brokerage_legacy_default_columns refused: brokerage_settings missing';
  end if;

  -- Idempotent: if none of the seven columns remain, ensure no catalog refs and exit.
  select count(*)::integer into v_cols_remaining
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'brokerage_settings'
    and column_name = any (
      array[
        'default_market_area',
        'default_buyer_rep_compensation_percent',
        'default_protection_period_days',
        'default_county_for_payment',
        'default_employer_relocation',
        'default_special_provisions',
        'default_intermediary_allowed'
      ]
    );

  if v_cols_remaining = 0 then
    if exists (
      select 1
      from public.fields
      where source_path = any (
        array[
          'default_market_area',
          'default_buyer_rep_compensation_percent',
          'default_protection_period_days',
          'default_county_for_payment',
          'default_employer_relocation',
          'default_special_provisions',
          'default_intermediary_allowed'
        ]
      )
    ) then
      raise exception
        'remove_brokerage_legacy_default_columns: columns already dropped but fields still reference default_* paths';
    end if;
    return;
  end if;

  if v_cols_remaining <> 7 then
    raise exception
      'remove_brokerage_legacy_default_columns refused: expected all 7 legacy default_* columns present, found %',
      v_cols_remaining;
  end if;

  -- Expected types (abort if schema drifted).
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brokerage_settings'
      and column_name = 'default_market_area' and data_type = 'character varying'
  ) then
    raise exception 'remove_brokerage_legacy_default_columns refused: unexpected type for default_market_area';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brokerage_settings'
      and column_name = 'default_buyer_rep_compensation_percent' and data_type = 'numeric'
  ) then
    raise exception 'remove_brokerage_legacy_default_columns refused: unexpected type for default_buyer_rep_compensation_percent';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brokerage_settings'
      and column_name = 'default_protection_period_days' and data_type = 'integer'
  ) then
    raise exception 'remove_brokerage_legacy_default_columns refused: unexpected type for default_protection_period_days';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brokerage_settings'
      and column_name = 'default_county_for_payment' and data_type = 'character varying'
  ) then
    raise exception 'remove_brokerage_legacy_default_columns refused: unexpected type for default_county_for_payment';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brokerage_settings'
      and column_name = 'default_employer_relocation' and data_type = 'character varying'
  ) then
    raise exception 'remove_brokerage_legacy_default_columns refused: unexpected type for default_employer_relocation';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brokerage_settings'
      and column_name = 'default_special_provisions' and data_type = 'text'
  ) then
    raise exception 'remove_brokerage_legacy_default_columns refused: unexpected type for default_special_provisions';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brokerage_settings'
      and column_name = 'default_intermediary_allowed' and data_type = 'boolean'
  ) then
    raise exception 'remove_brokerage_legacy_default_columns refused: unexpected type for default_intermediary_allowed';
  end if;

  select count(*)::integer into v_field_refs
  from public.fields
  where source_path = any (
    array[
      'default_market_area',
      'default_buyer_rep_compensation_percent',
      'default_protection_period_days',
      'default_county_for_payment',
      'default_employer_relocation',
      'default_special_provisions',
      'default_intermediary_allowed'
    ]
  );

  if v_field_refs <> 0 then
    raise exception
      'remove_brokerage_legacy_default_columns refused: % field(s) still use a legacy default_* source_path',
      v_field_refs;
  end if;

  -- Drop column-specific check before dropping the column.
  alter table public.brokerage_settings
    drop constraint if exists brokerage_settings_protection_period_non_negative;

  alter table public.brokerage_settings
    drop column default_market_area,
    drop column default_buyer_rep_compensation_percent,
    drop column default_protection_period_days,
    drop column default_county_for_payment,
    drop column default_employer_relocation,
    drop column default_special_provisions,
    drop column default_intermediary_allowed;

  -- Postconditions: legacy columns gone; profile columns remain.
  select count(*)::integer into v_cols_remaining
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'brokerage_settings'
    and column_name like 'default\_%' escape '\';

  if v_cols_remaining <> 0 then
    raise exception
      'remove_brokerage_legacy_default_columns postcondition failed: % default_* column(s) remain',
      v_cols_remaining;
  end if;

  select string_agg(expected.column_name, ', ' order by expected.column_name)
  into v_missing
  from (
    values
      ('brokerage_name'),
      ('brokerage_address'),
      ('brokerage_city'),
      ('brokerage_state'),
      ('brokerage_zip'),
      ('brokerage_office_phone'),
      ('brokerage_license_number'),
      ('brokerage_email'),
      ('broker_first_name'),
      ('broker_last_name'),
      ('broker_license_number'),
      ('broker_phone'),
      ('broker_email'),
      ('agent_first_name'),
      ('agent_last_name'),
      ('agent_license_number'),
      ('agent_phone'),
      ('agent_email'),
      ('supervisor_name'),
      ('status')
  ) as expected(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'brokerage_settings'
      and c.column_name = expected.column_name
  );

  if v_missing is not null then
    raise exception
      'remove_brokerage_legacy_default_columns postcondition failed: profile columns missing: %',
      v_missing;
  end if;

  if not exists (
    select 1 from public.brokerage_settings where status = 'ACTIVE'
  ) then
    raise exception
      'remove_brokerage_legacy_default_columns postcondition failed: no ACTIVE brokerage_settings row';
  end if;
end $$;
