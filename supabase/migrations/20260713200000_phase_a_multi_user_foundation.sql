-- Phase A: multi-user foundation (schema, seeds, ownership/scope backfill,
-- scoped unique indexes, helper + owner sync triggers).
-- Does NOT replace open authenticated RLS on existing business tables.
-- Does NOT migrate Storage paths or tighten Storage RLS.

begin;

-- ---------------------------------------------------------------------------
-- Constants
-- ---------------------------------------------------------------------------
-- Initial admin: e26c8f57-c0aa-4474-b43e-6e15f0260e99 (lee@leeharbaugh.com)

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  name text not null,
  legal_name text,
  organization_type text not null default 'BROKERAGE',
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state char(2) default 'TX',
  zip text,
  brokerage_license_number text,
  broker_first_name text,
  broker_middle_name text,
  broker_last_name text,
  broker_license_number text,
  broker_phone text,
  broker_email text,

  constraint organizations_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint organizations_type_check
    check (organization_type in ('BROKERAGE', 'OTHER')),
  constraint organizations_name_not_blank
    check (length(trim(name)) > 0)
);

create index if not exists organizations_status_idx
  on public.organizations (status);

create unique index if not exists organizations_license_name_active_uidx
  on public.organizations (lower(brokerage_license_number), lower(name))
  where status = 'ACTIVE'
    and brokerage_license_number is not null
    and length(trim(brokerage_license_number)) > 0;

drop trigger if exists organizations_set_update_date on public.organizations;
create trigger organizations_set_update_date
before update on public.organizations
for each row execute function public.set_update_date();

alter table public.organizations enable row level security;

drop policy if exists "organizations_authenticated_all" on public.organizations;
create policy "organizations_authenticated_all"
  on public.organizations for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- 2. organization_members
-- ---------------------------------------------------------------------------

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  membership_role text not null default 'MEMBER',

  constraint organization_members_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint organization_members_role_check
    check (membership_role in ('MEMBER', 'ORG_ADMIN'))
);

create index if not exists organization_members_status_idx
  on public.organization_members (status);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id)
  where status = 'ACTIVE';

create index if not exists organization_members_organization_id_idx
  on public.organization_members (organization_id)
  where status = 'ACTIVE';

create unique index if not exists organization_members_org_user_active_uidx
  on public.organization_members (organization_id, user_id)
  where status = 'ACTIVE';

drop trigger if exists organization_members_set_update_date on public.organization_members;
create trigger organization_members_set_update_date
before update on public.organization_members
for each row execute function public.set_update_date();

alter table public.organization_members enable row level security;

drop policy if exists "organization_members_authenticated_all" on public.organization_members;
create policy "organization_members_authenticated_all"
  on public.organization_members for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.organization_members to authenticated;

-- ---------------------------------------------------------------------------
-- 3. user_agent_settings
-- ---------------------------------------------------------------------------

create table if not exists public.user_agent_settings (
  user_id uuid primary key
    references auth.users (id) on delete cascade,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  legal_first_name text,
  legal_middle_name text,
  legal_last_name text,
  preferred_name text,
  display_name text,
  email text,
  phone text,
  phone_alternate text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state char(2) default 'TX',
  zip text,
  trec_license_number text,
  title text,

  constraint user_agent_settings_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED'))
);

create index if not exists user_agent_settings_status_idx
  on public.user_agent_settings (status);

drop trigger if exists user_agent_settings_set_update_date on public.user_agent_settings;
create trigger user_agent_settings_set_update_date
before update on public.user_agent_settings
for each row execute function public.set_update_date();

alter table public.user_agent_settings enable row level security;

drop policy if exists "user_agent_settings_authenticated_all" on public.user_agent_settings;
create policy "user_agent_settings_authenticated_all"
  on public.user_agent_settings for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.user_agent_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 4. profiles: role + identity + primary organization
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists app_role text not null default 'USER',
  add column if not exists preferred_name text,
  add column if not exists display_name text,
  add column if not exists primary_organization_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_app_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_app_role_check
      check (app_role in ('ADMIN', 'USER'));
  end if;
end $$;

create index if not exists profiles_app_role_idx
  on public.profiles (app_role)
  where status = 'ACTIVE';

