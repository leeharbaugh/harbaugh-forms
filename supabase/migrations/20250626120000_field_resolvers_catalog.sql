-- field_resolvers catalog: computed-value registry (additive, non-breaking).
-- Runtime resolver behavior is unchanged; fields.source_* columns remain authoritative.

-- ---------------------------------------------------------------------------
-- field_resolvers
-- ---------------------------------------------------------------------------

create table public.field_resolvers (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  resolver_key text not null,
  friendly_name text not null,
  category text not null,
  description text,
  example_output text,

  constraint field_resolvers_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint field_resolvers_resolver_key_not_blank
    check (length(trim(resolver_key)) > 0),
  constraint field_resolvers_friendly_name_not_blank
    check (length(trim(friendly_name)) > 0),
  constraint field_resolvers_category_not_blank
    check (length(trim(category)) > 0)
);

create index field_resolvers_status_idx
  on public.field_resolvers (status);

create index field_resolvers_category_idx
  on public.field_resolvers (category)
  where status = 'ACTIVE';

create unique index field_resolvers_resolver_key_active_uidx
  on public.field_resolvers (lower(resolver_key))
  where status = 'ACTIVE';

create trigger field_resolvers_set_update_date
before update on public.field_resolvers
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.field_resolvers enable row level security;

create policy "field_resolvers_authenticated_all"
  on public.field_resolvers for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.field_resolvers to authenticated;

-- ---------------------------------------------------------------------------
-- Seed catalog entries (idempotent via WHERE NOT EXISTS)
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
      'property_full_address',
      'Property Full Address',
      'property',
      'Full street address of the packet property (street, unit, city, state, ZIP). Resolves from packet_property.full_address or equivalent custom resolver.',
      '123 Main St., Arlington, TX 76010'
    ),
    (
      'property_city_state_zip',
      'Property City, State ZIP',
      'property',
      'City, state, and ZIP portion of the packet property address. Resolves from packet_property.address_city_state_zip.',
      'Arlington, TX 76010'
    ),
    (
      'agent_full_name',
      'Agent Full Name',
      'settings',
      'Full name of the agent from brokerage settings (first, middle, last).',
      'Jane Q. Agent'
    ),
    (
      'broker_full_name',
      'Broker Full Name',
      'settings',
      'Full name of the designated broker from brokerage settings.',
      'John Broker'
    ),
    (
      'buyer_1_full_name',
      'Buyer 1 Full Name',
      'contact_buyer',
      'Full name of the first buyer contact on the packet (buyer_1 role, by sort order).',
      'Alice Buyer'
    ),
    (
      'buyer_2_full_name',
      'Buyer 2 Full Name',
      'contact_buyer',
      'Full name of the second buyer contact on the packet (buyer_2 role).',
      'Bob Buyer'
    ),
    (
      'seller_1_full_name',
      'Seller 1 Full Name',
      'contact_seller',
      'Full name of the first seller contact on the packet (seller_1 role, by sort order).',
      'Carol Seller'
    ),
    (
      'seller_2_full_name',
      'Seller 2 Full Name',
      'contact_seller',
      'Full name of the second seller contact on the packet (seller_2 role).',
      'Dan Seller'
    ),
    (
      'seller_names',
      'All Seller Names',
      'contact_seller',
      'Comma-separated full names of all active seller contacts on the packet, ordered by sort_order. Composite computed value.',
      'Carol Seller, Dan Seller'
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
