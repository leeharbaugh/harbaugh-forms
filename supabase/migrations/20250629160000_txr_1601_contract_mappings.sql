-- TREC 20-19 / TXR 1601 One to Four Family Residential Contract first-pass PDF field mappings.
-- Does not touch public.forms. Page placement follows contract paragraph locations.

-- ---------------------------------------------------------------------------
-- 1. Deactivate existing mappings for listed field keys on TXR 1601
-- ---------------------------------------------------------------------------

with txr_1601_form as (
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
        lower(f.form_name) like '%one to four%'
        and lower(f.form_name) like '%residential%'
        and lower(f.form_name) like '%contract%'
      )
    )
  order by
    case
      when lower(trim(f.form_code)) in ('txr-1601', 'txr_1601', 'trec-20-19', 'trec_20_19')
        then 0
      else 1
    end,
    case when lower(f.form_name) like '%txr-1601%' then 0 else 1 end,
    case when lower(f.form_name) like '%trec-20-19%' then 0 else 1 end,
    f.id
  limit 1
),
mapping_field_keys(field_key) as (
  values
    ('contract_seller_names'),
    ('contract_buyer_names'),
    ('property_lot'),
    ('property_block'),
    ('property_addition'),
    ('property_city'),
    ('property_county'),
    ('property_address_zip'),
    ('contract_property_exclusions'),
    ('contract_sales_price_cash'),
    ('contract_financing_third_party'),
    ('contract_financing_loan_assumption'),
    ('contract_financing_seller_financing'),
    ('contract_sales_price_financing'),
    ('contract_sales_price_total'),
    ('contract_lease_residential'),
    ('contract_lease_fixture'),
    ('contract_lease_natural_resource'),
    ('contract_escrow_agent_name'),
    ('contract_escrow_agent_address'),
    ('contract_earnest_money_amount'),
    ('contract_option_fee_amount'),
    ('contract_additional_earnest_money_amount'),
    ('contract_additional_earnest_money_days'),
    ('contract_option_period_days'),
    ('contract_title_policy_paid_by_seller'),
    ('contract_title_policy_paid_by_buyer'),
    ('contract_title_company_name'),
    ('contract_title_exception_not_amended'),
    ('contract_title_exception_amended'),
    ('contract_title_exception_amended_paid_by_buyer'),
    ('contract_title_exception_amended_paid_by_seller'),
    ('contract_survey_option_1'),
    ('contract_survey_option_1_days'),
    ('contract_survey_option_1_new_survey_paid_by_seller'),
    ('contract_survey_option_1_new_survey_paid_by_buyer'),
    ('contract_survey_option_2'),
    ('contract_survey_option_2_days'),
    ('contract_survey_option_3'),
    ('contract_survey_option_3_days'),
    ('contract_title_objection_use_activity'),
    ('contract_title_objection_days'),
    ('contract_hoa_is_subject'),
    ('contract_hoa_is_not_subject'),
    ('contract_seller_disclosure_received'),
    ('contract_seller_disclosure_not_received'),
    ('contract_seller_disclosure_delivery_days'),
    ('contract_seller_disclosure_not_required'),
    ('contract_property_as_is'),
    ('contract_property_as_is_with_repairs'),
    ('contract_specific_repairs'),
    ('contract_service_contract_reimbursement_amount'),
    ('contract_water_disclosure_received'),
    ('contract_water_disclosure_not_received'),
    ('contract_water_disclosure_delivery_days'),
    ('contract_water_disclosure_not_required'),
    ('contract_water_provider_name'),
    ('contract_broker_disclosure_text'),
    ('contract_closing_date'),
    ('contract_buyer_possession_at_closing'),
    ('contract_buyer_possession_by_lease'),
    ('contract_special_provisions'),
    ('contract_seller_expense_contribution_amount'),
    ('contract_seller_contributes_to_buyer_broker_comp'),
    ('contract_seller_contribution_dollar_selected'),
    ('contract_seller_contribution_amount'),
    ('contract_seller_contribution_percent_selected'),
    ('contract_seller_contribution_percent'),
    ('contract_buyer_contributes_to_seller_broker_comp'),
    ('contract_buyer_contribution_dollar_selected'),
    ('contract_buyer_contribution_amount'),
    ('contract_buyer_contribution_percent_selected'),
    ('contract_buyer_contribution_percent'),
    ('contract_buyer_notice_address'),
    ('contract_seller_notice_address'),
    ('contract_buyer_notice_phone'),
    ('contract_seller_notice_phone'),
    ('contract_buyer_notice_email'),
    ('contract_seller_notice_email'),
    ('contract_buyer_agent_notice_address'),
    ('contract_seller_agent_notice_address'),
    ('contract_buyer_agent_notice_phone'),
    ('contract_seller_agent_notice_phone'),
    ('contract_buyer_agent_notice_email'),
    ('contract_seller_agent_notice_email'),
    ('contract_add_third_party_financing'),
    ('contract_add_sale_of_other_property'),
    ('contract_add_appraisal_termination'),
    ('contract_add_seller_financing'),
    ('contract_add_1031_exchange'),
    ('contract_add_short_sale'),
    ('contract_add_loan_assumption'),
    ('contract_add_release_liability_va'),
    ('contract_add_residential_leases'),
    ('contract_add_fixture_leases'),
    ('contract_add_buyer_temp_lease'),
    ('contract_add_seller_temp_lease'),
    ('contract_add_hydrostatic_testing'),
    ('contract_add_environmental'),
    ('contract_add_lead_paint'),
    ('contract_add_propane_service_area'),
    ('contract_add_seaward_gulf'),
    ('contract_add_coastal_area'),
    ('contract_add_district_notices'),
    ('contract_add_district_notices_text'),
    ('contract_add_hoa'),
    ('contract_add_non_realty_items'),
    ('contract_add_backup_contract'),
    ('contract_add_mineral_reservation'),
    ('contract_add_other'),
    ('contract_add_other_text'),
    ('contract_buyer_attorney_name'),
    ('contract_seller_attorney_name'),
    ('contract_effective_day'),
    ('contract_effective_month'),
    ('contract_effective_year'),
    ('contract_seller_brokerage_name'),
    ('contract_seller_brokerage_address'),
    ('contract_seller_brokerage_license_number'),
    ('contract_seller_associate_name'),
    ('contract_seller_team_name'),
    ('contract_seller_associate_email'),
    ('contract_seller_associate_phone'),
    ('contract_seller_associate_license_number'),
    ('contract_seller_supervisor_name'),
    ('contract_seller_supervisor_phone'),
    ('contract_seller_supervisor_license_number'),
    ('contract_buyer_brokerage_name'),
    ('contract_buyer_brokerage_address'),
    ('contract_buyer_brokerage_license_number'),
    ('contract_buyer_associate_name'),
    ('contract_buyer_team_name'),
    ('contract_buyer_associate_email'),
    ('contract_buyer_associate_phone'),
    ('contract_buyer_associate_license_number'),
    ('contract_buyer_supervisor_name'),
    ('contract_buyer_supervisor_phone'),
    ('contract_buyer_supervisor_license_number')
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
from txr_1601_form tf,
     target_fields fld
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.field_id
  and ffm.status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 2. Insert or update first-pass mappings (top-left origin; page 612 x 792)
-- ---------------------------------------------------------------------------

with txr_1601_form as (
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
        lower(f.form_name) like '%one to four%'
        and lower(f.form_name) like '%residential%'
        and lower(f.form_name) like '%contract%'
      )
    )
  order by
    case
      when lower(trim(f.form_code)) in ('txr-1601', 'txr_1601', 'trec-20-19', 'trec_20_19')
        then 0
      else 1
    end,
    case when lower(f.form_name) like '%txr-1601%' then 0 else 1 end,
    case when lower(f.form_name) like '%trec-20-19%' then 0 else 1 end,
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
    -- Page 1: Parties, property, sales price, leases
    ('contract_seller_names', 'Seller names', null::integer, 1, 255, 147, 250, 14, 'text', 9),
    ('contract_buyer_names', 'Buyer names', null::integer, 1, 120, 165, 250, 14, 'text', 9),
    ('property_lot', 'Property lot', null::integer, 1, 88, 236, 70, 14, 'text', 9),
    ('property_block', 'Property block', null::integer, 1, 210, 236, 70, 14, 'text', 9),
    ('property_addition', 'Property addition', null::integer, 1, 95, 252, 250, 14, 'text', 9),
    ('property_city', 'Property city', null::integer, 1, 395, 252, 120, 14, 'text', 9),
    ('property_county', 'Property county', null::integer, 1, 105, 267, 140, 14, 'text', 9),
    ('property_address_zip', 'Property address and ZIP', null::integer, 1, 195, 285, 340, 14, 'text', 9),
    ('contract_property_exclusions', 'Property exclusions', null::integer, 1, 70, 481, 500, 28, 'text', 9),
    ('contract_sales_price_cash', 'Sales price cash portion', null::integer, 1, 475, 553, 90, 14, 'text', 9),
    ('contract_financing_third_party', 'Third party financing addendum', null::integer, 1, 310, 615, 14, 14, 'checkbox', 9),
    ('contract_financing_loan_assumption', 'Loan assumption addendum', null::integer, 1, 310, 631, 14, 14, 'checkbox', 9),
    ('contract_financing_seller_financing', 'Seller financing addendum', null::integer, 1, 430, 631, 14, 14, 'checkbox', 9),
    ('contract_sales_price_financing', 'Sales price financing portion', null::integer, 1, 475, 633, 90, 14, 'text', 9),
    ('contract_sales_price_total', 'Sales price total', null::integer, 1, 475, 662, 90, 14, 'text', 9),
    ('contract_lease_residential', 'Residential lease', null::integer, 1, 47, 704, 14, 14, 'checkbox', 9),
    ('contract_lease_fixture', 'Fixture lease', null::integer, 1, 47, 735, 14, 14, 'checkbox', 9),
    ('contract_lease_natural_resource', 'Natural resource lease', null::integer, 1, 47, 766, 14, 14, 'checkbox', 9),

    -- Page 2: Earnest money / option, title policy
    ('contract_escrow_agent_name', 'Escrow agent name', null::integer, 2, 212, 78, 210, 14, 'text', 9),
    ('contract_escrow_agent_address', 'Escrow agent address', null::integer, 2, 105, 94, 390, 14, 'text', 9),
    ('contract_earnest_money_amount', 'Earnest money amount', null::integer, 2, 72, 112, 90, 14, 'text', 9),
    ('contract_option_fee_amount', 'Option fee amount', null::integer, 2, 280, 112, 90, 14, 'text', 9),
    ('contract_additional_earnest_money_amount', 'Additional earnest money amount', null::integer, 2, 244, 144, 90, 14, 'text', 9),
    ('contract_additional_earnest_money_days', 'Additional earnest money days', null::integer, 2, 132, 160, 60, 14, 'text', 9),
    ('contract_option_period_days', 'Option period days', null::integer, 2, 90, 303, 60, 14, 'text', 9),
    ('contract_title_policy_paid_by_seller', 'Title policy paid by seller', null::integer, 2, 245, 475, 14, 14, 'checkbox', 9),
    ('contract_title_policy_paid_by_buyer', 'Title policy paid by buyer', null::integer, 2, 305, 475, 14, 14, 'checkbox', 9),
    ('contract_title_company_name', 'Title company name', null::integer, 2, 390, 475, 170, 14, 'text', 9),
    ('contract_title_exception_not_amended', 'Title exception not amended', null::integer, 2, 47, 705, 14, 14, 'checkbox', 9),
    ('contract_title_exception_amended', 'Title exception amended', null::integer, 2, 47, 721, 14, 14, 'checkbox', 9),
    ('contract_title_exception_amended_paid_by_buyer', 'Title exception amended paid by buyer', null::integer, 2, 395, 721, 14, 14, 'checkbox', 9),
    ('contract_title_exception_amended_paid_by_seller', 'Title exception amended paid by seller', null::integer, 2, 455, 721, 14, 14, 'checkbox', 9),

    -- Page 3: Survey / objections / HOA
    ('contract_survey_option_1', 'Survey option 1', null::integer, 3, 47, 82, 14, 14, 'checkbox', 9),
    ('contract_survey_option_1_days', 'Survey option 1 days', null::integer, 3, 95, 82, 50, 14, 'text', 9),
    ('contract_survey_option_1_new_survey_paid_by_seller', 'New survey paid by seller', null::integer, 3, 372, 160, 14, 14, 'checkbox', 9),
    ('contract_survey_option_1_new_survey_paid_by_buyer', 'New survey paid by buyer', null::integer, 3, 440, 160, 14, 14, 'checkbox', 9),
    ('contract_survey_option_2', 'Survey option 2', null::integer, 3, 47, 177, 14, 14, 'checkbox', 9),
    ('contract_survey_option_2_days', 'Survey option 2 days', null::integer, 3, 95, 177, 50, 14, 'text', 9),
    ('contract_survey_option_3', 'Survey option 3', null::integer, 3, 47, 224, 14, 14, 'checkbox', 9),
    ('contract_survey_option_3_days', 'Survey option 3 days', null::integer, 3, 95, 224, 50, 14, 'text', 9),
    ('contract_title_objection_use_activity', 'Title objection use activity', null::integer, 3, 390, 290, 160, 14, 'text', 9),
    ('contract_title_objection_days', 'Title objection days', null::integer, 3, 325, 305, 50, 14, 'text', 9),
    ('contract_hoa_is_subject', 'Property subject to HOA', null::integer, 3, 398, 546, 14, 14, 'checkbox', 9),
    ('contract_hoa_is_not_subject', 'Property not subject to HOA', null::integer, 3, 430, 546, 14, 14, 'checkbox', 9),

    -- Page 4: Seller disclosure
    ('contract_seller_disclosure_received', 'Seller disclosure received', null::integer, 4, 47, 611, 14, 14, 'checkbox', 9),
    ('contract_seller_disclosure_not_received', 'Seller disclosure not received', null::integer, 4, 47, 629, 14, 14, 'checkbox', 9),
    ('contract_seller_disclosure_delivery_days', 'Seller disclosure delivery days', null::integer, 4, 268, 629, 50, 14, 'text', 9),
    ('contract_seller_disclosure_not_required', 'Seller disclosure not required', null::integer, 4, 47, 707, 14, 14, 'checkbox', 9),

    -- Page 5: Property condition / water disclosure
    ('contract_property_as_is', 'Property accepted as is', null::integer, 5, 47, 82, 14, 14, 'checkbox', 9),
    ('contract_property_as_is_with_repairs', 'Property as is with repairs', null::integer, 5, 47, 112, 14, 14, 'checkbox', 9),
    ('contract_specific_repairs', 'Specific repairs', null::integer, 5, 70, 130, 495, 42, 'text', 9),
    ('contract_service_contract_reimbursement_amount', 'Service contract reimbursement', null::integer, 5, 475, 404, 90, 14, 'text', 9),
    ('contract_water_disclosure_received', 'Water disclosure received', null::integer, 5, 47, 498, 14, 14, 'checkbox', 9),
    ('contract_water_disclosure_not_received', 'Water disclosure not received', null::integer, 5, 47, 528, 14, 14, 'checkbox', 9),
    ('contract_water_disclosure_delivery_days', 'Water disclosure delivery days', null::integer, 5, 285, 528, 50, 14, 'text', 9),
    ('contract_water_disclosure_not_required', 'Water disclosure not required', null::integer, 5, 47, 606, 14, 14, 'checkbox', 9),
    ('contract_water_provider_name', 'Water provider name', null::integer, 5, 390, 746, 170, 14, 'text', 9),

    -- Page 6: Closing / possession / special provisions
    ('contract_broker_disclosure_text', 'Broker disclosure text', null::integer, 6, 270, 75, 290, 42, 'text', 9),
    ('contract_closing_date', 'Closing date', null::integer, 6, 240, 150, 150, 14, 'date', 9),
    ('contract_buyer_possession_at_closing', 'Buyer possession at closing', null::integer, 6, 340, 425, 14, 14, 'checkbox', 9),
    ('contract_buyer_possession_by_lease', 'Buyer possession by lease', null::integer, 6, 435, 425, 14, 14, 'checkbox', 9),
    ('contract_special_provisions', 'Special provisions', null::integer, 6, 70, 611, 495, 42, 'text', 9),
    ('contract_seller_expense_contribution_amount', 'Seller expense contribution', null::integer, 6, 290, 736, 95, 14, 'text', 9),

    -- Page 7: Brokerage compensation contribution
    ('contract_seller_contributes_to_buyer_broker_comp', 'Seller contributes to buyer broker comp', null::integer, 7, 47, 120, 14, 14, 'checkbox', 9),
    ('contract_seller_contribution_dollar_selected', 'Seller contribution dollar selected', null::integer, 7, 252, 120, 14, 14, 'checkbox', 9),
    ('contract_seller_contribution_amount', 'Seller contribution amount', null::integer, 7, 270, 120, 80, 14, 'text', 9),
    ('contract_seller_contribution_percent_selected', 'Seller contribution percent selected', null::integer, 7, 370, 120, 14, 14, 'checkbox', 9),
    ('contract_seller_contribution_percent', 'Seller contribution percent', null::integer, 7, 390, 120, 60, 14, 'text', 9),
    ('contract_buyer_contributes_to_seller_broker_comp', 'Buyer contributes to seller broker comp', null::integer, 7, 47, 152, 14, 14, 'checkbox', 9),
    ('contract_buyer_contribution_dollar_selected', 'Buyer contribution dollar selected', null::integer, 7, 252, 152, 14, 14, 'checkbox', 9),
    ('contract_buyer_contribution_amount', 'Buyer contribution amount', null::integer, 7, 270, 152, 80, 14, 'text', 9),
    ('contract_buyer_contribution_percent_selected', 'Buyer contribution percent selected', null::integer, 7, 370, 152, 14, 14, 'checkbox', 9),
    ('contract_buyer_contribution_percent', 'Buyer contribution percent', null::integer, 7, 390, 152, 60, 14, 'text', 9),

    -- Page 8: Notices
    ('contract_buyer_notice_address', 'Buyer notice address', null::integer, 8, 112, 526, 190, 14, 'text', 9),
    ('contract_seller_notice_address', 'Seller notice address', null::integer, 8, 390, 526, 190, 14, 'text', 9),
    ('contract_buyer_notice_phone', 'Buyer notice phone', null::integer, 8, 112, 555, 190, 14, 'text', 9),
    ('contract_seller_notice_phone', 'Seller notice phone', null::integer, 8, 390, 555, 190, 14, 'text', 9),
    ('contract_buyer_notice_email', 'Buyer notice email', null::integer, 8, 112, 584, 190, 14, 'text', 9),
    ('contract_seller_notice_email', 'Seller notice email', null::integer, 8, 390, 584, 190, 14, 'text', 9),
    ('contract_buyer_agent_notice_address', 'Buyer agent notice address', null::integer, 8, 112, 628, 190, 14, 'text', 9),
    ('contract_seller_agent_notice_address', 'Seller agent notice address', null::integer, 8, 390, 628, 190, 14, 'text', 9),
    ('contract_buyer_agent_notice_phone', 'Buyer agent notice phone', null::integer, 8, 112, 657, 190, 14, 'text', 9),
    ('contract_seller_agent_notice_phone', 'Seller agent notice phone', null::integer, 8, 390, 657, 190, 14, 'text', 9),
    ('contract_buyer_agent_notice_email', 'Buyer agent notice email', null::integer, 8, 112, 686, 190, 14, 'text', 9),
    ('contract_seller_agent_notice_email', 'Seller agent notice email', null::integer, 8, 390, 686, 190, 14, 'text', 9),

    -- Page 9: Addenda and attorneys
    ('contract_add_third_party_financing', 'Add third party financing', null::integer, 9, 47, 93, 14, 14, 'checkbox', 9),
    ('contract_add_sale_of_other_property', 'Add sale of other property', null::integer, 9, 47, 111, 14, 14, 'checkbox', 9),
    ('contract_add_appraisal_termination', 'Add appraisal termination', null::integer, 9, 47, 129, 14, 14, 'checkbox', 9),
    ('contract_add_seller_financing', 'Add seller financing', null::integer, 9, 47, 147, 14, 14, 'checkbox', 9),
    ('contract_add_1031_exchange', 'Add 1031 exchange', null::integer, 9, 47, 165, 14, 14, 'checkbox', 9),
    ('contract_add_short_sale', 'Add short sale', null::integer, 9, 47, 183, 14, 14, 'checkbox', 9),
    ('contract_add_loan_assumption', 'Add loan assumption', null::integer, 9, 47, 201, 14, 14, 'checkbox', 9),
    ('contract_add_release_liability_va', 'Add release of liability VA', null::integer, 9, 47, 219, 14, 14, 'checkbox', 9),
    ('contract_add_residential_leases', 'Add residential leases', null::integer, 9, 47, 265, 14, 14, 'checkbox', 9),
    ('contract_add_fixture_leases', 'Add fixture leases', null::integer, 9, 47, 283, 14, 14, 'checkbox', 9),
    ('contract_add_buyer_temp_lease', 'Add buyer temporary lease', null::integer, 9, 47, 301, 14, 14, 'checkbox', 9),
    ('contract_add_seller_temp_lease', 'Add seller temporary lease', null::integer, 9, 47, 319, 14, 14, 'checkbox', 9),
    ('contract_add_hydrostatic_testing', 'Add hydrostatic testing', null::integer, 9, 47, 365, 14, 14, 'checkbox', 9),
    ('contract_add_environmental', 'Add environmental assessment', null::integer, 9, 47, 383, 14, 14, 'checkbox', 9),
    ('contract_add_lead_paint', 'Add lead-based paint', null::integer, 9, 47, 429, 14, 14, 'checkbox', 9),
    ('contract_add_propane_service_area', 'Add propane service area', null::integer, 9, 47, 462, 14, 14, 'checkbox', 9),
    ('contract_add_seaward_gulf', 'Add seaward gulf', null::integer, 9, 47, 480, 14, 14, 'checkbox', 9),
    ('contract_add_coastal_area', 'Add coastal area', null::integer, 9, 47, 498, 14, 14, 'checkbox', 9),
    ('contract_add_district_notices', 'Add district notices', null::integer, 9, 47, 516, 14, 14, 'checkbox', 9),
    ('contract_add_district_notices_text', 'District notices text', null::integer, 9, 240, 516, 320, 28, 'text', 9),
    ('contract_add_hoa', 'Add HOA', null::integer, 9, 47, 615, 14, 14, 'checkbox', 9),
    ('contract_add_non_realty_items', 'Add non-realty items', null::integer, 9, 47, 633, 14, 14, 'checkbox', 9),
    ('contract_add_backup_contract', 'Add backup contract', null::integer, 9, 47, 651, 14, 14, 'checkbox', 9),
    ('contract_add_mineral_reservation', 'Add mineral reservation', null::integer, 9, 47, 669, 14, 14, 'checkbox', 9),
    ('contract_add_other', 'Add other', null::integer, 9, 47, 687, 14, 14, 'checkbox', 9),
    ('contract_add_other_text', 'Other addendum text', null::integer, 9, 120, 687, 440, 28, 'text', 9),
    ('contract_buyer_attorney_name', 'Buyer attorney name', null::integer, 9, 120, 735, 180, 14, 'text', 9),
    ('contract_seller_attorney_name', 'Seller attorney name', null::integer, 9, 390, 735, 180, 14, 'text', 9),

    -- Page 10: Effective date
    ('contract_effective_day', 'Effective day', null::integer, 10, 127, 83, 45, 14, 'text', 9),
    ('contract_effective_month', 'Effective month', null::integer, 10, 206, 83, 100, 14, 'text', 9),
    ('contract_effective_year', 'Effective year', null::integer, 10, 344, 83, 50, 14, 'text', 9),

    -- Page 11: Broker contact info
    ('contract_seller_brokerage_name', 'Seller brokerage name', null::integer, 11, 47, 105, 330, 14, 'text', 9),
    ('contract_seller_brokerage_address', 'Seller brokerage address', null::integer, 11, 95, 137, 365, 14, 'text', 9),
    ('contract_seller_brokerage_license_number', 'Seller brokerage license', null::integer, 11, 185, 169, 130, 14, 'text', 9),
    ('contract_seller_associate_name', 'Seller associate name', null::integer, 11, 150, 201, 240, 14, 'text', 9),
    ('contract_seller_team_name', 'Seller team name', null::integer, 11, 112, 233, 240, 14, 'text', 9),
    ('contract_seller_associate_email', 'Seller associate email', null::integer, 11, 145, 265, 240, 14, 'text', 9),
    ('contract_seller_associate_phone', 'Seller associate phone', null::integer, 11, 170, 297, 120, 14, 'text', 9),
    ('contract_seller_associate_license_number', 'Seller associate license', null::integer, 11, 415, 297, 120, 14, 'text', 9),
    ('contract_seller_supervisor_name', 'Seller supervisor name', null::integer, 11, 215, 329, 240, 14, 'text', 9),
    ('contract_seller_supervisor_phone', 'Seller supervisor phone', null::integer, 11, 240, 361, 120, 14, 'text', 9),
    ('contract_seller_supervisor_license_number', 'Seller supervisor license', null::integer, 11, 440, 361, 120, 14, 'text', 9),
    ('contract_buyer_brokerage_name', 'Buyer brokerage name', null::integer, 11, 47, 410, 330, 14, 'text', 9),
    ('contract_buyer_brokerage_address', 'Buyer brokerage address', null::integer, 11, 95, 442, 365, 14, 'text', 9),
    ('contract_buyer_brokerage_license_number', 'Buyer brokerage license', null::integer, 11, 185, 474, 130, 14, 'text', 9),
    ('contract_buyer_associate_name', 'Buyer associate name', null::integer, 11, 150, 506, 240, 14, 'text', 9),
    ('contract_buyer_team_name', 'Buyer team name', null::integer, 11, 112, 538, 240, 14, 'text', 9),
    ('contract_buyer_associate_email', 'Buyer associate email', null::integer, 11, 145, 570, 240, 14, 'text', 9),
    ('contract_buyer_associate_phone', 'Buyer associate phone', null::integer, 11, 170, 602, 120, 14, 'text', 9),
    ('contract_buyer_associate_license_number', 'Buyer associate license', null::integer, 11, 415, 602, 120, 14, 'text', 9),
    ('contract_buyer_supervisor_name', 'Buyer supervisor name', null::integer, 11, 215, 634, 240, 14, 'text', 9),
    ('contract_buyer_supervisor_phone', 'Buyer supervisor phone', null::integer, 11, 240, 666, 120, 14, 'text', 9),
    ('contract_buyer_supervisor_license_number', 'Buyer supervisor license', null::integer, 11, 440, 666, 120, 14, 'text', 9)
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
    notes = 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract estimated placement',
    status = 'ACTIVE',
    update_date = now()
  from txr_1601_form tf,
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
  'TREC 20-19 / TXR 1601 One to Four Family Residential Contract estimated placement'
from placement_seed ps
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
);
