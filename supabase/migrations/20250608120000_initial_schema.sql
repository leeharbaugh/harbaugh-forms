-- Harbaugh Forms — real estate initial schema
-- Single-brokerage, single-user document generation for Texas real estate.
--
-- Standard columns on every table:
--   id          bigint generated always as identity primary key
--   create_date timestamptz not null default now()
--   update_date timestamptz not null default now()
--   status      varchar(20) not null default 'ACTIVE'  (soft delete: INACTIVE, DELETED)

-- ---------------------------------------------------------------------------
-- Shared utilities
-- ---------------------------------------------------------------------------

create or replace function public.set_update_date()
returns trigger
language plpgsql
as $$
begin
  new.update_date = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

create table public.clients (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  client_type varchar(20) not null default 'INDIVIDUAL',
  first_name varchar(100),
  middle_name varchar(100),
  last_name varchar(100),
  suffix varchar(20),
  entity_name varchar(255),
  email varchar(255),
  phone_primary varchar(30),
  phone_secondary varchar(30),
  mailing_address_line_1 varchar(255),
  mailing_address_line_2 varchar(255),
  mailing_city varchar(100),
  mailing_state char(2),
  mailing_zip varchar(20),
  notes text,

  constraint clients_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint clients_client_type_check
    check (client_type in ('INDIVIDUAL', 'ENTITY')),
  constraint clients_individual_name_check
    check (
      client_type <> 'INDIVIDUAL'
      or (first_name is not null and last_name is not null)
    ),
  constraint clients_entity_name_check
    check (client_type <> 'ENTITY' or entity_name is not null)
);

create index clients_status_idx on public.clients (status);
create index clients_last_name_idx on public.clients (last_name) where status = 'ACTIVE';
create index clients_entity_name_idx on public.clients (entity_name) where status = 'ACTIVE';

create unique index clients_email_active_uidx
  on public.clients (lower(email))
  where status = 'ACTIVE' and email is not null;

create trigger clients_set_update_date
before update on public.clients
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------

create table public.properties (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  street_address varchar(255) not null,
  unit varchar(50),
  city varchar(100) not null,
  state char(2) not null default 'TX',
  zip varchar(20) not null,
  county varchar(100),
  parcel_id varchar(100),
  legal_description text,
  property_type varchar(30) not null default 'SINGLE_FAMILY',
  bedrooms smallint,
  bathrooms numeric(4, 1),
  sqft integer,
  lot_sqft integer,
  year_built smallint,
  mls_number varchar(50),
  notes text,

  constraint properties_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint properties_property_type_check
    check (
      property_type in (
        'SINGLE_FAMILY',
        'CONDO',
        'TOWNHOME',
        'MULTI_FAMILY',
        'COMMERCIAL',
        'LAND',
        'OTHER'
      )
    ),
  constraint properties_street_address_not_blank
    check (length(trim(street_address)) > 0)
);

create index properties_status_idx on public.properties (status);
create index properties_city_state_idx on public.properties (city, state) where status = 'ACTIVE';
create index properties_mls_number_idx on public.properties (mls_number) where status = 'ACTIVE';

create unique index properties_address_active_uidx
  on public.properties (
    lower(street_address),
    coalesce(lower(unit), ''),
    lower(city),
    state,
    zip
  )
  where status = 'ACTIVE';

create trigger properties_set_update_date
before update on public.properties
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- brokerage_settings
-- ---------------------------------------------------------------------------

create table public.brokerage_settings (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  -- brokerage
  brokerage_name varchar(255),
  brokerage_license_number varchar(50),
  brokerage_phone varchar(30),
  brokerage_email varchar(255),
  brokerage_address1 varchar(255),
  brokerage_address2 varchar(255),
  brokerage_city varchar(100),
  brokerage_state char(2) default 'TX',
  brokerage_zip varchar(20),

  -- broker
  broker_name varchar(255),
  broker_license_number varchar(50),
  broker_phone varchar(30),
  broker_email varchar(255),

  -- supervisor
  supervisor_name varchar(255),
  supervisor_license_number varchar(50),
  supervisor_phone varchar(30),
  supervisor_email varchar(255),

  -- agent
  agent_name varchar(255),
  agent_license_number varchar(50),
  agent_phone varchar(30),
  agent_email varchar(255),

  -- defaults
  default_market_area varchar(100) not null default 'DFW',
  default_buyer_rep_compensation_percent numeric(5, 2) not null default 3.00,
  default_protection_period_days integer not null default 30,
  default_county_for_payment varchar(100) not null default 'Dallas/Tarrant',
  default_employer_relocation varchar(100) not null default 'NA',
  default_special_provisions text not null default 'NA',
  default_intermediary_allowed boolean not null default true,

  constraint brokerage_settings_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint brokerage_settings_protection_period_non_negative
    check (default_protection_period_days >= 0)
);

