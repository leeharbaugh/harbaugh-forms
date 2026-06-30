-- TREC 20-19 / TXR 1601 One to Four Family Residential Contract reusable field catalog.
-- Form metadata is pre-existing in public.forms (not modified here).
-- Does not create form_field_mappings.

-- ---------------------------------------------------------------------------
-- 1. Add contract_details as a fields.source_type
-- ---------------------------------------------------------------------------

alter table public.fields
  drop constraint if exists fields_source_type_check;

alter table public.fields
  add constraint fields_source_type_check
  check (
    source_type is null
    or source_type in (
      'settings_agent',
      'settings_brokerage',
      'packet_contact',
      'packet_property',
      'packet',
      'buyer_rep_details',
      'listing_agreement_details',
      'contract_details',
      'representation_agreement',
      'static_default',
      'custom_resolver',
      'manual_only',
      'packet_instance'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Seed field_resolvers catalog entries (idempotent)
-- ---------------------------------------------------------------------------

insert into public.field_resolvers (
  resolver_key,
  friendly_name,
  category,
  description,
  example_output
)
select
  v.resolver_key,
  v.friendly_name,
  v.category,
  v.description,
  v.example_output
from (
  values
    (
      'buyer_names',
      'All Buyer Names',
      'contact_buyer',
      'Comma-separated full names of active buyer-side packet contacts ordered by sort_order.',
      'Alice Buyer, Bob Buyer'
    ),
    (
      'property_address_street_zip',
      'Property Street Address and ZIP',
      'property',
      'Street address, optional unit, and ZIP from packet property.',
      '123 Main St. #2, 76010'
    ),
    (
      'contract_survey_option_seller_existing',
      'Contract Survey Option 1 Selected',
      'contract',
      'True when contract_details.survey_option is SELLER_EXISTING_SURVEY.',
      'true'
    ),
    (
      'contract_survey_option_buyer_new',
      'Contract Survey Option 2 Selected',
      'contract',
      'True when contract_details.survey_option is BUYER_NEW_SURVEY.',
      'true'
    ),
    (
      'contract_survey_option_seller_new',
      'Contract Survey Option 3 Selected',
      'contract',
      'True when contract_details.survey_option is SELLER_NEW_SURVEY.',
      'true'
    ),
    (
      'contract_effective_day',
      'Contract Effective Day',
      'contract',
      'Day portion of contract_details.effective_date (or stored effective_day).',
      '15'
    ),
    (
      'contract_effective_month',
      'Contract Effective Month',
      'contract',
      'Month name from contract_details.effective_date (or stored effective_month).',
      'June'
    ),
    (
      'contract_effective_year',
      'Contract Effective Year',
      'contract',
      'Year portion of contract_details.effective_date (or stored effective_year).',
      '2026'
    ),
    (
      'buyer_notice_address',
      'Buyer Notice Address',
      'contact_buyer',
      'Combined mailing addresses for buyer-side packet contacts.',
      '123 Main St., 456 Oak Ave.'
    ),
    (
      'buyer_notice_phone',
      'Buyer Notice Phone',
      'contact_buyer',
      'Primary phone for first buyer-side packet contact.',
      '(817) 555-0100'
    ),
    (
      'buyer_notice_email',
      'Buyer Notice Email',
      'contact_buyer',
      'Primary email for first buyer-side packet contact.',
      'buyer@example.com'
    ),
    (
      'seller_notice_address',
      'Seller Notice Address',
      'contact_seller',
      'Combined mailing addresses for seller-side packet contacts.',
      '789 Pine Rd.'
    ),
    (
      'seller_notice_phone',
      'Seller Notice Phone',
      'contact_seller',
      'Primary phone for first seller-side packet contact.',
      '(817) 555-0200'
    ),
    (
      'seller_notice_email',
      'Seller Notice Email',
      'contact_seller',
      'Primary email for first seller-side packet contact.',
      'seller@example.com'
    )
) as v(
  resolver_key,
  friendly_name,
  category,
  description,
  example_output
)
where not exists (
  select 1
  from public.field_resolvers fr
  where lower(fr.resolver_key) = lower(v.resolver_key)
    and fr.status = 'ACTIVE'
);

-- ---------------------------------------------------------------------------
-- 3. fields — idempotent upsert by field_key (active rows)
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
    ('contract_seller_names', 'contract_seller_names', 'Contract Seller Names', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Seller Names via custom resolver.', 'custom_resolver', null::text, 'seller_names'),
    ('contract_buyer_names', 'contract_buyer_names', 'Contract Buyer Names', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Buyer Names via custom resolver.', 'custom_resolver', null::text, 'buyer_names'),
    ('property_lot', 'property_lot', 'Property Lot', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property Lot from packet property.', 'packet_property', 'lot', null::text),
    ('property_block', 'property_block', 'Property Block', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property Block from packet property.', 'packet_property', 'block', null::text),
    ('property_addition', 'property_addition', 'Property Addition', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property Addition from packet property.', 'packet_property', 'subdivision', null::text),
    ('property_city', 'property_city', 'Property City', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property City from packet property.', 'packet_property', 'city', null::text),
    ('property_county', 'property_county', 'Property County', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property County from packet property.', 'packet_property', 'county', null::text),
    ('property_address_zip', 'property_address_zip', 'Property Street Address and ZIP', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property Street Address and ZIP via custom resolver.', 'custom_resolver', null::text, 'property_address_street_zip'),
    ('contract_property_exclusions', 'contract_property_exclusions', 'Contract Property Exclusions', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Property Exclusions (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_sales_price_cash', 'contract_sales_price_cash', 'Contract Sales Price Cash', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Sales Price Cash from contract_details.', 'contract_details', 'sales_price_cash', null::text),
    ('contract_sales_price_financing', 'contract_sales_price_financing', 'Contract Sales Price Financing', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Sales Price Financing from contract_details.', 'contract_details', 'sales_price_financing', null::text),
    ('contract_sales_price_total', 'contract_sales_price_total', 'Contract Sales Price Total', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Sales Price Total from contract_details.', 'contract_details', 'sales_price_total', null::text),
    ('contract_financing_third_party', 'contract_financing_third_party', 'Third Party Financing Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Third Party Financing Addendum from contract_details.', 'contract_details', 'financing_third_party', null::text),
    ('contract_financing_loan_assumption', 'contract_financing_loan_assumption', 'Loan Assumption Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Loan Assumption Addendum from contract_details.', 'contract_details', 'financing_loan_assumption', null::text),
    ('contract_financing_seller_financing', 'contract_financing_seller_financing', 'Seller Financing Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Financing Addendum from contract_details.', 'contract_details', 'financing_seller_financing', null::text),
    ('contract_lease_residential', 'contract_lease_residential', 'Residential Lease', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Residential Lease from contract_details.', 'contract_details', 'lease_residential', null::text),
    ('contract_lease_fixture', 'contract_lease_fixture', 'Fixture Lease', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Fixture Lease from contract_details.', 'contract_details', 'lease_fixture', null::text),
    ('contract_lease_natural_resource', 'contract_lease_natural_resource', 'Natural Resource Lease', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Natural Resource Lease from contract_details.', 'contract_details', 'lease_natural_resource', null::text),
    ('contract_natural_resource_leases_delivered', 'contract_natural_resource_leases_delivered', 'Natural Resource Leases Delivered', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Natural Resource Leases Delivered from contract_details.', 'contract_details', 'natural_resource_leases_delivered', null::text),
    ('contract_natural_resource_leases_not_delivered', 'contract_natural_resource_leases_not_delivered', 'Natural Resource Leases Not Delivered', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Natural Resource Leases Not Delivered from contract_details.', 'contract_details', 'natural_resource_leases_not_delivered', null::text),
    ('contract_natural_resource_lease_termination_days', 'contract_natural_resource_lease_termination_days', 'Natural Resource Lease Termination Days', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Natural Resource Lease Termination Days from contract_details.', 'contract_details', 'natural_resource_lease_termination_days', null::text),
    ('contract_escrow_agent_name', 'contract_escrow_agent_name', 'Escrow Agent Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Escrow Agent Name from contract_details.', 'contract_details', 'escrow_agent_name', null::text),
    ('contract_escrow_agent_address', 'contract_escrow_agent_address', 'Escrow Agent Address', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Escrow Agent Address from contract_details.', 'contract_details', 'escrow_agent_address', null::text),
    ('contract_earnest_money_amount', 'contract_earnest_money_amount', 'Earnest Money Amount', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Earnest Money Amount from contract_details.', 'contract_details', 'earnest_money_amount', null::text),
    ('contract_option_fee_amount', 'contract_option_fee_amount', 'Option Fee Amount', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Option Fee Amount from contract_details.', 'contract_details', 'option_fee_amount', null::text),
    ('contract_additional_earnest_money_amount', 'contract_additional_earnest_money_amount', 'Additional Earnest Money Amount', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Additional Earnest Money Amount from contract_details.', 'contract_details', 'additional_earnest_money_amount', null::text),
    ('contract_additional_earnest_money_days', 'contract_additional_earnest_money_days', 'Additional Earnest Money Days', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Additional Earnest Money Days from contract_details.', 'contract_details', 'additional_earnest_money_days', null::text),
    ('contract_option_period_days', 'contract_option_period_days', 'Option Period Days', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Option Period Days from contract_details.', 'contract_details', 'option_period_days', null::text),
    ('contract_title_policy_paid_by_seller', 'contract_title_policy_paid_by_seller', 'Title Policy Paid by Seller', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Title Policy Paid by Seller from contract_details.', 'contract_details', 'title_policy_paid_by_seller', null::text),
    ('contract_title_policy_paid_by_buyer', 'contract_title_policy_paid_by_buyer', 'Title Policy Paid by Buyer', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Title Policy Paid by Buyer from contract_details.', 'contract_details', 'title_policy_paid_by_buyer', null::text),
    ('contract_title_company_name', 'contract_title_company_name', 'Title Company Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Title Company Name from contract_details.', 'contract_details', 'title_company_name', null::text),
    ('contract_title_exception_not_amended', 'contract_title_exception_not_amended', 'Title Exception Not Amended', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Title Exception Not Amended from contract_details.', 'contract_details', 'title_exception_not_amended', null::text),
    ('contract_title_exception_amended', 'contract_title_exception_amended', 'Title Exception Amended', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Title Exception Amended from contract_details.', 'contract_details', 'title_exception_amended', null::text),
    ('contract_title_exception_amended_paid_by_buyer', 'contract_title_exception_amended_paid_by_buyer', 'Title Exception Amended Paid by Buyer', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Title Exception Amended Paid by Buyer from contract_details.', 'contract_details', 'title_exception_amended_paid_by_buyer', null::text),
    ('contract_title_exception_amended_paid_by_seller', 'contract_title_exception_amended_paid_by_seller', 'Title Exception Amended Paid by Seller', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Title Exception Amended Paid by Seller from contract_details.', 'contract_details', 'title_exception_amended_paid_by_seller', null::text),
    ('contract_survey_option_1', 'contract_survey_option_1', 'Survey Option 1 (Seller Existing)', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Survey Option 1 (Seller Existing) via custom resolver.', 'custom_resolver', null::text, 'contract_survey_option_seller_existing'),
    ('contract_survey_option_1_days', 'contract_survey_option_1_days', 'Survey Option 1 Days', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Survey Option 1 Days from contract_details.', 'contract_details', 'survey_option_1_days', null::text),
    ('contract_survey_option_1_new_survey_paid_by_seller', 'contract_survey_option_1_new_survey_paid_by_seller', 'Survey New Paid by Seller', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Survey New Paid by Seller from contract_details.', 'contract_details', 'survey_new_paid_by_seller', null::text),
    ('contract_survey_option_1_new_survey_paid_by_buyer', 'contract_survey_option_1_new_survey_paid_by_buyer', 'Survey New Paid by Buyer', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Survey New Paid by Buyer from contract_details.', 'contract_details', 'survey_new_paid_by_buyer', null::text),
    ('contract_survey_option_2', 'contract_survey_option_2', 'Survey Option 2 (Buyer New)', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Survey Option 2 (Buyer New) via custom resolver.', 'custom_resolver', null::text, 'contract_survey_option_buyer_new'),
    ('contract_survey_option_2_days', 'contract_survey_option_2_days', 'Survey Option 2 Days', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Survey Option 2 Days from contract_details.', 'contract_details', 'survey_option_2_days', null::text),
    ('contract_survey_option_3', 'contract_survey_option_3', 'Survey Option 3 (Seller New)', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Survey Option 3 (Seller New) via custom resolver.', 'custom_resolver', null::text, 'contract_survey_option_seller_new'),
    ('contract_survey_option_3_days', 'contract_survey_option_3_days', 'Survey Option 3 Days', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Survey Option 3 Days from contract_details.', 'contract_details', 'survey_option_3_days', null::text),
    ('contract_title_objection_use_activity', 'contract_title_objection_use_activity', 'Title Objection Use Activity', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Title Objection Use Activity from contract_details.', 'contract_details', 'title_objection_use_activity', null::text),
    ('contract_title_objection_days', 'contract_title_objection_days', 'Title Objection Days', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Title Objection Days from contract_details.', 'contract_details', 'title_objection_days', null::text),
    ('contract_hoa_is_subject', 'contract_hoa_is_subject', 'Property Subject to HOA', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property Subject to HOA from contract_details.', 'contract_details', 'hoa_is_subject', null::text),
    ('contract_hoa_is_not_subject', 'contract_hoa_is_not_subject', 'Property Not Subject to HOA', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property Not Subject to HOA from contract_details.', 'contract_details', 'hoa_is_not_subject', null::text),
    ('contract_seller_disclosure_received', 'contract_seller_disclosure_received', 'Seller Disclosure Received', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Disclosure Received from contract_details.', 'contract_details', 'seller_disclosure_received', null::text),
    ('contract_seller_disclosure_not_received', 'contract_seller_disclosure_not_received', 'Seller Disclosure Not Received', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Disclosure Not Received from contract_details.', 'contract_details', 'seller_disclosure_not_received', null::text),
    ('contract_seller_disclosure_delivery_days', 'contract_seller_disclosure_delivery_days', 'Seller Disclosure Delivery Days', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Disclosure Delivery Days from contract_details.', 'contract_details', 'seller_disclosure_delivery_days', null::text),
    ('contract_seller_disclosure_not_required', 'contract_seller_disclosure_not_required', 'Seller Disclosure Not Required', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Disclosure Not Required from contract_details.', 'contract_details', 'seller_disclosure_not_required', null::text),
    ('contract_property_as_is', 'contract_property_as_is', 'Property Accepted As Is', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property Accepted As Is from contract_details.', 'contract_details', 'property_as_is', null::text),
    ('contract_property_as_is_with_repairs', 'contract_property_as_is_with_repairs', 'Property As Is With Repairs', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Property As Is With Repairs from contract_details.', 'contract_details', 'property_as_is_with_repairs', null::text),
    ('contract_specific_repairs', 'contract_specific_repairs', 'Specific Repairs', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Specific Repairs from contract_details.', 'contract_details', 'specific_repairs', null::text),
    ('contract_service_contract_reimbursement_amount', 'contract_service_contract_reimbursement_amount', 'Service Contract Reimbursement Amount', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Service Contract Reimbursement Amount from contract_details.', 'contract_details', 'service_contract_reimbursement_amount', null::text),
    ('contract_water_disclosure_received', 'contract_water_disclosure_received', 'Water Disclosure Received', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Water Disclosure Received from contract_details.', 'contract_details', 'water_disclosure_received', null::text),
    ('contract_water_disclosure_not_received', 'contract_water_disclosure_not_received', 'Water Disclosure Not Received', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Water Disclosure Not Received from contract_details.', 'contract_details', 'water_disclosure_not_received', null::text),
    ('contract_water_disclosure_delivery_days', 'contract_water_disclosure_delivery_days', 'Water Disclosure Delivery Days', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Water Disclosure Delivery Days from contract_details.', 'contract_details', 'water_disclosure_delivery_days', null::text),
    ('contract_water_disclosure_not_required', 'contract_water_disclosure_not_required', 'Water Disclosure Not Required', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Water Disclosure Not Required from contract_details.', 'contract_details', 'water_disclosure_not_required', null::text),
    ('contract_water_provider_name', 'contract_water_provider_name', 'Water Provider Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Water Provider Name from contract_details.', 'contract_details', 'water_provider_name', null::text),
    ('contract_broker_disclosure_text', 'contract_broker_disclosure_text', 'Broker Disclosure Text', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Broker Disclosure Text from contract_details.', 'contract_details', 'broker_disclosure_text', null::text),
    ('contract_closing_date', 'contract_closing_date', 'Closing Date', 'date', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Closing Date from contract_details.', 'contract_details', 'closing_date', null::text),
    ('contract_buyer_possession_at_closing', 'contract_buyer_possession_at_closing', 'Buyer Possession at Closing', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Possession at Closing from contract_details.', 'contract_details', 'buyer_possession_at_closing', null::text),
    ('contract_buyer_possession_by_lease', 'contract_buyer_possession_by_lease', 'Buyer Possession by Lease', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Possession by Lease from contract_details.', 'contract_details', 'buyer_possession_by_lease', null::text),
    ('contract_special_provisions', 'contract_special_provisions', 'Special Provisions', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Special Provisions from contract_details.', 'contract_details', 'special_provisions', null::text),
    ('contract_seller_expense_contribution_amount', 'contract_seller_expense_contribution_amount', 'Seller Expense Contribution Amount', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Expense Contribution Amount from contract_details.', 'contract_details', 'seller_expense_contribution_amount', null::text),
    ('contract_seller_contributes_to_buyer_broker_comp', 'contract_seller_contributes_to_buyer_broker_comp', 'Seller Contributes to Buyer Broker Compensation', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Contributes to Buyer Broker Compensation from contract_details.', 'contract_details', 'seller_contributes_to_buyer_broker_comp', null::text),
    ('contract_seller_contribution_dollar_selected', 'contract_seller_contribution_dollar_selected', 'Seller Contribution Dollar Selected', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Contribution Dollar Selected from contract_details.', 'contract_details', 'seller_contribution_dollar_selected', null::text),
    ('contract_seller_contribution_amount', 'contract_seller_contribution_amount', 'Seller Contribution Amount', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Contribution Amount from contract_details.', 'contract_details', 'seller_contribution_amount', null::text),
    ('contract_seller_contribution_percent_selected', 'contract_seller_contribution_percent_selected', 'Seller Contribution Percent Selected', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Contribution Percent Selected from contract_details.', 'contract_details', 'seller_contribution_percent_selected', null::text),
    ('contract_seller_contribution_percent', 'contract_seller_contribution_percent', 'Seller Contribution Percent', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Contribution Percent from contract_details.', 'contract_details', 'seller_contribution_percent', null::text),
    ('contract_buyer_contributes_to_seller_broker_comp', 'contract_buyer_contributes_to_seller_broker_comp', 'Buyer Contributes to Seller Broker Compensation', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Contributes to Seller Broker Compensation from contract_details.', 'contract_details', 'buyer_contributes_to_seller_broker_comp', null::text),
    ('contract_buyer_contribution_dollar_selected', 'contract_buyer_contribution_dollar_selected', 'Buyer Contribution Dollar Selected', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Contribution Dollar Selected from contract_details.', 'contract_details', 'buyer_contribution_dollar_selected', null::text),
    ('contract_buyer_contribution_amount', 'contract_buyer_contribution_amount', 'Buyer Contribution Amount', 'currency', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Contribution Amount from contract_details.', 'contract_details', 'buyer_contribution_amount', null::text),
    ('contract_buyer_contribution_percent_selected', 'contract_buyer_contribution_percent_selected', 'Buyer Contribution Percent Selected', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Contribution Percent Selected from contract_details.', 'contract_details', 'buyer_contribution_percent_selected', null::text),
    ('contract_buyer_contribution_percent', 'contract_buyer_contribution_percent', 'Buyer Contribution Percent', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Contribution Percent from contract_details.', 'contract_details', 'buyer_contribution_percent', null::text),
    ('contract_buyer_notice_address', 'contract_buyer_notice_address', 'Buyer Notice Address', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Notice Address via custom resolver.', 'custom_resolver', null::text, 'buyer_notice_address'),
    ('contract_buyer_notice_phone', 'contract_buyer_notice_phone', 'Buyer Notice Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Notice Phone via custom resolver.', 'custom_resolver', null::text, 'buyer_notice_phone'),
    ('contract_buyer_notice_email', 'contract_buyer_notice_email', 'Buyer Notice Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Notice Email via custom resolver.', 'custom_resolver', null::text, 'buyer_notice_email'),
    ('contract_seller_notice_address', 'contract_seller_notice_address', 'Seller Notice Address', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Notice Address via custom resolver.', 'custom_resolver', null::text, 'seller_notice_address'),
    ('contract_seller_notice_phone', 'contract_seller_notice_phone', 'Seller Notice Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Notice Phone via custom resolver.', 'custom_resolver', null::text, 'seller_notice_phone'),
    ('contract_seller_notice_email', 'contract_seller_notice_email', 'Seller Notice Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Notice Email via custom resolver.', 'custom_resolver', null::text, 'seller_notice_email'),
    ('contract_buyer_agent_notice_address', 'contract_buyer_agent_notice_address', 'Buyer Agent Notice Address', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Agent Notice Address (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_agent_notice_phone', 'contract_buyer_agent_notice_phone', 'Buyer Agent Notice Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Agent Notice Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_agent_notice_email', 'contract_buyer_agent_notice_email', 'Buyer Agent Notice Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Agent Notice Email (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_seller_agent_notice_address', 'contract_seller_agent_notice_address', 'Seller Agent Notice Address', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Agent Notice Address (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_seller_agent_notice_phone', 'contract_seller_agent_notice_phone', 'Seller Agent Notice Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Agent Notice Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_seller_agent_notice_email', 'contract_seller_agent_notice_email', 'Seller Agent Notice Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Agent Notice Email (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_third_party_financing', 'contract_add_third_party_financing', 'Third Party Financing Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Third Party Financing Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_sale_of_other_property', 'contract_add_sale_of_other_property', 'Sale of Other Property Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Sale of Other Property Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_appraisal_termination', 'contract_add_appraisal_termination', 'Appraisal Termination Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Appraisal Termination Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_seller_financing', 'contract_add_seller_financing', 'Seller Financing Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Financing Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_1031_exchange', 'contract_add_1031_exchange', '1031 Exchange Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - 1031 Exchange Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_short_sale', 'contract_add_short_sale', 'Short Sale Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Short Sale Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_loan_assumption', 'contract_add_loan_assumption', 'Loan Assumption Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Loan Assumption Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_release_liability_va', 'contract_add_release_liability_va', 'Release of Liability on VA Loan Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Release of Liability on VA Loan Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_residential_leases', 'contract_add_residential_leases', 'Residential Leases Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Residential Leases Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_fixture_leases', 'contract_add_fixture_leases', 'Fixture Leases Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Fixture Leases Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_buyer_temp_lease', 'contract_add_buyer_temp_lease', 'Buyer Temporary Lease Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Temporary Lease Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_seller_temp_lease', 'contract_add_seller_temp_lease', 'Seller Temporary Lease Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Temporary Lease Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_hydrostatic_testing', 'contract_add_hydrostatic_testing', 'Hydrostatic Testing Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Hydrostatic Testing Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_environmental', 'contract_add_environmental', 'Environmental Assessment Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Environmental Assessment Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_lead_paint', 'contract_add_lead_paint', 'Lead-Based Paint Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Lead-Based Paint Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_propane_service_area', 'contract_add_propane_service_area', 'Propane Service Area Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Propane Service Area Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_seaward_gulf', 'contract_add_seaward_gulf', 'Seaward Gulf Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seaward Gulf Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_coastal_area', 'contract_add_coastal_area', 'Coastal Area Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Coastal Area Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_district_notices', 'contract_add_district_notices', 'District Notices Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - District Notices Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_hoa', 'contract_add_hoa', 'HOA Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - HOA Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_non_realty_items', 'contract_add_non_realty_items', 'Non-Realty Items Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Non-Realty Items Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_backup_contract', 'contract_add_backup_contract', 'Backup Contract Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Backup Contract Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_mineral_reservation', 'contract_add_mineral_reservation', 'Mineral Reservation Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Mineral Reservation Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_other', 'contract_add_other', 'Other Addendum', 'boolean', 'checkbox', null::text, false, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Other Addendum (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_district_notices_text', 'contract_add_district_notices_text', 'District Notices Addendum Text', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - District Notices Addendum Text (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_add_other_text', 'contract_add_other_text', 'Other Addendum Text', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Other Addendum Text (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_attorney_name', 'contract_buyer_attorney_name', 'Buyer Attorney Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Attorney Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_attorney_phone', 'contract_buyer_attorney_phone', 'Buyer Attorney Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Attorney Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_attorney_fax', 'contract_buyer_attorney_fax', 'Buyer Attorney Fax', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Attorney Fax (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_attorney_email', 'contract_buyer_attorney_email', 'Buyer Attorney Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Attorney Email (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_seller_attorney_name', 'contract_seller_attorney_name', 'Seller Attorney Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Attorney Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_seller_attorney_phone', 'contract_seller_attorney_phone', 'Seller Attorney Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Attorney Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_seller_attorney_fax', 'contract_seller_attorney_fax', 'Seller Attorney Fax', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Attorney Fax (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_seller_attorney_email', 'contract_seller_attorney_email', 'Seller Attorney Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Attorney Email (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_effective_date', 'contract_effective_date', 'Contract Effective Date', 'date', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Effective Date from contract_details.', 'contract_details', 'effective_date', null::text),
    ('contract_effective_day', 'contract_effective_day', 'Contract Effective Day', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Effective Day via custom resolver.', 'custom_resolver', null::text, 'contract_effective_day'),
    ('contract_effective_month', 'contract_effective_month', 'Contract Effective Month', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Effective Month via custom resolver.', 'custom_resolver', null::text, 'contract_effective_month'),
    ('contract_effective_year', 'contract_effective_year', 'Contract Effective Year', 'number', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Contract Effective Year via custom resolver.', 'custom_resolver', null::text, 'contract_effective_year'),
    ('contract_seller_brokerage_name', 'contract_seller_brokerage_name', 'Seller Brokerage Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Brokerage Name from brokerage settings (seller side).', 'settings_brokerage', 'brokerage_name', null::text),
    ('contract_seller_brokerage_address', 'contract_seller_brokerage_address', 'Seller Brokerage Address', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Brokerage Address from brokerage settings (seller side).', 'settings_brokerage', 'brokerage_address', null::text),
    ('contract_seller_brokerage_license_number', 'contract_seller_brokerage_license_number', 'Seller Brokerage License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Brokerage License Number from brokerage settings (seller side).', 'settings_brokerage', 'brokerage_license_number', null::text),
    ('contract_seller_associate_name', 'contract_seller_associate_name', 'Seller Associate Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Associate Name via custom resolver.', 'custom_resolver', null::text, 'agent_full_name'),
    ('contract_seller_team_name', 'contract_seller_team_name', 'Seller Team Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Team Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_seller_associate_email', 'contract_seller_associate_email', 'Seller Associate Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Associate Email from agent settings (seller side).', 'settings_agent', 'agent_email', null::text),
    ('contract_seller_associate_phone', 'contract_seller_associate_phone', 'Seller Associate Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Associate Phone from agent settings (seller side).', 'settings_agent', 'agent_phone', null::text),
    ('contract_seller_associate_license_number', 'contract_seller_associate_license_number', 'Seller Associate License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Associate License Number from agent settings (seller side).', 'settings_agent', 'agent_license_number', null::text),
    ('contract_seller_supervisor_name', 'contract_seller_supervisor_name', 'Seller Supervisor Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Supervisor Name from brokerage settings (seller side).', 'settings_brokerage', 'supervisor_name', null::text),
    ('contract_seller_supervisor_phone', 'contract_seller_supervisor_phone', 'Seller Supervisor Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Supervisor Phone from brokerage settings (seller side).', 'settings_brokerage', 'supervisor_phone', null::text),
    ('contract_seller_supervisor_license_number', 'contract_seller_supervisor_license_number', 'Seller Supervisor License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Seller Supervisor License Number from brokerage settings (seller side).', 'settings_brokerage', 'supervisor_license_number', null::text),
    ('contract_buyer_brokerage_name', 'contract_buyer_brokerage_name', 'Buyer Brokerage Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Brokerage Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_brokerage_address', 'contract_buyer_brokerage_address', 'Buyer Brokerage Address', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Brokerage Address (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_brokerage_license_number', 'contract_buyer_brokerage_license_number', 'Buyer Brokerage License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Brokerage License Number (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_associate_name', 'contract_buyer_associate_name', 'Buyer Associate Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Associate Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_team_name', 'contract_buyer_team_name', 'Buyer Team Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Team Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_associate_email', 'contract_buyer_associate_email', 'Buyer Associate Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Associate Email (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_associate_phone', 'contract_buyer_associate_phone', 'Buyer Associate Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Associate Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_associate_license_number', 'contract_buyer_associate_license_number', 'Buyer Associate License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Associate License Number (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_supervisor_name', 'contract_buyer_supervisor_name', 'Buyer Supervisor Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Supervisor Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_supervisor_phone', 'contract_buyer_supervisor_phone', 'Buyer Supervisor Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Supervisor Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_buyer_supervisor_license_number', 'contract_buyer_supervisor_license_number', 'Buyer Supervisor License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Buyer Supervisor License Number (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_brokerage_name', 'contract_intermediary_brokerage_name', 'Intermediary Brokerage Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Brokerage Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_brokerage_address', 'contract_intermediary_brokerage_address', 'Intermediary Brokerage Address', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Brokerage Address (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_brokerage_license_number', 'contract_intermediary_brokerage_license_number', 'Intermediary Brokerage License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Brokerage License Number (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_seller_associate_name', 'contract_intermediary_seller_associate_name', 'Intermediary Seller Associate Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Seller Associate Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_seller_team_name', 'contract_intermediary_seller_team_name', 'Intermediary Seller Team Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Seller Team Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_seller_associate_email', 'contract_intermediary_seller_associate_email', 'Intermediary Seller Associate Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Seller Associate Email (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_seller_associate_phone', 'contract_intermediary_seller_associate_phone', 'Intermediary Seller Associate Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Seller Associate Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_seller_associate_license_number', 'contract_intermediary_seller_associate_license_number', 'Intermediary Seller Associate License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Seller Associate License Number (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_seller_supervisor_name', 'contract_intermediary_seller_supervisor_name', 'Intermediary Seller Supervisor Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Seller Supervisor Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_seller_supervisor_phone', 'contract_intermediary_seller_supervisor_phone', 'Intermediary Seller Supervisor Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Seller Supervisor Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_seller_supervisor_license_number', 'contract_intermediary_seller_supervisor_license_number', 'Intermediary Seller Supervisor License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Seller Supervisor License Number (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_buyer_associate_name', 'contract_intermediary_buyer_associate_name', 'Intermediary Buyer Associate Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Buyer Associate Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_buyer_team_name', 'contract_intermediary_buyer_team_name', 'Intermediary Buyer Team Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Buyer Team Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_buyer_associate_email', 'contract_intermediary_buyer_associate_email', 'Intermediary Buyer Associate Email', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Buyer Associate Email (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_buyer_associate_phone', 'contract_intermediary_buyer_associate_phone', 'Intermediary Buyer Associate Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Buyer Associate Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_buyer_associate_license_number', 'contract_intermediary_buyer_associate_license_number', 'Intermediary Buyer Associate License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Buyer Associate License Number (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_buyer_supervisor_name', 'contract_intermediary_buyer_supervisor_name', 'Intermediary Buyer Supervisor Name', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Buyer Supervisor Name (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_buyer_supervisor_phone', 'contract_intermediary_buyer_supervisor_phone', 'Intermediary Buyer Supervisor Phone', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Buyer Supervisor Phone (packet/form-specific).', 'manual_only', null::text, null::text),
    ('contract_intermediary_buyer_supervisor_license_number', 'contract_intermediary_buyer_supervisor_license_number', 'Intermediary Buyer Supervisor License Number', 'text', 'text', null::text, null::boolean, false, 'TREC 20-19 / TXR 1601 One to Four Family Residential Contract - Intermediary Buyer Supervisor License Number (packet/form-specific).', 'manual_only', null::text, null::text)
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
-- 4. Backfill field_resolver_id for new custom_resolver fields
-- ---------------------------------------------------------------------------

with resolver_lookup as (
  select id, lower(resolver_key) as resolver_key
  from public.field_resolvers
  where status = 'ACTIVE'
)
update public.fields f
set
  field_resolver_id = rl.id,
  update_date = now()
from resolver_lookup rl
where f.status = 'ACTIVE'
  and f.source_type = 'custom_resolver'
  and lower(trim(f.resolver_key)) = rl.resolver_key
  and f.field_resolver_id is distinct from rl.id;
