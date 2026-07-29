-- Brokerage offices, TREC verification metadata, and business audit logging.
-- Forward-only. No CASCADE. Soft-delete conventions preserved.
-- Target: harbaugh-forms-dev only during feature development.

begin;

-- ---------------------------------------------------------------------------
-- 1. brokerage_offices (normalized branch/office under an organization)
-- ---------------------------------------------------------------------------

create table if not exists public.brokerage_offices (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  organization_id uuid not null
    references public.organizations (id) on delete restrict,

  office_name text not null,
  address_line_1 text,
  address_line_2 text,
  city text,
  state char(2) default 'TX',
  zip text,
  office_phone text,
  branch_license_number text,
  is_main_office boolean not null default false,

  constraint brokerage_offices_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint brokerage_offices_office_name_not_blank
    check (length(trim(office_name)) > 0)
);

create index if not exists brokerage_offices_organization_id_idx
  on public.brokerage_offices (organization_id)
  where status <> 'DELETED';

create index if not exists brokerage_offices_status_idx
  on public.brokerage_offices (status);

create unique index if not exists brokerage_offices_org_name_active_uidx
  on public.brokerage_offices (organization_id, lower(office_name))
  where status = 'ACTIVE';

create unique index if not exists brokerage_offices_one_main_active_uidx
  on public.brokerage_offices (organization_id)
  where status = 'ACTIVE' and is_main_office = true;

drop trigger if exists brokerage_offices_set_update_date on public.brokerage_offices;
create trigger brokerage_offices_set_update_date
before update on public.brokerage_offices
for each row execute function public.set_update_date();

alter table public.brokerage_offices enable row level security;

drop policy if exists "brokerage_offices_select" on public.brokerage_offices;
drop policy if exists "brokerage_offices_insert" on public.brokerage_offices;
drop policy if exists "brokerage_offices_update" on public.brokerage_offices;

create policy "brokerage_offices_select"
  on public.brokerage_offices
  for select
  to authenticated
  using (
    public.is_app_admin()
    or public.is_active_organization_member(organization_id)
  );

create policy "brokerage_offices_insert"
  on public.brokerage_offices
  for insert
  to authenticated
  with check (public.is_app_admin());

create policy "brokerage_offices_update"
  on public.brokerage_offices
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

grant select, insert, update on table public.brokerage_offices to authenticated;
revoke delete on table public.brokerage_offices from authenticated;

-- ---------------------------------------------------------------------------
-- 2. organization_members.brokerage_office_id
-- ---------------------------------------------------------------------------

alter table public.organization_members
  add column if not exists brokerage_office_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_members_brokerage_office_id_fkey'
      and conrelid = 'public.organization_members'::regclass
  ) then
    alter table public.organization_members
      add constraint organization_members_brokerage_office_id_fkey
      foreign key (brokerage_office_id)
      references public.brokerage_offices (id)
      on delete restrict;
  end if;
end $$;

create index if not exists organization_members_brokerage_office_id_idx
  on public.organization_members (brokerage_office_id)
  where status = 'ACTIVE' and brokerage_office_id is not null;

-- Office must belong to the same organization when set.
create or replace function public.organization_members_office_org_match()
returns trigger
language plpgsql
as $$
declare
  v_office_org uuid;
begin
  if new.brokerage_office_id is null then
    return new;
  end if;

  select organization_id into v_office_org
  from public.brokerage_offices
  where id = new.brokerage_office_id
    and status <> 'DELETED';

  if v_office_org is null then
    raise exception 'brokerage_office_id % is missing or deleted', new.brokerage_office_id;
  end if;

  if v_office_org <> new.organization_id then
    raise exception 'brokerage office does not belong to membership organization';
  end if;

  return new;
end;
$$;

drop trigger if exists organization_members_office_org_match_trg
  on public.organization_members;
create trigger organization_members_office_org_match_trg
before insert or update of brokerage_office_id, organization_id
on public.organization_members
for each row execute function public.organization_members_office_org_match();

-- ---------------------------------------------------------------------------
-- 3. TREC verification metadata on user_agent_settings
-- ---------------------------------------------------------------------------