create index brokerage_settings_status_idx on public.brokerage_settings (status);

create trigger brokerage_settings_set_update_date
before update on public.brokerage_settings
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------

create table public.app_settings (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  setting_key varchar(100) not null,
  setting_value text,
  setting_type varchar(20) not null default 'TEXT',
  description text,

  constraint app_settings_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint app_settings_setting_type_check
    check (setting_type in ('TEXT', 'NUMBER', 'BOOLEAN', 'JSON')),
  constraint app_settings_setting_key_not_blank
    check (length(trim(setting_key)) > 0)
);

create index app_settings_status_idx on public.app_settings (status);

create unique index app_settings_setting_key_active_uidx
  on public.app_settings (lower(setting_key))
  where status = 'ACTIVE';

create trigger app_settings_set_update_date
before update on public.app_settings
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- representation_agreements
-- ---------------------------------------------------------------------------

create table public.representation_agreements (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  agreement_type varchar(20) not null,
  agreement_status varchar(20) not null default 'ACTIVE',
  property_id bigint references public.properties (id) on delete set null,
  effective_date date not null,
  expiration_date date,
  signed_date date,
  created_by_user_id uuid references auth.users (id) on delete set null,
  notes text,

  constraint representation_agreements_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint representation_agreements_agreement_type_check
    check (agreement_type in ('BUYER_REP', 'LISTING')),
  constraint representation_agreements_agreement_status_check
    check (agreement_status in ('ACTIVE', 'EXPIRED', 'TERMINATED', 'COMPLETED')),
  constraint representation_agreements_date_range_check
    check (expiration_date is null or expiration_date >= effective_date)
);

create index representation_agreements_status_idx
  on public.representation_agreements (status);

create index representation_agreements_agreement_status_idx
  on public.representation_agreements (agreement_status)
  where status = 'ACTIVE';

create index representation_agreements_property_id_idx
  on public.representation_agreements (property_id)
  where status = 'ACTIVE';

create index representation_agreements_agreement_type_idx
  on public.representation_agreements (agreement_type)
  where status = 'ACTIVE';

create trigger representation_agreements_set_update_date
before update on public.representation_agreements
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- representation_agreement_clients
-- ---------------------------------------------------------------------------

create table public.representation_agreement_clients (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  representation_agreement_id bigint not null
    references public.representation_agreements (id) on delete restrict,
  client_id bigint not null
    references public.clients (id) on delete restrict,
  client_role varchar(30) not null default 'PRIMARY',
  sort_order integer not null default 0,

  constraint representation_agreement_clients_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint representation_agreement_clients_client_role_check
    check (
      client_role in (
        'PRIMARY',
        'CO_CLIENT',
        'SPOUSE',
        'POWER_OF_ATTORNEY',
        'OTHER'
      )
    ),
  constraint representation_agreement_clients_sort_order_non_negative
    check (sort_order >= 0)
);

create index representation_agreement_clients_status_idx
  on public.representation_agreement_clients (status);

create index representation_agreement_clients_agreement_id_idx
  on public.representation_agreement_clients (representation_agreement_id)
  where status = 'ACTIVE';

create index representation_agreement_clients_client_id_idx
  on public.representation_agreement_clients (client_id)
  where status = 'ACTIVE';

create unique index representation_agreement_clients_pair_active_uidx
  on public.representation_agreement_clients (representation_agreement_id, client_id)
  where status = 'ACTIVE';

