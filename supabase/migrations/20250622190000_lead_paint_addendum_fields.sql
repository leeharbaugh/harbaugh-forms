-- TREC 56-0 / TXR 1906 Lead-Based Paint Addendum field catalog and first-pass PDF mappings.
-- Form metadata is pre-existing in public.forms (not modified here).

-- ---------------------------------------------------------------------------
-- 1. Seed field catalog
-- ---------------------------------------------------------------------------

with seed (
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
      'property_address_city',
      'property_address_city',
      'Property Street Address and City',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Lead-Based Paint Addendum · Property street address and city from packet property.',
      'packet_property',
      'address_city',
      'property_address_city'
    ),
    (
      'lead_paint_known_present',
      'lead_paint_known_present',
      'Known lead-based paint and/or hazards are present',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'Lead-Based Paint Addendum · Seller disclosure checkbox (packet-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lead_paint_known_present_explanation',
      'lead_paint_known_present_explanation',
      'Explanation of known lead-based paint/hazards',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Lead-Based Paint Addendum · Explanation when lead-based paint/hazards are known.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lead_paint_no_actual_knowledge',
      'lead_paint_no_actual_knowledge',
      'Seller has no actual knowledge of lead-based paint/hazards',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'Lead-Based Paint Addendum · Seller has no actual knowledge checkbox.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lead_paint_records_provided',
      'lead_paint_records_provided',
      'Seller provided available records/reports',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'Lead-Based Paint Addendum · Seller provided records/reports checkbox.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lead_paint_records_list',
      'lead_paint_records_list',
      'List of records/reports provided',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Lead-Based Paint Addendum · List of records/reports provided by seller.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lead_paint_no_records',
      'lead_paint_no_records',
      'Seller has no records/reports',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'Lead-Based Paint Addendum · Seller has no records/reports checkbox.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lead_paint_buyer_waives_inspection',
      'lead_paint_buyer_waives_inspection',
      'Buyer waives opportunity to inspect',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'Lead-Based Paint Addendum · Buyer waives inspection opportunity checkbox.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lead_paint_buyer_has_inspection_period',
      'lead_paint_buyer_has_inspection_period',
      'Buyer has 10-day inspection period',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'Lead-Based Paint Addendum · Buyer 10-day inspection period checkbox.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lead_paint_buyer_received_records',
      'lead_paint_buyer_received_records',
      'Buyer received copies of listed information',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'Lead-Based Paint Addendum · Buyer received listed information checkbox.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lead_paint_buyer_received_pamphlet',
      'lead_paint_buyer_received_pamphlet',
      'Buyer received Protect Your Family from Lead in Your Home pamphlet',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'Lead-Based Paint Addendum · Buyer received EPA pamphlet checkbox.',
      'manual_only',
      null::text,
      null::text
    )
),
inserted as (
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
    s.field_data_type,
    s.field_widget_type,
    s.default_value,
    s.default_checked,
    s.required,
    s.notes,
    s.source_type,
    s.source_path,
    s.resolver_key
  from seed s
  where not exists (
    select 1
    from public.fields existing
    where lower(existing.field_key) = lower(s.field_key)
      and existing.status = 'ACTIVE'
  )
  returning field_key
)
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
from seed s
where lower(target.field_key) = lower(s.field_key)
  and target.status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 2. Deactivate existing mappings for these field keys on Lead Paint form
-- ---------------------------------------------------------------------------

with lead_paint_form as (
  select f.id as form_id
  from public.forms f
  where f.status = 'ACTIVE'
    and (
      lower(trim(f.form_code)) in (
        'trec-56-0',
        'trec_56_0',
        'txr-1906',
        'txr_1906'
      )
      or (
        lower(f.form_name) like '%lead%'
        and lower(f.form_name) like '%paint%'
      )
    )
  order by
    case
      when lower(trim(f.form_code)) in (
        'trec-56-0',
        'trec_56_0',
        'txr-1906',
        'txr_1906'
      ) then 0
      else 1
    end,
    f.id
  limit 1
),
mapping_field_keys(field_key) as (
  values
    ('property_address_city'),
    ('lead_paint_known_present'),
    ('lead_paint_known_present_explanation'),
    ('lead_paint_no_actual_knowledge'),
    ('lead_paint_records_provided'),
    ('lead_paint_records_list'),
    ('lead_paint_no_records'),
    ('lead_paint_buyer_waives_inspection'),
    ('lead_paint_buyer_has_inspection_period'),
    ('lead_paint_buyer_received_records'),
    ('lead_paint_buyer_received_pamphlet')
),
target_fields as (
  select f.id as field_id, f.field_key
  from public.fields f
  inner join mapping_field_keys k on lower(f.field_key) = lower(k.field_key)
  where f.status = 'ACTIVE'
)
update public.form_field_mappings ffm
set
  status = 'INACTIVE',
  update_date = now()
