-- Native Signing: live Draft participant identity and Packet auto-add.
-- Development only. Forward-only. Do not edit prior migrations.
--
-- 1. Signing-scoped suppression of deliberately removed Packet participants,
--    keyed by Contact id, so Draft auto-add never silently re-adds them.
-- 2. Source Packet import skips suppressed Contacts.
-- 3. Participant name/email are canonized at activation: they cannot change
--    once the Signing has a package revision or leaves DRAFT.

begin;

-- ---------------------------------------------------------------------------
-- 1. Removed Packet participant suppression (Draft preparation state)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_draft_packet_participant_suppressions (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  signing_id uuid not null
    references public.signings (id) on delete cascade,
  linked_contact_id bigint not null
    references public.contacts (id) on delete cascade,
  removed_by_user_id uuid,
  constraint signing_draft_packet_participant_suppressions_key
    unique (signing_id, linked_contact_id)
);

comment on table public.signing_draft_packet_participant_suppressions is
  'Draft-only: Packet Contacts a manager deliberately removed from this Signing. Draft auto-add skips them until the manager restores them. Never evidence.';

create index if not exists signing_draft_packet_participant_suppressions_contact_idx
  on public.signing_draft_packet_participant_suppressions (linked_contact_id);

create or replace function public.signing_draft_packet_suppression_require_draft()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_state text;
begin
  select lifecycle_state
    into v_state
    from public.signings
   where id = new.signing_id
   for share;
  if v_state is distinct from 'DRAFT' then
    raise exception 'SIGNING_PARTICIPANT_SUPPRESSION_NOT_DRAFT';
  end if;
  return new;
end;
$$;

revoke all on function public.signing_draft_packet_suppression_require_draft() from public;

drop trigger if exists signing_draft_packet_suppression_require_draft
  on public.signing_draft_packet_participant_suppressions;
create trigger signing_draft_packet_suppression_require_draft
  before insert or update on public.signing_draft_packet_participant_suppressions
  for each row
  execute function public.signing_draft_packet_suppression_require_draft();

alter table public.signing_draft_packet_participant_suppressions enable row level security;
alter table public.signing_draft_packet_participant_suppressions force row level security;

drop policy if exists signing_draft_packet_suppressions_deny_authenticated
  on public.signing_draft_packet_participant_suppressions;
create policy signing_draft_packet_suppressions_deny_authenticated
  on public.signing_draft_packet_participant_suppressions
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists signing_draft_packet_suppressions_deny_anon
  on public.signing_draft_packet_participant_suppressions;
create policy signing_draft_packet_suppressions_deny_anon
  on public.signing_draft_packet_participant_suppressions
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists account_state_application_gate
  on public.signing_draft_packet_participant_suppressions;
create policy account_state_application_gate
  on public.signing_draft_packet_participant_suppressions
  as restrictive
  for all
  to authenticated
  using (public.has_application_access())
  with check (public.has_application_access());

revoke all on table public.signing_draft_packet_participant_suppressions from public;
revoke all on table public.signing_draft_packet_participant_suppressions from anon;
revoke all on table public.signing_draft_packet_participant_suppressions from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Source Packet import skips suppressed Contacts
-- ---------------------------------------------------------------------------