create trigger representation_agreement_clients_set_update_date
before update on public.representation_agreement_clients
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- buyer_rep_details
-- ---------------------------------------------------------------------------

create table public.buyer_rep_details (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  representation_agreement_id bigint not null
    references public.representation_agreements (id) on delete restrict,
  representation_kind varchar(20) not null,
  market_area varchar(100) not null default 'DFW',
  compensation_percent numeric(5, 3) not null default 3.000,
  protection_period_days integer not null default 30,
  county_for_payment varchar(100) not null default 'Dallas/Tarrant',
  employer_relocation varchar(100) not null default 'NA',
  intermediary_allowed boolean not null default true,
  retainer_amount numeric(14, 2) not null default 0,
  add_iabs boolean not null default true,
  add_home_inspection boolean not null default true,
  add_wire_fraud boolean not null default true,
  add_mineral_clauses boolean not null default true,
  special_provisions text not null default 'NA',

  constraint buyer_rep_details_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint buyer_rep_details_representation_kind_check
    check (representation_kind in ('PURCHASE', 'LEASE')),
  constraint buyer_rep_details_protection_period_non_negative
    check (protection_period_days >= 0),
  constraint buyer_rep_details_retainer_amount_non_negative
    check (retainer_amount >= 0)
);

create index buyer_rep_details_status_idx on public.buyer_rep_details (status);

create unique index buyer_rep_details_agreement_active_uidx
  on public.buyer_rep_details (representation_agreement_id)
  where status = 'ACTIVE';

create trigger buyer_rep_details_set_update_date
before update on public.buyer_rep_details
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- listing_agreement_details
-- ---------------------------------------------------------------------------

create table public.listing_agreement_details (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  representation_agreement_id bigint not null
    references public.representation_agreements (id) on delete restrict,
  representation_kind varchar(20) not null,
  list_price numeric(14, 2),
  seller_broker_fee_percent numeric(5, 2),
  buyer_broker_fee_percent numeric(5, 2),
  showing_service varchar(100) not null default 'BrokerBay',
  hoa_exists boolean,
  lead_based_paint_required boolean,
  seller_disclosure_required boolean,
  exclusions text not null default 'NA',
  included_personal_property text not null default 'NA',
  service_contract_amount numeric(14, 2) not null default 0,
  preferred_title_company varchar(255),
  occupancy_status varchar(50),
  access_notes text not null default 'NA',

  constraint listing_agreement_details_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint listing_agreement_details_representation_kind_check
    check (representation_kind in ('SALE', 'LEASE')),
  constraint listing_agreement_details_service_contract_amount_non_negative
    check (service_contract_amount >= 0)
);

create index listing_agreement_details_status_idx
  on public.listing_agreement_details (status);

create unique index listing_agreement_details_agreement_active_uidx
  on public.listing_agreement_details (representation_agreement_id)
  where status = 'ACTIVE';

create trigger listing_agreement_details_set_update_date
before update on public.listing_agreement_details
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- form_templates
-- ---------------------------------------------------------------------------

create table public.form_templates (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  template_code varchar(50) not null,
  template_name varchar(255) not null,
  form_category varchar(30) not null default 'OTHER',
  state_code char(2) not null default 'TX',
  version_label varchar(50),
  source_storage_path text not null,
  description text,

  constraint form_templates_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint form_templates_form_category_check
    check (
      form_category in (
        'REPRESENTATION',
        'DISCLOSURE',
        'ADDENDUM',
        'CONTRACT',
        'OTHER'
      )
    ),
  constraint form_templates_template_code_not_blank
    check (length(trim(template_code)) > 0),
  constraint form_templates_template_name_not_blank
    check (length(trim(template_name)) > 0),
  constraint form_templates_source_path_not_blank
    check (length(trim(source_storage_path)) > 0)
);

create index form_templates_status_idx on public.form_templates (status);
create index form_templates_form_category_idx on public.form_templates (form_category) where status = 'ACTIVE';

create unique index form_templates_code_version_active_uidx
  on public.form_templates (lower(template_code), coalesce(version_label, ''))
  where status = 'ACTIVE';

create trigger form_templates_set_update_date
before update on public.form_templates
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- packet_templates
-- ---------------------------------------------------------------------------

