-- TXR-2516 (06-15-15) Authorization to Furnish TILA-RESPA Integrated Disclosures
-- field catalog and first-pass PDF mappings.
-- Does not touch public.forms.

-- ---------------------------------------------------------------------------
-- Resolve TXR-2516 form
-- ---------------------------------------------------------------------------

create temp table txr_2516_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in ('txr-2516', 'txr_2516')
    or lower(trim(f.form_code)) like '%txr-2516%'
    or lower(trim(f.form_code)) like '%txr_2516%'
    or (
      lower(f.form_name) like '%tila%'
      and lower(f.form_name) like '%respa%'
      and lower(f.form_name) like '%authorization%'
    )
    or (
      lower(f.form_name) like '%authorization%'
      and lower(f.form_name) like '%furnish%'
      and lower(f.form_name) like '%disclosure%'
    )
  )
order by
  case when lower(trim(f.form_code)) in ('txr-2516', 'txr_2516') then 0 else 1 end,
  case
    when lower(f.form_name) like '%txr-2516%' or lower(f.form_name) like '%2516%' then 0
    else 1
  end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Upsert field definitions (idempotent by field_key)
-- ---------------------------------------------------------------------------

create temp table txr_2516_fields_touched (
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
      'property_address',
      'property_address',
      'Property',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Shared catalog · Property full address from packet property via property_full_address resolver.',
      'packet_property',
      null::text,
      'property_full_address'
    ),
    (
      'tila_respa_client_is_seller',
      'tila_respa_client_is_seller',
      'Client is Seller',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-2516 · Client is seller (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'tila_respa_client_is_buyer',
      'tila_respa_client_is_buyer',
      'Client is Buyer',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-2516 · Client is buyer (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'brokerage_name',
      'brokerage_name',
      'Brokerage Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage/firm name from brokerage_settings.',
      'settings_brokerage',
      'brokerage_name',
      null::text
    ),
    (
      'brokerage_license_number',
      'brokerage_license_number',
      'Brokerage License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage/firm license number from brokerage_settings (not broker_license_number).',
      'settings_brokerage',
      'brokerage_license_number',
      null::text
    ),
    (
      'brokerage_address',
      'brokerage_address',
      'Brokerage Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage street address from brokerage_settings.',
      'settings_brokerage',
      'brokerage_address',
      null::text
    ),
    (
      'brokerage_city_state_zip',
      'brokerage_city_state_zip',
      'Brokerage City, State, Zip',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Composite brokerage city, state, and ZIP from brokerage_settings.',
      'settings_brokerage',
      'brokerage_city_state_zip',
      null::text
    ),
    (
      'brokerage_office_phone',
      'brokerage_office_phone',
      'Brokerage Office Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage office phone from brokerage_settings (not broker_phone).',
      'settings_brokerage',
      'brokerage_office_phone',
      null::text
    ),
    (
      'brokerage_fax',
      'brokerage_fax',
      'Brokerage Fax',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage fax (manual entry; no brokerage_fax column in brokerage_settings).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'brokerage_email',
      'brokerage_email',
      'Brokerage Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage/firm email from brokerage_settings (not broker_email).',
      'settings_brokerage',
      'brokerage_email',
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
insert into txr_2516_fields_touched (field_key, action)
select field_key, 'inserted' from inserted_fields
union all
select field_key, 'updated' from updated_fields;

-- ---------------------------------------------------------------------------
-- First-pass page 1 mappings
-- ---------------------------------------------------------------------------

create temp table txr_2516_placement_seed (
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

insert into txr_2516_placement_seed (
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
  ('property_address', 'Page 1 property', null::integer, 1, 92, 170, 410, 14, 'text'),
  ('tila_respa_client_is_seller', 'Page 1 client is seller', null::integer, 1, 73, 214, 14, 14, 'checkbox'),
  ('tila_respa_client_is_buyer', 'Page 1 client is buyer', null::integer, 1, 134, 214, 14, 14, 'checkbox'),
  ('brokerage_name', 'Page 1 brokerage name', null::integer, 1, 162, 274, 340, 14, 'text'),
  ('brokerage_license_number', 'Page 1 brokerage license number', null::integer, 1, 190, 304, 150, 14, 'text'),
  ('brokerage_address', 'Page 1 brokerage address', null::integer, 1, 118, 333, 385, 14, 'text'),
  ('brokerage_city_state_zip', 'Page 1 brokerage city state zip', null::integer, 1, 150, 363, 352, 14, 'text'),
  ('brokerage_office_phone', 'Page 1 brokerage office phone', null::integer, 1, 107, 393, 145, 14, 'text'),
  ('brokerage_fax', 'Page 1 brokerage fax', null::integer, 1, 340, 393, 145, 14, 'text'),
  ('brokerage_email', 'Page 1 brokerage email', null::integer, 1, 107, 423, 395, 14, 'text'),
  ('agent_full_name', 'Page 1 agent full name', null::integer, 1, 292, 453, 210, 14, 'text'),
  ('agent_license_number', 'Page 1 agent license number', null::integer, 1, 347, 483, 155, 14, 'text');

create temp table txr_2516_mappings_touched (
  field_key text not null,
  page_number integer not null,
  occurrence_index integer,
  action text not null
) on commit drop;

-- Deactivate active mappings with no matching seeded placement (wrong page/occurrence)
update public.form_field_mappings ffm
set
  status = 'INACTIVE',
  update_date = now()
from txr_2516_form tf,
     public.fields fld
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.id
  and fld.status = 'ACTIVE'
  and ffm.status = 'ACTIVE'
  and exists (
    select 1
    from txr_2516_placement_seed ps
    where lower(ps.field_key) = lower(fld.field_key)
  )
  and not exists (
    select 1
    from txr_2516_placement_seed ps
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
    notes = 'TXR-2516 TILA-RESPA authorization first-pass placement',
    status = 'ACTIVE',
    update_date = now()
  from txr_2516_form tf,
       txr_2516_placement_seed ps,
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
    'TXR-2516 TILA-RESPA authorization first-pass placement'
  from txr_2516_placement_seed ps
  inner join txr_2516_form tf on true
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
insert into txr_2516_mappings_touched (field_key, page_number, occurrence_index, action)
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
  select form_id into v_form_id from txr_2516_form limit 1;

  select count(*) into v_fields_inserted
  from txr_2516_fields_touched where action = 'inserted';

  select count(*) into v_fields_updated
  from txr_2516_fields_touched where action = 'updated';

  select count(*) into v_mappings_inserted
  from txr_2516_mappings_touched where action = 'inserted';

  select count(*) into v_mappings_updated
  from txr_2516_mappings_touched where action = 'updated';

  select string_agg(expected.field_key, ', ' order by expected.field_key)
  into v_unresolved_fields
  from (
    values
      ('property_address'),
      ('tila_respa_client_is_seller'),
      ('tila_respa_client_is_buyer'),
      ('brokerage_name'),
      ('brokerage_license_number'),
      ('brokerage_address'),
      ('brokerage_city_state_zip'),
      ('brokerage_office_phone'),
      ('brokerage_fax'),
      ('brokerage_email'),
      ('agent_full_name'),
      ('agent_license_number')
  ) as expected(field_key)
  left join txr_2516_fields_touched touched
    on lower(touched.field_key) = lower(expected.field_key)
  where touched.field_key is null;

  select string_agg(
    ps.field_key || ' (page ' || ps.page_number || ')',
    ', '
    order by ps.field_key
  )
  into v_unresolved_mappings
  from txr_2516_placement_seed ps
  left join txr_2516_mappings_touched touched
    on lower(touched.field_key) = lower(ps.field_key)
   and touched.page_number = ps.page_number
   and coalesce(touched.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
  where touched.field_key is null
    and v_form_id is not null;

  raise notice 'TXR-2516 TILA-RESPA authorization migration report';
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
