-- TREC 20-19 / TXR 1601 One to Four Family Residential Contract:
-- buyer-side intermediary associate fields (settings_agent / settings_brokerage)
-- and page 11 PDF mappings. Seller-side intermediary fields remain manual_only.
-- Does not touch public.forms or hard-delete anything.

-- ---------------------------------------------------------------------------
-- Resolve TXR 1601 / TREC 20-19 One to Four Contract form
-- ---------------------------------------------------------------------------

create temp table txr_1601_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in (
      'txr-1601',
      'txr_1601',
      'trec-20-19',
      'trec_20_19'
    )
    or lower(trim(f.form_code)) like '%txr-1601%'
    or lower(trim(f.form_code)) like '%txr_1601%'
    or lower(trim(f.form_code)) like '%trec-20-19%'
    or lower(trim(f.form_code)) like '%trec_20_19%'
    or (
      lower(f.form_name) like '%one%four%'
      and lower(f.form_name) like '%contract%'
    )
    or (
      lower(f.form_name) like '%one-to-four%'
      and lower(f.form_name) like '%contract%'
    )
  )
order by
  case
    when lower(trim(f.form_code)) in ('txr-1601', 'txr_1601', 'trec-20-19', 'trec_20_19') then 0
    else 1
  end,
  case when lower(f.form_name) like '%txr-1601%' or lower(f.form_name) like '%trec-20-19%' then 0 else 1 end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Task 1 — Upsert buyer intermediary field definitions
-- ---------------------------------------------------------------------------

create temp table txr_1601_buyer_intermediary_fields_touched (
  field_key text primary key,
  action text not null
) on commit drop;

with field_seed (
  field_key,
  field_name,
  field_label,
  field_data_type,
  field_widget_type,
  default_value,
  default_checked,
  required,
  notes,
  source_type,
  source_path,
  resolver_key
) as (
  values
    (
      'contract_intermediary_buyer_associate_name',
      'contract_intermediary_buyer_associate_name',
      'Intermediary Buyer Associate Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary associate name from agent settings.',
      'settings_agent',
      'agent_full_name',
      null::text
    ),
    (
      'contract_intermediary_buyer_team_name',
      'contract_intermediary_buyer_team_name',
      'Intermediary Buyer Team Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary team name (no agent_team_name source; manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_email',
      'contract_intermediary_buyer_associate_email',
      'Intermediary Buyer Associate Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary associate email from agent settings.',
      'settings_agent',
      'agent_email',
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_phone',
      'contract_intermediary_buyer_associate_phone',
      'Intermediary Buyer Associate Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary associate phone from agent settings.',
      'settings_agent',
      'agent_phone',
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_license_number',
      'contract_intermediary_buyer_associate_license_number',
      'Intermediary Buyer Associate License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary associate license from agent settings.',
      'settings_agent',
      'agent_license_number',
      null::text
    ),
    (
      'contract_intermediary_buyer_supervisor_name',
      'contract_intermediary_buyer_supervisor_name',
      'Intermediary Buyer Licensed Supervisor Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary licensed supervisor name from brokerage settings.',
      'settings_brokerage',
      'supervisor_name',
      null::text
    ),
    (
      'contract_intermediary_buyer_supervisor_phone',
      'contract_intermediary_buyer_supervisor_phone',
      'Intermediary Buyer Licensed Supervisor Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary licensed supervisor phone from brokerage settings.',
      'settings_brokerage',
      'supervisor_phone',
      null::text
    ),
    (
      'contract_intermediary_buyer_supervisor_license_number',
      'contract_intermediary_buyer_supervisor_license_number',
      'Intermediary Buyer Licensed Supervisor License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary licensed supervisor license from brokerage settings.',
      'settings_brokerage',
      'supervisor_license_number',
      null::text
    )
),
inserted_fields as (
  insert into public.fields (
    field_key,
    field_name,
    field_label,
    field_data_type,
    field_widget_type,
    default_value,
    default_checked,
    required,
    notes,
    source_type,
    source_path,
    resolver_key,
    status
  )
  select
    s.field_key,
    s.field_name,
    s.field_label,
    s.field_data_type,
    s.field_widget_type,
    s.default_value,
    s.default_checked,
    s.required,
    s.notes,
    s.source_type,
    s.source_path,
    s.resolver_key,
    'ACTIVE'
  from field_seed s
  where not exists (
    select 1
    from public.fields existing
    where lower(existing.field_key) = lower(s.field_key)
      and existing.status = 'ACTIVE'
  )
  returning field_key
),
updated_fields as (
  update public.fields target
  set
    field_name = s.field_name,
    field_label = s.field_label,
    field_data_type = s.field_data_type,
    field_widget_type = s.field_widget_type,
    default_value = s.default_value,
    default_checked = s.default_checked,
    required = s.required,
    notes = s.notes,
    source_type = s.source_type,
    source_path = s.source_path,
    resolver_key = s.resolver_key,
    update_date = now()
  from field_seed s
  where lower(target.field_key) = lower(s.field_key)
    and target.status = 'ACTIVE'
  returning target.field_key
)
insert into txr_1601_buyer_intermediary_fields_touched (field_key, action)
select field_key, 'inserted' from inserted_fields
union all
select field_key, 'updated' from updated_fields;