alter table public.user_agent_settings
  add column if not exists trec_license_type text,
  add column if not exists trec_reported_full_name text,
  add column if not exists trec_license_status text,
  add column if not exists trec_expiration_date date,
  add column if not exists trec_related_license_number text,
  add column if not exists trec_related_license_name text,
  add column if not exists trec_lookup_at timestamptz,
  add column if not exists license_verified_at timestamptz,
  add column if not exists license_verification_source text,
  add column if not exists license_manual_override_reason text,
  add column if not exists license_verified_by_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_agent_settings_license_verification_source_check'
      and conrelid = 'public.user_agent_settings'::regclass
  ) then
    alter table public.user_agent_settings
      add constraint user_agent_settings_license_verification_source_check
      check (
        license_verification_source is null
        or license_verification_source in ('trec', 'manual')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_agent_settings_license_verified_by_user_id_fkey'
      and conrelid = 'public.user_agent_settings'::regclass
  ) then
    alter table public.user_agent_settings
      add constraint user_agent_settings_license_verified_by_user_id_fkey
      foreign key (license_verified_by_user_id)
      references auth.users (id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Broker TREC verification metadata on organizations
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists broker_trec_license_type text,
  add column if not exists broker_trec_reported_full_name text,
  add column if not exists broker_trec_license_status text,
  add column if not exists broker_trec_expiration_date date,
  add column if not exists broker_trec_related_license_number text,
  add column if not exists broker_trec_related_license_name text,
  add column if not exists broker_trec_lookup_at timestamptz,
  add column if not exists broker_license_verified_at timestamptz,
  add column if not exists broker_license_verification_source text,
  add column if not exists broker_license_manual_override_reason text,
  add column if not exists broker_license_verified_by_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_broker_license_verification_source_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_broker_license_verification_source_check
      check (
        broker_license_verification_source is null
        or broker_license_verification_source in ('trec', 'manual')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_broker_license_verified_by_user_id_fkey'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_broker_license_verified_by_user_id_fkey
      foreign key (broker_license_verified_by_user_id)
      references auth.users (id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. audit_settings (singleton ordinary-logging toggle)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_settings (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  ordinary_logging_enabled boolean not null default true,
  last_changed_by_user_id uuid
    references auth.users (id) on delete set null,
  last_changed_at timestamptz,

  constraint audit_settings_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED'))
);

create unique index if not exists audit_settings_one_active_uidx
  on public.audit_settings ((true))
  where status = 'ACTIVE';

drop trigger if exists audit_settings_set_update_date on public.audit_settings;
create trigger audit_settings_set_update_date
before update on public.audit_settings
for each row execute function public.set_update_date();

alter table public.audit_settings enable row level security;

drop policy if exists "audit_settings_select" on public.audit_settings;
drop policy if exists "audit_settings_insert" on public.audit_settings;
drop policy if exists "audit_settings_update" on public.audit_settings;

create policy "audit_settings_select"
  on public.audit_settings
  for select
  to authenticated
  using (public.is_app_admin());

create policy "audit_settings_insert"
  on public.audit_settings
  for insert
  to authenticated
  with check (public.is_app_admin());

create policy "audit_settings_update"
  on public.audit_settings
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

grant select, insert, update on table public.audit_settings to authenticated;
revoke delete on table public.audit_settings from authenticated;
grant usage, select on sequence public.audit_settings_id_seq to authenticated;

insert into public.audit_settings (
  ordinary_logging_enabled,
  status
)
select true, 'ACTIVE'
where not exists (
  select 1 from public.audit_settings where status = 'ACTIVE'
);

-- ---------------------------------------------------------------------------
-- 6. audit_events (append-only business audit log)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',

  event_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_profile_id uuid,
  actor_display_name text,
  actor_role_snapshot text,
  organization_id uuid,
  brokerage_office_id uuid,
  event_category text not null,
  action text not null,
  target_entity_type text,
  target_entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id text,
  success boolean not null default true,
  failure_classification text,
  source_ip text,
  user_agent text,
  is_mandatory boolean not null default false,

  constraint audit_events_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED')),
  constraint audit_events_category_not_blank
    check (length(trim(event_category)) > 0),
  constraint audit_events_action_not_blank
    check (length(trim(action)) > 0),
  constraint audit_events_summary_not_blank
    check (length(trim(summary)) > 0)
);

create index if not exists audit_events_event_at_idx
  on public.audit_events (event_at desc);

create index if not exists audit_events_category_action_idx
  on public.audit_events (event_category, action);

create index if not exists audit_events_actor_user_id_idx
  on public.audit_events (actor_user_id)
  where actor_user_id is not null;

create index if not exists audit_events_organization_id_idx
  on public.audit_events (organization_id)
  where organization_id is not null;

create index if not exists audit_events_target_idx
  on public.audit_events (target_entity_type, target_entity_id);

drop trigger if exists audit_events_set_update_date on public.audit_events;
create trigger audit_events_set_update_date
before update on public.audit_events
for each row execute function public.set_update_date();

-- Prevent ordinary authenticated mutation of audit rows.
create or replace function public.audit_events_append_only_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'audit_events are append-only and cannot be updated';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'audit_events are append-only and cannot be deleted';
  end if;
  return null;
end;
$$;

drop trigger if exists audit_events_append_only_trg on public.audit_events;
create trigger audit_events_append_only_trg
before update or delete on public.audit_events
for each row execute function public.audit_events_append_only_guard();

alter table public.audit_events enable row level security;

drop policy if exists "audit_events_select" on public.audit_events;
drop policy if exists "audit_events_insert" on public.audit_events;
drop policy if exists "audit_events_update" on public.audit_events;
drop policy if exists "audit_events_delete" on public.audit_events;

-- Cross-organization audit visibility is Global Admin only.
create policy "audit_events_select"
  on public.audit_events
  for select
  to authenticated
  using (public.is_app_admin());

-- Browser clients must not insert arbitrary audit rows.
-- Trusted inserts use service_role (bypasses RLS) via application code.
create policy "audit_events_insert"
  on public.audit_events
  for insert
  to authenticated
  with check (false);

create policy "audit_events_update"
  on public.audit_events
  for update
  to authenticated
  using (false)
  with check (false);

create policy "audit_events_delete"
  on public.audit_events
  for delete
  to authenticated
  using (false);

grant select on table public.audit_events to authenticated;
revoke insert, update, delete on table public.audit_events from authenticated;
grant usage, select on sequence public.audit_events_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Seed main office for Davey Goosmann Realty (no org duplication)
-- ---------------------------------------------------------------------------

insert into public.brokerage_offices (
  organization_id,
  office_name,
  address_line_1,
  address_line_2,
  city,
  state,
  zip,
  office_phone,
  is_main_office,
  status
)
select
  o.id,
  'Main Office',
  o.address_line_1,
  o.address_line_2,
  o.city,
  o.state,
  o.zip,
  o.phone,
  true,
  'ACTIVE'
from public.organizations o
where o.status = 'ACTIVE'
  and lower(o.name) = lower('Davey Goosmann Realty')
  and lower(coalesce(o.brokerage_license_number, '')) = lower('9006865')
  and not exists (
    select 1
    from public.brokerage_offices bo
    where bo.organization_id = o.id
      and bo.status = 'ACTIVE'
      and lower(bo.office_name) = lower('Main Office')
  );

-- Assign Lee's DGR membership to the main office when missing.
update public.organization_members om
set brokerage_office_id = bo.id
from public.brokerage_offices bo
join public.organizations o on o.id = bo.organization_id
where om.organization_id = o.id
  and om.user_id = 'e26c8f57-c0aa-4474-b43e-6e15f0260e99'
  and om.status = 'ACTIVE'
  and om.brokerage_office_id is null
  and bo.status = 'ACTIVE'
  and bo.is_main_office = true
  and lower(o.name) = lower('Davey Goosmann Realty')
  and lower(coalesce(o.brokerage_license_number, '')) = lower('9006865');

commit;
