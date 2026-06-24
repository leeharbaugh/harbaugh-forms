-- TXR-1101 Listing Agreement mapping cleanup: inactivate bad placements,
-- ensure separate ¶2A property fields exist, insert corrected page 1 / page 2 mappings.
-- Does not touch public.forms. Soft-delete only (status = INACTIVE).

-- ---------------------------------------------------------------------------
-- Resolve TXR-1101 form (existing app convention)
-- ---------------------------------------------------------------------------

create temp table txr_1101_cleanup_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in ('txr-1101', 'txr_1101')
    or lower(trim(f.form_code)) like '%txr-1101%'
    or lower(trim(f.form_code)) like '%txr_1101%'
    or (
      lower(f.form_name) like '%listing agreement%'
      and (
        lower(f.form_name) like '%residential%'
        or lower(f.form_name) like '%exclusive right to sell%'
      )
    )
  )
order by
  case when lower(trim(f.form_code)) in ('txr-1101', 'txr_1101') then 0 else 1 end,
  case when lower(f.form_name) like '%txr-1101%' then 0 else 1 end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Task 2 — Inactivate clearly wrong / broad mappings for target field keys
-- ---------------------------------------------------------------------------

create temp table txr_1101_cleanup_target_keys (
  field_key text primary key
) on commit drop;

insert into txr_1101_cleanup_target_keys (field_key)
values
  ('property_description'),
  ('listing_price'),
  ('listing_begin_date'),
  ('listing_end_date'),
  ('property_lot'),
  ('property_block'),
  ('property_addition'),
  ('property_city'),
  ('property_county'),
  ('property_address_zip');

create temp table txr_1101_cleanup_inactivated on commit drop as
with inactivated as (
  update public.form_field_mappings ffm
  set
    status = 'INACTIVE',
    update_date = now()
  from txr_1101_cleanup_form tf,
       public.fields fld,
       txr_1101_cleanup_target_keys tk
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and fld.status = 'ACTIVE'
    and lower(fld.field_key) = lower(tk.field_key)
    and ffm.status = 'ACTIVE'
  returning
    ffm.id as mapping_id,
    fld.field_key,
    ffm.page_number,
    ffm.mapping_name
)
select * from inactivated;

-- ---------------------------------------------------------------------------
-- Task 3 — Ensure required separate property fields exist
-- ---------------------------------------------------------------------------

create temp table txr_1101_cleanup_fields_touched (
  field_key text not null,
  action text not null
) on commit drop;

with field_seed (
  field_key,
  field_name,
  field_label,
  notes,
  source_type,
  source_path
) as (
  values
    (
      'property_lot',
      'property_lot',
      'Property Lot',
      'TXR-1101 ¶2A · Property lot (packet property lot when available).',
      'packet_property',
      'lot'
    ),
    (
      'property_block',
      'property_block',
      'Property Block',
      'TXR-1101 ¶2A · Property block (packet property block when available).',
      'packet_property',
      'block'
    ),
    (
      'property_addition',
      'property_addition',
      'Property Addition',
      'TXR-1101 ¶2A · Property addition/subdivision (packet property subdivision).',
      'packet_property',
      'subdivision'
    ),
    (
      'property_city',
      'property_city',
      'Property City',
      'TXR-1101 ¶2A · Property city from packet property.',
      'packet_property',
      'city'
    ),
    (
      'property_county',
      'property_county',
      'Property County',
      'TXR-1101 ¶2A · Property county from packet property.',
      'packet_property',
      'county'
    ),
    (
      'property_address_zip',
      'property_address_zip',
      'Property Address and ZIP',
      'TXR-1101 ¶2A · Property street address and ZIP from packet property (address path).',
      'packet_property',
      'address'
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
    resolver_key
  )
  select
    s.field_key,
    s.field_name,
    s.field_label,
    'text',
    'text',
    null::text,
    null::boolean,
    false,
    s.notes,
    s.source_type,
    s.source_path,
    null::text
  from field_seed s
  where not exists (
    select 1
    from public.fields existing
    where lower(existing.field_key) = lower(s.field_key)
      and existing.status = 'ACTIVE'
  )
  returning field_key
)
insert into txr_1101_cleanup_fields_touched (field_key, action)
select field_key, 'inserted'
from inserted_fields;