-- ---------------------------------------------------------------------------
-- Task 2 & 3 — Page 11 buyer intermediary mappings; duplicate prevention
-- ---------------------------------------------------------------------------

create temp table txr_1601_buyer_intermediary_placement_seed (
  field_key text not null,
  mapping_name text not null,
  occurrence_index integer,
  page_number integer not null,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  field_widget_type text not null
) on commit drop;

insert into txr_1601_buyer_intermediary_placement_seed (
  field_key,
  mapping_name,
  occurrence_index,
  page_number,
  x,
  y,
  width,
  height,
  field_widget_type
)
values
  (
    'contract_intermediary_buyer_associate_name',
    'Page 11 intermediary buyer associate name',
    null::integer,
    11,
    185,
    856,
    220,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_team_name',
    'Page 11 intermediary buyer team name',
    null::integer,
    11,
    112,
    888,
    240,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_associate_email',
    'Page 11 intermediary buyer associate email',
    null::integer,
    11,
    145,
    920,
    240,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_associate_phone',
    'Page 11 intermediary buyer associate phone',
    null::integer,
    11,
    170,
    952,
    120,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_associate_license_number',
    'Page 11 intermediary buyer associate license number',
    null::integer,
    11,
    415,
    952,
    120,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_supervisor_name',
    'Page 11 intermediary buyer licensed supervisor name',
    null::integer,
    11,
    215,
    984,
    240,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_supervisor_phone',
    'Page 11 intermediary buyer licensed supervisor phone',
    null::integer,
    11,
    240,
    1016,
    120,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_supervisor_license_number',
    'Page 11 intermediary buyer licensed supervisor license number',
    null::integer,
    11,
    440,
    1016,
    120,
    14,
    'text'
  );

create temp table txr_1601_buyer_intermediary_mappings_touched (
  field_key text not null,
  page_number integer not null,
  occurrence_index integer,
  action text not null
) on commit drop;

create temp table txr_1601_buyer_intermediary_mappings_deactivated (
  field_key text not null,
  page_number integer not null,
  occurrence_index integer,
  reason text not null
) on commit drop;

-- Deactivate active mappings on wrong page for buyer intermediary fields
with deactivated_wrong_page as (
  update public.form_field_mappings ffm
  set
    status = 'INACTIVE',
    update_date = now()
  from txr_1601_form tf,
       public.fields fld,
       txr_1601_buyer_intermediary_placement_seed ps
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
    and ffm.status = 'ACTIVE'
    and ffm.page_number <> ps.page_number
  returning
    fld.field_key,
    ffm.page_number,
    ffm.occurrence_index
)
insert into txr_1601_buyer_intermediary_mappings_deactivated (field_key, page_number, occurrence_index, reason)
select field_key, page_number, occurrence_index, 'wrong page' from deactivated_wrong_page;

-- Deactivate active mappings with no matching seeded placement (page/occurrence mismatch)
with deactivated_stale as (
  update public.form_field_mappings ffm
  set
    status = 'INACTIVE',
    update_date = now()
  from txr_1601_form tf,
       public.fields fld
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and fld.status = 'ACTIVE'
    and ffm.status = 'ACTIVE'
    and exists (
      select 1
      from txr_1601_buyer_intermediary_placement_seed ps
      where lower(ps.field_key) = lower(fld.field_key)
    )
    and not exists (
      select 1
      from txr_1601_buyer_intermediary_placement_seed ps
      where lower(ps.field_key) = lower(fld.field_key)
        and ps.page_number = ffm.page_number
        and coalesce(ps.occurrence_index, -1) = coalesce(ffm.occurrence_index, -1)
    )
  returning
    fld.field_key,
    ffm.page_number,
    ffm.occurrence_index
)
insert into txr_1601_buyer_intermediary_mappings_deactivated (field_key, page_number, occurrence_index, reason)
select field_key, page_number, occurrence_index, 'stale placement' from deactivated_stale;