create index if not exists profiles_primary_organization_id_idx
  on public.profiles (primary_organization_id)
  where status = 'ACTIVE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_primary_organization_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_primary_organization_id_fkey
      foreign key (primary_organization_id)
      references public.organizations (id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Seed Davey Goosmann Realty org + admin membership + profile/agent
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := 'e26c8f57-c0aa-4474-b43e-6e15f0260e99';
  v_org_id uuid;
begin
  if not exists (select 1 from auth.users where id = v_admin) then
    raise exception 'Phase A abort: initial admin auth user % not found', v_admin;
  end if;

  select id into v_org_id
  from public.organizations
  where status = 'ACTIVE'
    and lower(coalesce(brokerage_license_number, '')) = lower('9006865')
    and lower(name) = lower('Davey Goosmann Realty')
  limit 1;

  if v_org_id is null then
    insert into public.organizations (
      name,
      legal_name,
      organization_type,
      email,
      phone,
      address_line_1,
      city,
      state,
      zip,
      brokerage_license_number,
      broker_first_name,
      broker_last_name,
      broker_license_number,
      broker_phone,
      broker_email,
      status
    )
    values (
      'Davey Goosmann Realty',
      'Davey Goosmann Realty',
      'BROKERAGE',
      'deedavey50@gmail.com',
      '817-539-9434',
      '600 Strata Cir. #212',
      'Mansfield',
      'TX',
      '76063',
      '9006865',
      'Dee',
      'Davey',
      '0283607',
      '817-228-8150',
      'deedavey50@gmail.com',
      'ACTIVE'
    )
    returning id into v_org_id;
  end if;

  if v_org_id is null then
    raise exception 'Phase A abort: failed to seed Davey Goosmann Realty organization';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    membership_role,
    status
  )
  select v_org_id, v_admin, 'ORG_ADMIN', 'ACTIVE'
  where not exists (
    select 1 from public.organization_members
    where organization_id = v_org_id
      and user_id = v_admin
      and status = 'ACTIVE'
  );

  insert into public.profiles (
    id,
    email,
    first_name,
    middle_name,
    last_name,
    preferred_name,
    display_name,
    app_role,
    status,
    primary_organization_id
  )
  values (
    v_admin,
    'lee@leeharbaugh.com',
    'Kenneth',
    'Lee',
    'Harbaugh',
    'Lee',
    'Lee Harbaugh',
    'ADMIN',
    'ACTIVE',
    v_org_id
  )
  on conflict (id) do update
  set
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    preferred_name = excluded.preferred_name,
    display_name = excluded.display_name,
    app_role = 'ADMIN',
    primary_organization_id = excluded.primary_organization_id,
    status = 'ACTIVE',
    update_date = now();

  insert into public.user_agent_settings (
    user_id,
    legal_first_name,
    legal_middle_name,
    legal_last_name,
    preferred_name,
    display_name,
    email,
    phone,
    address_line_1,
    city,
    state,
    zip,
    trec_license_number,
    status
  )
  values (
    v_admin,
    'Kenneth',
    'Lee',
    'Harbaugh',
    'Lee',
    'Lee Harbaugh',
    'lee@harbaughbrothers.com',
    '817-881-4768',
    '5801 Chatsworth Ct.',
    'Arlington',
    'TX',
    '76018',
    '0712335',
    'ACTIVE'
  )
  on conflict (user_id) do update
  set
    legal_first_name = excluded.legal_first_name,
    legal_middle_name = excluded.legal_middle_name,
    legal_last_name = excluded.legal_last_name,
    preferred_name = excluded.preferred_name,
    display_name = excluded.display_name,
    email = excluded.email,
    phone = excluded.phone,
    address_line_1 = excluded.address_line_1,
    city = excluded.city,
    state = excluded.state,
    zip = excluded.zip,
    trec_license_number = excluded.trec_license_number,
    status = 'ACTIVE',
    update_date = now();
end $$;

-- ---------------------------------------------------------------------------
-- 6. Ownership / scope columns
-- ---------------------------------------------------------------------------

alter table public.packet_forms
  add column if not exists owner_user_id uuid
    references auth.users (id) on delete set null;

alter table public.representation_agreements
  add column if not exists owner_user_id uuid
    references auth.users (id) on delete set null;

alter table public.collections
  add column if not exists scope varchar(20),
  add column if not exists organization_id uuid
    references public.organizations (id) on delete set null;

alter table public.forms
  add column if not exists scope varchar(20),
  add column if not exists organization_id uuid
    references public.organizations (id) on delete set null;

