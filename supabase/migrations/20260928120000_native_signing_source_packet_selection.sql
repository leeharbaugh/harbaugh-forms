-- Native Signing: atomic Draft source Packet selection + Packet party import.
-- Forward-only. Development only. Server (service_role) execution only.
--
-- 1. signing_select_source_packet binds/switches signings.source_packet_id and
--    inserts the supplied Packet parties in one transaction, holding the
--    Signing row lock so competing selections serialize.
-- 2. Included Packet-form documents must belong to the Signing's source Packet.

begin;

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
begin
  if p_packet_id is null then
    raise exception 'SOURCE_PACKET_INVALID';
  end if;
  if p_parties is null or jsonb_typeof(p_parties) <> 'array' then
    raise exception 'SOURCE_PACKET_PARTIES_INVALID';
  end if;

  select id, lifecycle_state, source_packet_id
    into v_signing
    from public.signings
   where id = p_signing_id
   for update;

  if not found then
    raise exception 'SOURCE_PACKET_SIGNING_NOT_FOUND';
  end if;
  if v_signing.lifecycle_state <> 'DRAFT' then
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

    insert into public.signing_participants (
      signing_id,
      full_name,
      email,
      optional_role,
      linked_contact_id,
      participant_status,
      display_order
    ) values (
      p_signing_id,
      v_party ->> 'full_name',
      coalesce(v_party ->> 'email', ''),
      nullif(v_party ->> 'optional_role', ''),
      v_contact_id,
      'PENDING',
      v_next_order
    );
    v_next_order := v_next_order + 1;
    v_added := v_added + 1;
  end loop;

  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end;
$$;

revoke all on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) from public;
revoke all on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) from anon;
revoke all on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) from authenticated;
grant execute on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) to service_role;

create or replace function public.signing_documents_enforce_source_packet()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_signing record;
  v_form_packet_id bigint;
begin
  if new.source_packet_form_id is null or new.included_in_draft is not true then
    return new;
  end if;

  select lifecycle_state, source_packet_id
    into v_signing
    from public.signings
   where id = new.signing_id
   for share;

  if not found or v_signing.lifecycle_state <> 'DRAFT' then
    return new;
  end if;

  select packet_id
    into v_form_packet_id
    from public.packet_forms
   where id = new.source_packet_form_id;

  if v_signing.source_packet_id is null
     or v_form_packet_id is distinct from v_signing.source_packet_id then
    raise exception 'SOURCE_PACKET_DOCUMENT_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function public.signing_documents_enforce_source_packet() from public;

-- Legacy unbound Drafts whose included Packet documents all come from one
-- Packet adopt that Packet as their source.
with single_packet as (
  select d.signing_id, min(pf.packet_id) as packet_id
    from public.signing_documents d
    join public.packet_forms pf on pf.id = d.source_packet_form_id
    join public.signings s on s.id = d.signing_id
   where d.included_in_draft = true
     and s.lifecycle_state = 'DRAFT'
     and s.source_packet_id is null
   group by d.signing_id
  having count(distinct pf.packet_id) = 1
)
update public.signings s
   set source_packet_id = sp.packet_id
  from single_packet sp
 where s.id = sp.signing_id;

drop trigger if exists signing_documents_enforce_source_packet on public.signing_documents;
create trigger signing_documents_enforce_source_packet
  before insert or update of included_in_draft, source_packet_form_id
  on public.signing_documents
  for each row
  execute function public.signing_documents_enforce_source_packet();

commit;
