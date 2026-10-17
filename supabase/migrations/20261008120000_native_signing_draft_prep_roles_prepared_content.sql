-- Native Signing: Draft preparation model cleanup.
-- Development only. Forward-only. Do not edit prior migrations.
--
-- 1. Participant role_code (stable vocabulary) next to the free-form
--    optional_role label; frozen into revision participants at promotion.
--    Role is a preparation label, never identity proof or authority.
-- 2. Quick-add linkage: a broker participant links to the brokerage profile
--    it came from; the same User / broker profile cannot be added twice.
-- 3. Source Packet selection / refresh carries role_code.
-- 4. Date Signed may link to a Signature or an Initials field of the same
--    participant (Draft and revision evidence).
-- 5. Manager-prepared content (Printed Name, Checkmark) lives in its own
--    Draft table. It is baked into the prepared document version at
--    activation and never becomes a signer field or adopted mark.

begin;

-- ---------------------------------------------------------------------------
-- 1. Participant role_code
-- ---------------------------------------------------------------------------

alter table public.signing_participants
  add column if not exists role_code text;

alter table public.signing_participants
  drop constraint if exists signing_participants_role_code_check;
alter table public.signing_participants
  add constraint signing_participants_role_code_check
  check (
    role_code is null
    or role_code in (
      'BUYER', 'SELLER', 'TENANT', 'LANDLORD', 'AGENT', 'BROKER', 'OTHER'
    )
  );

comment on column public.signing_participants.role_code is
  'Stable participant role for preparation (BUYER/SELLER/TENANT/LANDLORD/AGENT/BROKER/OTHER). Not identity proof or legal authority.';
comment on column public.signing_participants.optional_role is
  'Optional human role label shown with role_code; kept for compatibility.';

alter table public.signing_package_revision_participants
  add column if not exists frozen_role_code text;

alter table public.signing_package_revision_participants
  drop constraint if exists sprp_role_code_check;
