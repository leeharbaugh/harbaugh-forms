-- Property-level HOA information.
-- Supports multiple HOAs per property with soft-delete lifecycle.

-- ---------------------------------------------------------------------------
-- property_hoas
-- ---------------------------------------------------------------------------

create table public.property_hoas (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  property_id bigint not null
    references public.properties (id) on delete restrict,
  hoa_name varchar(255) not null,
  hoa_phone varchar(30),
  management_company_name varchar(255),
  management_company_phone varchar(30),
  management_company_email varchar(255),
  notes text,

  constraint property_hoas_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint property_hoas_hoa_name_not_blank
    check (length(trim(hoa_name)) > 0)
);

create index property_hoas_property_id_idx
  on public.property_hoas (property_id);

create index property_hoas_status_idx
  on public.property_hoas (status);

create unique index property_hoas_property_hoa_name_active_uidx
  on public.property_hoas (property_id, lower(hoa_name))
  where status = 'ACTIVE';

create trigger property_hoas_set_update_date
before update on public.property_hoas
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.property_hoas enable row level security;

create policy "property_hoas_authenticated_all"
  on public.property_hoas for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.property_hoas to authenticated;
