-- TXR-1102 Residential Lease Listing Agreement — term dates, late charges day,
-- and page 11 broker/agent signature block fields + mappings.
-- Does not touch public.forms.

-- ---------------------------------------------------------------------------
-- Task 1 — listing_agreement_details columns
-- ---------------------------------------------------------------------------

alter table public.listing_agreement_details
  add column if not exists lease_listing_begin_date date,
  add column if not exists lease_listing_end_date date,
  add column if not exists late_charges_incurred_day integer not null default 2;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_late_charges_incurred_day_nonneg'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_late_charges_incurred_day_nonneg
      check (late_charges_incurred_day >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Resolve TXR-1102 form
-- ---------------------------------------------------------------------------

create temp table txr_1102_missing_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in ('txr-1102', 'txr_1102')
    or lower(trim(f.form_code)) like '%txr-1102%'
    or lower(trim(f.form_code)) like '%txr_1102%'
    or (
      lower(f.form_name) like '%residential%'
      and lower(f.form_name) like '%lease%'
      and lower(f.form_name) like '%listing%'
    )
  )
order by
  case when lower(trim(f.form_code)) in ('txr-1102', 'txr_1102') then 0 else 1 end,
  case
    when lower(f.form_name) like '%txr-1102%' or lower(f.form_name) like '%1102%' then 0
    else 1
  end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Task 2 — Upsert field definitions (idempotent by field_key)
-- ---------------------------------------------------------------------------