with updated_mappings as (
  update public.form_field_mappings ffm
  set
    mapping_name = ps.mapping_name,
    x = ps.x,
    y = ps.y,
    width = ps.width,
    height = ps.height,
    page_width = 612,
    page_height = 792,
    font_size = 9,
    field_widget_type = ps.field_widget_type,
    notes = 'TREC 20-19 / TXR 1601 intermediary buyer agent fields migration',
    status = 'ACTIVE',
    update_date = now()
  from txr_1601_form tf,
       txr_1601_buyer_intermediary_placement_seed ps,
       public.fields fld
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
    and ffm.page_number = ps.page_number
    and coalesce(ffm.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
    and ffm.status = 'ACTIVE'
  returning
    fld.field_key,
    ffm.page_number,
    ffm.occurrence_index
),
inserted_mappings as (
  insert into public.form_field_mappings (
    form_id,
    field_id,
    mapping_name,
    occurrence_index,
    page_number,
    x,
    y,
    width,
    height,
    page_width,
    page_height,
    font_size,
    field_widget_type,
    notes
  )
  select
    tf.form_id,
    fld.id,
    ps.mapping_name,
    ps.occurrence_index,
    ps.page_number,
    ps.x,
    ps.y,
    ps.width,
    ps.height,
    612,
    792,
    9,
    ps.field_widget_type,
    'TREC 20-19 / TXR 1601 intermediary buyer agent fields migration'
  from txr_1601_buyer_intermediary_placement_seed ps
  inner join txr_1601_form tf on true
  inner join public.fields fld
    on lower(fld.field_key) = lower(ps.field_key)
   and fld.status = 'ACTIVE'
  where not exists (
    select 1
    from public.form_field_mappings existing
    where existing.form_id = tf.form_id
      and existing.field_id = fld.id
      and existing.page_number = ps.page_number
      and coalesce(existing.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
      and existing.status = 'ACTIVE'
  )
  returning
    (select field_key from public.fields where id = field_id) as field_key,
    page_number,
    occurrence_index
)
insert into txr_1601_buyer_intermediary_mappings_touched (field_key, page_number, occurrence_index, action)
select field_key, page_number, occurrence_index, 'updated' from updated_mappings
union all
select field_key, page_number, occurrence_index, 'inserted' from inserted_mappings;

-- ---------------------------------------------------------------------------
-- Task 4 — Report
-- ---------------------------------------------------------------------------

do $$
declare
  v_form_id bigint;
  v_fields_inserted integer;
  v_fields_updated integer;
  v_mappings_inserted integer;
  v_mappings_updated integer;
  v_mappings_deactivated integer;
  v_unresolved_fields text;
  v_unresolved_mappings text;
  v_below_page_fold text;
begin
  select form_id into v_form_id from txr_1601_form limit 1;

  select count(*) into v_fields_inserted
  from txr_1601_buyer_intermediary_fields_touched
  where action = 'inserted';

  select count(*) into v_fields_updated
  from txr_1601_buyer_intermediary_fields_touched
  where action = 'updated';

  select count(*) into v_mappings_inserted
  from txr_1601_buyer_intermediary_mappings_touched
  where action = 'inserted';

  select count(*) into v_mappings_updated
  from txr_1601_buyer_intermediary_mappings_touched
  where action = 'updated';

  select count(*) into v_mappings_deactivated
  from txr_1601_buyer_intermediary_mappings_deactivated;

  select string_agg(expected.field_key, ', ' order by expected.field_key)
  into v_unresolved_fields
  from (
    values
      ('contract_intermediary_buyer_associate_name'),
      ('contract_intermediary_buyer_team_name'),
      ('contract_intermediary_buyer_associate_email'),
      ('contract_intermediary_buyer_associate_phone'),
      ('contract_intermediary_buyer_associate_license_number'),
      ('contract_intermediary_buyer_supervisor_name'),
      ('contract_intermediary_buyer_supervisor_phone'),
      ('contract_intermediary_buyer_supervisor_license_number')
  ) as expected(field_key)
  left join txr_1601_buyer_intermediary_fields_touched touched
    on lower(touched.field_key) = lower(expected.field_key)
  where touched.field_key is null;

  select string_agg(
    ps.field_key || ' (page ' || ps.page_number
      || coalesce(', occurrence ' || ps.occurrence_index::text, '')
      || ')',
    ', '
    order by ps.field_key
  )
  into v_unresolved_mappings
  from txr_1601_buyer_intermediary_placement_seed ps
  left join txr_1601_buyer_intermediary_mappings_touched touched
    on lower(touched.field_key) = lower(ps.field_key)
   and touched.page_number = ps.page_number
   and coalesce(touched.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
  where touched.field_key is null
    and v_form_id is not null;

  select string_agg(
    ps.field_key || ' (y=' || ps.y::text || ', bottom=' || (ps.y + ps.height)::text || ' > page_height 792)',
    '; '
    order by ps.field_key
  )
  into v_below_page_fold
  from txr_1601_buyer_intermediary_placement_seed ps
  where ps.y + ps.height > 792;

  raise notice 'TREC 20-19 / TXR 1601 intermediary buyer agent migration report';
  raise notice '  form_id: %', coalesce(v_form_id::text, 'NOT FOUND');
  raise notice '  fields inserted: %', v_fields_inserted;
  raise notice '  fields updated: %', v_fields_updated;
  raise notice '  mappings inserted: %', v_mappings_inserted;
  raise notice '  mappings updated: %', v_mappings_updated;
  raise notice '  mappings deactivated (duplicate prevention): %', v_mappings_deactivated;

  if v_unresolved_fields is not null then
    raise notice '  unresolved fields (no active catalog row): %', v_unresolved_fields;
  end if;

  if v_form_id is null then
    raise notice '  unresolved mappings: form not found; no mappings applied';
  elsif v_unresolved_mappings is not null then
    raise notice '  unresolved mappings: %', v_unresolved_mappings;
  end if;

  if v_below_page_fold is not null then
    raise notice '  coordinates below standard page fold (may need manual adjustment in PDF editor): %', v_below_page_fold;
  end if;
end $$;
