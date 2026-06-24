-- TXR-1501 Buyer/Tenant Representation Agreement Long Form PDF field mappings.
-- Does not touch public.forms. Replaces active mappings for listed field_keys on TXR-1501 only.

-- ---------------------------------------------------------------------------
-- 1. Seed combined agreement-between catalog field
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
  values (
    'buyer_rep_agreement_between',
    'buyer_rep_agreement_between',
    'Buyer/Tenant Representation Agreement between',
    'text',
    'text',
    null::text,
    null::boolean,
    false,
    'TXR-1501 · Combined buyer/client names and brokerage name for the agreement-between line.',
    'custom_resolver',
    null::text,
    'buyer_rep_agreement_between'
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
-- 2. Resolve TXR-1501 form and deactivate conflicting active mappings
-- ---------------------------------------------------------------------------

with txr_form as (
  select f.id as form_id
  from public.forms f
  where f.status = 'ACTIVE'
    and (
      lower(trim(f.form_code)) in ('txr-1501', 'txr_1501')
      or (
        lower(f.form_name) like '%buyer/tenant%'
        and lower(f.form_name) like '%representation%'
        and lower(f.form_name) like '%long%'
      )
    )
  order by
    case when lower(trim(f.form_code)) in ('txr-1501', 'txr_1501') then 0 else 1 end,
    f.id
  limit 1
),
mapping_field_keys(field_key) as (
  values
    ('buyer_rep_agreement_between'),
    ('buyer_client_name_1'),
    ('buyer_client_name_2'),
    ('buyer_client_address'),
    ('buyer_client_city_state_zip'),
    ('buyer_client_phone'),
    ('buyer_client_email'),
    ('buyer_rep_broker_name'),
    ('buyer_rep_broker_address'),
    ('buyer_rep_broker_city_state_zip'),
    ('buyer_rep_broker_phone'),
    ('buyer_rep_broker_email'),
    ('buyer_rep_market_area'),
    ('buyer_rep_effective_date'),
    ('buyer_rep_expiration_date'),
    ('buyer_rep_purchase_fee_percent'),
    ('buyer_rep_purchase_flat_fee'),
    ('buyer_rep_lease_one_month_rent_percent'),
    ('buyer_rep_lease_all_rents_percent'),
    ('buyer_rep_lease_flat_fee'),
    ('buyer_rep_retainer_amount'),
    ('buyer_rep_retainer_will_apply'),
    ('buyer_rep_retainer_will_not_apply'),
    ('buyer_rep_construction_compensation'),
    ('buyer_rep_other_compensation'),
    ('buyer_rep_protection_period_days'),
    ('buyer_rep_payment_county'),
    ('buyer_rep_employer_relocation'),
    ('buyer_rep_intermediary_status_yes'),
    ('buyer_rep_intermediary_status_no'),
    ('buyer_rep_special_provisions'),
    ('buyer_rep_add_iabs'),
    ('buyer_rep_add_lead_based_paint'),
    ('buyer_rep_add_mold_remediation'),
    ('buyer_rep_add_flood_hazard'),
    ('buyer_rep_add_property_insurance'),
    ('buyer_rep_add_home_inspection'),
    ('buyer_rep_add_general_information_notice'),
    ('buyer_rep_add_wire_fraud'),
    ('buyer_rep_add_other_document'),
    ('buyer_rep_add_other_document_description')
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
from txr_form tf,
     target_fields fld
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.field_id
  and ffm.status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 3. Insert replacement mappings (estimated coordinates)
-- ---------------------------------------------------------------------------

with txr_form as (
  select f.id as form_id
  from public.forms f
  where f.status = 'ACTIVE'
    and (
      lower(trim(f.form_code)) in ('txr-1501', 'txr_1501')
      or (
        lower(f.form_name) like '%buyer/tenant%'
        and lower(f.form_name) like '%representation%'
        and lower(f.form_name) like '%long%'
      )
    )
  order by
    case when lower(trim(f.form_code)) in ('txr-1501', 'txr_1501') then 0 else 1 end,
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
    -- Agreement-between line (pages 2-5)
    ('buyer_rep_agreement_between', 'Agreement between (page 2)', null::integer, 2, 196, 52, 330, 12, 'text', 10),
    ('buyer_rep_agreement_between', 'Agreement between (page 3)', null::integer, 3, 196, 52, 330, 12, 'text', 10),
    ('buyer_rep_agreement_between', 'Agreement between (page 4)', null::integer, 4, 196, 52, 330, 12, 'text', 10),
    ('buyer_rep_agreement_between', 'Agreement between (page 5)', null::integer, 5, 196, 52, 330, 12, 'text', 10),

    -- Page 1 party block
    ('buyer_client_name_1', 'Buyer/client name 1', null::integer, 1, 48, 98, 220, 12, 'text', 10),
    ('buyer_client_name_2', 'Buyer/client name 2', null::integer, 1, 280, 98, 220, 12, 'text', 10),
    ('buyer_client_address', 'Buyer/client address', null::integer, 1, 48, 114, 452, 12, 'text', 10),
    ('buyer_client_city_state_zip', 'Buyer/client city/state/zip', null::integer, 1, 48, 130, 260, 12, 'text', 10),
    ('buyer_client_phone', 'Buyer/client phone', null::integer, 1, 320, 130, 180, 12, 'text', 10),
    ('buyer_client_email', 'Buyer/client email', null::integer, 1, 48, 146, 260, 12, 'text', 10),
    ('buyer_rep_broker_name', 'Brokerage name', null::integer, 1, 48, 178, 220, 12, 'text', 10),
    ('buyer_rep_broker_address', 'Brokerage address', null::integer, 1, 48, 194, 452, 12, 'text', 10),
    ('buyer_rep_broker_city_state_zip', 'Brokerage city/state/zip', null::integer, 1, 48, 210, 260, 12, 'text', 10),
    ('buyer_rep_broker_phone', 'Brokerage phone', null::integer, 1, 320, 210, 180, 12, 'text', 10),
    ('buyer_rep_broker_email', 'Brokerage email', null::integer, 1, 48, 226, 260, 12, 'text', 10),
    ('buyer_rep_market_area', 'Market area', null::integer, 1, 360, 258, 140, 12, 'text', 10),
    ('buyer_rep_effective_date', 'Effective date', null::integer, 1, 48, 258, 90, 12, 'date', 10),
    ('buyer_rep_expiration_date', 'Expiration date', null::integer, 1, 160, 258, 90, 12, 'date', 10),

    -- Page 2 compensation / retainer / intermediary
    ('buyer_rep_purchase_fee_percent', 'Purchase fee percent', null::integer, 2, 420, 168, 40, 12, 'text', 10),
    ('buyer_rep_purchase_flat_fee', 'Purchase flat fee', null::integer, 2, 470, 168, 60, 12, 'text', 10),
    ('buyer_rep_lease_one_month_rent_percent', 'Lease one month rent percent', null::integer, 2, 420, 186, 40, 12, 'text', 10),
    ('buyer_rep_lease_all_rents_percent', 'Lease all rents percent', null::integer, 2, 470, 186, 40, 12, 'text', 10),
    ('buyer_rep_lease_flat_fee', 'Lease flat fee', null::integer, 2, 520, 186, 60, 12, 'text', 10),
    ('buyer_rep_retainer_amount', 'Retainer amount', null::integer, 2, 200, 220, 70, 12, 'text', 10),
    ('buyer_rep_retainer_will_apply', 'Retainer will apply', null::integer, 2, 48, 238, 12, 12, 'checkbox', 10),
    ('buyer_rep_retainer_will_not_apply', 'Retainer will not apply', null::integer, 2, 120, 238, 12, 12, 'checkbox', 10),
    ('buyer_rep_construction_compensation', 'Construction compensation', null::integer, 2, 48, 270, 200, 12, 'text', 10),
    ('buyer_rep_other_compensation', 'Other compensation', null::integer, 2, 280, 270, 220, 12, 'text', 10),
    ('buyer_rep_protection_period_days', 'Protection period days', null::integer, 2, 320, 302, 40, 12, 'text', 10),
    ('buyer_rep_payment_county', 'Payment county', null::integer, 2, 48, 318, 180, 12, 'text', 10),
    ('buyer_rep_employer_relocation', 'Employer relocation', null::integer, 2, 280, 318, 220, 12, 'text', 10),
    ('buyer_rep_intermediary_status_yes', 'Intermediary status yes', null::integer, 2, 48, 350, 12, 12, 'checkbox', 10),
    ('buyer_rep_intermediary_status_no', 'Intermediary status no', null::integer, 2, 120, 350, 12, 12, 'checkbox', 10),

    -- Page 3 special provisions
    ('buyer_rep_special_provisions', 'Special provisions', null::integer, 3, 48, 120, 500, 80, 'text', 10),

    -- Page 4 addenda checkboxes
    ('buyer_rep_add_iabs', 'Add IABS', null::integer, 4, 48, 140, 12, 12, 'checkbox', 10),
    ('buyer_rep_add_lead_based_paint', 'Add lead-based paint', null::integer, 4, 48, 164, 12, 12, 'checkbox', 10),
    ('buyer_rep_add_mold_remediation', 'Add mold remediation', null::integer, 4, 48, 188, 12, 12, 'checkbox', 10),
    ('buyer_rep_add_flood_hazard', 'Add flood hazard', null::integer, 4, 48, 212, 12, 12, 'checkbox', 10),
    ('buyer_rep_add_property_insurance', 'Add property insurance', null::integer, 4, 48, 236, 12, 12, 'checkbox', 10),
    ('buyer_rep_add_home_inspection', 'Add home inspection', null::integer, 4, 280, 140, 12, 12, 'checkbox', 10),
    ('buyer_rep_add_general_information_notice', 'Add general information notice', null::integer, 4, 280, 164, 12, 12, 'checkbox', 10),
    ('buyer_rep_add_wire_fraud', 'Add wire fraud', null::integer, 4, 280, 188, 12, 12, 'checkbox', 10),
    ('buyer_rep_add_other_document', 'Add other document', null::integer, 4, 280, 212, 12, 12, 'checkbox', 10),

    -- Page 5 other document description
    ('buyer_rep_add_other_document_description', 'Other document description', null::integer, 5, 80, 420, 400, 24, 'text', 10)
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
  ps.font_size,
  ps.field_widget_type,
  'TXR-1501 estimated placement'
from placement_seed ps
inner join txr_form tf on true
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
