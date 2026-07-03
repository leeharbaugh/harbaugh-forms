-- TXR-1423 Amendment to Residential Listing — Exclusive Right to Lease
-- field catalog and first-pass PDF mappings.
-- Amends TXR-1102. Amendment values are packet/form-specific (manual_only).
-- Does not touch public.forms or listing_agreement_details.

-- ---------------------------------------------------------------------------
-- Resolve TXR-1423 form
-- ---------------------------------------------------------------------------

create temp table txr_1423_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in ('txr-1423', 'txr_1423')
    or lower(trim(f.form_code)) like '%txr-1423%'
    or lower(trim(f.form_code)) like '%txr_1423%'
    or (
      lower(f.form_name) like '%amendment%'
      and lower(f.form_name) like '%listing%'
      and lower(f.form_name) like '%lease%'
    )
    or (
      lower(f.form_name) like '%1423%'
      and lower(f.form_name) like '%amendment%'
    )
  )
order by
  case when lower(trim(f.form_code)) in ('txr-1423', 'txr_1423') then 0 else 1 end,
  case
    when lower(f.form_name) like '%txr-1423%' or lower(f.form_name) like '%1423%' then 0
    else 1
  end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Upsert field definitions (idempotent by field_key)
-- ---------------------------------------------------------------------------

