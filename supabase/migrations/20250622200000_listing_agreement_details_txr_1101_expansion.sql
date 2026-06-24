-- Expand listing_agreement_details for TXR-1101 Residential Real Estate Listing Agreement.
-- Does not touch public.forms, public.fields, or form_field_mappings.

alter table public.listing_agreement_details
  add column if not exists listing_begin_date date,
  add column if not exists listing_end_date date,

  add column if not exists compensation_model varchar not null default 'BROKER_WITH_COOP',
  add column if not exists listing_commission_percent numeric(5, 2) not null default 0,
  add column if not exists listing_flat_fee numeric(14, 2) not null default 0,
  add column if not exists listing_compensation_other text not null default 'NA',
  add column if not exists buyer_broker_comp_percent numeric(5, 2) not null default 0,
  add column if not exists buyer_broker_comp_flat_fee numeric(14, 2) not null default 0,
  add column if not exists authorize_public_compensation_disclosure boolean not null default true,
  add column if not exists seller_authorizes_buyer_expense_disclosure boolean not null default false,
  add column if not exists other_fees_reimbursable_expenses text not null default 'NA',
  add column if not exists protection_period_days integer not null default 30,
  add column if not exists payment_county varchar not null default 'Dallas/Tarrant',

  add column if not exists mls_filing_option varchar not null default 'FILE_IMMEDIATELY',
  add column if not exists mls_delayed_days integer not null default 0,
  add column if not exists mls_delayed_purpose text not null default 'NA',

  add column if not exists scheduling_company text not null default 'BrokerBay',
  add column if not exists keybox_authorized boolean not null default true,

  add column if not exists internet_display_option varchar not null default 'FULL_DISPLAY',

  add column if not exists financing_conventional boolean not null default true,
  add column if not exists financing_va boolean not null default true,
  add column if not exists financing_fha boolean not null default true,
  add column if not exists financing_cash boolean not null default true,
  add column if not exists financing_texas_veterans boolean not null default false,
  add column if not exists financing_owner_finance boolean not null default false,
  add column if not exists financing_other boolean not null default false,
  add column if not exists financing_other_description text not null default 'NA',

  add column if not exists known_financial_obligations_exception text not null default 'NA',
  add column if not exists known_liens_exception text not null default 'NA',
  add column if not exists employer_relocation_company text not null default 'NA',
  add column if not exists known_districts text not null default 'NA',

  add column if not exists add_iabs boolean not null default true,
  add column if not exists add_sellers_disclosure boolean not null default true,
  add column if not exists add_lead_paint boolean not null default false,
  add column if not exists add_t47 boolean not null default true,
  add column if not exists add_mud_notice boolean not null default false,
  add column if not exists add_pid_notice boolean not null default false,
  add column if not exists add_hoa_request boolean not null default false,
  add column if not exists add_mortgage_info_request boolean not null default false,
  add column if not exists add_mineral_info boolean not null default true,
  add column if not exists add_onsite_sewer_info boolean not null default false,
  add column if not exists add_property_insurance boolean not null default true,
  add column if not exists add_flood_hazard boolean not null default true,
  add column if not exists add_condo_addendum boolean not null default false,
  add column if not exists add_keybox_tenant boolean not null default false,
  add column if not exists add_authorization_to_advertise boolean not null default false,
  add column if not exists add_other_document boolean not null default false,
  add column if not exists add_other_document_description text not null default 'NA';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_compensation_model_check'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_compensation_model_check
      check (compensation_model in ('BROKER_WITH_COOP', 'BROKER_NO_COOP'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_protection_period_non_negative'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_protection_period_non_negative
      check (protection_period_days >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_mls_filing_option_check'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_mls_filing_option_check
      check (mls_filing_option in ('FILE_IMMEDIATELY', 'DELAYED_FILING', 'NO_MLS'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_mls_delayed_days_non_negative'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_mls_delayed_days_non_negative
      check (mls_delayed_days >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listing_agreement_details_internet_display_option_check'
  ) then
    alter table public.listing_agreement_details
      add constraint listing_agreement_details_internet_display_option_check
      check (
        internet_display_option in (
          'FULL_DISPLAY',
          'NO_INTERNET_DISPLAY',
          'NO_ADDRESS_DISPLAY'
        )
      );
  end if;
end $$;
