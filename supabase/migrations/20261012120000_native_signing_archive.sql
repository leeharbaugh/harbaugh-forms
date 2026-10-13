-- Native Signing: Archive Signing.
-- Development only. Forward-only. Do not edit prior migrations.
--
-- Archive is organizational state, not lifecycle: `signings.archived_at` hides
-- a Signing from the default Signings list and never changes
-- `lifecycle_state`. Unarchive clears it and restores nothing else.
--
-- Archiving an In Progress Signing revokes all participant access in the same
-- transaction (credentials, entry sessions, unconsumed in-person handoffs,
-- active ceremony sessions and presence leases). Evidence, marks, placements,
-- participant progress and package revisions are untouched.
--
-- Guards (serialized against the archive transaction by a share lock on the
-- Signing row): no new participant access may be created on an archived
-- Signing, an archived Draft may not be activated, and no participant
-- evidence write may land on an archived In Progress Signing.
--
-- The actor is recorded by the SIGNING_ARCHIVED event, so there is no
-- archived_by column. No index: list queries are already scoped by
-- organization and archived_at only filters within that set.

begin;

alter table public.signings
  add column if not exists archived_at timestamptz;

comment on column public.signings.archived_at is
  'When set, the Signing is archived (hidden from the default Signings list). Organizational state only; never lifecycle and never evidence.';

-- ---------------------------------------------------------------------------
-- 1. Atomic archive
-- ---------------------------------------------------------------------------