create temp table txr_1423_fields_touched (
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
      'Property Address',
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
      'lease_listing_amendment_effective_date',
      'lease_listing_amendment_effective_date',
      'Lease Listing Amendment Effective Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 Amendment to Residential Lease Listing · Effective date (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_price_changed',
      'lease_listing_amend_price_changed',
      'Lease Listing Amend Price Changed',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Monthly rent / price changed (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_monthly_rent',
      'lease_listing_amend_monthly_rent',
      'Lease Listing Amend Monthly Rent',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Amended monthly rent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_min_lease_months',
      'lease_listing_amend_min_lease_months',
      'Lease Listing Amend Min Lease Months',
      'integer',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Amended minimum lease term months (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_max_lease_months',
      'lease_listing_amend_max_lease_months',
      'Lease Listing Amend Max Lease Months',
      'integer',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Amended maximum lease term months (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_term_changed',
      'lease_listing_amend_term_changed',
      'Lease Listing Amend Term Changed',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Listing term changed (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_new_end_date',
      'lease_listing_amend_new_end_date',
      'Lease Listing Amend New End Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Amended listing end date (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_broker_fee_changed',
      'lease_listing_amend_broker_fee_changed',
      'Lease Listing Amend Broker Fee Changed',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Broker fee changed (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_fee_5a1_selected',
      'lease_listing_amend_fee_5a1_selected',
      'Lease Listing Amend Fee 5A(1) Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Paragraph 5A(1) broker fee option selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_fee_5b_selected',
      'lease_listing_amend_fee_5b_selected',
      'Lease Listing Amend Fee 5B Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Paragraph 5B broker fee option selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_fee_one_month_selected',
      'lease_listing_amend_fee_one_month_selected',
      'Lease Listing Amend Fee One Month Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · One month rent broker fee selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_fee_one_month_percent',
      'lease_listing_amend_fee_one_month_percent',
      'Lease Listing Amend Fee One Month Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · One month rent broker fee percent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_fee_all_rents_selected',
      'lease_listing_amend_fee_all_rents_selected',
      'Lease Listing Amend Fee All Rents Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · All rents broker fee selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_fee_all_rents_percent',
      'lease_listing_amend_fee_all_rents_percent',
      'Lease Listing Amend Fee All Rents Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · All rents broker fee percent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_fee_other_selected',
      'lease_listing_amend_fee_other_selected',
      'Lease Listing Amend Fee Other Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Other broker fee selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_fee_other_text',
      'lease_listing_amend_fee_other_text',
      'Lease Listing Amend Fee Other Text',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Other broker fee description (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_other_broker_comp_changed',
      'lease_listing_amend_other_broker_comp_changed',
      'Lease Listing Amend Other Broker Comp Changed',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Other broker compensation changed (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_other_broker_one_month_selected',
      'lease_listing_amend_other_broker_one_month_selected',
      'Lease Listing Amend Other Broker One Month Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Other broker one month rent selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_other_broker_one_month_percent',
      'lease_listing_amend_other_broker_one_month_percent',
      'Lease Listing Amend Other Broker One Month Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Other broker one month rent percent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_other_broker_all_rents_selected',
      'lease_listing_amend_other_broker_all_rents_selected',
      'Lease Listing Amend Other Broker All Rents Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Other broker all rents selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_other_broker_all_rents_percent',
      'lease_listing_amend_other_broker_all_rents_percent',
      'Lease Listing Amend Other Broker All Rents Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Other broker all rents percent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_other_broker_flat_fee_selected',
      'lease_listing_amend_other_broker_flat_fee_selected',
      'Lease Listing Amend Other Broker Flat Fee Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Other broker flat fee selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_other_broker_flat_fee',
      'lease_listing_amend_other_broker_flat_fee',
      'Lease Listing Amend Other Broker Flat Fee',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Other broker flat fee amount (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_cease_marketing_selected',
      'lease_listing_amend_cease_marketing_selected',
      'Lease Listing Amend Cease Marketing Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Cease marketing selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_cease_marketing_date',
      'lease_listing_amend_cease_marketing_date',
      'Lease Listing Amend Cease Marketing Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Cease marketing date (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_resume_on_owner_instructions',
      'lease_listing_amend_resume_on_owner_instructions',
      'Lease Listing Amend Resume On Owner Instructions',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Resume marketing on owner instructions (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_resume_on_specific_date_selected',
      'lease_listing_amend_resume_on_specific_date_selected',
      'Lease Listing Amend Resume On Specific Date Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Resume marketing on specific date selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_resume_marketing_date',
      'lease_listing_amend_resume_marketing_date',
      'Lease Listing Amend Resume Marketing Date',
      'date',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Resume marketing date (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_paragraphs_changed_selected',
      'lease_listing_amend_paragraphs_changed_selected',
      'Lease Listing Amend Paragraphs Changed Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Paragraphs changed selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_paragraph_numbers',
      'lease_listing_amend_paragraph_numbers',
      'Lease Listing Amend Paragraph Numbers',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Paragraph numbers changed (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_paragraph_changes',
      'lease_listing_amend_paragraph_changes',
      'Lease Listing Amend Paragraph Changes',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1423 · Paragraph change description (packet/form-specific).',
      'manual_only',
      null::text,
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
      'Individual broker license number from brokerage_settings.',
      'settings_brokerage',
      'broker_license_number',
      null::text
    ),
    (
      'lease_listing_amend_broker_signature_checkbox',
      'lease_listing_amend_broker_signature_checkbox',
      'Lease Listing Amend Broker Signature Checkbox',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Broker signature type checkbox (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'lease_listing_amend_broker_associate_signature_checkbox',
      'lease_listing_amend_broker_associate_signature_checkbox',
      'Lease Listing Amend Broker Associate Signature Checkbox',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1423 · Broker associate signature type checkbox (packet/form-specific).',
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
insert into txr_1423_fields_touched (field_key, action)
select field_key, 'inserted' from inserted_fields
union all
select field_key, 'updated' from updated_fields;

-- ---------------------------------------------------------------------------
-- First-pass page 1 mappings
-- ---------------------------------------------------------------------------

create temp table txr_1423_placement_seed (
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

insert into txr_1423_placement_seed (
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
  ('property_address', 'Page 1 property address', null::integer, 1, 75, 130, 465, 14, 'text'),
  ('lease_listing_amendment_effective_date', 'Page 1 amendment effective date', null::integer, 1, 108, 181, 100, 14, 'text'),
  ('lease_listing_amend_price_changed', 'Page 1 price changed', null::integer, 1, 47, 218, 14, 14, 'checkbox'),
  ('lease_listing_amend_monthly_rent', 'Page 1 amended monthly rent', null::integer, 1, 272, 246, 90, 14, 'text'),
  ('lease_listing_amend_min_lease_months', 'Page 1 amended min lease months', null::integer, 1, 315, 274, 65, 14, 'text'),
  ('lease_listing_amend_max_lease_months', 'Page 1 amended max lease months', null::integer, 1, 500, 274, 65, 14, 'text'),
  ('lease_listing_amend_term_changed', 'Page 1 term changed', null::integer, 1, 47, 304, 14, 14, 'checkbox'),
  ('lease_listing_amend_new_end_date', 'Page 1 new end date', null::integer, 1, 378, 304, 150, 14, 'text'),
  ('lease_listing_amend_broker_fee_changed', 'Page 1 broker fee changed', null::integer, 1, 47, 333, 14, 14, 'checkbox'),
  ('lease_listing_amend_fee_5a1_selected', 'Page 1 fee 5A(1) selected', null::integer, 1, 260, 333, 14, 14, 'checkbox'),
  ('lease_listing_amend_fee_5b_selected', 'Page 1 fee 5B selected', null::integer, 1, 342, 333, 14, 14, 'checkbox'),
  ('lease_listing_amend_fee_one_month_selected', 'Page 1 fee one month selected', null::integer, 1, 72, 362, 14, 14, 'checkbox'),
  ('lease_listing_amend_fee_one_month_percent', 'Page 1 fee one month percent', null::integer, 1, 120, 362, 55, 14, 'text'),
  ('lease_listing_amend_fee_all_rents_selected', 'Page 1 fee all rents selected', null::integer, 1, 72, 391, 14, 14, 'checkbox'),
  ('lease_listing_amend_fee_all_rents_percent', 'Page 1 fee all rents percent', null::integer, 1, 120, 391, 55, 14, 'text'),
  ('lease_listing_amend_fee_other_selected', 'Page 1 fee other selected', null::integer, 1, 72, 420, 14, 14, 'checkbox'),
  ('lease_listing_amend_fee_other_text', 'Page 1 fee other text', null::integer, 1, 105, 420, 455, 14, 'text'),
  ('lease_listing_amend_other_broker_comp_changed', 'Page 1 other broker comp changed', null::integer, 1, 47, 449, 14, 14, 'checkbox'),
  ('lease_listing_amend_other_broker_one_month_selected', 'Page 1 other broker one month selected', null::integer, 1, 72, 491, 14, 14, 'checkbox'),
  ('lease_listing_amend_other_broker_one_month_percent', 'Page 1 other broker one month percent', null::integer, 1, 95, 491, 55, 14, 'text'),
  ('lease_listing_amend_other_broker_all_rents_selected', 'Page 1 other broker all rents selected', null::integer, 1, 72, 520, 14, 14, 'checkbox'),
  ('lease_listing_amend_other_broker_all_rents_percent', 'Page 1 other broker all rents percent', null::integer, 1, 95, 520, 55, 14, 'text'),
  ('lease_listing_amend_other_broker_flat_fee_selected', 'Page 1 other broker flat fee selected', null::integer, 1, 72, 549, 14, 14, 'checkbox'),
  ('lease_listing_amend_other_broker_flat_fee', 'Page 1 other broker flat fee', null::integer, 1, 185, 549, 95, 14, 'text'),
  ('lease_listing_amend_cease_marketing_selected', 'Page 1 cease marketing selected', null::integer, 1, 47, 579, 14, 14, 'checkbox'),
  ('lease_listing_amend_cease_marketing_date', 'Page 1 cease marketing date', null::integer, 1, 360, 579, 100, 14, 'text'),
  ('lease_listing_amend_resume_on_owner_instructions', 'Page 1 resume on owner instructions', null::integer, 1, 330, 608, 14, 14, 'checkbox'),
  ('lease_listing_amend_resume_on_specific_date_selected', 'Page 1 resume on specific date selected', null::integer, 1, 505, 608, 14, 14, 'checkbox'),
  ('lease_listing_amend_resume_marketing_date', 'Page 1 resume marketing date', null::integer, 1, 72, 637, 485, 14, 'text'),
  ('lease_listing_amend_paragraphs_changed_selected', 'Page 1 paragraphs changed selected', null::integer, 1, 47, 666, 14, 14, 'checkbox'),
  ('lease_listing_amend_paragraph_numbers', 'Page 1 paragraph numbers', null::integer, 1, 152, 666, 125, 14, 'text'),
  ('lease_listing_amend_paragraph_changes', 'Page 1 paragraph changes', null::integer, 1, 72, 695, 485, 35, 'text'),
  -- Signature block below paragraph changes (y 695 + h 35); avoids overlap with amendment body
  ('broker_full_name', 'Page 1 broker printed name', null::integer, 1, 47, 738, 220, 14, 'text'),
  ('broker_license_number', 'Page 1 broker license number', null::integer, 1, 275, 738, 90, 14, 'text'),
  ('lease_listing_amend_broker_signature_checkbox', 'Page 1 broker signature checkbox', null::integer, 1, 47, 753, 14, 14, 'checkbox'),
  ('lease_listing_amend_broker_associate_signature_checkbox', 'Page 1 broker associate signature checkbox', null::integer, 1, 220, 753, 14, 14, 'checkbox'),
  ('agent_full_name', 'Page 1 agent printed name', null::integer, 1, 47, 778, 230, 14, 'text'),
  ('agent_license_number', 'Page 1 agent license number', null::integer, 1, 420, 778, 100, 14, 'text');

create temp table txr_1423_mappings_touched (
  field_key text not null,
  page_number integer not null,
  occurrence_index integer,
  action text not null
) on commit drop;

-- Deactivate active mappings on wrong page/occurrence (TXR-1423 only)
update public.form_field_mappings ffm
set
  status = 'INACTIVE',
  update_date = now()
from txr_1423_form tf,
     public.fields fld
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.id
  and fld.status = 'ACTIVE'
  and ffm.status = 'ACTIVE'
  and exists (
    select 1
    from txr_1423_placement_seed ps
    where lower(ps.field_key) = lower(fld.field_key)
  )
  and not exists (
    select 1
    from txr_1423_placement_seed ps
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
    notes = 'TXR-1423 lease listing amendment first-pass placement',
    status = 'ACTIVE',
    update_date = now()
  from txr_1423_form tf,
       txr_1423_placement_seed ps,
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
    'TXR-1423 lease listing amendment first-pass placement'
  from txr_1423_placement_seed ps
  inner join txr_1423_form tf on true
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
insert into txr_1423_mappings_touched (field_key, page_number, occurrence_index, action)
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
  select form_id into v_form_id from txr_1423_form limit 1;

  select count(*) into v_fields_inserted
  from txr_1423_fields_touched where action = 'inserted';

  select count(*) into v_fields_updated
  from txr_1423_fields_touched where action = 'updated';

  select count(*) into v_mappings_inserted
  from txr_1423_mappings_touched where action = 'inserted';

  select count(*) into v_mappings_updated
  from txr_1423_mappings_touched where action = 'updated';

  select string_agg(expected.field_key, ', ' order by expected.field_key)
  into v_unresolved_fields
  from (
    values
      ('property_address'),
      ('lease_listing_amendment_effective_date'),
      ('lease_listing_amend_price_changed'),
      ('lease_listing_amend_monthly_rent'),
      ('lease_listing_amend_min_lease_months'),
      ('lease_listing_amend_max_lease_months'),
      ('lease_listing_amend_term_changed'),
      ('lease_listing_amend_new_end_date'),
      ('lease_listing_amend_broker_fee_changed'),
      ('lease_listing_amend_fee_5a1_selected'),
      ('lease_listing_amend_fee_5b_selected'),
      ('lease_listing_amend_fee_one_month_selected'),
      ('lease_listing_amend_fee_one_month_percent'),
      ('lease_listing_amend_fee_all_rents_selected'),
      ('lease_listing_amend_fee_all_rents_percent'),
      ('lease_listing_amend_fee_other_selected'),
      ('lease_listing_amend_fee_other_text'),
      ('lease_listing_amend_other_broker_comp_changed'),
      ('lease_listing_amend_other_broker_one_month_selected'),
      ('lease_listing_amend_other_broker_one_month_percent'),
      ('lease_listing_amend_other_broker_all_rents_selected'),
      ('lease_listing_amend_other_broker_all_rents_percent'),
      ('lease_listing_amend_other_broker_flat_fee_selected'),
      ('lease_listing_amend_other_broker_flat_fee'),
      ('lease_listing_amend_cease_marketing_selected'),
      ('lease_listing_amend_cease_marketing_date'),
      ('lease_listing_amend_resume_on_owner_instructions'),
      ('lease_listing_amend_resume_on_specific_date_selected'),
      ('lease_listing_amend_resume_marketing_date'),
      ('lease_listing_amend_paragraphs_changed_selected'),
      ('lease_listing_amend_paragraph_numbers'),
      ('lease_listing_amend_paragraph_changes'),
      ('broker_full_name'),
      ('broker_license_number'),
      ('lease_listing_amend_broker_signature_checkbox'),
      ('lease_listing_amend_broker_associate_signature_checkbox'),
      ('agent_full_name'),
      ('agent_license_number')
  ) as expected(field_key)
  left join txr_1423_fields_touched touched
    on lower(touched.field_key) = lower(expected.field_key)
  where touched.field_key is null;

  select string_agg(
    ps.field_key || ' (page ' || ps.page_number || ')',
    ', '
    order by ps.field_key
  )
  into v_unresolved_mappings
  from txr_1423_placement_seed ps
  left join txr_1423_mappings_touched touched
    on lower(touched.field_key) = lower(ps.field_key)
   and touched.page_number = ps.page_number
   and coalesce(touched.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
  where touched.field_key is null
    and v_form_id is not null;

  raise notice 'TXR-1423 lease listing amendment migration report';
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
