-- Expand listing_agreement_details for TXR-1102 Residential Lease Listing Agreement.
-- Does not touch public.forms, public.fields, or form_field_mappings.

alter table public.listing_agreement_details
  -- Lease listing pricing
  add column if not exists monthly_rent numeric(14, 2) not null default 0,
  add column if not exists lease_term_min_months integer not null default 0,
  add column if not exists lease_term_max_months integer not null default 0,

  -- Property details
  add column if not exists non_real_estate_items text not null default 'NA',
  add column if not exists lease_listing_exclusions text not null default 'NA',

  -- Compensation 5A/5B
  add column if not exists lease_compensation_model varchar not null default 'WITH_OTHER_BROKER',
  add column if not exists broker_fee_one_month_percent numeric(5, 2) not null default 0,
  add column if not exists broker_fee_all_rents_percent numeric(5, 2) not null default 0,
  add column if not exists broker_fee_other text not null default 'NA',
  add column if not exists other_broker_one_month_percent numeric(5, 2) not null default 0,
  add column if not exists other_broker_all_rents_percent numeric(5, 2) not null default 0,
  add column if not exists other_broker_flat_fee numeric(14, 2) not null default 0,

  -- Renewal/sale compensation
  add column if not exists renewal_one_month_percent numeric(5, 2) not null default 0,
  add column if not exists renewal_all_rents_percent numeric(5, 2) not null default 0,
  add column if not exists renewal_other text not null default 'NA',
  add column if not exists sale_compensation_percent numeric(5, 2) not null default 0,
  add column if not exists sale_compensation_other text not null default 'NA',
  add column if not exists reimbursable_expenses text not null default 'NA',

  -- Protection/county
  add column if not exists lease_protection_period_days integer not null default 30,
  add column if not exists lease_payment_county varchar not null default 'Dallas/Tarrant',

  -- MLS
  add column if not exists lease_mls_filing_option varchar not null default 'FILE_IMMEDIATELY',
  add column if not exists lease_mls_delayed_days integer not null default 0,
  add column if not exists lease_mls_delayed_purpose text not null default 'NA',

  -- Access/keybox
  add column if not exists lease_scheduling_company text not null default 'BrokerBay',
  add column if not exists lease_keybox_authorized boolean not null default true,

  -- Internet display
  add column if not exists lease_internet_display_option varchar not null default 'FULL_DISPLAY',

  -- Make ready
  add column if not exists make_ready_option varchar not null default 'BROKER_NOT_AUTHORIZED',
  add column if not exists make_ready_cost_cap numeric(14, 2) not null default 0,
  add column if not exists make_ready_landlord_pays_contractors boolean not null default false,
  add column if not exists make_ready_broker_reimbursed boolean not null default false,
  add column if not exists make_ready_service_fee text not null default 'NA',

  -- Landlord representations
  add column if not exists lease_known_financial_obligations_exception text not null default 'NA',
  add column if not exists lease_known_liens_exception text not null default 'NA',
  add column if not exists optional_common_area_fees_exception text not null default 'NA',
  add column if not exists health_safety_condition_exception text not null default 'NA',

  -- Special provisions
  add column if not exists lease_special_provisions text not null default 'NA',

  -- Addenda
  add column if not exists lease_add_iabs boolean not null default true,
  add column if not exists lease_add_rental_flood_disclosure boolean not null default false,
  add column if not exists lease_add_lead_paint boolean not null default false,
  add column if not exists lease_add_hoa_request boolean not null default false,
  add column if not exists lease_add_flood_hazard boolean not null default false,
  add column if not exists lease_add_condo_addendum boolean not null default false,
  add column if not exists lease_add_keybox_tenant boolean not null default false,
  add column if not exists lease_add_onsite_sewer boolean not null default false,
  add column if not exists lease_add_irs_forms boolean not null default false,
  add column if not exists lease_add_unescorted_access boolean not null default false,
  add column if not exists lease_add_assistance_animals boolean not null default false,
  add column if not exists lease_add_other_document boolean not null default false,
  add column if not exists lease_add_other_document_description text not null default 'NA',

  -- Lease requirements, paragraph 20
  add column if not exists rent_due_first_day boolean not null default true,
  add column if not exists rent_due_other text not null default 'NA',
  add column if not exists initial_late_charge_amount numeric(14, 2) not null default 0,
  add column if not exists initial_late_charge_percent numeric(5, 2) not null default 0,
  add column if not exists additional_late_charge_daily_amount numeric(14, 2) not null default 0,

  add column if not exists animals_not_permitted boolean not null default false,
  add column if not exists animals_permitted boolean not null default false,
  add column if not exists animal_restrictions text not null default 'NA',
  add column if not exists animal_deposit numeric(14, 2) not null default 0,
  add column if not exists animal_monthly_rent_increase numeric(14, 2) not null default 0,
  add column if not exists animal_nonrefundable_fee numeric(14, 2) not null default 0,
  add column if not exists animal_violation_initial_charge numeric(14, 2) not null default 0,
  add column if not exists animal_violation_daily_charge numeric(14, 2) not null default 0,

  add column if not exists security_deposit numeric(14, 2) not null default 0,
  add column if not exists tenant_utilities_except text not null default 'NA',
  add column if not exists guest_days integer not null default 0,
  add column if not exists vehicle_count integer not null default 0,
  add column if not exists trip_charge numeric(14, 2) not null default 0,
  add column if not exists keybox_last_days integer not null default 0,
  add column if not exists early_withdrawal_fee numeric(14, 2) not null default 0,
  add column if not exists inventory_condition_form_days integer not null default 0,

  add column if not exists yard_maintained_by varchar not null default 'TENANT',
  add column if not exists pool_spa_maintained_by varchar not null default 'NA',

  add column if not exists emergency_repair_phone text not null default 'NA',
  add column if not exists items_not_repaired text not null default 'NA',
  add column if not exists tenant_liability_insurance_amount numeric(14, 2) not null default 0,

  add column if not exists replacement_tenant_by_tenant_amount numeric(14, 2) not null default 0,
  add column if not exists replacement_tenant_by_tenant_percent numeric(5, 2) not null default 0,
  add column if not exists replacement_tenant_by_landlord_amount numeric(14, 2) not null default 0,
  add column if not exists replacement_tenant_by_landlord_percent numeric(5, 2) not null default 0,

  add column if not exists lease_requirements_special_provisions text not null default 'NA',
  add column if not exists lease_requirements_other text not null default 'NA';