create or replace function public.signing_select_source_packet(
  p_signing_id uuid,
  p_expected_source_packet_id bigint,
  p_packet_id bigint,
  p_parties jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_signing record;
  v_party jsonb;
  v_contact_id bigint;
  v_next_order integer;
  v_added integer := 0;
  v_skipped integer := 0;
  v_suppressed integer := 0;
begin
  if p_packet_id is null then
    raise exception 'SOURCE_PACKET_INVALID';
  end if;
  if p_parties is null or jsonb_typeof(p_parties) <> 'array' then
    raise exception 'SOURCE_PACKET_PARTIES_INVALID';
  end if;

  select id, lifecycle_state, source_packet_id, current_package_revision_id
    into v_signing
    from public.signings
   where id = p_signing_id
   for update;

  if not found then
    raise exception 'SOURCE_PACKET_SIGNING_NOT_FOUND';
  end if;
  if v_signing.lifecycle_state <> 'DRAFT'
     or v_signing.current_package_revision_id is not null then
    raise exception 'SOURCE_PACKET_NOT_DRAFT';
  end if;
  if v_signing.source_packet_id is distinct from p_expected_source_packet_id then
    raise exception 'SOURCE_PACKET_CONFLICT';
  end if;

  if v_signing.source_packet_id is distinct from p_packet_id then
    if exists (
      select 1
        from public.signing_documents d
        join public.packet_forms pf on pf.id = d.source_packet_form_id
       where d.signing_id = p_signing_id
         and d.included_in_draft = true
         and pf.packet_id <> p_packet_id
    ) then
      raise exception 'SOURCE_PACKET_HAS_DOCUMENTS';
    end if;

    if v_signing.source_packet_id is not null and exists (
      select 1
        from public.signing_participants p
       where p.signing_id = p_signing_id
         and p.participant_status <> 'REMOVED'
         and p.linked_contact_id is not null
    ) then
      raise exception 'SOURCE_PACKET_HAS_PARTICIPANTS';
    end if;

    update public.signings
       set source_packet_id = p_packet_id
     where id = p_signing_id;
  end if;

  select coalesce(max(display_order), -1) + 1
    into v_next_order
    from public.signing_participants
   where signing_id = p_signing_id;

  for v_party in select value from jsonb_array_elements(p_parties)
  loop
    v_contact_id := (v_party ->> 'linked_contact_id')::bigint;
    if exists (
      select 1
        from public.signing_participants p
       where p.signing_id = p_signing_id
         and p.participant_status <> 'REMOVED'
         and p.linked_contact_id = v_contact_id
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if exists (
      select 1
        from public.signing_draft_packet_participant_suppressions s
       where s.signing_id = p_signing_id
         and s.linked_contact_id = v_contact_id
    ) then
      v_suppressed := v_suppressed + 1;
      continue;
    end if;

    insert into public.signing_participants (
      signing_id,
      full_name,
      email,
      optional_role,
      role_code,
      linked_contact_id,
      participant_status,
      display_order
    ) values (
      p_signing_id,
      v_party ->> 'full_name',
      coalesce(v_party ->> 'email', ''),
      nullif(v_party ->> 'optional_role', ''),
      nullif(v_party ->> 'role_code', ''),
      v_contact_id,
      'PENDING',
      v_next_order
    );
    v_next_order := v_next_order + 1;
    v_added := v_added + 1;
  end loop;

  return jsonb_build_object(
    'added', v_added,
    'skipped', v_skipped,
    'suppressed', v_suppressed
  );
end;
$$;

revoke all on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) from public;
revoke all on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) from anon;
revoke all on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) from authenticated;
grant execute on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Participant identity is canonized at activation
-- ---------------------------------------------------------------------------

create or replace function public.signing_participants_freeze_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_signing record;
begin
  if new.full_name is not distinct from old.full_name
     and new.email is not distinct from old.email then
    return new;
  end if;

  select lifecycle_state, current_package_revision_id
    into v_signing
    from public.signings
   where id = new.signing_id
   for share;

  if v_signing.lifecycle_state is distinct from 'DRAFT'
     or v_signing.current_package_revision_id is not null then
    raise exception 'SIGNING_PARTICIPANT_IDENTITY_FROZEN';
  end if;
  return new;
end;
$$;

revoke all on function public.signing_participants_freeze_identity() from public;

drop trigger if exists signing_participants_freeze_identity
  on public.signing_participants;
create trigger signing_participants_freeze_identity
  before update of full_name, email on public.signing_participants
  for each row
  execute function public.signing_participants_freeze_identity();

commit;
