-- Native Signing: Transaction Coordinator / operator authority foundation.
-- Forward-only. Development only. Do not apply to production from this stage.
--
-- Adds:
--   signing_operator_delegations  — persistent TC → responsible User grants
--   signing_operator_associations — Signing-scoped TC operators (not agents)
-- Extends signing_events.actor_type with TRANSACTION_COORDINATOR.
-- Generalizes amendment locks so a TC operator (or agent) may hold them.
-- Adds signings.created_by_user_id for durable creator provenance.

begin;

-- ---------------------------------------------------------------------------
-- 1. Creator provenance on Signing root
-- ---------------------------------------------------------------------------

alter table public.signings
  add column if not exists created_by_user_id uuid
    references public.profiles (id) on delete set null;

comment on column public.signings.created_by_user_id is
  'Actual User who created the Signing (may be a TC). Distinct from original_sender_* and PRIMARY association (responsible agent/broker).';

-- Backfill existing development rows: creator was historically the original sender.
update public.signings
set created_by_user_id = original_sender_user_id
where created_by_user_id is null
  and original_sender_user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Persistent operator delegations (many-to-many)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_operator_delegations (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  responsible_user_id uuid not null
    references public.profiles (id) on delete restrict,
  delegate_user_id uuid not null
    references public.profiles (id) on delete restrict,

  operator_role text not null default 'TRANSACTION_COORDINATOR',
  status text not null default 'ACTIVE',

  granted_by_user_id uuid
    references public.profiles (id) on delete set null,
  effective_started_at timestamptz not null default now(),
  effective_ended_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid
    references public.profiles (id) on delete set null,
  revoke_reason text,

  constraint sod_operator_role_check
    check (operator_role = 'TRANSACTION_COORDINATOR'),
  constraint sod_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'REVOKED')),
  constraint sod_delegate_ne_responsible
    check (delegate_user_id <> responsible_user_id),
  constraint sod_effective_range
    check (
      effective_ended_at is null
      or effective_ended_at >= effective_started_at
    ),
  constraint sod_revoked_consistency
    check (
      (status = 'REVOKED' and revoked_at is not null)
      or (status <> 'REVOKED' and revoked_at is null)
    )
);

create unique index if not exists sod_one_active_delegation_uidx
  on public.signing_operator_delegations (
    organization_id,
    responsible_user_id,
    delegate_user_id,
    operator_role
  )
  where status = 'ACTIVE' and revoked_at is null and effective_ended_at is null;

create index if not exists sod_delegate_active_idx
  on public.signing_operator_delegations (delegate_user_id, organization_id)
  where status = 'ACTIVE';

create index if not exists sod_responsible_active_idx
  on public.signing_operator_delegations (responsible_user_id, organization_id)
  where status = 'ACTIVE';

drop trigger if exists signing_operator_delegations_set_update_date
  on public.signing_operator_delegations;
create trigger signing_operator_delegations_set_update_date
before update on public.signing_operator_delegations
for each row execute function public.set_update_date();

comment on table public.signing_operator_delegations is
  'Persistent Transaction Coordinator grants: delegate may administer Signings for a responsible User in an organization. Not an agent association.';

-- ---------------------------------------------------------------------------
-- 3. Signing-scoped operator associations
-- ---------------------------------------------------------------------------

create table if not exists public.signing_operator_associations (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  operator_user_id uuid not null
    references public.profiles (id) on delete restrict,

  operator_role text not null default 'TRANSACTION_COORDINATOR',
  operator_display_name text not null,
  operator_email text,
  status text not null default 'ACTIVE',

  signing_operator_delegation_id uuid
    references public.signing_operator_delegations (id) on delete restrict,

  effective_started_at timestamptz not null default now(),
  effective_ended_at timestamptz,
  end_reason text,
  added_by_user_id uuid
    references public.profiles (id) on delete set null,
  ended_by_user_id uuid
    references public.profiles (id) on delete set null,

  constraint soa_operator_role_check
    check (operator_role = 'TRANSACTION_COORDINATOR'),
  constraint soa_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'ENDED')),
  constraint soa_display_name_not_blank
    check (length(trim(operator_display_name)) > 0),
  constraint soa_effective_range
    check (
      effective_ended_at is null
      or effective_ended_at >= effective_started_at
    ),
  constraint soa_signing_id_id_key
    unique (signing_id, id)
);