create or replace function public.signing_archive(p_signing_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_signing record;
  v_now timestamptz := now();
  v_credentials integer := 0;
  v_entry_sessions integer := 0;
  v_handoffs integer := 0;
  v_browser_sessions integer := 0;
  v_leases integer := 0;
begin
  select id, lifecycle_state, archived_at
    into v_signing
    from public.signings
   where id = p_signing_id
   for update;

  if not found then
    raise exception 'SIGNING_ARCHIVE_NOT_FOUND';
  end if;

  if v_signing.archived_at is not null then
    return jsonb_build_object(
      'already_archived', true,
      'archived_at', v_signing.archived_at,
      'lifecycle_state', v_signing.lifecycle_state,
      'revoked_credentials', 0,
      'revoked_entry_sessions', 0,
      'revoked_handoffs', 0,
      'revoked_browser_sessions', 0,
      'released_presence_leases', 0
    );
  end if;

  update public.signings
     set archived_at = v_now
   where id = p_signing_id;

  if v_signing.lifecycle_state = 'IN_PROGRESS' then
    update public.signing_participant_credentials
       set is_current = false,
           revoked_at = v_now,
           revoked_reason = 'SIGNING_ARCHIVED'
     where signing_id = p_signing_id
       and is_current = true
       and revoked_at is null;
    get diagnostics v_credentials = row_count;

    update public.signing_entry_sessions
       set revoked_at = v_now,
           revoked_reason = 'SIGNING_ARCHIVED'
     where signing_id = p_signing_id
       and revoked_at is null;
    get diagnostics v_entry_sessions = row_count;

    update public.signing_in_person_handoffs
       set revoked_at = v_now,
           revoked_reason = 'SIGNING_ARCHIVED'
     where signing_id = p_signing_id
       and consumed_at is null
       and revoked_at is null;
    get diagnostics v_handoffs = row_count;

    update public.signing_participant_presence_leases
       set released_at = v_now,
           release_reason = 'SIGNING_ARCHIVED'
     where signing_id = p_signing_id
       and released_at is null;
    get diagnostics v_leases = row_count;

    update public.signing_browser_sessions
       set status = 'REVOKED',
           ended_at = v_now,
           ended_reason = 'SIGNING_ARCHIVED'
     where signing_id = p_signing_id
       and status = 'ACTIVE';
    get diagnostics v_browser_sessions = row_count;
  end if;

  return jsonb_build_object(
    'already_archived', false,
    'archived_at', v_now,
    'lifecycle_state', v_signing.lifecycle_state,
    'revoked_credentials', v_credentials,
    'revoked_entry_sessions', v_entry_sessions,
    'revoked_handoffs', v_handoffs,
    'revoked_browser_sessions', v_browser_sessions,
    'released_presence_leases', v_leases
  );
end;
$$;

revoke all on function public.signing_archive(uuid) from public;
revoke all on function public.signing_archive(uuid) from anon;
revoke all on function public.signing_archive(uuid) from authenticated;
grant execute on function public.signing_archive(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. No new participant access on an archived Signing
-- ---------------------------------------------------------------------------

create or replace function public.signing_reject_access_when_archived()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_archived_at timestamptz;
begin
  select archived_at
    into v_archived_at
    from public.signings
   where id = new.signing_id
   for share;

  if v_archived_at is not null then
    raise exception 'SIGNING_ARCHIVED'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists spc_reject_when_archived
  on public.signing_participant_credentials;
create trigger spc_reject_when_archived
before insert on public.signing_participant_credentials
for each row execute function public.signing_reject_access_when_archived();

drop trigger if exists ses_reject_when_archived
  on public.signing_entry_sessions;
create trigger ses_reject_when_archived
before insert on public.signing_entry_sessions
for each row execute function public.signing_reject_access_when_archived();

drop trigger if exists siph_reject_when_archived
  on public.signing_in_person_handoffs;
create trigger siph_reject_when_archived
before insert on public.signing_in_person_handoffs
for each row execute function public.signing_reject_access_when_archived();

drop trigger if exists sbs_reject_when_archived
  on public.signing_browser_sessions;
create trigger sbs_reject_when_archived
before insert on public.signing_browser_sessions
for each row execute function public.signing_reject_access_when_archived();

drop trigger if exists spl_reject_when_archived
  on public.signing_participant_presence_leases;
create trigger spl_reject_when_archived
before insert on public.signing_participant_presence_leases
for each row execute function public.signing_reject_access_when_archived();

-- ---------------------------------------------------------------------------
-- 3. An archived Draft may not be activated
-- ---------------------------------------------------------------------------

create or replace function public.signings_reject_archived_activation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.archived_at is not null
     and old.lifecycle_state = 'DRAFT'
     and new.lifecycle_state = 'IN_PROGRESS' then
    raise exception 'SIGNING_ARCHIVED'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists signings_reject_archived_activation on public.signings;
create trigger signings_reject_archived_activation
before update on public.signings
for each row execute function public.signings_reject_archived_activation();

-- ---------------------------------------------------------------------------
-- 4. No participant evidence write on an archived In Progress Signing
-- ---------------------------------------------------------------------------

create or replace function public.signing_reject_evidence_when_archived()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_signing record;
begin
  if tg_table_name = 'signing_participants'
     and new.participant_status is not distinct from old.participant_status
     and new.consent_accepted_at is not distinct from old.consent_accepted_at
     and new.identity_confirmed_at is not distinct from old.identity_confirmed_at
     and new.finished_at is not distinct from old.finished_at
     and new.declined_at is not distinct from old.declined_at then
    return new;
  end if;

  select lifecycle_state, archived_at
    into v_signing
    from public.signings
   where id = new.signing_id
   for share;

  if v_signing.archived_at is not null
     and v_signing.lifecycle_state = 'IN_PROGRESS' then
    raise exception 'SIGNING_ARCHIVED'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists signing_field_placements_reject_when_archived
  on public.signing_field_placements;
create trigger signing_field_placements_reject_when_archived
before insert or update on public.signing_field_placements
for each row execute function public.signing_reject_evidence_when_archived();

drop trigger if exists signing_adopted_marks_reject_when_archived
  on public.signing_adopted_marks;
create trigger signing_adopted_marks_reject_when_archived
before insert or update on public.signing_adopted_marks
for each row execute function public.signing_reject_evidence_when_archived();

drop trigger if exists signing_participants_reject_when_archived
  on public.signing_participants;
create trigger signing_participants_reject_when_archived
before update on public.signing_participants
for each row execute function public.signing_reject_evidence_when_archived();

commit;
