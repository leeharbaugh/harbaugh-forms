-- Part 1: Contact fields
-- Part 2: App profiles linked to auth.users
-- Part 3: Nullable owner_user_id on user-owned tables (future multi-user)

-- ---------------------------------------------------------------------------
-- Part 1 — contacts: additional Texas / CRM fields
-- ---------------------------------------------------------------------------

alter table public.contacts
  add column if not exists preferred_name text,
  add column if not exists title text,
  add column if not exists email_secondary text,
  add column if not exists street_address_line_1 text,
  add column if not exists street_address_line_2 text,
  add column if not exists street_city text,
  add column if not exists street_state text default 'TX',
  add column if not exists street_zip text,
  add column if not exists county text,
  add column if not exists preferred_contact_method text,
  add column if not exists company_name text,
  add column if not exists brokerage_name text,
  add column if not exists trec_license_number text,
  add column if not exists entity_type text,
  add column if not exists date_of_birth date,
  add column if not exists occupation text;

-- ---------------------------------------------------------------------------
-- Part 2 — profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  first_name text,
  middle_name text,
  last_name text,
  email text,
  phone text,
  trec_license_number text,
  brokerage_name text,
  notes text,

  constraint profiles_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED'))
);

create index if not exists profiles_status_idx
  on public.profiles (status);

create trigger profiles_set_update_date
before update on public.profiles
for each row execute function public.set_update_date();

alter table public.profiles enable row level security;

drop policy if exists "profiles_authenticated_all" on public.profiles;
create policy "profiles_authenticated_all"
  on public.profiles for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Part 3 — owner_user_id (nullable, no backfill)
-- ---------------------------------------------------------------------------

alter table public.contacts
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

alter table public.properties
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

alter table public.packets
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

alter table public.collections
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

alter table public.forms
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

create index if not exists contacts_owner_user_id_idx
  on public.contacts (owner_user_id)
  where status = 'ACTIVE';

create index if not exists properties_owner_user_id_idx
  on public.properties (owner_user_id)
  where status = 'ACTIVE';

create index if not exists packets_owner_user_id_idx
  on public.packets (owner_user_id)
  where status = 'ACTIVE';

create index if not exists collections_owner_user_id_idx
  on public.collections (owner_user_id)
  where status = 'ACTIVE';

create index if not exists forms_owner_user_id_idx
  on public.forms (owner_user_id)
  where status = 'ACTIVE';