create temp table txr_1102_missing_fields_touched (
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
      'lease_listing_begin_date',
      'lease_listing_begin_date',
      'Lease Listing Begin Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1102 · Lease listing term begin date from listing_agreement_details.',
      'listing_agreement_details',
      'lease_listing_begin_date',
      null::text
    ),
    (
      'lease_listing_end_date',
      'lease_listing_end_date',
      'Lease Listing End Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1102 · Lease listing term end date from listing_agreement_details.',
      'listing_agreement_details',
      'lease_listing_end_date',
      null::text
    ),
    (
      'lease_late_charges_incurred_day',
      'lease_late_charges_incurred_day',
      'Lease Late Charges Incurred Day',
      'integer',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1102 · Day of month late charges are incurred from listing_agreement_details.',
      'listing_agreement_details',
      'late_charges_incurred_day',
      null::text
    ),
    (
      'broker_full_name',
      'broker_full_name',
      'Broker Full Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Designated broker full name from brokerage_settings.',
      'settings_brokerage',
      'broker_full_name',
      null::text
    ),
    (
      'broker_license_number',
      'broker_license_number',
      'Broker License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Individual broker license number from brokerage_settings (not brokerage_license_number).',
      'settings_brokerage',
      'broker_license_number',
      null::text
    ),
    (
      'lease_broker_signature_checkbox',
      'lease_broker_signature_checkbox',
      'Lease Broker Signature Checkbox',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1102 · Broker signature type checkbox (manual).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_broker_associate_signature_checkbox',
      'lease_broker_associate_signature_checkbox',
      'Lease Broker Associate Signature Checkbox',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1102 · Broker associate signature type checkbox (manual).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'agent_full_name',
      'agent_full_name',
      'Agent Full Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Agent full name from agent settings.',
      'settings_agent',
      'agent_full_name',
      null::text
    ),
    (
      'agent_license_number',
      'agent_license_number',
      'Agent License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Agent license number from agent settings.',
      'settings_agent',
      'agent_license_number',
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
insert into txr_1102_missing_fields_touched (field_key, action)
select field_key, 'inserted' from inserted_fields
union all
select field_key, 'updated' from updated_fields;

-- ---------------------------------------------------------------------------
-- Task 3 — PDF mappings
-- ---------------------------------------------------------------------------

create temp table txr_1102_missing_placement_seed (
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

insert into txr_1102_missing_placement_seed (
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
  ('lease_listing_begin_date', 'Page 1 lease listing begin date', null::integer, 1, 195, 758, 95, 14, 'text'),
  ('lease_listing_end_date', 'Page 1 lease listing end date', null::integer, 1, 432, 758, 110, 14, 'text'),
  ('lease_late_charges_incurred_day', 'Page 9 late charges incurred day', null::integer, 9, 285, 565, 45, 14, 'text'),
  ('broker_full_name', 'Page 11 broker printed name', null::integer, 11, 47, 615, 215, 14, 'text'),
  ('broker_license_number', 'Page 11 broker license number', null::integer, 11, 270, 615, 90, 14, 'text'),
  ('lease_broker_signature_checkbox', 'Page 11 broker signature checkbox', null::integer, 11, 47, 645, 14, 14, 'checkbox'),
  ('lease_broker_associate_signature_checkbox', 'Page 11 broker associate signature checkbox', null::integer, 11, 47, 690, 14, 14, 'checkbox'),
  ('agent_full_name', 'Page 11 agent printed name', null::integer, 11, 47, 735, 230, 14, 'text'),
  ('agent_license_number', 'Page 11 agent license number', null::integer, 11, 420, 735, 100, 14, 'text');

create temp table txr_1102_missing_mappings_touched (
  field_key text not null,
  page_number integer not null,
  occurrence_index integer,
  action text not null
) on commit drop;

-- Deactivate active mappings on wrong page/occurrence for these field keys (TXR-1102 only)
update public.form_field_mappings ffm
set
  status = 'INACTIVE',
  update_date = now()
from txr_1102_missing_form tf,
     public.fields fld
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.id
  and fld.status = 'ACTIVE'
  and ffm.status = 'ACTIVE'
  and exists (
    select 1
    from txr_1102_missing_placement_seed ps
    where lower(ps.field_key) = lower(fld.field_key)
  )
  and not exists (
    select 1
    from txr_1102_missing_placement_seed ps
    where lower(ps.field_key) = lower(fld.field_key)
      and ps.page_number = ffm.page_number
      and coalesce(ps.occurrence_index, -1) = coalesce(ffm.occurrence_index, -1)
  );

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
    notes = 'TXR-1102 lease listing term, late charges, and signature block placement',
    status = 'ACTIVE',
    update_date = now()
  from txr_1102_missing_form tf,
       txr_1102_missing_placement_seed ps,
       public.fields fld
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
    and ffm.page_number = ps.page_number
    and coalesce(ffm.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
    and ffm.status = 'ACTIVE'
  returning fld.field_key, ffm.page_number, ffm.occurrence_index
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
    'TXR-1102 lease listing term, late charges, and signature block placement'
  from txr_1102_missing_placement_seed ps
  inner join txr_1102_missing_form tf on true
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
insert into txr_1102_missing_mappings_touched (field_key, page_number, occurrence_index, action)
select field_key, page_number, occurrence_index, 'updated' from updated_mappings
union all
select field_key, page_number, occurrence_index, 'inserted' from inserted_mappings;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

do $$
declare
  v_form_id bigint;
  v_fields_inserted integer;
  v_fields_updated integer;
  v_mappings_inserted integer;
  v_mappings_updated integer;
  v_unresolved_fields text;
  v_unresolved_mappings text;
begin
  select form_id into v_form_id from txr_1102_missing_form limit 1;

  select count(*) into v_fields_inserted
  from txr_1102_missing_fields_touched where action = 'inserted';

  select count(*) into v_fields_updated
  from txr_1102_missing_fields_touched where action = 'updated';

  select count(*) into v_mappings_inserted
  from txr_1102_missing_mappings_touched where action = 'inserted';

  select count(*) into v_mappings_updated
  from txr_1102_missing_mappings_touched where action = 'updated';

  select string_agg(expected.field_key, ', ' order by expected.field_key)
  into v_unresolved_fields
  from (
    values
      ('lease_listing_begin_date'),
      ('lease_listing_end_date'),
      ('lease_late_charges_incurred_day'),
      ('broker_full_name'),
      ('broker_license_number'),
      ('lease_broker_signature_checkbox'),
      ('lease_broker_associate_signature_checkbox'),
      ('agent_full_name'),
      ('agent_license_number')
  ) as expected(field_key)
  left join txr_1102_missing_fields_touched touched
    on lower(touched.field_key) = lower(expected.field_key)
  where touched.field_key is null;

  select string_agg(
    ps.field_key || ' (page ' || ps.page_number || ')',
    ', '
    order by ps.field_key
  )
  into v_unresolved_mappings
  from txr_1102_missing_placement_seed ps
  left join txr_1102_missing_mappings_touched touched
    on lower(touched.field_key) = lower(ps.field_key)
   and touched.page_number = ps.page_number
   and coalesce(touched.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
  where touched.field_key is null
    and v_form_id is not null;

  raise notice 'TXR-1102 missing fields/mappings migration report';
  raise notice '  form_id: %', coalesce(v_form_id::text, 'NOT FOUND');
  raise notice '  fields inserted: %', v_fields_inserted;
  raise notice '  fields updated: %', v_fields_updated;
  raise notice '  mappings inserted: %', v_mappings_inserted;
  raise notice '  mappings updated: %', v_mappings_updated;

  if v_unresolved_fields is not null then
    raise notice '  unresolved fields: %', v_unresolved_fields;
  end if;

  if v_form_id is null then
    raise notice '  unresolved mappings: form not found; no mappings applied';
  elsif v_unresolved_mappings is not null then
    raise notice '  unresolved mappings: %', v_unresolved_mappings;
  end if;
end $$;