-- authorize_public_compensation_disclosure already exists from TXR-1101 expansion.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_lease_compensation_model_check'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_lease_compensation_model_check
      check (
        lease_compensation_model in ('WITH_OTHER_BROKER', 'WITHOUT_OTHER_BROKER')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_lease_mls_filing_option_check'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_lease_mls_filing_option_check
      check (
        lease_mls_filing_option in ('FILE_IMMEDIATELY', 'DELAYED_FILING', 'NO_MLS')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_lease_internet_display_option_check'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_lease_internet_display_option_check
      check (
        lease_internet_display_option in (
          'FULL_DISPLAY',
          'NO_INTERNET_DISPLAY',
          'NO_ADDRESS_DISPLAY'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_make_ready_option_check'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_make_ready_option_check
      check (
        make_ready_option in ('BROKER_NOT_AUTHORIZED', 'BROKER_AUTHORIZED')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_lease_protection_period_non_negative'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_lease_protection_period_non_negative
      check (lease_protection_period_days >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_lease_mls_delayed_days_non_negative'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_lease_mls_delayed_days_non_negative
      check (lease_mls_delayed_days >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_lease_term_min_months_non_negative'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_lease_term_min_months_non_negative
      check (lease_term_min_months >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_lease_term_max_months_non_negative'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_lease_term_max_months_non_negative
      check (lease_term_max_months >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_guest_days_non_negative'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_guest_days_non_negative
      check (guest_days >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_vehicle_count_non_negative'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_vehicle_count_non_negative
      check (vehicle_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_keybox_last_days_non_negative'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_keybox_last_days_non_negative
      check (keybox_last_days >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_inv_cond_form_days_nonneg'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_inv_cond_form_days_nonneg
      check (inventory_condition_form_days >= 0);
  end if;
end $$;