alter table public.fields
  add column if not exists owner_user_id uuid
    references auth.users (id) on delete set null,
  add column if not exists scope varchar(20),
  add column if not exists organization_id uuid
    references public.organizations (id) on delete set null;

create index if not exists packet_forms_owner_user_id_idx
  on public.packet_forms (owner_user_id)
  where status = 'ACTIVE';

create index if not exists representation_agreements_owner_user_id_idx
  on public.representation_agreements (owner_user_id)
  where status = 'ACTIVE';

create index if not exists collections_scope_idx
  on public.collections (scope)
  where status = 'ACTIVE';

create index if not exists forms_scope_idx
  on public.forms (scope)
  where status = 'ACTIVE';

create index if not exists fields_scope_idx
  on public.fields (scope)
  where status = 'ACTIVE';

create index if not exists fields_owner_user_id_idx
  on public.fields (owner_user_id)
  where status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 7. Validate global collections (exact ID + name) then backfill
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := 'e26c8f57-c0aa-4474-b43e-6e15f0260e99';
  v_mismatch text;
begin
  select string_agg(format('id=%s expected=%s actual=%s', e.id, e.expected_name, c.collection_name), '; ')
  into v_mismatch
  from (
    values
      (1::bigint, 'Buyer Rep Packet'),
      (2::bigint, 'Residential Sales Listing Packet'),
      (3::bigint, 'Contract Offer'),
      (5::bigint, 'Residential Lease Listing')
  ) as e(id, expected_name)
  left join public.collections c on c.id = e.id
  where c.id is null
     or c.collection_name is distinct from e.expected_name;

  if v_mismatch is not null then
    raise exception 'Phase A abort: global collection ID/name mismatch: %', v_mismatch;
  end if;

  if not exists (
    select 1 from public.collections
    where id = 4 and collection_name = 'Test Packet' and status = 'DELETED'
  ) then
    raise exception 'Phase A abort: collection ID 4 is not DELETED Test Packet as expected';
  end if;

  -- Private owner business records (all statuses)
  update public.contacts
  set owner_user_id = v_admin
  where owner_user_id is distinct from v_admin;

  update public.properties
  set owner_user_id = v_admin
  where owner_user_id is distinct from v_admin;

  update public.packets
  set owner_user_id = v_admin
  where owner_user_id is distinct from v_admin;

  update public.representation_agreements
  set owner_user_id = v_admin
  where owner_user_id is distinct from v_admin;

  update public.packet_forms pf
  set owner_user_id = p.owner_user_id
  from public.packets p
  where pf.packet_id = p.id
    and pf.owner_user_id is distinct from p.owner_user_id;

  -- Forms / fields → GLOBAL library
  update public.forms
  set
    scope = 'GLOBAL',
    owner_user_id = null,
    organization_id = null
  where scope is distinct from 'GLOBAL'
     or owner_user_id is not null
     or organization_id is not null;

  update public.fields
  set
    scope = 'GLOBAL',
    owner_user_id = null,
    organization_id = null
  where scope is distinct from 'GLOBAL'
     or owner_user_id is not null
     or organization_id is not null;

  -- Collections 1,2,3,5 → GLOBAL
  update public.collections
  set
    scope = 'GLOBAL',
    owner_user_id = null,
    organization_id = null
  where id in (1, 2, 3, 5);

  -- Collection 4 Test Packet → PRIVATE (remain DELETED)
  update public.collections
  set
    scope = 'PRIVATE',
    owner_user_id = v_admin,
    organization_id = null
  where id = 4;
end $$;

-- Defaults for future inserts (after backfill)
alter table public.forms
  alter column scope set default 'PRIVATE';

alter table public.collections
  alter column scope set default 'PRIVATE';

alter table public.fields
  alter column scope set default 'PRIVATE';

