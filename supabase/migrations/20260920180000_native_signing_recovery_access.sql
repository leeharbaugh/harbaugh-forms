-- Native Signing recovery credential/session access gate.
-- Forward-only. Development apply only via deliberate tooling.
--
-- Restored/cloned DBs must not silently reactivate historical participant
-- links, ceremony sessions, completed-package links, or related external
-- Signing access.
--
-- Design (see decisions.md):
-- * access_suspended OR env SIGNING_ACCESS_SUSPENDED=true denies external access.
-- * access_epoch is stamped onto credential/session rows at issuance and
--   checked on every validation. Bumping the epoch invalidates all prior
--   bearers without rewriting evidence.
-- * Missing signing_system_controls row = fail-closed (deny).
--
-- DEV seed choice:
--   Generate epoch E and set access_suspended=false on the existing default
--   row so Stage validators that create NEW credentials keep working.
--   EXISTING credential/session rows are backfilled to sentinel
--   'pre-recovery-access-v0' (distinct from E) so they FAIL validation —
--   fail-closed; do not bless old bearers.
--
-- PRODUCTION / RESTORE procedure (not applied by this migration):
--   Must set access_suspended=true and bump access_epoch before any email or
--   ceremony resumes. Re-issue links after recovery review rather than
--   silently reviving pre-restore bearers. Schema column default for
--   access_suspended remains true so a freshly inserted controls row without
--   explicit initialization fails closed.

begin;

-- ---------------------------------------------------------------------------
-- 1. Extend signing_system_controls with access suspension + epoch
-- ---------------------------------------------------------------------------

alter table public.signing_system_controls
  add column if not exists access_suspended boolean not null default true;

alter table public.signing_system_controls
  add column if not exists access_epoch text;

alter table public.signing_system_controls
  add column if not exists access_suspended_at timestamptz;

alter table public.signing_system_controls
  add column if not exists access_suspended_by_note text;

alter table public.signing_system_controls
  add column if not exists access_resumed_at timestamptz;

alter table public.signing_system_controls
  add column if not exists access_resumed_by_note text;

alter table public.signing_system_controls
  add column if not exists access_epoch_bumped_at timestamptz;

alter table public.signing_system_controls
  add column if not exists access_epoch_bump_note text;

-- Seed current epoch and leave access_suspended=false for the existing
-- default row (dev usability). Production enablement / restore checklists
-- must deliberately set access_suspended=true and bump the epoch.
do $$
declare
  seeded_epoch text := gen_random_uuid()::text;
begin
  update public.signing_system_controls
  set
    access_epoch = coalesce(nullif(trim(access_epoch), ''), seeded_epoch),
    access_suspended = false,
    access_resumed_at = coalesce(access_resumed_at, now()),
    access_resumed_by_note = coalesce(
      access_resumed_by_note,
      'recovery-access migration: seeded active epoch for development'
    ),
    access_epoch_bumped_at = coalesce(access_epoch_bumped_at, now()),
    access_epoch_bump_note = coalesce(
      access_epoch_bump_note,
      'recovery-access migration: initial epoch seed'
    )
  where id = 'default';

  -- Ensure a default row exists if somehow absent (fail-closed defaults).
  insert into public.signing_system_controls (
    id,
    work_suspended,
    access_suspended,
    access_epoch,
    access_epoch_bumped_at,
    access_epoch_bump_note
  )
  values (
    'default',
    false,
    true,
    seeded_epoch,
    now(),
    'recovery-access migration: created default row fail-closed'
  )
  on conflict (id) do nothing;
end $$;

alter table public.signing_system_controls
  alter column access_epoch set not null;

comment on column public.signing_system_controls.access_suspended is
  'When true (or SIGNING_ACCESS_SUSPENDED=true), external Signing credential/session '
  'validation and invitation/completed-package email sends are denied. Missing row = deny. '
  'Column default is true (fail-closed). Development seed sets false after epoch init; '
  'production/restore must set true deliberately.';

comment on column public.signing_system_controls.access_epoch is
  'Current access epoch (UUID text). Stamped onto credential/session rows at issuance. '
  'Bump invalidates all prior external bearers. Distinct from wrap-key rotation.';

comment on table public.signing_system_controls is
  'Global Signing controls: work_suspended (workers/finalization/email) and '
  'access_suspended + access_epoch (external credential/session authorization). '
  'FORCE RLS; service_role only. Restore: suspend work + suspend access + bump epoch.';

-- ---------------------------------------------------------------------------
-- 2. Add immutable access_epoch to credential / session / handoff tables
-- ---------------------------------------------------------------------------

-- Sentinel for pre-migration rows: must NOT equal the current controls epoch.
-- Existing disposable fixtures therefore fail validation (fail-closed).

alter table public.signing_participant_credentials
  add column if not exists access_epoch text;

alter table public.signing_entry_sessions
  add column if not exists access_epoch text;

alter table public.signing_browser_sessions
  add column if not exists access_epoch text;

