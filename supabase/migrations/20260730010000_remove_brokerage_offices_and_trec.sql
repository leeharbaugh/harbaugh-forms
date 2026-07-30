-- Remove abandoned brokerage-office and TREC verification schema.
-- Retains audit_settings and audit_events (minus unused brokerage_office_id).
-- Forward-only. No CASCADE. Development-only application for this branch.
-- Target: harbaugh-forms-dev (ewxsxwzezhkeawnjvigx).

begin;

-- ---------------------------------------------------------------------------
-- 1. Remove unused audit_events.brokerage_office_id before dropping offices
-- ---------------------------------------------------------------------------

alter table public.audit_events
  drop column if exists brokerage_office_id;

-- ---------------------------------------------------------------------------
-- 2. Clear membership office assignments, then drop office FK / trigger / column
-- ---------------------------------------------------------------------------

update public.organization_members
set brokerage_office_id = null
where brokerage_office_id is not null;

drop trigger if exists organization_members_office_org_match_trg
  on public.organization_members;

drop function if exists public.organization_members_office_org_match();

alter table public.organization_members
  drop constraint if exists organization_members_brokerage_office_id_fkey;

drop index if exists public.organization_members_brokerage_office_id_idx;

alter table public.organization_members
  drop column if exists brokerage_office_id;

-- ---------------------------------------------------------------------------
-- 3. Drop brokerage_offices (policies, trigger, indexes, table)
-- ---------------------------------------------------------------------------

drop policy if exists "brokerage_offices_select" on public.brokerage_offices;
drop policy if exists "brokerage_offices_insert" on public.brokerage_offices;
drop policy if exists "brokerage_offices_update" on public.brokerage_offices;

drop trigger if exists brokerage_offices_set_update_date on public.brokerage_offices;

drop index if exists public.brokerage_offices_organization_id_idx;
drop index if exists public.brokerage_offices_status_idx;
drop index if exists public.brokerage_offices_org_name_active_uidx;
drop index if exists public.brokerage_offices_one_main_active_uidx;

drop table if exists public.brokerage_offices;

-- ---------------------------------------------------------------------------
-- 4. Remove TREC verification metadata from user_agent_settings
-- ---------------------------------------------------------------------------

alter table public.user_agent_settings
  drop constraint if exists user_agent_settings_license_verification_source_check;

alter table public.user_agent_settings
  drop constraint if exists user_agent_settings_license_verified_by_user_id_fkey;

alter table public.user_agent_settings
  drop column if exists trec_license_type,
  drop column if exists trec_reported_full_name,
  drop column if exists trec_license_status,
  drop column if exists trec_expiration_date,
  drop column if exists trec_related_license_number,
  drop column if exists trec_related_license_name,
  drop column if exists trec_lookup_at,
  drop column if exists license_verified_at,
  drop column if exists license_verification_source,
  drop column if exists license_manual_override_reason,
  drop column if exists license_verified_by_user_id;

-- Keep preexisting user_agent_settings.trec_license_number (manual license field).

-- ---------------------------------------------------------------------------
-- 5. Remove broker TREC verification metadata from organizations
-- ---------------------------------------------------------------------------

alter table public.organizations
  drop constraint if exists organizations_broker_license_verification_source_check;

alter table public.organizations
  drop constraint if exists organizations_broker_license_verified_by_user_id_fkey;

alter table public.organizations
  drop column if exists broker_trec_license_type,
  drop column if exists broker_trec_reported_full_name,
  drop column if exists broker_trec_license_status,
  drop column if exists broker_trec_expiration_date,
  drop column if exists broker_trec_related_license_number,
  drop column if exists broker_trec_related_license_name,
  drop column if exists broker_trec_lookup_at,
  drop column if exists broker_license_verified_at,
  drop column if exists broker_license_verification_source,
  drop column if exists broker_license_manual_override_reason,
  drop column if exists broker_license_verified_by_user_id;

-- Keep preexisting organizations.broker_license_number and related broker identity fields.

commit;
