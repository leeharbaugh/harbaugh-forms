-- Instance-world packet metadata: packet_type, property_id, packet_contacts.
-- Does not drop legacy agreement tables or packets.representation_agreement_id.

-- ---------------------------------------------------------------------------
-- packets: packet_type and property_id
-- ---------------------------------------------------------------------------

alter table public.packets
  add column if not exists packet_type varchar(30),
  add column if not exists property_id bigint references public.properties (id) on delete set null;

alter table public.packets
  drop constraint if exists packets_packet_type_check;

alter table public.packets
  add constraint packets_packet_type_check
    check (
      packet_type is null
      or packet_type in (
        'buyer_rep',
        'listing',
        'contract_offer'
      )
    );

create index if not exists packets_packet_type_idx
  on public.packets (packet_type)
  where status = 'ACTIVE';

create index if not exists packets_property_id_idx
  on public.packets (property_id)
  where status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- packet_contacts
-- ---------------------------------------------------------------------------

create table if not exists public.packet_contacts (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  packet_id bigint not null
    references public.packets (id) on delete restrict,
  contact_id bigint not null
    references public.contacts (id) on delete restrict,
  packet_role varchar(30) not null default 'PRIMARY',
  sort_order integer not null default 0,

  constraint packet_contacts_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint packet_contacts_packet_role_check
    check (
      packet_role in (
        'PRIMARY',
        'CO_CLIENT',
        'SPOUSE',
        'POWER_OF_ATTORNEY',
        'BUYER',
        'TENANT',
        'SELLER',
        'LANDLORD',
        'OTHER'
      )
    ),
  constraint packet_contacts_sort_order_non_negative
    check (sort_order >= 0)
);

create index if not exists packet_contacts_status_idx
  on public.packet_contacts (status);

create index if not exists packet_contacts_packet_id_idx
  on public.packet_contacts (packet_id)
  where status = 'ACTIVE';

create index if not exists packet_contacts_contact_id_idx
  on public.packet_contacts (contact_id)
  where status = 'ACTIVE';

create unique index if not exists packet_contacts_packet_contact_active_uidx
  on public.packet_contacts (packet_id, contact_id)
  where status = 'ACTIVE';

create trigger packet_contacts_set_update_date
before update on public.packet_contacts
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.packet_contacts enable row level security;

drop policy if exists "packet_contacts_authenticated_all" on public.packet_contacts;
create policy "packet_contacts_authenticated_all"
  on public.packet_contacts for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.packet_contacts to authenticated;
