-- TREC 20-19 / TXR 1601 One to Four Family Residential Contract durable business data.
-- Form metadata is pre-existing in public.forms (not modified here).
-- Does not create public.fields or form_field_mappings.

-- ---------------------------------------------------------------------------
-- contract_details
-- ---------------------------------------------------------------------------

create table if not exists public.contract_details (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  packet_id bigint references public.packets (id) on delete restrict,
  property_id bigint references public.properties (id) on delete set null,

  contract_type varchar not null default 'ONE_TO_FOUR_RESIDENTIAL_RESALE',
  effective_date date,
  closing_date date,

  -- Sales price
  sales_price_cash numeric(14, 2) not null default 0,
  sales_price_financing numeric(14, 2) not null default 0,
  sales_price_total numeric(14, 2) not null default 0,

  -- Financing addenda
  financing_third_party boolean not null default false,
  financing_loan_assumption boolean not null default false,
  financing_seller_financing boolean not null default false,

  -- Leases
  lease_residential boolean not null default false,
  lease_fixture boolean not null default false,
  lease_natural_resource boolean not null default false,
  natural_resource_leases_delivered boolean not null default false,
  natural_resource_leases_not_delivered boolean not null default false,
  natural_resource_lease_termination_days integer not null default 0,

  -- Earnest money / option
  escrow_agent_name text not null default 'NA',
  escrow_agent_address text not null default 'NA',
  earnest_money_amount numeric(14, 2) not null default 0,
  option_fee_amount numeric(14, 2) not null default 0,
  additional_earnest_money_amount numeric(14, 2) not null default 0,
  additional_earnest_money_days integer not null default 0,
  option_period_days integer not null default 0,

  -- Title policy
  title_policy_paid_by_seller boolean not null default true,
  title_policy_paid_by_buyer boolean not null default false,
  title_company_name text not null default 'NA',
  title_exception_not_amended boolean not null default true,
  title_exception_amended boolean not null default false,
  title_exception_amended_paid_by_buyer boolean not null default false,
  title_exception_amended_paid_by_seller boolean not null default false,

  -- Survey / objections
  survey_option varchar not null default 'SELLER_EXISTING_SURVEY',
  survey_option_1_days integer not null default 0,
  survey_option_2_days integer not null default 0,
  survey_option_3_days integer not null default 0,
  survey_new_paid_by_seller boolean not null default false,
  survey_new_paid_by_buyer boolean not null default false,
  title_objection_use_activity text not null default 'NA',
  title_objection_days integer not null default 0,

  -- HOA
  hoa_is_subject boolean not null default false,
  hoa_is_not_subject boolean not null default true,

  -- Seller disclosure
  seller_disclosure_received boolean not null default false,
  seller_disclosure_not_received boolean not null default true,
  seller_disclosure_delivery_days integer not null default 0,
  seller_disclosure_not_required boolean not null default false,

  -- Property condition
  property_as_is boolean not null default true,
  property_as_is_with_repairs boolean not null default false,
  specific_repairs text not null default 'NA',
  service_contract_reimbursement_amount numeric(14, 2) not null default 0,

  -- Water disclosure
  water_disclosure_received boolean not null default false,
  water_disclosure_not_received boolean not null default false,
  water_disclosure_delivery_days integer not null default 0,
  water_disclosure_not_required boolean not null default false,
  water_provider_name text not null default 'NA',

  -- Broker/sales agent disclosure
  broker_disclosure_text text not null default 'NA',

  -- Possession
  buyer_possession_at_closing boolean not null default true,
  buyer_possession_by_lease boolean not null default false,

  -- Special provisions
  special_provisions text not null default 'NA',

  -- Settlement expenses
  seller_expense_contribution_amount numeric(14, 2) not null default 0,

  -- Brokerage compensation contributions
  seller_contributes_to_buyer_broker_comp boolean not null default false,
  seller_contribution_dollar_selected boolean not null default false,
  seller_contribution_amount numeric(14, 2) not null default 0,
  seller_contribution_percent_selected boolean not null default false,
  seller_contribution_percent numeric(5, 2) not null default 0,

  buyer_contributes_to_seller_broker_comp boolean not null default false,
  buyer_contribution_dollar_selected boolean not null default false,
  buyer_contribution_amount numeric(14, 2) not null default 0,
  buyer_contribution_percent_selected boolean not null default false,
  buyer_contribution_percent numeric(5, 2) not null default 0,

  -- Effective date split fields (PDF rendering)
  effective_day integer,
  effective_month text,
  effective_year integer,

  constraint contract_details_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint contract_details_survey_option_check
    check (
      survey_option in (
        'SELLER_EXISTING_SURVEY',
        'BUYER_NEW_SURVEY',
        'SELLER_NEW_SURVEY'
      )
    ),
  constraint contract_details_natural_resource_lease_termination_days_non_negative
    check (natural_resource_lease_termination_days >= 0),
  constraint contract_details_additional_earnest_money_days_non_negative
    check (additional_earnest_money_days >= 0),
  constraint contract_details_option_period_days_non_negative
    check (option_period_days >= 0),
  constraint contract_details_survey_option_days_non_negative
    check (
      survey_option_1_days >= 0
      and survey_option_2_days >= 0
      and survey_option_3_days >= 0
    ),
  constraint contract_details_title_objection_days_non_negative
    check (title_objection_days >= 0),
  constraint contract_details_seller_disclosure_delivery_days_non_negative
    check (seller_disclosure_delivery_days >= 0),
  constraint contract_details_water_disclosure_delivery_days_non_negative
    check (water_disclosure_delivery_days >= 0),
  constraint contract_details_sales_price_non_negative
    check (
      sales_price_cash >= 0
      and sales_price_financing >= 0
      and sales_price_total >= 0
    ),
  constraint contract_details_earnest_money_non_negative
    check (
      earnest_money_amount >= 0
      and option_fee_amount >= 0
      and additional_earnest_money_amount >= 0
    ),
  constraint contract_details_service_contract_reimbursement_non_negative
    check (service_contract_reimbursement_amount >= 0),
  constraint contract_details_seller_expense_contribution_non_negative
    check (seller_expense_contribution_amount >= 0),
  constraint contract_details_contribution_amounts_non_negative
    check (
      seller_contribution_amount >= 0
      and buyer_contribution_amount >= 0
      and seller_contribution_percent >= 0
      and buyer_contribution_percent >= 0
    )
);

create index if not exists contract_details_packet_id_idx
  on public.contract_details (packet_id);

create index if not exists contract_details_property_id_idx
  on public.contract_details (property_id);

create index if not exists contract_details_contract_type_idx
  on public.contract_details (contract_type);

create index if not exists contract_details_status_idx
  on public.contract_details (status);

drop trigger if exists contract_details_set_update_date on public.contract_details;
create trigger contract_details_set_update_date
before update on public.contract_details
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.contract_details enable row level security;

drop policy if exists "contract_details_authenticated_all" on public.contract_details;
create policy "contract_details_authenticated_all"
  on public.contract_details for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.contract_details to authenticated;
