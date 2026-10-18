-- Native Signing: durable marker for Draft Packet auto-add.
-- Development only. Forward-only. Do not edit prior migrations.
--
-- Draft auto-add runs while a Signing page is opened, and more than one
-- request may perform it. The marker commits with the participant insert
-- (under the Signing row lock), so the "Added from the source Packet" notice
-- is derived from data rather than from whichever request inserted the row.
-- Manual Packet import and Restore leave it null. Never evidence.

begin;

alter table public.signing_participants
  add column if not exists auto_added_from_packet_at timestamptz;

comment on column public.signing_participants.auto_added_from_packet_at is
  'Draft-only: set when Draft auto-add inserted this participant from the source Packet. Drives the manager notice. Never evidence.';

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
      display_order,
      auto_added_from_packet_at
    ) values (
      p_signing_id,
      v_party ->> 'full_name',
      coalesce(v_party ->> 'email', ''),
      nullif(v_party ->> 'optional_role', ''),
      nullif(v_party ->> 'role_code', ''),
      v_contact_id,
      'PENDING',
      v_next_order,
      case when (v_party ->> 'auto_added') = 'true' then now() end
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

commit;
