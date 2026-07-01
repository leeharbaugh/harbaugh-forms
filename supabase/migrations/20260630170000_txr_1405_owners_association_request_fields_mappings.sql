-- TXR-1405 (03-02-12) Request for Information from an Owners' Association
-- field catalog and first-pass PDF mappings.
-- Does not touch public.forms.

-- ---------------------------------------------------------------------------
-- Resolve TXR-1405 form
-- ---------------------------------------------------------------------------

create temp table txr_1405_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in ('txr-1405', 'txr_1405')
    or lower(trim(f.form_code)) like '%txr-1405%'
    or lower(trim(f.form_code)) like '%txr_1405%'
    or (
      lower(f.form_name) like '%request%'
      and lower(f.form_name) like '%information%'
      and lower(f.form_name) like '%association%'
    )
    or (
      lower(f.form_name) like '%owners%'
      and lower(f.form_name) like '%association%'
      and lower(f.form_name) like '%request%'
    )
  )
order by
  case when lower(trim(f.form_code)) in ('txr-1405', 'txr_1405') then 0 else 1 end,
  case when lower(f.form_name) like '%txr-1405%' or lower(f.form_name) like '%1405%' then 0 else 1 end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Upsert field definitions (idempotent by field_key)
-- ---------------------------------------------------------------------------