create table public.packet_templates (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  packet_name varchar(255) not null,
  packet_type varchar(30) not null,
  description text,

  constraint packet_templates_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint packet_templates_packet_type_check
    check (
      packet_type in (
        'BUYER_REP_PACKET',
        'LISTING_PACKET',
        'OFFER_PACKET',
        'AMENDMENT_PACKET',
        'CUSTOM'
      )
    ),
  constraint packet_templates_packet_name_not_blank
    check (length(trim(packet_name)) > 0)
);

create index packet_templates_status_idx on public.packet_templates (status);
create index packet_templates_packet_type_idx on public.packet_templates (packet_type) where status = 'ACTIVE';

create unique index packet_templates_name_active_uidx
  on public.packet_templates (lower(packet_name))
  where status = 'ACTIVE';

create trigger packet_templates_set_update_date
before update on public.packet_templates
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- packet_template_forms
-- ---------------------------------------------------------------------------

create table public.packet_template_forms (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  packet_template_id bigint not null
    references public.packet_templates (id) on delete restrict,
  form_template_id bigint not null
    references public.form_templates (id) on delete restrict,
  sort_order integer not null default 0,
  is_required boolean not null default true,

  constraint packet_template_forms_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint packet_template_forms_sort_order_non_negative
    check (sort_order >= 0)
);

create index packet_template_forms_status_idx on public.packet_template_forms (status);

create index packet_template_forms_packet_template_id_idx
  on public.packet_template_forms (packet_template_id)
  where status = 'ACTIVE';

create unique index packet_template_forms_packet_form_active_uidx
  on public.packet_template_forms (packet_template_id, form_template_id)
  where status = 'ACTIVE';

create unique index packet_template_forms_packet_sort_active_uidx
  on public.packet_template_forms (packet_template_id, sort_order)
  where status = 'ACTIVE';

create trigger packet_template_forms_set_update_date
before update on public.packet_template_forms
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- generated_packets
-- ---------------------------------------------------------------------------

create table public.generated_packets (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  packet_template_id bigint not null
    references public.packet_templates (id) on delete restrict,
  representation_agreement_id bigint
    references public.representation_agreements (id) on delete set null,
  packet_label varchar(255) not null,
  generated_by_user_id uuid references auth.users (id) on delete set null,
  notes text,

  constraint generated_packets_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint generated_packets_packet_label_not_blank
    check (length(trim(packet_label)) > 0)
);

create index generated_packets_status_idx on public.generated_packets (status);

create index generated_packets_packet_template_id_idx
  on public.generated_packets (packet_template_id)
  where status = 'ACTIVE';

create index generated_packets_representation_agreement_id_idx
  on public.generated_packets (representation_agreement_id)
  where status = 'ACTIVE';

create trigger generated_packets_set_update_date
before update on public.generated_packets
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- generated_documents
-- ---------------------------------------------------------------------------

create table public.generated_documents (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  generated_packet_id bigint not null
    references public.generated_packets (id) on delete restrict,
  form_template_id bigint not null
    references public.form_templates (id) on delete restrict,
  document_name varchar(255) not null,
  document_state varchar(20) not null default 'DRAFT',
  storage_path text,
  field_data jsonb not null default '{}'::jsonb,
  signed_date timestamptz,
  generated_by_user_id uuid references auth.users (id) on delete set null,

  constraint generated_documents_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint generated_documents_document_state_check
    check (document_state in ('DRAFT', 'FINAL', 'SIGNED', 'VOID')),
  constraint generated_documents_document_name_not_blank
    check (length(trim(document_name)) > 0)
);

create index generated_documents_status_idx on public.generated_documents (status);

create index generated_documents_generated_packet_id_idx
  on public.generated_documents (generated_packet_id)
  where status = 'ACTIVE';

create index generated_documents_form_template_id_idx
  on public.generated_documents (form_template_id)
  where status = 'ACTIVE';

create index generated_documents_document_state_idx
  on public.generated_documents (document_state)
  where status = 'ACTIVE';

create trigger generated_documents_set_update_date
before update on public.generated_documents
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- Referential integrity: agreement type ↔ detail tables
-- ---------------------------------------------------------------------------