create unique index if not exists soa_one_active_operator_uidx
  on public.signing_operator_associations (
    signing_id,
    operator_user_id,
    operator_role
  )
  where status = 'ACTIVE' and effective_ended_at is null;

create index if not exists soa_operator_user_idx
  on public.signing_operator_associations (operator_user_id);

create index if not exists soa_signing_id_idx
  on public.signing_operator_associations (signing_id);

drop trigger if exists signing_operator_associations_set_update_date
  on public.signing_operator_associations;
create trigger signing_operator_associations_set_update_date
before update on public.signing_operator_associations
for each row execute function public.set_update_date();

comment on table public.signing_operator_associations is
  'Signing-scoped Transaction Coordinator operators. Distinct from signing_agent_associations (PRIMARY/CO_AGENT only).';

-- ---------------------------------------------------------------------------
-- 4. Event actor vocabulary: TRANSACTION_COORDINATOR
-- ---------------------------------------------------------------------------

alter table public.signing_events
  drop constraint if exists signing_events_actor_type_check;

alter table public.signing_events
  add constraint signing_events_actor_type_check
  check (
    actor_type in (
      'PRIMARY_AGENT',
      'CO_AGENT',
      'TRANSACTION_COORDINATOR',
      'BROKERAGE_ADMINISTRATOR',
      'PARTICIPANT',
      'SYSTEM_ADMINISTRATOR',
      'SYSTEM'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Amendment locks: allow agent association OR operator association holder
-- ---------------------------------------------------------------------------

alter table public.signing_amendment_locks
  alter column held_by_agent_association_id drop not null;

alter table public.signing_amendment_locks
  add column if not exists held_by_operator_association_id uuid;

alter table public.signing_amendment_locks
  add column if not exists held_by_user_id uuid
    references public.profiles (id) on delete restrict;

-- Existing rows: backfill holder User from agent association.
update public.signing_amendment_locks l
set held_by_user_id = a.agent_user_id
from public.signing_agent_associations a
where l.held_by_agent_association_id = a.id
  and l.held_by_user_id is null
  and a.agent_user_id is not null;

alter table public.signing_amendment_locks
  drop constraint if exists sal_holder_xor;

alter table public.signing_amendment_locks
  add constraint sal_holder_xor
  check (
    (
      held_by_agent_association_id is not null
      and held_by_operator_association_id is null
    )
    or (
      held_by_agent_association_id is null
      and held_by_operator_association_id is not null
    )
  );

alter table public.signing_amendment_locks
  drop constraint if exists sal_operator_same_signing_fkey;

alter table public.signing_amendment_locks
  add constraint sal_operator_same_signing_fkey
  foreign key (signing_id, held_by_operator_association_id)
  references public.signing_operator_associations (signing_id, id)
  on delete restrict;

comment on table public.signing_amendment_locks is
  'Exclusive pre-signature amendment locks. Holder is an agent association or a TC operator association; held_by_user_id is the authenticated workspace User.';

-- ---------------------------------------------------------------------------
-- 6. Deny-by-default RLS
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'signing_operator_delegations',
    'signing_operator_associations'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_deny_authenticated', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (false) with check (false)',
      t || '_deny_authenticated', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_deny_anon', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to anon using (false) with check (false)',
      t || '_deny_anon', t
    );

    execute format('drop policy if exists account_state_application_gate on public.%I', t);
    execute format(
      'create policy account_state_application_gate on public.%I as restrictive for all to authenticated using (public.has_application_access()) with check (public.has_application_access())',
      t
    );

    execute format('revoke all on table public.%I from public', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from authenticated', t);
  end loop;
end $$;

commit;