create temp table txr_1405_fields_touched (
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
      'hoa_association_name',
      'hoa_association_name',
      'Owners'' Association Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Owners'' association name from property_hoas via property_hoa_name resolver.',
      'packet_property',
      null::text,
      'property_hoa_name'
    ),
    (
      'hoa_association_address',
      'hoa_association_address',
      'Owners'' Association Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Owners'' association mailing address (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_association_city_state_zip',
      'hoa_association_city_state_zip',
      'Owners'' Association City State Zip',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Owners'' association city, state, and ZIP (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_intend_to_sell',
      'hoa_request_intend_to_sell',
      'HOA Request Intend to Sell',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1405 · Requester intends to sell the property (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_intend_to_purchase',
      'hoa_request_intend_to_purchase',
      'HOA Request Intend to Purchase',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1405 · Requester intends to purchase the property (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'property_address',
      'property_address',
      'Property Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Shared catalog · Property full address from packet property.',
      'packet_property',
      'full_address',
      'property_full_address'
    ),
    (
      'property_city_state_zip',
      'property_city_state_zip',
      'Property City State Zip',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Property city, state, and ZIP from packet property.',
      'packet_property',
      'address_city_state_zip',
      'property_city_state_zip'
    ),
    (
      'hoa_request_residential_subdivision_info',
      'hoa_request_residential_subdivision_info',
      'HOA Request Residential Subdivision Info',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1405 · Request residential subdivision information (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_condominium_info',
      'hoa_request_condominium_info',
      'HOA Request Condominium Info',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1405 · Request condominium information (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_deliver_to_broker',
      'hoa_request_deliver_to_broker',
      'HOA Request Deliver to Broker',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1405 · Deliver requested information to broker (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_deliver_to_owner',
      'hoa_request_deliver_to_owner',
      'HOA Request Deliver to Owner',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1405 · Deliver requested information to owner (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_deliver_to_buyer',
      'hoa_request_deliver_to_buyer',
      'HOA Request Deliver to Buyer',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1405 · Deliver requested information to buyer (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_deliver_to_closing_agent',
      'hoa_request_deliver_to_closing_agent',
      'HOA Request Deliver to Closing Agent',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1405 · Deliver requested information to closing agent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_delivery_attn',
      'hoa_request_delivery_attn',
      'HOA Request Delivery Attention',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Delivery attention line (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_delivery_address',
      'hoa_request_delivery_address',
      'HOA Request Delivery Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Delivery street address (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_delivery_city_state_zip',
      'hoa_request_delivery_city_state_zip',
      'HOA Request Delivery City State Zip',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Delivery city, state, and ZIP (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_delivery_phone',
      'hoa_request_delivery_phone',
      'HOA Request Delivery Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Delivery phone number (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_delivery_fax',
      'hoa_request_delivery_fax',
      'HOA Request Delivery Fax',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Delivery fax number (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_delivery_email',
      'hoa_request_delivery_email',
      'HOA Request Delivery Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Delivery email address (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_request_fee_amount',
      'hoa_request_fee_amount',
      'HOA Request Fee Amount',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1405 · Requested information fee amount (packet/form-specific).',
      'manual_only',
      null::text,
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
insert into txr_1405_fields_touched (field_key, action)
select field_key, 'inserted' from inserted_fields
union all
select field_key, 'updated' from updated_fields;

-- ---------------------------------------------------------------------------
-- First-pass page 1 mappings
-- ---------------------------------------------------------------------------

create temp table txr_1405_placement_seed (
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

insert into txr_1405_placement_seed (
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
  ('hoa_association_name', 'Page 1 owners association name', null::integer, 1, 88, 99, 430, 14, 'text'),
  ('hoa_association_address', 'Page 1 owners association address', null::integer, 1, 88, 123, 430, 14, 'text'),
  ('hoa_association_city_state_zip', 'Page 1 owners association city state zip', null::integer, 1, 88, 148, 430, 14, 'text'),
  ('hoa_request_intend_to_sell', 'Page 1 intend to sell', null::integer, 1, 251, 214, 14, 14, 'checkbox'),
  ('hoa_request_intend_to_purchase', 'Page 1 intend to purchase', null::integer, 1, 293, 214, 14, 14, 'checkbox'),
  ('property_address', 'Page 1 property address', null::integer, 1, 88, 239, 430, 14, 'text'),
  ('property_city_state_zip', 'Page 1 property city state zip', null::integer, 1, 88, 264, 430, 14, 'text'),
  ('hoa_request_residential_subdivision_info', 'Page 1 residential subdivision info', null::integer, 1, 47, 314, 14, 14, 'checkbox'),
  ('hoa_request_condominium_info', 'Page 1 condominium info', null::integer, 1, 47, 407, 14, 14, 'checkbox'),
  ('hoa_request_deliver_to_broker', 'Page 1 deliver to broker', null::integer, 1, 70, 508, 14, 14, 'checkbox'),
  ('hoa_request_deliver_to_owner', 'Page 1 deliver to owner', null::integer, 1, 139, 508, 14, 14, 'checkbox'),
  ('hoa_request_deliver_to_buyer', 'Page 1 deliver to buyer', null::integer, 1, 204, 508, 14, 14, 'checkbox'),
  ('hoa_request_deliver_to_closing_agent', 'Page 1 deliver to closing agent', null::integer, 1, 266, 508, 14, 14, 'checkbox'),
  ('hoa_request_delivery_attn', 'Page 1 delivery attention', null::integer, 1, 112, 532, 400, 14, 'text'),
  ('hoa_request_delivery_address', 'Page 1 delivery address', null::integer, 1, 88, 557, 430, 14, 'text'),
  ('hoa_request_delivery_city_state_zip', 'Page 1 delivery city state zip', null::integer, 1, 88, 582, 430, 14, 'text'),
  ('hoa_request_delivery_phone', 'Page 1 delivery phone', null::integer, 1, 70, 607, 180, 14, 'text'),
  ('hoa_request_delivery_fax', 'Page 1 delivery fax', null::integer, 1, 310, 607, 180, 14, 'text'),
  ('hoa_request_delivery_email', 'Page 1 delivery email', null::integer, 1, 88, 632, 430, 14, 'text'),
  ('hoa_request_fee_amount', 'Page 1 request fee amount', null::integer, 1, 132, 706, 85, 14, 'text');

create temp table txr_1405_mappings_touched (
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
from txr_1405_form tf,
     public.fields fld
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.id
  and fld.status = 'ACTIVE'
  and ffm.status = 'ACTIVE'
  and exists (
    select 1
    from txr_1405_placement_seed ps
    where lower(ps.field_key) = lower(fld.field_key)
  )
  and not exists (
    select 1
    from txr_1405_placement_seed ps
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
    notes = 'TXR-1405 Owners'' Association request first-pass placement',
    status = 'ACTIVE',
    update_date = now()
  from txr_1405_form tf,
       txr_1405_placement_seed ps,
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
    'TXR-1405 Owners'' Association request first-pass placement'
  from txr_1405_placement_seed ps
  inner join txr_1405_form tf on true
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
insert into txr_1405_mappings_touched (field_key, page_number, occurrence_index, action)
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
  select form_id into v_form_id from txr_1405_form limit 1;

  select count(*) into v_fields_inserted
  from txr_1405_fields_touched where action = 'inserted';

  select count(*) into v_fields_updated
  from txr_1405_fields_touched where action = 'updated';

  select count(*) into v_mappings_inserted
  from txr_1405_mappings_touched where action = 'inserted';

  select count(*) into v_mappings_updated
  from txr_1405_mappings_touched where action = 'updated';

  select string_agg(expected.field_key, ', ' order by expected.field_key)
  into v_unresolved_fields
  from (
    values
      ('hoa_association_name'),
      ('hoa_association_address'),
      ('hoa_association_city_state_zip'),
      ('hoa_request_intend_to_sell'),
      ('hoa_request_intend_to_purchase'),
      ('property_address'),
      ('property_city_state_zip'),
      ('hoa_request_residential_subdivision_info'),
      ('hoa_request_condominium_info'),
      ('hoa_request_deliver_to_broker'),
      ('hoa_request_deliver_to_owner'),
      ('hoa_request_deliver_to_buyer'),
      ('hoa_request_deliver_to_closing_agent'),
      ('hoa_request_delivery_attn'),
      ('hoa_request_delivery_address'),
      ('hoa_request_delivery_city_state_zip'),
      ('hoa_request_delivery_phone'),
      ('hoa_request_delivery_fax'),
      ('hoa_request_delivery_email'),
      ('hoa_request_fee_amount')
  ) as expected(field_key)
  left join txr_1405_fields_touched touched
    on lower(touched.field_key) = lower(expected.field_key)
  where touched.field_key is null;

  select string_agg(
    ps.field_key || ' (page ' || ps.page_number || ')',
    ', '
    order by ps.field_key
  )
  into v_unresolved_mappings
  from txr_1405_placement_seed ps
  left join txr_1405_mappings_touched touched
    on lower(touched.field_key) = lower(ps.field_key)
   and touched.page_number = ps.page_number
   and coalesce(touched.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
  where touched.field_key is null
    and v_form_id is not null;

  raise notice 'TXR-1405 Owners'' Association request migration report';
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
