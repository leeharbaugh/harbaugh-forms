-- TXR-1404 Amendment to Residential Listing field catalog and first-pass PDF mappings.
-- Amends TXR-1101. Form metadata is pre-existing in public.forms (not modified here).
-- Amendment values are packet/form-specific (manual_only); does not update listing_agreement_details.

-- ---------------------------------------------------------------------------
-- 1. Seed field catalog — idempotent upsert by field_key (active rows)
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
      'property_address',
      'property_address',
      'Property Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Property address from packet property.',
      'packet_property',
      'property_address',
      'property_address'
    ),
    (
      'listing_amendment_effective_date',
      'listing_amendment_effective_date',
      'Listing Amendment Effective Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Amendment effective date (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_price_changed',
      'listing_amendment_price_changed',
      'Listing Price Changed',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Listing price changed checkbox (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_new_listing_price',
      'listing_amendment_new_listing_price',
      'New Listing Price',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · New listing price (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_end_date_changed',
      'listing_amendment_end_date_changed',
      'Listing End Date Changed',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Listing end date changed checkbox (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_new_end_date',
      'listing_amendment_new_end_date',
      'New Listing End Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · New listing end date (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_broker_fee_changed',
      'listing_amendment_broker_fee_changed',
      'Broker Fee Changed',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Broker fee changed checkbox (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_fee_percent_or_flat_selected',
      'listing_amendment_fee_percent_or_flat_selected',
      'Broker Fee Percent or Flat Fee Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Broker fee percent or flat fee selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_fee_percent',
      'listing_amendment_fee_percent',
      'Broker Fee Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Broker fee percent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_fee_flat_fee',
      'listing_amendment_fee_flat_fee',
      'Broker Fee Flat Fee',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Broker fee flat fee (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_unrepresented_buyer_fee_selected',
      'listing_amendment_unrepresented_buyer_fee_selected',
      'Additional Fee if Buyer Is Unrepresented Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Additional fee if buyer is unrepresented selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_unrepresented_buyer_fee_percent',
      'listing_amendment_unrepresented_buyer_fee_percent',
      'Additional Fee if Buyer Unrepresented Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Additional fee if buyer unrepresented percent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_unrepresented_buyer_fee_flat_fee',
      'listing_amendment_unrepresented_buyer_fee_flat_fee',
      'Additional Fee if Buyer Unrepresented Flat Fee',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Additional fee if buyer unrepresented flat fee (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_other_fee_selected',
      'listing_amendment_other_fee_selected',
      'Other Broker Fee Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Other broker fee selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_other_fee_text',
      'listing_amendment_other_fee_text',
      'Other Broker Fee Text',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Other broker fee text (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_cease_marketing_selected',
      'listing_amendment_cease_marketing_selected',
      'Cease Marketing Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Cease marketing selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_cease_marketing_date',
      'listing_amendment_cease_marketing_date',
      'Cease Marketing Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Cease marketing date (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_resume_on_owner_instructions',
      'listing_amendment_resume_on_owner_instructions',
      'Resume on Further Instructions from Owner',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Resume on further instructions from owner (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_resume_on_specific_date_selected',
      'listing_amendment_resume_on_specific_date_selected',
      'Resume on Specific Date Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Resume on specific date selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_resume_marketing_date',
      'listing_amendment_resume_marketing_date',
      'Resume Marketing Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Resume marketing date (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_paragraphs_changed_selected',
      'listing_amendment_paragraphs_changed_selected',
      'Paragraphs Changed Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1404 Amendment to Residential Listing · Paragraphs changed selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_paragraph_numbers',
      'listing_amendment_paragraph_numbers',
      'Paragraph Numbers Changed',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Paragraph numbers changed (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'listing_amendment_paragraph_changes',
      'listing_amendment_paragraph_changes',
      'Paragraph Changes',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1404 Amendment to Residential Listing · Paragraph changes text (packet/form-specific).',
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
-- 2. Deactivate existing mappings for these field keys on TXR-1404
-- ---------------------------------------------------------------------------

with txr_1404_form as (
  select f.id as form_id
  from public.forms f
  where f.status = 'ACTIVE'
    and (
      lower(trim(f.form_code)) in ('txr-1404', 'txr_1404')
      or lower(trim(f.form_code)) like '%txr-1404%'
      or lower(trim(f.form_code)) like '%txr_1404%'
      or (
        lower(f.form_name) like '%amendment%'
        and lower(f.form_name) like '%residential%'
        and lower(f.form_name) like '%listing%'
      )
    )
  order by
    case when lower(trim(f.form_code)) in ('txr-1404', 'txr_1404') then 0 else 1 end,
    case when lower(f.form_name) like '%txr-1404%' then 0 else 1 end,
    f.id
  limit 1
),
mapping_field_keys(field_key) as (
  values
    ('property_address'),
    ('listing_amendment_effective_date'),
    ('listing_amendment_price_changed'),
    ('listing_amendment_new_listing_price'),
    ('listing_amendment_end_date_changed'),
    ('listing_amendment_new_end_date'),
    ('listing_amendment_broker_fee_changed'),
    ('listing_amendment_fee_percent_or_flat_selected'),
    ('listing_amendment_fee_percent'),
    ('listing_amendment_fee_flat_fee'),
    ('listing_amendment_unrepresented_buyer_fee_selected'),
    ('listing_amendment_unrepresented_buyer_fee_percent'),
    ('listing_amendment_unrepresented_buyer_fee_flat_fee'),
    ('listing_amendment_other_fee_selected'),
    ('listing_amendment_other_fee_text'),
    ('listing_amendment_cease_marketing_selected'),
    ('listing_amendment_cease_marketing_date'),
    ('listing_amendment_resume_on_owner_instructions'),
    ('listing_amendment_resume_on_specific_date_selected'),
    ('listing_amendment_resume_marketing_date'),
    ('listing_amendment_paragraphs_changed_selected'),
    ('listing_amendment_paragraph_numbers'),
    ('listing_amendment_paragraph_changes')
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
from txr_1404_form tf,
     target_fields fld
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.field_id
  and ffm.status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 3. Insert or update first-pass mappings (top-left origin; page 612 x 792)
-- ---------------------------------------------------------------------------

with txr_1404_form as (
  select f.id as form_id
  from public.forms f
  where f.status = 'ACTIVE'
    and (
      lower(trim(f.form_code)) in ('txr-1404', 'txr_1404')
      or lower(trim(f.form_code)) like '%txr-1404%'
      or lower(trim(f.form_code)) like '%txr_1404%'
      or (
        lower(f.form_name) like '%amendment%'
        and lower(f.form_name) like '%residential%'
        and lower(f.form_name) like '%listing%'
      )
    )
  order by
    case when lower(trim(f.form_code)) in ('txr-1404', 'txr_1404') then 0 else 1 end,
    case when lower(f.form_name) like '%txr-1404%' then 0 else 1 end,
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
    ('property_address', 'Property address', null::integer, 1, 75, 130, 465, 14, 'text', 9),
    ('listing_amendment_effective_date', 'Amendment effective date', null::integer, 1, 110, 181, 100, 14, 'date', 9),
    ('listing_amendment_price_changed', 'Listing price changed', null::integer, 1, 47, 218, 14, 14, 'checkbox', 9),
    ('listing_amendment_new_listing_price', 'New listing price', null::integer, 1, 474, 218, 80, 14, 'text', 9),
    ('listing_amendment_end_date_changed', 'Listing end date changed', null::integer, 1, 47, 246, 14, 14, 'checkbox', 9),
    ('listing_amendment_new_end_date', 'New listing end date', null::integer, 1, 423, 246, 130, 14, 'date', 9),
    ('listing_amendment_broker_fee_changed', 'Broker fee changed', null::integer, 1, 47, 275, 14, 14, 'checkbox', 9),
    ('listing_amendment_fee_percent_or_flat_selected', 'Broker fee percent or flat fee', null::integer, 1, 72, 304, 14, 14, 'checkbox', 9),
    ('listing_amendment_fee_percent', 'Broker fee percent', null::integer, 1, 120, 304, 55, 14, 'text', 9),
    ('listing_amendment_fee_flat_fee', 'Broker fee flat fee', null::integer, 1, 366, 304, 95, 14, 'text', 9),
    ('listing_amendment_unrepresented_buyer_fee_selected', 'Unrepresented buyer fee selected', null::integer, 1, 72, 333, 14, 14, 'checkbox', 9),
    ('listing_amendment_unrepresented_buyer_fee_percent', 'Unrepresented buyer fee percent', null::integer, 1, 158, 333, 55, 14, 'text', 9),
    ('listing_amendment_unrepresented_buyer_fee_flat_fee', 'Unrepresented buyer fee flat fee', null::integer, 1, 416, 333, 95, 14, 'text', 9),
    ('listing_amendment_other_fee_selected', 'Other broker fee selected', null::integer, 1, 72, 362, 14, 14, 'checkbox', 9),
    ('listing_amendment_other_fee_text', 'Other broker fee text', null::integer, 1, 102, 362, 455, 14, 'text', 9),
    ('listing_amendment_cease_marketing_selected', 'Cease marketing selected', null::integer, 1, 47, 391, 14, 14, 'checkbox', 9),
    ('listing_amendment_cease_marketing_date', 'Cease marketing date', null::integer, 1, 357, 391, 100, 14, 'date', 9),
    ('listing_amendment_resume_on_owner_instructions', 'Resume on owner instructions', null::integer, 1, 292, 420, 14, 14, 'checkbox', 9),
    ('listing_amendment_resume_on_specific_date_selected', 'Resume on specific date selected', null::integer, 1, 494, 420, 14, 14, 'checkbox', 9),
    ('listing_amendment_resume_marketing_date', 'Resume marketing date', null::integer, 1, 72, 449, 485, 14, 'date', 9),
    ('listing_amendment_paragraphs_changed_selected', 'Paragraphs changed selected', null::integer, 1, 47, 478, 14, 14, 'checkbox', 9),
    ('listing_amendment_paragraph_numbers', 'Paragraph numbers changed', null::integer, 1, 151, 478, 125, 14, 'text', 9),
    ('listing_amendment_paragraph_changes', 'Paragraph changes', null::integer, 1, 72, 507, 485, 42, 'text', 9)
),
updated_mappings as (
  update public.form_field_mappings ffm
  set
    mapping_name = ps.mapping_name,
    x = ps.x,
    y = ps.y,
    width = ps.width,
    height = ps.height,
    page_width = 612,
    page_height = 792,
    font_size = ps.font_size,
    field_widget_type = ps.field_widget_type,
    notes = 'TXR-1404 Amendment to Residential Listing estimated placement',
    status = 'ACTIVE',
    update_date = now()
  from txr_1404_form tf,
       placement_seed ps,
       public.fields fld
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
    and ffm.page_number = ps.page_number
    and coalesce(ffm.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
    and ffm.status = 'ACTIVE'
  returning ffm.id
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
  ps.font_size,
  ps.field_widget_type,
  'TXR-1404 Amendment to Residential Listing estimated placement'
from placement_seed ps
inner join txr_1404_form tf on true
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
);
