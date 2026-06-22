-- TXR-1501 Buyer/Tenant Representation Agreement Long Form reusable field catalog seeds.
-- Form metadata and PDF placements are managed separately (do not touch public.forms).

-- ---------------------------------------------------------------------------
-- Expand fields.source_type for agreement-backed resolver paths
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
      'representation_agreement',
      'static_default',
      'custom_resolver',
      'manual_only'
    )
  );

-- ---------------------------------------------------------------------------
-- fields — idempotent upsert by field_key (active rows)
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
    -- Client fields
    (
      'buyer_client_name_1',
      'buyer_client_name_1',
      'Buyer/Client Name 1',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · First buyer/client contact name from packet contacts.',
      'packet_contact',
      'buyer_client_1.full_name',
      null::text
    ),
    (
      'buyer_client_name_2',
      'buyer_client_name_2',
      'Buyer/Client Name 2',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Second buyer/client contact name from packet contacts.',
      'packet_contact',
      'buyer_client_2.full_name',
      null::text
    ),
    (
      'buyer_client_address',
      'buyer_client_address',
      'Buyer/Client Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Primary buyer/client mailing address lines.',
      'custom_resolver',
      null::text,
      'buyer_client_address'
    ),
    (
      'buyer_client_city_state_zip',
      'buyer_client_city_state_zip',
      'Buyer/Client City, State ZIP',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Primary buyer/client city, state, and ZIP.',
      'custom_resolver',
      null::text,
      'buyer_client_city_state_zip'
    ),
    (
      'buyer_client_phone',
      'buyer_client_phone',
      'Buyer/Client Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Primary buyer/client phone from packet contacts.',
      'packet_contact',
      'buyer_client_1.phone',
      null::text
    ),
    (
      'buyer_client_email',
      'buyer_client_email',
      'Buyer/Client Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Primary buyer/client email from packet contacts.',
      'packet_contact',
      'buyer_client_1.email',
      null::text
    ),

    -- Brokerage fields
    (
      'buyer_rep_broker_name',
      'buyer_rep_broker_name',
      'Broker Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Brokerage name from settings.',
      'settings_brokerage',
      'brokerage_name',
      null::text
    ),
    (
      'buyer_rep_broker_address',
      'buyer_rep_broker_address',
      'Broker Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Brokerage street address from settings.',
      'settings_brokerage',
      'brokerage_address',
      null::text
    ),
    (
      'buyer_rep_broker_city_state_zip',
      'buyer_rep_broker_city_state_zip',
      'Broker City, State ZIP',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Brokerage city, state, and ZIP from settings.',
      'custom_resolver',
      null::text,
      'brokerage_city_state_zip'
    ),
    (
      'buyer_rep_broker_phone',
      'buyer_rep_broker_phone',
      'Broker Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Brokerage office phone from settings.',
      'settings_brokerage',
      'brokerage_office_phone',
      null::text
    ),
    (
      'buyer_rep_broker_email',
      'buyer_rep_broker_email',
      'Broker Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Designated broker email from settings.',
      'settings_brokerage',
      'broker_email',
      null::text
    ),

    -- Agreement fields
    (
      'buyer_rep_market_area',
      'buyer_rep_market_area',
      'Market Area',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Market area from buyer_rep_details.',
      'buyer_rep_details',
      'market_area',
      null::text
    ),
    (
      'buyer_rep_effective_date',
      'buyer_rep_effective_date',
      'Effective Date',
      'date',
      'date',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Agreement effective date.',
      'representation_agreement',
      'effective_date',
      null::text
    ),
    (
      'buyer_rep_expiration_date',
      'buyer_rep_expiration_date',
      'Expiration Date',
      'date',
      'date',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Agreement expiration date.',
      'representation_agreement',
      'expiration_date',
      null::text
    ),
    (
      'buyer_rep_purchase_fee_percent',
      'buyer_rep_purchase_fee_percent',
      'Purchase Fee Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Purchase compensation percent from buyer_rep_details.',
      'buyer_rep_details',
      'compensation_percent',
      null::text
    ),
    (
      'buyer_rep_purchase_flat_fee',
      'buyer_rep_purchase_flat_fee',
      'Purchase Flat Fee',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Purchase flat fee from buyer_rep_details.',
      'buyer_rep_details',
      'purchase_flat_fee',
      null::text
    ),
    (
      'buyer_rep_lease_one_month_rent_percent',
      'buyer_rep_lease_one_month_rent_percent',
      'Lease One Month Rent Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Lease one-month rent percent from buyer_rep_details.',
      'buyer_rep_details',
      'lease_one_month_rent_percent',
      null::text
    ),
    (
      'buyer_rep_lease_all_rents_percent',
      'buyer_rep_lease_all_rents_percent',
      'Lease All Rents Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Lease all-rents percent from buyer_rep_details.',
      'buyer_rep_details',
      'lease_all_rents_percent',
      null::text
    ),
    (
      'buyer_rep_lease_flat_fee',
      'buyer_rep_lease_flat_fee',
      'Lease Flat Fee',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Lease flat fee from buyer_rep_details.',
      'buyer_rep_details',
      'lease_flat_fee',
      null::text
    ),
    (
      'buyer_rep_retainer_amount',
      'buyer_rep_retainer_amount',
      'Retainer Amount',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Retainer amount from buyer_rep_details.',
      'buyer_rep_details',
      'retainer_amount',
      null::text
    ),
    (
      'buyer_rep_retainer_will_apply',
      'buyer_rep_retainer_will_apply',
      'Retainer Will Apply',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Retainer applies to fee from buyer_rep_details.',
      'buyer_rep_details',
      'retainer_applies_to_fee',
      null::text
    ),
    (
      'buyer_rep_retainer_will_not_apply',
      'buyer_rep_retainer_will_not_apply',
      'Retainer Will Not Apply',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Inverse of retainer applies to fee.',
      'custom_resolver',
      null::text,
      'buyer_rep_retainer_will_not_apply'
    ),
    (
      'buyer_rep_construction_compensation',
      'buyer_rep_construction_compensation',
      'Construction Compensation',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Construction compensation from buyer_rep_details.',
      'buyer_rep_details',
      'construction_compensation',
      null::text
    ),
    (
      'buyer_rep_other_compensation',
      'buyer_rep_other_compensation',
      'Other Compensation',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Other compensation from buyer_rep_details.',
      'buyer_rep_details',
      'other_compensation',
      null::text
    ),
    (
      'buyer_rep_protection_period_days',
      'buyer_rep_protection_period_days',
      'Protection Period Days',
      'integer',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Protection period days from buyer_rep_details.',
      'buyer_rep_details',
      'protection_period_days',
      null::text
    ),
    (
      'buyer_rep_payment_county',
      'buyer_rep_payment_county',
      'Payment County',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · County for payment from buyer_rep_details.',
      'buyer_rep_details',
      'county_for_payment',
      null::text
    ),
    (
      'buyer_rep_employer_relocation',
      'buyer_rep_employer_relocation',
      'Employer Relocation',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Employer relocation from buyer_rep_details.',
      'buyer_rep_details',
      'employer_relocation',
      null::text
    ),
    (
      'buyer_rep_intermediary_status_yes',
      'buyer_rep_intermediary_status_yes',
      'Intermediary Status Yes',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Intermediary allowed from buyer_rep_details.',
      'buyer_rep_details',
      'intermediary_allowed',
      null::text
    ),
    (
      'buyer_rep_intermediary_status_no',
      'buyer_rep_intermediary_status_no',
      'Intermediary Status No',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Inverse of intermediary allowed.',
      'custom_resolver',
      null::text,
      'buyer_rep_intermediary_status_no'
    ),
    (
      'buyer_rep_special_provisions',
      'buyer_rep_special_provisions',
      'Special Provisions',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Special provisions from buyer_rep_details.',
      'buyer_rep_details',
      'special_provisions',
      null::text
    ),

    -- Addenda fields
    (
      'buyer_rep_add_iabs',
      'buyer_rep_add_iabs',
      'Add IABS',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Include IABS addendum from buyer_rep_details.',
      'buyer_rep_details',
      'add_iabs',
      null::text
    ),
    (
      'buyer_rep_add_lead_based_paint',
      'buyer_rep_add_lead_based_paint',
      'Add Lead-Based Paint',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Include lead-based paint addendum from buyer_rep_details.',
      'buyer_rep_details',
      'add_lead_based_paint',
      null::text
    ),
    (
      'buyer_rep_add_mold_remediation',
      'buyer_rep_add_mold_remediation',
      'Add Mold Remediation',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Include mold remediation addendum from buyer_rep_details.',
      'buyer_rep_details',
      'add_mold_remediation',
      null::text
    ),
    (
      'buyer_rep_add_flood_hazard',
      'buyer_rep_add_flood_hazard',
      'Add Flood Hazard',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Include flood hazard addendum from buyer_rep_details.',
      'buyer_rep_details',
      'add_flood_hazard',
      null::text
    ),
    (
      'buyer_rep_add_property_insurance',
      'buyer_rep_add_property_insurance',
      'Add Property Insurance',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Include property insurance addendum from buyer_rep_details.',
      'buyer_rep_details',
      'add_property_insurance',
      null::text
    ),
    (
      'buyer_rep_add_home_inspection',
      'buyer_rep_add_home_inspection',
      'Add Home Inspection',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Include home inspection addendum from buyer_rep_details.',
      'buyer_rep_details',
      'add_home_inspection',
      null::text
    ),
    (
      'buyer_rep_add_general_information_notice',
      'buyer_rep_add_general_information_notice',
      'Add General Information Notice',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Include general information notice from buyer_rep_details.',
      'buyer_rep_details',
      'add_general_information_notice',
      null::text
    ),
    (
      'buyer_rep_add_wire_fraud',
      'buyer_rep_add_wire_fraud',
      'Add Wire Fraud',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Include wire fraud addendum from buyer_rep_details.',
      'buyer_rep_details',
      'add_wire_fraud',
      null::text
    ),
    (
      'buyer_rep_add_other_document',
      'buyer_rep_add_other_document',
      'Add Other Document',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Include other document from buyer_rep_details.',
      'buyer_rep_details',
      'add_other_document',
      null::text
    ),
    (
      'buyer_rep_add_other_document_description',
      'buyer_rep_add_other_document_description',
      'Other Document Description',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1501 Buyer/Tenant Representation Agreement Long Form · Other document description from buyer_rep_details.',
      'buyer_rep_details',
      'add_other_document_description',
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