with field_seed (
  field_key,
  field_name,
  field_label,
  notes,
  source_type,
  source_path
) as (
  values
    (
      'property_lot',
      'property_lot',
      'Property Lot',
      'TXR-1101 ¶2A · Property lot (packet property lot when available).',
      'packet_property',
      'lot'
    ),
    (
      'property_block',
      'property_block',
      'Property Block',
      'TXR-1101 ¶2A · Property block (packet property block when available).',
      'packet_property',
      'block'
    ),
    (
      'property_addition',
      'property_addition',
      'Property Addition',
      'TXR-1101 ¶2A · Property addition/subdivision (packet property subdivision).',
      'packet_property',
      'subdivision'
    ),
    (
      'property_city',
      'property_city',
      'Property City',
      'TXR-1101 ¶2A · Property city from packet property.',
      'packet_property',
      'city'
    ),
    (
      'property_county',
      'property_county',
      'Property County',
      'TXR-1101 ¶2A · Property county from packet property.',
      'packet_property',
      'county'
    ),
    (
      'property_address_zip',
      'property_address_zip',
      'Property Address and ZIP',
      'TXR-1101 ¶2A · Property street address and ZIP from packet property (address path).',
      'packet_property',
      'address'
    )
),
updated_fields as (
  update public.fields target
  set
    field_name = s.field_name,
    field_label = s.field_label,
    field_data_type = 'text',
    field_widget_type = 'text',
    required = false,
    notes = s.notes,
    source_type = s.source_type,
    source_path = s.source_path,
    resolver_key = null,
    update_date = now()
  from field_seed s
  where lower(target.field_key) = lower(s.field_key)
    and target.status = 'ACTIVE'
  returning target.field_key
)
insert into txr_1101_cleanup_fields_touched (field_key, action)
select field_key, 'updated'
from updated_fields;

-- ---------------------------------------------------------------------------
-- Task 4 & 5 — Insert or update corrected mappings (top-left origin; 612 x 792)
-- ---------------------------------------------------------------------------

create temp table txr_1101_cleanup_placement_seed (
  field_key text primary key,
  mapping_name text not null,
  page_number integer not null,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  field_widget_type text not null
) on commit drop;

insert into txr_1101_cleanup_placement_seed (
  field_key,
  mapping_name,
  page_number,
  x,
  y,
  width,
  height,
  field_widget_type
)
values
  ('property_lot', '¶2A Property lot', 1, 136, 452, 65, 14, 'text'),
  ('property_block', '¶2A Property block', 1, 248, 452, 70, 14, 'text'),
  ('property_addition', '¶2A Property addition', 1, 95, 468, 250, 14, 'text'),
  ('property_city', '¶2A Property city', 1, 405, 468, 130, 14, 'text'),
  ('property_county', '¶2A Property county', 1, 77, 483, 120, 14, 'text'),
  ('property_address_zip', '¶2A Property address/zip', 1, 255, 483, 300, 14, 'text'),
  ('listing_price', '¶3 Listing price', 2, 470, 92, 95, 14, 'text'),
  ('listing_begin_date', '¶4 Listing begin date', 2, 196, 137, 95, 14, 'date'),
  ('listing_end_date', '¶4 Listing end date', 2, 440, 137, 105, 14, 'date');

create temp table txr_1101_cleanup_mappings_updated on commit drop as
with updated as (
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
    notes = 'TXR-1101 mapping cleanup (corrected placement)',
    status = 'ACTIVE',
    update_date = now()
  from txr_1101_cleanup_form tf,
       txr_1101_cleanup_placement_seed ps,
       public.fields fld
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
    and ffm.page_number = ps.page_number
    and coalesce(ffm.occurrence_index, -1) = -1
    and ffm.status = 'ACTIVE'
  returning
    ffm.id as mapping_id,
    fld.field_key,
    ffm.page_number,
    'updated'::text as action
)
select * from updated;