alter table public.signing_completed_package_credentials
  add column if not exists access_epoch text;

alter table public.signing_completed_package_sessions
  add column if not exists access_epoch text;

alter table public.signing_in_person_handoffs
  add column if not exists access_epoch text;

alter table public.signing_device_handoff_locks
  add column if not exists access_epoch text;

update public.signing_participant_credentials
set access_epoch = 'pre-recovery-access-v0'
where access_epoch is null;

update public.signing_entry_sessions
set access_epoch = 'pre-recovery-access-v0'
where access_epoch is null;

update public.signing_browser_sessions
set access_epoch = 'pre-recovery-access-v0'
where access_epoch is null;

update public.signing_completed_package_credentials
set access_epoch = 'pre-recovery-access-v0'
where access_epoch is null;

update public.signing_completed_package_sessions
set access_epoch = 'pre-recovery-access-v0'
where access_epoch is null;

update public.signing_in_person_handoffs
set access_epoch = 'pre-recovery-access-v0'
where access_epoch is null;

update public.signing_device_handoff_locks
set access_epoch = 'pre-recovery-access-v0'
where access_epoch is null;

alter table public.signing_participant_credentials
  alter column access_epoch set not null;

alter table public.signing_entry_sessions
  alter column access_epoch set not null;

alter table public.signing_browser_sessions
  alter column access_epoch set not null;

alter table public.signing_completed_package_credentials
  alter column access_epoch set not null;

alter table public.signing_completed_package_sessions
  alter column access_epoch set not null;

alter table public.signing_in_person_handoffs
  alter column access_epoch set not null;

alter table public.signing_device_handoff_locks
  alter column access_epoch set not null;

comment on column public.signing_participant_credentials.access_epoch is
  'Access epoch at issuance. Immutable. Must match signing_system_controls.access_epoch to validate.';
comment on column public.signing_entry_sessions.access_epoch is
  'Access epoch at session creation. Immutable. Must match current controls epoch to validate.';
comment on column public.signing_browser_sessions.access_epoch is
  'Access epoch at ceremony session creation. Immutable. Must match current controls epoch to validate.';
comment on column public.signing_completed_package_credentials.access_epoch is
  'Access epoch at issuance. Immutable. Must match current controls epoch to validate.';
comment on column public.signing_completed_package_sessions.access_epoch is
  'Access epoch at session creation. Immutable. Must match current controls epoch to validate.';
comment on column public.signing_in_person_handoffs.access_epoch is
  'Access epoch at handoff creation. Immutable. Must match current controls epoch to validate.';
comment on column public.signing_device_handoff_locks.access_epoch is
  'Access epoch at lock creation. Immutable. Must match current controls epoch to validate.';

-- ---------------------------------------------------------------------------
-- 3. Immutable access_epoch triggers (BEFORE UPDATE)
-- ---------------------------------------------------------------------------

create or replace function public.signing_access_epoch_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.access_epoch is distinct from old.access_epoch then
    raise exception '% access_epoch is immutable', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.signing_access_epoch_immutable() is
  'Rejects UPDATE that changes access_epoch on Signing credential/session/handoff tables.';

drop trigger if exists spc_access_epoch_immutable
  on public.signing_participant_credentials;
create trigger spc_access_epoch_immutable
before update on public.signing_participant_credentials
for each row execute function public.signing_access_epoch_immutable();

drop trigger if exists ses_access_epoch_immutable
  on public.signing_entry_sessions;
create trigger ses_access_epoch_immutable
before update on public.signing_entry_sessions
for each row execute function public.signing_access_epoch_immutable();

drop trigger if exists sbs_access_epoch_immutable
  on public.signing_browser_sessions;
create trigger sbs_access_epoch_immutable
before update on public.signing_browser_sessions
for each row execute function public.signing_access_epoch_immutable();

drop trigger if exists scpc_access_epoch_immutable
  on public.signing_completed_package_credentials;
create trigger scpc_access_epoch_immutable
before update on public.signing_completed_package_credentials
for each row execute function public.signing_access_epoch_immutable();

drop trigger if exists scps_access_epoch_immutable
  on public.signing_completed_package_sessions;
create trigger scps_access_epoch_immutable
before update on public.signing_completed_package_sessions
for each row execute function public.signing_access_epoch_immutable();

drop trigger if exists siph_access_epoch_immutable
  on public.signing_in_person_handoffs;
create trigger siph_access_epoch_immutable
before update on public.signing_in_person_handoffs
for each row execute function public.signing_access_epoch_immutable();

drop trigger if exists sdhl_access_epoch_immutable
  on public.signing_device_handoff_locks;
create trigger sdhl_access_epoch_immutable
before update on public.signing_device_handoff_locks
for each row execute function public.signing_access_epoch_immutable();

-- FORCE RLS / deny-browser on signing_system_controls already established by
-- 20260919180000_native_signing_completion_delivery.sql — unchanged here.

commit;