create or replace function public.validate_representation_agreement_detail()
returns trigger
language plpgsql
as $$
declare
  agreement_type_value varchar(20);
begin
  select agreement_type
  into agreement_type_value
  from public.representation_agreements
  where id = new.representation_agreement_id;

  if agreement_type_value is null then
    raise exception 'Representation agreement % not found', new.representation_agreement_id;
  end if;

  if tg_table_name = 'buyer_rep_details' and agreement_type_value <> 'BUYER_REP' then
    raise exception 'buyer_rep_details requires a BUYER_REP agreement';
  end if;

  if tg_table_name = 'listing_agreement_details' and agreement_type_value <> 'LISTING' then
    raise exception 'listing_agreement_details requires a LISTING agreement';
  end if;

  return new;
end;
$$;

create trigger buyer_rep_details_validate_agreement_type
before insert or update on public.buyer_rep_details
for each row execute function public.validate_representation_agreement_detail();

create trigger listing_agreement_details_validate_agreement_type
before insert or update on public.listing_agreement_details
for each row execute function public.validate_representation_agreement_detail();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Single-user app: any authenticated user has full access.
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.properties enable row level security;
alter table public.brokerage_settings enable row level security;
alter table public.app_settings enable row level security;
alter table public.representation_agreements enable row level security;
alter table public.representation_agreement_clients enable row level security;
alter table public.buyer_rep_details enable row level security;
alter table public.listing_agreement_details enable row level security;
alter table public.form_templates enable row level security;
alter table public.packet_templates enable row level security;
alter table public.packet_template_forms enable row level security;
alter table public.generated_packets enable row level security;
alter table public.generated_documents enable row level security;

create policy "clients_authenticated_all"
  on public.clients for all to authenticated
  using (true) with check (true);

create policy "properties_authenticated_all"
  on public.properties for all to authenticated
  using (true) with check (true);

create policy "brokerage_settings_authenticated_all"
  on public.brokerage_settings for all to authenticated
  using (true) with check (true);

create policy "app_settings_authenticated_all"
  on public.app_settings for all to authenticated
  using (true) with check (true);

create policy "representation_agreements_authenticated_all"
  on public.representation_agreements for all to authenticated
  using (true) with check (true);

create policy "representation_agreement_clients_authenticated_all"
  on public.representation_agreement_clients for all to authenticated
  using (true) with check (true);

create policy "buyer_rep_details_authenticated_all"
  on public.buyer_rep_details for all to authenticated
  using (true) with check (true);

create policy "listing_agreement_details_authenticated_all"
  on public.listing_agreement_details for all to authenticated
  using (true) with check (true);

create policy "form_templates_authenticated_all"
  on public.form_templates for all to authenticated
  using (true) with check (true);

create policy "packet_templates_authenticated_all"
  on public.packet_templates for all to authenticated
  using (true) with check (true);

create policy "packet_template_forms_authenticated_all"
  on public.packet_template_forms for all to authenticated
  using (true) with check (true);

create policy "generated_packets_authenticated_all"
  on public.generated_packets for all to authenticated
  using (true) with check (true);

create policy "generated_documents_authenticated_all"
  on public.generated_documents for all to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Data API grants
-- ---------------------------------------------------------------------------

grant usage on schema public to postgres, anon, authenticated;

grant select, insert, update, delete on table public.clients to authenticated;
grant select, insert, update, delete on table public.properties to authenticated;
grant select, insert, update, delete on table public.brokerage_settings to authenticated;
grant select, insert, update, delete on table public.app_settings to authenticated;
grant select, insert, update, delete on table public.representation_agreements to authenticated;
grant select, insert, update, delete on table public.representation_agreement_clients to authenticated;
grant select, insert, update, delete on table public.buyer_rep_details to authenticated;
grant select, insert, update, delete on table public.listing_agreement_details to authenticated;
grant select, insert, update, delete on table public.form_templates to authenticated;
grant select, insert, update, delete on table public.packet_templates to authenticated;
grant select, insert, update, delete on table public.packet_template_forms to authenticated;
grant select, insert, update, delete on table public.generated_packets to authenticated;
grant select, insert, update, delete on table public.generated_documents to authenticated;