-- ---------------------------------------------------------------------------
-- 8. Check constraints (scope combos + ACTIVE ownership)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'forms_scope_check'
      and conrelid = 'public.forms'::regclass
  ) then
    alter table public.forms
      add constraint forms_scope_check
      check (scope in ('GLOBAL', 'PRIVATE', 'ORGANIZATION'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'forms_scope_combo_check'
      and conrelid = 'public.forms'::regclass
  ) then
    alter table public.forms
      add constraint forms_scope_combo_check
      check (
        (scope = 'GLOBAL' and owner_user_id is null and organization_id is null)
        or (scope = 'PRIVATE' and owner_user_id is not null)
        or (scope = 'ORGANIZATION' and organization_id is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'collections_scope_check'
      and conrelid = 'public.collections'::regclass
  ) then
    alter table public.collections
      add constraint collections_scope_check
      check (scope in ('GLOBAL', 'PRIVATE', 'ORGANIZATION'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'collections_scope_combo_check'
      and conrelid = 'public.collections'::regclass
  ) then
    alter table public.collections
      add constraint collections_scope_combo_check
      check (
        (scope = 'GLOBAL' and owner_user_id is null and organization_id is null)
        or (scope = 'PRIVATE' and owner_user_id is not null)
        or (scope = 'ORGANIZATION' and organization_id is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fields_scope_check'
      and conrelid = 'public.fields'::regclass
  ) then
    alter table public.fields
      add constraint fields_scope_check
      check (scope in ('GLOBAL', 'PRIVATE', 'ORGANIZATION'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fields_scope_combo_check'
      and conrelid = 'public.fields'::regclass
  ) then
    alter table public.fields
      add constraint fields_scope_combo_check
      check (
        (scope = 'GLOBAL' and owner_user_id is null and organization_id is null)
        or (scope = 'PRIVATE' and owner_user_id is not null)
        or (scope = 'ORGANIZATION' and organization_id is not null)
      );
  end if;

  -- Require owner on ACTIVE private business records
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_active_requires_owner'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_active_requires_owner
      check (status <> 'ACTIVE' or owner_user_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'properties_active_requires_owner'
      and conrelid = 'public.properties'::regclass
  ) then
    alter table public.properties
      add constraint properties_active_requires_owner
      check (status <> 'ACTIVE' or owner_user_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'packets_active_requires_owner'
      and conrelid = 'public.packets'::regclass
  ) then
    alter table public.packets
      add constraint packets_active_requires_owner
      check (status <> 'ACTIVE' or owner_user_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'representation_agreements_active_requires_owner'
      and conrelid = 'public.representation_agreements'::regclass
  ) then
    alter table public.representation_agreements
      add constraint representation_agreements_active_requires_owner
      check (status <> 'ACTIVE' or owner_user_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'packet_forms_active_requires_owner'
      and conrelid = 'public.packet_forms'::regclass
  ) then
    alter table public.packet_forms
      add constraint packet_forms_active_requires_owner
      check (status <> 'ACTIVE' or owner_user_id is not null);
  end if;
end $$;

-- Not-null scope after backfill
alter table public.forms
  alter column scope set not null;

alter table public.collections
  alter column scope set not null;

alter table public.fields
  alter column scope set not null;

-- ---------------------------------------------------------------------------
-- 9. Scoped unique indexes (create new, then drop old blockers)
-- ---------------------------------------------------------------------------

-- Preflight: fail if replacements would collide
do $$
declare
  v_dup text;
begin
  select string_agg(owner_user_id::text || ':' || addr, ', ')
  into v_dup
  from (
    select
      owner_user_id,
      lower(street_address) || '|' || coalesce(lower(unit), '') || '|' ||
        lower(city) || '|' || state || '|' || zip as addr,
      count(*) as c
    from public.properties
    where status = 'ACTIVE'
    group by 1, 2
    having count(*) > 1
  ) d;
  if v_dup is not null then
    raise exception 'Phase A abort: duplicate active property addresses per owner: %', v_dup;
  end if;
end $$;

create unique index if not exists properties_owner_address_active_uidx
  on public.properties (
    owner_user_id,
    lower(street_address),
    coalesce(lower(unit), ''),
    lower(city),
    state,
    zip
  )
  where status = 'ACTIVE';

create unique index if not exists forms_global_code_version_active_uidx
  on public.forms (lower(form_code), coalesce(version_label, ''))
  where status = 'ACTIVE' and scope = 'GLOBAL';

create unique index if not exists forms_private_owner_code_version_active_uidx
  on public.forms (owner_user_id, lower(form_code), coalesce(version_label, ''))
  where status = 'ACTIVE' and scope = 'PRIVATE';

create unique index if not exists forms_organization_code_version_active_uidx
  on public.forms (organization_id, lower(form_code), coalesce(version_label, ''))
  where status = 'ACTIVE' and scope = 'ORGANIZATION';

create unique index if not exists collections_global_name_active_uidx
  on public.collections (lower(collection_name))
  where status = 'ACTIVE' and scope = 'GLOBAL';

create unique index if not exists collections_private_owner_name_active_uidx
  on public.collections (owner_user_id, lower(collection_name))
  where status = 'ACTIVE' and scope = 'PRIVATE';

create unique index if not exists collections_organization_name_active_uidx
  on public.collections (organization_id, lower(collection_name))
  where status = 'ACTIVE' and scope = 'ORGANIZATION';

create unique index if not exists fields_global_field_key_active_uidx
  on public.fields (lower(field_key))
  where status = 'ACTIVE' and scope = 'GLOBAL';

create unique index if not exists fields_private_owner_field_key_active_uidx
  on public.fields (owner_user_id, lower(field_key))
  where status = 'ACTIVE' and scope = 'PRIVATE';

create unique index if not exists fields_organization_field_key_active_uidx
  on public.fields (organization_id, lower(field_key))
  where status = 'ACTIVE' and scope = 'ORGANIZATION';

drop index if exists public.properties_address_active_uidx;
drop index if exists public.forms_code_version_active_uidx;
drop index if exists public.collections_name_active_uidx;
drop index if exists public.fields_field_key_active_uidx;

-- ---------------------------------------------------------------------------
-- 10. Helper: is_app_admin()
-- ---------------------------------------------------------------------------

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'ACTIVE'
      and app_role = 'ADMIN'
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Protect profiles.app_role (cannot self-elevate via client)
-- ---------------------------------------------------------------------------

create or replace function public.profiles_protect_app_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No JWT (migrations / service role SQL): allow trusted server updates.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.app_role is distinct from 'USER' and not public.is_app_admin() then
      new.app_role := 'USER';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.app_role is distinct from old.app_role and not public.is_app_admin() then
      raise exception 'Only an application ADMIN may change profiles.app_role';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_app_role on public.profiles;
create trigger profiles_protect_app_role
before insert or update on public.profiles
for each row execute function public.profiles_protect_app_role();

-- ---------------------------------------------------------------------------
-- 12. Owner assignment triggers (force auth.uid for non-admins)
-- ---------------------------------------------------------------------------

create or replace function public.set_row_owner_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if public.is_app_admin() then
        if new.owner_user_id is null then
          new.owner_user_id := auth.uid();
        end if;
      else
        new.owner_user_id := auth.uid();
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.owner_user_id is distinct from old.owner_user_id
       and not public.is_app_admin() then
      new.owner_user_id := old.owner_user_id;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists contacts_set_owner_user_id on public.contacts;
create trigger contacts_set_owner_user_id
before insert or update on public.contacts
for each row execute function public.set_row_owner_user_id();

drop trigger if exists properties_set_owner_user_id on public.properties;
create trigger properties_set_owner_user_id
before insert or update on public.properties
for each row execute function public.set_row_owner_user_id();

drop trigger if exists packets_set_owner_user_id on public.packets;
create trigger packets_set_owner_user_id
before insert or update on public.packets
for each row execute function public.set_row_owner_user_id();

drop trigger if exists representation_agreements_set_owner_user_id
  on public.representation_agreements;
create trigger representation_agreements_set_owner_user_id
before insert or update on public.representation_agreements
for each row execute function public.set_row_owner_user_id();

-- Scoped library rows: default PRIVATE + owner for non-global inserts
create or replace function public.set_scoped_library_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope is null then
    new.scope := 'PRIVATE';
  end if;

  if new.scope = 'GLOBAL' then
    if not public.is_app_admin() then
      -- Non-admins cannot create or convert rows to GLOBAL
      new.scope := 'PRIVATE';
    end if;
  end if;

  if new.scope = 'ORGANIZATION' then
    if not public.is_app_admin() then
      new.scope := 'PRIVATE';
      new.organization_id := null;
    end if;
  end if;

  if new.scope = 'GLOBAL' then
    new.owner_user_id := null;
    new.organization_id := null;
  elsif new.scope = 'PRIVATE' then
    new.organization_id := null;
    if auth.uid() is not null then
      if public.is_app_admin() then
        if new.owner_user_id is null then
          new.owner_user_id := auth.uid();
        end if;
      else
        new.owner_user_id := auth.uid();
      end if;
    end if;
  elsif new.scope = 'ORGANIZATION' then
    new.owner_user_id := null;
  end if;

  if tg_op = 'UPDATE'
     and not public.is_app_admin()
     and (
       new.scope is distinct from old.scope
       or new.owner_user_id is distinct from old.owner_user_id
       or new.organization_id is distinct from old.organization_id
     ) then
    -- Non-admins keep prior ownership/scope classification
    new.scope := old.scope;
    new.owner_user_id := old.owner_user_id;
    new.organization_id := old.organization_id;
  end if;

  return new;
end;
$$;

drop trigger if exists forms_set_scoped_library_ownership on public.forms;
create trigger forms_set_scoped_library_ownership
before insert or update on public.forms
for each row execute function public.set_scoped_library_ownership();

drop trigger if exists collections_set_scoped_library_ownership on public.collections;
create trigger collections_set_scoped_library_ownership
before insert or update on public.collections
for each row execute function public.set_scoped_library_ownership();

drop trigger if exists fields_set_scoped_library_ownership on public.fields;
create trigger fields_set_scoped_library_ownership
before insert or update on public.fields
for each row execute function public.set_scoped_library_ownership();

-- ---------------------------------------------------------------------------
-- 13. packet_forms.owner_user_id sync from parent packet
-- ---------------------------------------------------------------------------

create or replace function public.sync_packet_form_owner_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_user_id into v_owner
  from public.packets
  where id = new.packet_id;

  if v_owner is null then
    raise exception
      'packet_forms require a parent packet with owner_user_id (packet_id=%)',
      new.packet_id;
  end if;

  -- Always derive from parent; ignore/overwrite client-supplied owner.
  new.owner_user_id := v_owner;
  return new;
end;
$$;

drop trigger if exists packet_forms_sync_owner_user_id on public.packet_forms;
create trigger packet_forms_sync_owner_user_id
before insert or update of packet_id, owner_user_id on public.packet_forms
for each row execute function public.sync_packet_form_owner_user_id();

create or replace function public.cascade_packet_owner_to_packet_forms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    update public.packet_forms
    set owner_user_id = new.owner_user_id
    where packet_id = new.id
      and owner_user_id is distinct from new.owner_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists packets_cascade_owner_to_packet_forms on public.packets;
create trigger packets_cascade_owner_to_packet_forms
after update of owner_user_id on public.packets
for each row execute function public.cascade_packet_owner_to_packet_forms();

-- ---------------------------------------------------------------------------
-- 14. Final integrity checks inside the migration
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := 'e26c8f57-c0aa-4474-b43e-6e15f0260e99';
  v_cnt integer;
begin
  select count(*) into v_cnt from public.profiles
  where id = v_admin and app_role = 'ADMIN' and status = 'ACTIVE';
  if v_cnt <> 1 then
    raise exception 'Phase A abort: admin profile not configured';
  end if;

  select count(*) into v_cnt from public.contacts where owner_user_id is null;
  if v_cnt <> 0 then
    raise exception 'Phase A abort: % contacts still lack owner', v_cnt;
  end if;

  select count(*) into v_cnt from public.properties where owner_user_id is null;
  if v_cnt <> 0 then
    raise exception 'Phase A abort: % properties still lack owner', v_cnt;
  end if;

  select count(*) into v_cnt from public.packets where owner_user_id is null;
  if v_cnt <> 0 then
    raise exception 'Phase A abort: % packets still lack owner', v_cnt;
  end if;

  select count(*) into v_cnt from public.packet_forms where owner_user_id is null;
  if v_cnt <> 0 then
    raise exception 'Phase A abort: % packet_forms still lack owner', v_cnt;
  end if;

  select count(*) into v_cnt
  from public.packet_forms pf
  join public.packets p on p.id = pf.packet_id
  where pf.owner_user_id is distinct from p.owner_user_id;
  if v_cnt <> 0 then
    raise exception 'Phase A abort: % packet_forms owner mismatch vs packet', v_cnt;
  end if;

  select count(*) into v_cnt from public.forms where scope = 'GLOBAL';
  if v_cnt <> 18 then
    raise exception 'Phase A abort: expected 18 GLOBAL forms, found %', v_cnt;
  end if;

  select count(*) into v_cnt
  from public.collections
  where id in (1, 2, 3, 5) and scope = 'GLOBAL' and owner_user_id is null;
  if v_cnt <> 4 then
    raise exception 'Phase A abort: expected 4 GLOBAL collections, found %', v_cnt;
  end if;

  select count(*) into v_cnt
  from public.collections
  where id = 4 and scope = 'PRIVATE' and owner_user_id = v_admin and status = 'DELETED';
  if v_cnt <> 1 then
    raise exception 'Phase A abort: Test Packet (id 4) not PRIVATE/DELETED/owned';
  end if;
end $$;

commit;