create temp table txr_1101_cleanup_mappings_inserted on commit drop as
with inserted as (
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
    null::integer,
    ps.page_number,
    ps.x,
    ps.y,
    ps.width,
    ps.height,
    612,
    792,
    9,
    ps.field_widget_type,
    'TXR-1101 mapping cleanup (corrected placement)'
  from txr_1101_cleanup_placement_seed ps
  inner join txr_1101_cleanup_form tf on true
  inner join public.fields fld
    on lower(fld.field_key) = lower(ps.field_key)
   and fld.status = 'ACTIVE'
  where not exists (
    select 1
    from public.form_field_mappings existing
    where existing.form_id = tf.form_id
      and existing.field_id = fld.id
      and existing.page_number = ps.page_number
      and coalesce(existing.occurrence_index, -1) = -1
      and existing.status = 'ACTIVE'
  )
  returning
    id as mapping_id,
    (select field_key from public.fields where id = field_id) as field_key,
    page_number,
    'inserted'::text as action
)
select * from inserted;

-- ---------------------------------------------------------------------------
-- Task 6 — Report results
-- ---------------------------------------------------------------------------

do $$
declare
  v_form_id bigint;
  v_inactivated integer;
  v_fields_touched integer;
  v_mappings_updated integer;
  v_mappings_inserted integer;
  v_unresolved text;
begin
  select form_id into v_form_id from txr_1101_cleanup_form limit 1;

  select count(*) into v_inactivated from txr_1101_cleanup_inactivated;
  select count(*) into v_fields_touched from txr_1101_cleanup_fields_touched;
  select count(*) into v_mappings_updated from txr_1101_cleanup_mappings_updated;
  select count(*) into v_mappings_inserted from txr_1101_cleanup_mappings_inserted;

  select string_agg(ps.field_key, ', ' order by ps.field_key)
  into v_unresolved
  from txr_1101_cleanup_placement_seed ps
  where not exists (
    select 1
    from public.fields fld
    where lower(fld.field_key) = lower(ps.field_key)
      and fld.status = 'ACTIVE'
  );

  raise notice 'TXR-1101 mapping cleanup report';
  raise notice '  form_id: %', coalesce(v_form_id::text, 'NOT FOUND');
  raise notice '  mappings inactivated: %', coalesce(v_inactivated, 0);
  raise notice '  fields created/updated: %', coalesce(v_fields_touched, 0);
  raise notice '  mappings updated: %', coalesce(v_mappings_updated, 0);
  raise notice '  mappings inserted: %', coalesce(v_mappings_inserted, 0);
  raise notice '  unresolved placement field_keys: %',
    coalesce(v_unresolved, '(none)');

  if not exists (
    select 1
    from public.fields fld
    where lower(fld.field_key) = 'property_description'
      and fld.status = 'ACTIVE'
  ) then
    raise notice '  note: property_description field_key not in catalog (no field rows to inactivate)';
  end if;

  if v_form_id is null then
    raise warning 'TXR-1101 form not found — no mappings were changed';
  end if;
end $$;

-- Row-level report (visible in SQL editor / migration output)
select 'form' as report_section, form_id::text as detail
from txr_1101_cleanup_form;

select 'inactivated' as report_section, field_key, page_number::text, mapping_id::text
from txr_1101_cleanup_inactivated
order by field_key, page_number;

select 'fields_touched' as report_section, field_key, action
from txr_1101_cleanup_fields_touched
order by field_key;

select 'mappings_updated' as report_section, field_key, page_number::text, mapping_id::text
from txr_1101_cleanup_mappings_updated
order by field_key;

select 'mappings_inserted' as report_section, field_key, page_number::text, mapping_id::text
from txr_1101_cleanup_mappings_inserted
order by field_key;

select 'unresolved_placement_field_keys' as report_section,
  ps.field_key as detail
from txr_1101_cleanup_placement_seed ps
where not exists (
  select 1
  from public.fields fld
  where lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
);
