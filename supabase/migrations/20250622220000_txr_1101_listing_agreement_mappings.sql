-- TXR-1101 Residential Real Estate Listing Agreement first-pass PDF field mappings.
-- Does not touch public.forms. Page placement follows TXR-1101 paragraph locations.

-- ---------------------------------------------------------------------------
-- 1. Deactivate existing mappings for listed field keys on TXR-1101
-- ---------------------------------------------------------------------------

with txr_form as (
  select f.id as form_id
  from public.forms f
  where f.status = 'ACTIVE'
    and (
      lower(trim(f.form_code)) in ('txr-1101', 'txr_1101')
      or (
        lower(f.form_name) like '%residential%'
        and lower(f.form_name) like '%listing%'
        and lower(f.form_name) like '%exclusive%'
      )
    )
  order by
    case when lower(trim(f.form_code)) in ('txr-1101', 'txr_1101') then 0 else 1 end,
    f.id
  limit 1
),
mapping_field_keys(field_key) as (
  values
    ('seller_name_1'),
    ('seller_name_2'),
    ('seller_address'),
    ('seller_city_state_zip'),
    ('seller_phone'),
    ('seller_email'),
    ('listing_agreement_concerning'),
    ('property_lot'),
    ('property_block'),
    ('property_addition'),
    ('property_city'),
    ('property_county'),
    ('property_address_zip'),
    ('property_legal_description'),
    ('listing_exclusions'),
    ('listing_hoa_is_subject'),
    ('listing_hoa_is_not_subject'),
    ('listing_price'),
    ('listing_begin_date'),
    ('listing_end_date'),
    ('listing_compensation_model_with_coop'),
    ('listing_compensation_model_no_coop'),
    ('listing_commission_percent'),
    ('listing_flat_fee'),
    ('listing_compensation_other'),
    ('buyer_broker_comp_percent'),
    ('buyer_broker_comp_flat_fee'),
    ('seller_authorizes_buyer_expense_disclosure_yes'),
    ('seller_authorizes_buyer_expense_disclosure_no'),
    ('other_fees_reimbursable_expenses'),
    ('listing_protection_period_days'),
    ('listing_payment_county'),
    ('mls_file_listing'),
    ('mls_file_immediately'),
    ('mls_delay_filing'),
    ('mls_delayed_days'),
    ('mls_delayed_purpose'),
    ('mls_no_filing'),
    ('scheduling_company'),
    ('keybox_authorized_yes'),
    ('keybox_authorized_no'),
    ('listing_intermediary_yes'),
    ('listing_intermediary_no'),
    ('internet_no_display'),
    ('internet_no_address_display'),
    ('financing_conventional'),
    ('financing_va'),
    ('financing_fha'),
    ('financing_cash'),
    ('financing_texas_veterans'),
    ('financing_owner_finance'),
    ('financing_other'),
    ('financing_other_description'),
    ('known_financial_obligations_exception'),
    ('known_liens_exception'),
    ('employer_relocation_company'),
    ('known_districts'),
    ('listing_special_provisions'),
    ('listing_add_iabs'),
    ('listing_add_sellers_disclosure'),
    ('listing_add_lead_paint'),
    ('listing_add_t47'),
    ('listing_add_mud_notice'),
    ('listing_add_pid_notice'),
    ('listing_add_hoa_request'),
    ('listing_add_mortgage_info_request'),
    ('listing_add_mineral_info'),
    ('listing_add_onsite_sewer_info'),
    ('listing_add_property_insurance'),
    ('listing_add_flood_hazard'),
    ('listing_add_condo_addendum'),
    ('listing_add_keybox_tenant'),
    ('listing_add_authorization_to_advertise'),
    ('listing_add_other_document'),
    ('listing_add_other_document_description')
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
-- 2. Insert replacement mappings (estimated coordinates; page 612 x 792)
-- ---------------------------------------------------------------------------

with txr_form as (
  select f.id as form_id
  from public.forms f
  where f.status = 'ACTIVE'
    and (
      lower(trim(f.form_code)) in ('txr-1101', 'txr_1101')
      or (
        lower(f.form_name) like '%residential%'
        and lower(f.form_name) like '%listing%'
        and lower(f.form_name) like '%exclusive%'
      )
    )
  order by
    case when lower(trim(f.form_code)) in ('txr-1101', 'txr_1101') then 0 else 1 end,
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
    -- Page 1: ¶1 Parties, ¶2 Property
    ('seller_name_1', '¶1 Seller name 1', null::integer, 1, 48, 98, 220, 14, 'text', 9),
    ('seller_name_2', '¶1 Seller name 2', null::integer, 1, 48, 112, 220, 14, 'text', 9),
    ('seller_address', '¶1 Seller address', null::integer, 1, 48, 126, 452, 14, 'text', 9),
    ('seller_city_state_zip', '¶1 Seller city/state/zip', null::integer, 1, 48, 140, 260, 14, 'text', 9),
    ('seller_phone', '¶1 Seller phone', null::integer, 1, 320, 140, 180, 14, 'text', 9),
    ('seller_email', '¶1 Seller email', null::integer, 1, 48, 154, 300, 14, 'text', 9),
    ('property_lot', '¶2A Property lot', null::integer, 1, 136, 452, 65, 14, 'text', 9),
    ('property_block', '¶2A Property block', null::integer, 1, 248, 452, 70, 14, 'text', 9),
    ('property_addition', '¶2A Property addition', null::integer, 1, 95, 468, 250, 14, 'text', 9),
    ('property_city', '¶2A Property city', null::integer, 1, 405, 468, 130, 14, 'text', 9),
    ('property_county', '¶2A Property county', null::integer, 1, 77, 483, 120, 14, 'text', 9),
    ('property_address_zip', '¶2A Property address/zip', null::integer, 1, 255, 483, 300, 14, 'text', 9),
    ('property_legal_description', '¶2A Property legal description (exhibit)', null::integer, 1, 48, 510, 400, 28, 'text', 9),
    ('listing_exclusions', '¶2 Listing exclusions', null::integer, 1, 320, 268, 180, 14, 'text', 9),
    ('listing_hoa_is_subject', '¶2E HOA is subject', null::integer, 1, 200, 296, 14, 14, 'checkbox', 9),
    ('listing_hoa_is_not_subject', '¶2E HOA is not subject', null::integer, 1, 260, 296, 14, 14, 'checkbox', 9),

    -- Page 2: ¶3 Listing Price, ¶4 Term, ¶5 Broker Compensation (start)
    ('listing_price', '¶3 Listing price', null::integer, 2, 470, 92, 95, 14, 'text', 9),
    ('listing_begin_date', '¶4 Listing begin date', null::integer, 2, 196, 137, 95, 14, 'date', 9),
    ('listing_end_date', '¶4 Listing end date', null::integer, 2, 440, 137, 105, 14, 'date', 9),
    ('listing_compensation_model_with_coop', '¶5A Compensation with co-op', null::integer, 2, 48, 188, 14, 14, 'checkbox', 9),
    ('listing_compensation_model_no_coop', '¶5B Compensation no co-op', null::integer, 2, 48, 212, 14, 14, 'checkbox', 9),
    ('listing_commission_percent', '¶5 Listing commission percent', null::integer, 2, 420, 200, 45, 14, 'text', 9),
    ('listing_flat_fee', '¶5 Listing flat fee', null::integer, 2, 500, 200, 70, 14, 'text', 9),
    ('listing_compensation_other', '¶5 Listing compensation other', null::integer, 2, 200, 228, 180, 14, 'text', 9),
    ('buyer_broker_comp_percent', '¶5 Buyer broker comp percent', null::integer, 2, 420, 248, 45, 14, 'text', 9),
    ('buyer_broker_comp_flat_fee', '¶5 Buyer broker comp flat fee', null::integer, 2, 500, 248, 70, 14, 'text', 9),

    -- Pages 2–9: running "Residential Listing concerning" header
    ('listing_agreement_concerning', 'Listing concerning (page 2)', null::integer, 2, 196, 52, 330, 14, 'text', 9),
    ('listing_agreement_concerning', 'Listing concerning (page 3)', null::integer, 3, 196, 52, 330, 14, 'text', 9),
    ('listing_agreement_concerning', 'Listing concerning (page 4)', null::integer, 4, 196, 52, 330, 14, 'text', 9),
    ('listing_agreement_concerning', 'Listing concerning (page 5)', null::integer, 5, 196, 52, 330, 14, 'text', 9),
    ('listing_agreement_concerning', 'Listing concerning (page 6)', null::integer, 6, 196, 52, 330, 14, 'text', 9),
    ('listing_agreement_concerning', 'Listing concerning (page 7)', null::integer, 7, 196, 52, 330, 14, 'text', 9),
    ('listing_agreement_concerning', 'Listing concerning (page 8)', null::integer, 8, 196, 52, 330, 14, 'text', 9),
    ('listing_agreement_concerning', 'Listing concerning (page 9)', null::integer, 9, 196, 52, 330, 14, 'text', 9),

    -- Page 3: ¶5 Broker Compensation (continued)
    ('other_fees_reimbursable_expenses', '¶5E Other fees/reimbursable expenses', null::integer, 3, 48, 118, 320, 14, 'text', 9),
    ('listing_protection_period_days', '¶5F Protection period days', null::integer, 3, 400, 198, 40, 14, 'text', 9),
    ('listing_payment_county', '¶5G Payment county', null::integer, 3, 200, 228, 180, 14, 'text', 9),

    -- Page 4: ¶5 Broker Compensation (end), ¶6 Listing Services (start)
    ('mls_file_listing', '¶6A MLS file listing', null::integer, 4, 48, 280, 14, 14, 'checkbox', 9),
    ('mls_file_immediately', '¶6A1a MLS file immediately', null::integer, 4, 72, 310, 14, 14, 'checkbox', 9),
    ('mls_delay_filing', '¶6A1b MLS delay filing', null::integer, 4, 72, 340, 14, 14, 'checkbox', 9),
    ('mls_delayed_days', '¶6A1b MLS delayed days', null::integer, 4, 400, 338, 40, 14, 'text', 9),
    ('mls_delayed_purpose', '¶6A1b MLS delayed purpose', null::integer, 4, 120, 360, 380, 28, 'text', 9),
    ('mls_no_filing', '¶6A2 MLS no filing', null::integer, 4, 48, 420, 14, 14, 'checkbox', 9),

    -- Page 5: ¶6 Listing Services (end), ¶7 Access/Keybox
    ('scheduling_company', '¶7B Scheduling company', null::integer, 5, 120, 198, 300, 14, 'text', 9),
    ('keybox_authorized_yes', '¶7C Keybox authorized yes', null::integer, 5, 72, 318, 14, 14, 'checkbox', 9),
    ('keybox_authorized_no', '¶7C Keybox authorized no', null::integer, 5, 120, 318, 14, 14, 'checkbox', 9),

    -- Page 6: ¶9 Intermediary
    ('listing_intermediary_yes', '¶9A Intermediary yes', null::integer, 6, 48, 118, 14, 14, 'checkbox', 9),
    ('listing_intermediary_no', '¶9B Intermediary no', null::integer, 6, 48, 278, 14, 14, 'checkbox', 9),

    -- Page 7: ¶11 Broker Authority / Financing
    ('internet_no_display', '¶11B No internet display', null::integer, 7, 48, 118, 14, 14, 'checkbox', 9),
    ('internet_no_address_display', '¶11B No address internet display', null::integer, 7, 48, 148, 14, 14, 'checkbox', 9),
    ('financing_conventional', '¶11C Financing conventional', null::integer, 7, 48, 198, 14, 14, 'checkbox', 9),
    ('financing_va', '¶11C Financing VA', null::integer, 7, 48, 223, 14, 14, 'checkbox', 9),
    ('financing_fha', '¶11C Financing FHA', null::integer, 7, 120, 198, 14, 14, 'checkbox', 9),
    ('financing_cash', '¶11C Financing cash', null::integer, 7, 120, 223, 14, 14, 'checkbox', 9),
    ('financing_texas_veterans', '¶11C Financing Texas veterans', null::integer, 7, 200, 198, 14, 14, 'checkbox', 9),
    ('financing_owner_finance', '¶11C Financing owner finance', null::integer, 7, 200, 223, 14, 14, 'checkbox', 9),
    ('financing_other', '¶11C Financing other', null::integer, 7, 300, 198, 14, 14, 'checkbox', 9),
    ('financing_other_description', '¶11C Financing other description', null::integer, 7, 360, 223, 200, 14, 'text', 9),
    ('seller_authorizes_buyer_expense_disclosure_yes', '¶11F Seller authorizes buyer expense disclosure yes', null::integer, 7, 48, 338, 14, 14, 'checkbox', 9),
    ('seller_authorizes_buyer_expense_disclosure_no', '¶11F Seller authorizes buyer expense disclosure no', null::integer, 7, 120, 338, 14, 14, 'checkbox', 9),

    -- Page 8: ¶12 Seller Representations
    ('known_financial_obligations_exception', '¶12E Known financial obligations exception', null::integer, 8, 48, 198, 360, 14, 'text', 9),
    ('known_liens_exception', '¶12F Known liens exception', null::integer, 8, 48, 248, 360, 14, 'text', 9),
    ('employer_relocation_company', '¶12I Employer relocation company', null::integer, 8, 48, 348, 360, 14, 'text', 9),
    ('known_districts', '¶12K Known districts', null::integer, 8, 48, 448, 400, 14, 'text', 9),

    -- Page 9: ¶15 Special Provisions, ¶19 Addenda
    ('listing_special_provisions', '¶15 Special provisions', null::integer, 9, 48, 98, 500, 60, 'text', 9),
    ('listing_add_iabs', '¶19A Add IABS', null::integer, 9, 48, 200, 14, 14, 'checkbox', 9),
    ('listing_add_sellers_disclosure', '¶19B Add seller disclosure', null::integer, 9, 48, 224, 14, 14, 'checkbox', 9),
    ('listing_add_lead_paint', '¶19C Add lead paint', null::integer, 9, 48, 248, 14, 14, 'checkbox', 9),
    ('listing_add_t47', '¶19D Add T-47', null::integer, 9, 48, 272, 14, 14, 'checkbox', 9),
    ('listing_add_mud_notice', '¶19E Add MUD notice', null::integer, 9, 48, 296, 14, 14, 'checkbox', 9),
    ('listing_add_pid_notice', '¶19F Add PID notice', null::integer, 9, 48, 320, 14, 14, 'checkbox', 9),
    ('listing_add_hoa_request', '¶19G Add HOA request', null::integer, 9, 48, 344, 14, 14, 'checkbox', 9),
    ('listing_add_mortgage_info_request', '¶19H Add mortgage info request', null::integer, 9, 48, 368, 14, 14, 'checkbox', 9),
    ('listing_add_mineral_info', '¶19I Add mineral info', null::integer, 9, 48, 392, 14, 14, 'checkbox', 9),
    ('listing_add_onsite_sewer_info', '¶19J Add onsite sewer info', null::integer, 9, 300, 200, 14, 14, 'checkbox', 9),
    ('listing_add_property_insurance', '¶19K Add property insurance', null::integer, 9, 300, 224, 14, 14, 'checkbox', 9),
    ('listing_add_flood_hazard', '¶19L Add flood hazard', null::integer, 9, 300, 248, 14, 14, 'checkbox', 9),
    ('listing_add_condo_addendum', '¶19M Add condo addendum', null::integer, 9, 300, 272, 14, 14, 'checkbox', 9),
    ('listing_add_keybox_tenant', '¶19N Add keybox tenant', null::integer, 9, 300, 296, 14, 14, 'checkbox', 9),
    ('listing_add_authorization_to_advertise', '¶19O Add authorization to advertise', null::integer, 9, 300, 320, 14, 14, 'checkbox', 9),
    ('listing_add_other_document', '¶19P Add other document', null::integer, 9, 300, 344, 14, 14, 'checkbox', 9),
    ('listing_add_other_document_description', '¶19P Other document description', null::integer, 9, 80, 480, 400, 40, 'text', 9)
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
  'TXR-1101 paragraph-based estimated placement'
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