from lead_paint_form lpf,
     target_fields fld
where ffm.form_id = lpf.form_id
  and ffm.field_id = fld.field_id
  and ffm.status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 3. Insert first-pass mappings (top-left origin; page 612 x 792)
-- ---------------------------------------------------------------------------

with lead_paint_form as (
  select f.id as form_id
  from public.forms f
  where f.status = 'ACTIVE'
    and (
      lower(trim(f.form_code)) in (
        'trec-56-0',
        'trec_56_0',
        'txr-1906',
        'txr_1906'
      )
      or (
        lower(f.form_name) like '%lead%'
        and lower(f.form_name) like '%paint%'
      )
    )
  order by
    case
      when lower(trim(f.form_code)) in (
        'trec-56-0',
        'trec_56_0',
        'txr-1906',
        'txr_1906'
      ) then 0
      else 1
    end,
    f.id
  limit 1
),
placement_seed (
  field_key,
  mapping_name,
  occurrence_index,
  page_number,
  x,
  y,
  width,
  height,
  field_widget_type,
  font_size
) as (
  values
    (
      'property_address_city',
      'Property street address and city',
      null::integer,
      1,
      215,
      121,
      330,
      12,
      'text',
      9
    ),
    (
      'lead_paint_known_present',
      'Known lead-based paint present',
      null::integer,
      1,
      47,
      248,
      8,
      8,
      'checkbox',
      10
    ),
    (
      'lead_paint_known_present_explanation',
      'Known lead-based paint explanation (inline)',
      0,
      1,
      462,
      246,
      105,
      12,
      'text',
      10
    ),
    (
      'lead_paint_known_present_explanation',
      'Known lead-based paint explanation (continuation)',
      1,
      1,
      60,
      262,
      505,
      12,
      'text',
      10
    ),
    (
      'lead_paint_no_actual_knowledge',
      'No actual knowledge of lead-based paint',
      null::integer,
      1,
      47,
      280,
      8,
      8,
      'checkbox',
      10
    ),
    (
      'lead_paint_records_provided',
      'Records/reports provided',
      null::integer,
      1,
      47,
      331,
      8,
      8,
      'checkbox',
      10
    ),
    (
      'lead_paint_records_list',
      'Records/reports list (inline)',
      0,
      1,
      420,
      347,
      145,
      12,
      'text',
      10
    ),
    (
      'lead_paint_records_list',
      'Records/reports list (continuation)',
      1,
      1,
      60,
      362,
      505,
      12,
      'text',
      10
    ),
    (
      'lead_paint_no_records',
      'No records/reports',
      null::integer,
      1,
      47,
      379,
      8,
      8,
      'checkbox',
      10
    ),
    (
      'lead_paint_buyer_waives_inspection',
      'Buyer waives inspection',
      null::integer,
      1,
      47,
      429,
      8,
      8,
      'checkbox',
      10
    ),
    (
      'lead_paint_buyer_has_inspection_period',
      'Buyer 10-day inspection period',
      null::integer,
      1,
      47,
      462,
      8,
      8,
      'checkbox',
      10
    ),
    (
      'lead_paint_buyer_received_records',
      'Buyer received listed information',
      null::integer,
      1,
      47,
      544,
      8,
      8,
      'checkbox',
      10
    ),
    (
      'lead_paint_buyer_received_pamphlet',
      'Buyer received EPA pamphlet',
      null::integer,
      1,
      47,
      560,
      8,
      8,
      'checkbox',
      10
    )
)
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
  lpf.form_id,
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
  ps.font_size,
  ps.field_widget_type,
  'TREC 56-0 / TXR 1906 Lead-Based Paint Addendum estimated placement'
from placement_seed ps
inner join lead_paint_form lpf on true
inner join public.fields fld
  on lower(fld.field_key) = lower(ps.field_key)
 and fld.status = 'ACTIVE'
where not exists (
  select 1
  from public.form_field_mappings existing
  where existing.form_id = lpf.form_id
    and existing.field_id = fld.id
    and existing.page_number = ps.page_number
    and coalesce(existing.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
    and existing.status = 'ACTIVE'
);