alter table public.signing_package_revision_participants
  add constraint sprp_role_code_check
  check (
    frozen_role_code is null
    or frozen_role_code in (
      'BUYER', 'SELLER', 'TENANT', 'LANDLORD', 'AGENT', 'BROKER', 'OTHER'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Quick-add linkage and duplicate guards
-- ---------------------------------------------------------------------------

alter table public.signing_participants
  add column if not exists linked_brokerage_settings_id bigint
    references public.brokerage_settings (id) on delete set null;

comment on column public.signing_participants.linked_brokerage_settings_id is
  'Brokerage profile a quick-added broker participant was created from (server-derived only).';

create unique index if not exists signing_participants_signing_linked_user_key
  on public.signing_participants (signing_id, linked_user_id)
  where linked_user_id is not null and participant_status <> 'REMOVED';

create unique index if not exists signing_participants_signing_linked_broker_key
  on public.signing_participants (signing_id, linked_brokerage_settings_id)
  where linked_brokerage_settings_id is not null
    and participant_status <> 'REMOVED';

-- ---------------------------------------------------------------------------
-- 3. Source Packet selection / additive refresh carries role_code
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

  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end;
$$;

revoke all on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) from public;
revoke all on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) from anon;
revoke all on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) from authenticated;
grant execute on function public.signing_select_source_packet(uuid, bigint, bigint, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Date Signed links to a same-participant Signature or Initials
--    (column names keep their historical "signature" wording).
-- ---------------------------------------------------------------------------

comment on column public.signing_draft_fields.linked_signature_draft_field_id is
  'DATE_SIGNED only: the Signature or Initials Draft field (same participant) whose accepted placement time the date shows.';
comment on column public.signing_fields.linked_signature_field_id is
  'DATE_SIGNED only: the Signature or Initials field (same revision participant) whose accepted placement time the date shows.';

create or replace function public.signing_draft_fields_enforce_date_link()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source record;
begin
  if new.field_type <> 'DATE_SIGNED' then
    if new.linked_signature_draft_field_id is not null then
      raise exception 'SIGNING_DATE_LINK_INVALID';
    end if;
    if tg_op = 'UPDATE'
       and new.field_type not in ('SIGNATURE', 'INITIALS')
       and exists (
         select 1
           from public.signing_draft_fields d
          where d.signing_id = new.signing_id
            and d.linked_signature_draft_field_id = new.id
       ) then
      raise exception 'SIGNING_DATE_LINK_INVALID';
    end if;
    return new;
  end if;

  if new.linked_signature_draft_field_id is null then
    return new;
  end if;

  select field_type, signing_participant_id
    into v_source
    from public.signing_draft_fields
   where signing_id = new.signing_id
     and id = new.linked_signature_draft_field_id;

  if not found
     or v_source.field_type not in ('SIGNATURE', 'INITIALS')
     or v_source.signing_participant_id <> new.signing_participant_id then
    raise exception 'SIGNING_DATE_LINK_INVALID';
  end if;
  return new;
end;
$$;

revoke all on function public.signing_draft_fields_enforce_date_link() from public;

drop trigger if exists signing_draft_fields_enforce_date_link on public.signing_draft_fields;
create trigger signing_draft_fields_enforce_date_link
  before insert or update of field_type, signing_participant_id, linked_signature_draft_field_id
  on public.signing_draft_fields
  for each row
  execute function public.signing_draft_fields_enforce_date_link();

create or replace function public.signing_fields_enforce_date_link()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source record;
begin
  if new.linked_signature_field_id is null then
    return new;
  end if;
  if new.field_type <> 'DATE_SIGNED' then
    raise exception 'SIGNING_DATE_LINK_INVALID';
  end if;

  select field_type, package_revision_id, package_revision_participant_id
    into v_source
    from public.signing_fields
   where signing_id = new.signing_id
     and id = new.linked_signature_field_id;

  if not found
     or v_source.field_type not in ('SIGNATURE', 'INITIALS')
     or v_source.package_revision_id <> new.package_revision_id
     or v_source.package_revision_participant_id <> new.package_revision_participant_id then
    raise exception 'SIGNING_DATE_LINK_INVALID';
  end if;
  return new;
end;
$$;

revoke all on function public.signing_fields_enforce_date_link() from public;

drop trigger if exists signing_fields_enforce_date_link on public.signing_fields;
create trigger signing_fields_enforce_date_link
  before insert on public.signing_fields
  for each row
  execute function public.signing_fields_enforce_date_link();

-- ---------------------------------------------------------------------------
-- 5. Manager-prepared Draft content (Printed Name, Checkmark)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_draft_prepared_content (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_document_id uuid not null,
  signing_participant_id uuid,
  content_type text not null,
  page_number integer not null,
  x double precision not null,
  y double precision not null,
  width double precision not null,
  height double precision not null,

  constraint signing_draft_prepared_content_type_check
    check (content_type in ('PRINTED_NAME', 'CHECKMARK')),
  constraint signing_draft_prepared_content_participant_check
    check (
      (content_type = 'PRINTED_NAME' and signing_participant_id is not null)
      or (content_type = 'CHECKMARK' and signing_participant_id is null)
    ),
  constraint signing_draft_prepared_content_page_positive
    check (page_number >= 1),
  constraint signing_draft_prepared_content_size_positive
    check (width > 0 and height > 0),
  constraint signing_draft_prepared_content_document_same_signing_fkey
    foreign key (signing_id, signing_document_id)
    references public.signing_documents (signing_id, id)
    on delete restrict,
  constraint signing_draft_prepared_content_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict
);

comment on table public.signing_draft_prepared_content is
  'Manager-prepared Draft document content (Printed Name, Checkmark). Baked into the prepared document version at activation; never signer fields, adopted marks, or participant evidence.';

create index if not exists signing_draft_prepared_content_signing_id_idx
  on public.signing_draft_prepared_content (signing_id);
create index if not exists signing_draft_prepared_content_document_id_idx
  on public.signing_draft_prepared_content (signing_document_id);
create index if not exists signing_draft_prepared_content_participant_id_idx
  on public.signing_draft_prepared_content (signing_participant_id);

drop trigger if exists signing_draft_prepared_content_set_update_date
  on public.signing_draft_prepared_content;
create trigger signing_draft_prepared_content_set_update_date
before update on public.signing_draft_prepared_content
for each row execute function public.set_update_date();

create or replace function public.signing_draft_prepared_content_require_draft()
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
    raise exception 'SIGNING_PREPARED_CONTENT_NOT_DRAFT';
  end if;
  return new;
end;
$$;

revoke all on function public.signing_draft_prepared_content_require_draft() from public;

drop trigger if exists signing_draft_prepared_content_require_draft
  on public.signing_draft_prepared_content;
create trigger signing_draft_prepared_content_require_draft
  before insert or update on public.signing_draft_prepared_content
  for each row
  execute function public.signing_draft_prepared_content_require_draft();

alter table public.signing_draft_prepared_content enable row level security;
alter table public.signing_draft_prepared_content force row level security;

drop policy if exists signing_draft_prepared_content_deny_authenticated
  on public.signing_draft_prepared_content;
create policy signing_draft_prepared_content_deny_authenticated
  on public.signing_draft_prepared_content
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists signing_draft_prepared_content_deny_anon
  on public.signing_draft_prepared_content;
create policy signing_draft_prepared_content_deny_anon
  on public.signing_draft_prepared_content
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists account_state_application_gate
  on public.signing_draft_prepared_content;
create policy account_state_application_gate
  on public.signing_draft_prepared_content
  as restrictive
  for all
  to authenticated
  using (public.has_application_access())
  with check (public.has_application_access());

revoke all on table public.signing_draft_prepared_content from public;
revoke all on table public.signing_draft_prepared_content from anon;
revoke all on table public.signing_draft_prepared_content from authenticated;

commit;
