-- Signing Placement Templates (development-only forward migration).
--
-- A placement template stores Signing field geometry for one exact Form
-- version (public.forms.id). Scopes are PERSONAL (one owner) and
-- ORGANIZATION (one organization); there is no Global scope. Placements name
-- participant slots (role_code + ordinal), never a Contact, User,
-- participant, name, or email. Templates are configuration, not evidence:
-- they are soft-deleted via status and applied fields are ordinary editable
-- Draft fields with no live link back to the template.
--
-- signing_apply_placement_template() is the authoritative application
-- transaction: it locks the Signing, revalidates Draft state, the exact Form
-- version, template eligibility and precedence, maps slots to participants
-- from role_code + stable display order, creates fields (a Date only after
-- its Signature/Initials), and records the request id for idempotent replay.
--
-- signing_copy_placement_template() creates an independent target template
-- for another Form version, copying placements that fit the target's pages.

begin;

-- ---------------------------------------------------------------------------
-- 1. Templates
-- ---------------------------------------------------------------------------

create table if not exists public.signing_placement_templates (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  form_id bigint not null
    references public.forms (id) on delete restrict,
  scope_type text not null,
  owner_user_id uuid
    references public.profiles (id) on delete restrict,
  organization_id uuid
    references public.organizations (id) on delete restrict,
  status text not null default 'ACTIVE',
  deleted_at timestamptz,
  created_by_user_id uuid
    references public.profiles (id) on delete set null,
  updated_by_user_id uuid
    references public.profiles (id) on delete set null,
  copied_from_template_id uuid
    references public.signing_placement_templates (id) on delete set null,

  constraint spt_scope_type_check
    check (scope_type in ('PERSONAL', 'ORGANIZATION')),
  constraint spt_scope_owner_check
    check (
      (scope_type = 'PERSONAL' and owner_user_id is not null and organization_id is null)
      or (scope_type = 'ORGANIZATION' and organization_id is not null and owner_user_id is null)
    ),
  constraint spt_status_check
    check (status in ('ACTIVE', 'DELETED')),
  constraint spt_deleted_at_check
    check ((status = 'DELETED') = (deleted_at is not null)),
  constraint spt_not_copied_from_self
    check (copied_from_template_id is null or copied_from_template_id <> id)
);

comment on table public.signing_placement_templates is
  'Signing placement configuration for one exact Form version (forms.id). PERSONAL or ORGANIZATION scope; never evidence; soft-deleted via status.';

create unique index if not exists spt_one_active_personal_uidx
  on public.signing_placement_templates (form_id, owner_user_id)
  where status = 'ACTIVE' and scope_type = 'PERSONAL';

create unique index if not exists spt_one_active_organization_uidx
  on public.signing_placement_templates (form_id, organization_id)
  where status = 'ACTIVE' and scope_type = 'ORGANIZATION';

create index if not exists spt_form_id_idx
  on public.signing_placement_templates (form_id);
create index if not exists spt_owner_user_id_idx
  on public.signing_placement_templates (owner_user_id)
  where owner_user_id is not null;
create index if not exists spt_organization_id_idx
  on public.signing_placement_templates (organization_id)
  where organization_id is not null;

drop trigger if exists spt_set_update_date on public.signing_placement_templates;
create trigger spt_set_update_date
before update on public.signing_placement_templates
for each row execute function public.set_update_date();

-- The exact Form version and scope owner never change; a deleted template
-- stays deleted.
create or replace function public.spt_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.form_id is distinct from old.form_id
     or new.scope_type is distinct from old.scope_type
     or new.owner_user_id is distinct from old.owner_user_id
     or new.organization_id is distinct from old.organization_id
     or new.copied_from_template_id is distinct from old.copied_from_template_id then
    raise exception 'PLACEMENT_TEMPLATE_IDENTITY_IMMUTABLE';
  end if;
  if old.status = 'DELETED' and new.status <> 'DELETED' then
    raise exception 'PLACEMENT_TEMPLATE_DELETED';
  end if;
  return new;
end;
$$;

revoke all on function public.spt_guard_update() from public;

drop trigger if exists spt_guard_update on public.signing_placement_templates;
create trigger spt_guard_update
  before update on public.signing_placement_templates
  for each row
  execute function public.spt_guard_update();

alter table public.signing_placement_templates enable row level security;
alter table public.signing_placement_templates force row level security;

drop policy if exists spt_deny_authenticated on public.signing_placement_templates;
create policy spt_deny_authenticated
  on public.signing_placement_templates
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 2. Template fields
-- ---------------------------------------------------------------------------

create table if not exists public.signing_placement_template_fields (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  template_id uuid not null
    references public.signing_placement_templates (id) on delete restrict,
  field_type text not null,
  slot_role_code text,
  slot_ordinal integer,
  is_required boolean not null default true,
  page_number integer not null,
  x double precision not null,
  y double precision not null,
  width double precision not null,
  height double precision not null,
  linked_template_field_id uuid,

  constraint sptf_template_id_id_key
    unique (template_id, id),
  constraint sptf_field_type_check
    check (field_type in ('SIGNATURE', 'INITIALS', 'DATE_SIGNED', 'PRINTED_NAME', 'CHECKMARK')),
  constraint sptf_slot_role_check
    check (
      slot_role_code is null
      or slot_role_code in ('BUYER', 'SELLER', 'TENANT', 'LANDLORD', 'AGENT', 'BROKER', 'OTHER')
    ),
  constraint sptf_slot_ordinal_check
    check (slot_ordinal is null or slot_ordinal between 1 and 20),
  constraint sptf_slot_pair_check
    check ((slot_role_code is null) = (slot_ordinal is null)),
  constraint sptf_slot_by_type_check
    check (
      (field_type = 'CHECKMARK' and slot_role_code is null)
      or (field_type <> 'CHECKMARK' and slot_role_code is not null)
    ),
  constraint sptf_link_by_type_check
    check (
      (field_type = 'DATE_SIGNED' and linked_template_field_id is not null)
      or (field_type <> 'DATE_SIGNED' and linked_template_field_id is null)
    ),
  constraint sptf_not_self_linked
    check (linked_template_field_id is null or linked_template_field_id <> id),
  constraint sptf_page_positive
    check (page_number >= 1),
  constraint sptf_size_positive
    check (width > 0 and height > 0),
  -- A Date's source is always in the same template; removing a source
  -- removes its Dates so no unlinked Date remains.
  constraint sptf_link_same_template_fkey
    foreign key (template_id, linked_template_field_id)
    references public.signing_placement_template_fields (template_id, id)
    on delete cascade
);

comment on table public.signing_placement_template_fields is
  'Placement geometry for a placement template. Slots are role_code + ordinal only; Checkmark has no slot; a Date links to a same-slot Signature/Initials in the same template.';

create index if not exists sptf_template_id_idx
  on public.signing_placement_template_fields (template_id);
create index if not exists sptf_linked_template_field_id_idx
  on public.signing_placement_template_fields (linked_template_field_id)
  where linked_template_field_id is not null;

drop trigger if exists sptf_set_update_date on public.signing_placement_template_fields;
create trigger sptf_set_update_date
before update on public.signing_placement_template_fields
for each row execute function public.set_update_date();

-- Writes need an ACTIVE template; a Date links to a Signature/Initials with
-- the same slot; a source keeps its source type while Dates link to it.
create or replace function public.sptf_enforce_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_source record;
begin
  select status into v_status
    from public.signing_placement_templates
   where id = new.template_id;
  if v_status is distinct from 'ACTIVE' then
    raise exception 'PLACEMENT_TEMPLATE_NOT_ACTIVE';
  end if;

  if tg_op = 'UPDATE' and new.template_id <> old.template_id then
    raise exception 'PLACEMENT_TEMPLATE_FIELD_MOVE_FORBIDDEN';
  end if;

  if new.field_type = 'DATE_SIGNED' then
    select field_type, slot_role_code, slot_ordinal
      into v_source
      from public.signing_placement_template_fields
     where template_id = new.template_id
       and id = new.linked_template_field_id;
    if not found
       or v_source.field_type not in ('SIGNATURE', 'INITIALS')
       or v_source.slot_role_code is distinct from new.slot_role_code
       or v_source.slot_ordinal is distinct from new.slot_ordinal then
      raise exception 'PLACEMENT_TEMPLATE_DATE_LINK_INVALID';
    end if;
  elsif tg_op = 'UPDATE'
        and new.field_type not in ('SIGNATURE', 'INITIALS')
        and exists (
          select 1
            from public.signing_placement_template_fields d
           where d.template_id = new.template_id
             and d.linked_template_field_id = new.id
        ) then
    raise exception 'PLACEMENT_TEMPLATE_DATE_LINK_INVALID';
  end if;
  return new;
end;
$$;

revoke all on function public.sptf_enforce_integrity() from public;

drop trigger if exists sptf_enforce_integrity on public.signing_placement_template_fields;
create trigger sptf_enforce_integrity
  before insert or update on public.signing_placement_template_fields
  for each row
  execute function public.sptf_enforce_integrity();

-- A linked Date always follows its source's slot.
create or replace function public.sptf_dates_follow_source_slot()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.field_type in ('SIGNATURE', 'INITIALS')
     and (new.slot_role_code is distinct from old.slot_role_code
          or new.slot_ordinal is distinct from old.slot_ordinal) then
    update public.signing_placement_template_fields
       set slot_role_code = new.slot_role_code,
           slot_ordinal = new.slot_ordinal
     where template_id = new.template_id
       and linked_template_field_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.sptf_dates_follow_source_slot() from public;

drop trigger if exists sptf_dates_follow_source_slot on public.signing_placement_template_fields;
create trigger sptf_dates_follow_source_slot
  after update of slot_role_code, slot_ordinal on public.signing_placement_template_fields
  for each row
  execute function public.sptf_dates_follow_source_slot();

alter table public.signing_placement_template_fields enable row level security;
alter table public.signing_placement_template_fields force row level security;

drop policy if exists sptf_deny_authenticated on public.signing_placement_template_fields;
create policy sptf_deny_authenticated
  on public.signing_placement_template_fields
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 3. Application requests (idempotency only; not evidence)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_placement_template_applications (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_document_id uuid not null,
  template_id uuid not null
    references public.signing_placement_templates (id) on delete restrict,
  request_id uuid not null,
  actor_user_id uuid
    references public.profiles (id) on delete set null,
  created_count integer not null,
  skipped_count integer not null,

  constraint spta_counts_nonnegative
    check (created_count >= 0 and skipped_count >= 0),
  constraint spta_signing_request_key
    unique (signing_id, request_id),
  constraint spta_document_same_signing_fkey
    foreign key (signing_id, signing_document_id)
    references public.signing_documents (signing_id, id)
    on delete restrict
);

comment on table public.signing_placement_template_applications is
  'One row per applied placement-template request (idempotent replay of double submits). Configuration bookkeeping, not Signing evidence.';

create index if not exists spta_template_id_idx
  on public.signing_placement_template_applications (template_id);
create index if not exists spta_signing_document_id_idx
  on public.signing_placement_template_applications (signing_document_id);

alter table public.signing_placement_template_applications enable row level security;
alter table public.signing_placement_template_applications force row level security;

drop policy if exists spta_deny_authenticated on public.signing_placement_template_applications;
create policy spta_deny_authenticated
  on public.signing_placement_template_applications
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 4. Authoritative application transaction
-- ---------------------------------------------------------------------------

create or replace function public.signing_apply_placement_template(
  p_signing_id uuid,
  p_signing_document_id uuid,
  p_template_id uuid,
  p_request_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_signing record;
  v_document record;
  v_template record;
  v_previous record;
  v_form_id bigint;
  v_snapshot_form_id bigint;
  v_field record;
  v_participant_id uuid;
  v_source_id text;
  v_new_id uuid;
  v_created_ids jsonb := '{}'::jsonb;
  v_created integer := 0;
  v_skipped integer := 0;
begin
  if p_request_id is null or p_actor_user_id is null then
    raise exception 'PLACEMENT_TEMPLATE_REQUEST_INVALID';
  end if;

  select id, lifecycle_state, originating_organization_id
    into v_signing
    from public.signings
   where id = p_signing_id
   for update;
  if not found then
    raise exception 'PLACEMENT_TEMPLATE_SIGNING_NOT_FOUND';
  end if;

  select signing_document_id, template_id, created_count, skipped_count
    into v_previous
    from public.signing_placement_template_applications
   where signing_id = p_signing_id
     and request_id = p_request_id;
  if found then
    if v_previous.signing_document_id <> p_signing_document_id
       or v_previous.template_id <> p_template_id then
      raise exception 'PLACEMENT_TEMPLATE_REQUEST_REUSED';
    end if;
    return jsonb_build_object(
      'created', v_previous.created_count,
      'skipped', v_previous.skipped_count,
      'replayed', true
    );
  end if;

  if v_signing.lifecycle_state <> 'DRAFT' then
    raise exception 'PLACEMENT_TEMPLATE_NOT_DRAFT';
  end if;

  select id, included_in_draft, source_packet_form_id, selected_draft_source_snapshot_id
    into v_document
    from public.signing_documents
   where signing_id = p_signing_id
     and id = p_signing_document_id;
  if not found or v_document.included_in_draft is not true then
    raise exception 'PLACEMENT_TEMPLATE_DOCUMENT_INVALID';
  end if;

  if v_document.source_packet_form_id is not null then
    select form_id into v_form_id
      from public.packet_forms
     where id = v_document.source_packet_form_id;
  end if;
  if v_document.selected_draft_source_snapshot_id is not null then
    select form_id into v_snapshot_form_id
      from public.signing_draft_source_snapshots
     where signing_id = p_signing_id
       and id = v_document.selected_draft_source_snapshot_id;
    if v_snapshot_form_id is distinct from v_form_id then
      raise exception 'PLACEMENT_TEMPLATE_FORM_MISMATCH';
    end if;
  end if;
  if v_form_id is null then
    raise exception 'PLACEMENT_TEMPLATE_FORM_MISMATCH';
  end if;

  select id, form_id, scope_type, owner_user_id, organization_id, status
    into v_template
    from public.signing_placement_templates
   where id = p_template_id
   for share;
  if not found or v_template.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_TEMPLATE_NOT_AVAILABLE';
  end if;
  if v_template.form_id <> v_form_id then
    raise exception 'PLACEMENT_TEMPLATE_FORM_MISMATCH';
  end if;

  if v_template.scope_type = 'PERSONAL' then
    if v_template.owner_user_id <> p_actor_user_id then
      raise exception 'PLACEMENT_TEMPLATE_NOT_AVAILABLE';
    end if;
  else
    if v_template.organization_id <> v_signing.originating_organization_id
       or not exists (
         select 1
           from public.organization_members m
           join public.organizations o on o.id = m.organization_id
          where m.user_id = p_actor_user_id
            and m.organization_id = v_template.organization_id
            and m.status = 'ACTIVE'
            and o.status = 'ACTIVE'
       ) then
      raise exception 'PLACEMENT_TEMPLATE_NOT_AVAILABLE';
    end if;
    -- A Personal template fully wins over the Organization template.
    if exists (
      select 1
        from public.signing_placement_templates p
       where p.form_id = v_form_id
         and p.scope_type = 'PERSONAL'
         and p.owner_user_id = p_actor_user_id
         and p.status = 'ACTIVE'
    ) then
      raise exception 'PLACEMENT_TEMPLATE_SUPERSEDED';
    end if;
  end if;

  -- Sources before Dates so each Date links to its new source.
  for v_field in
    select f.*, slot.participant_id
      from public.signing_placement_template_fields f
      left join (
        select p.id as participant_id,
               p.role_code,
               row_number() over (
                 partition by p.role_code
                 order by p.display_order, p.create_date, p.id
               ) as ordinal
          from public.signing_participants p
         where p.signing_id = p_signing_id
           and p.participant_status <> 'REMOVED'
           and p.role_code is not null
      ) slot
        on slot.role_code = f.slot_role_code
       and slot.ordinal = f.slot_ordinal
     where f.template_id = p_template_id
     order by (f.field_type = 'DATE_SIGNED'), f.page_number, f.y, f.x, f.id
  loop
    v_participant_id := v_field.participant_id;

    if v_field.field_type = 'CHECKMARK' then
      insert into public.signing_draft_prepared_content (
        signing_id, signing_document_id, signing_participant_id, content_type,
        page_number, x, y, width, height
      ) values (
        p_signing_id, p_signing_document_id, null, 'CHECKMARK',
        v_field.page_number, v_field.x, v_field.y, v_field.width, v_field.height
      );
      v_created := v_created + 1;
      continue;
    end if;

    if v_participant_id is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_field.field_type = 'PRINTED_NAME' then
      insert into public.signing_draft_prepared_content (
        signing_id, signing_document_id, signing_participant_id, content_type,
        page_number, x, y, width, height
      ) values (
        p_signing_id, p_signing_document_id, v_participant_id, 'PRINTED_NAME',
        v_field.page_number, v_field.x, v_field.y, v_field.width, v_field.height
      );
      v_created := v_created + 1;
    elsif v_field.field_type = 'DATE_SIGNED' then
      v_source_id := v_created_ids ->> v_field.linked_template_field_id::text;
      if v_source_id is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      insert into public.signing_draft_fields (
        signing_id, signing_document_id, signing_participant_id, field_type,
        is_required, page_number, x, y, width, height,
        linked_signature_draft_field_id
      ) values (
        p_signing_id, p_signing_document_id, v_participant_id, 'DATE_SIGNED',
        v_field.is_required, v_field.page_number, v_field.x, v_field.y,
        v_field.width, v_field.height, v_source_id::uuid
      );
      v_created := v_created + 1;
    else
      insert into public.signing_draft_fields (
        signing_id, signing_document_id, signing_participant_id, field_type,
        is_required, page_number, x, y, width, height
      ) values (
        p_signing_id, p_signing_document_id, v_participant_id, v_field.field_type,
        v_field.is_required, v_field.page_number, v_field.x, v_field.y,
        v_field.width, v_field.height
      )
      returning id into v_new_id;
      v_created_ids := v_created_ids || jsonb_build_object(v_field.id::text, v_new_id::text);
      v_created := v_created + 1;
    end if;
  end loop;

  insert into public.signing_placement_template_applications (
    signing_id, signing_document_id, template_id, request_id, actor_user_id,
    created_count, skipped_count
  ) values (
    p_signing_id, p_signing_document_id, p_template_id, p_request_id,
    p_actor_user_id, v_created, v_skipped
  );

  return jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped,
    'replayed', false
  );
end;
$$;

revoke all on function public.signing_apply_placement_template(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.signing_apply_placement_template(uuid, uuid, uuid, uuid, uuid) from anon;
revoke all on function public.signing_apply_placement_template(uuid, uuid, uuid, uuid, uuid) from authenticated;
grant execute on function public.signing_apply_placement_template(uuid, uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Copy from another Form version
-- ---------------------------------------------------------------------------

create or replace function public.signing_copy_placement_template(
  p_source_template_id uuid,
  p_target_form_id bigint,
  p_target_page_count integer,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source record;
  v_target_id uuid;
  v_field record;
  v_new_id uuid;
  v_source_id text;
  v_created_ids jsonb := '{}'::jsonb;
  v_copied integer := 0;
  v_skipped integer := 0;
  v_skipped_pages integer[] := '{}';
begin
  if p_target_page_count is null or p_target_page_count < 1 then
    raise exception 'PLACEMENT_TEMPLATE_PAGE_COUNT_INVALID';
  end if;

  select id, form_id, scope_type, owner_user_id, organization_id, status
    into v_source
    from public.signing_placement_templates
   where id = p_source_template_id
   for share;
  if not found or v_source.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_TEMPLATE_NOT_AVAILABLE';
  end if;
  if v_source.form_id = p_target_form_id then
    raise exception 'PLACEMENT_TEMPLATE_COPY_SAME_FORM';
  end if;

  begin
    insert into public.signing_placement_templates (
      form_id, scope_type, owner_user_id, organization_id, status,
      created_by_user_id, updated_by_user_id, copied_from_template_id
    ) values (
      p_target_form_id, v_source.scope_type, v_source.owner_user_id,
      v_source.organization_id, 'ACTIVE', p_actor_user_id, p_actor_user_id,
      v_source.id
    )
    returning id into v_target_id;
  exception when unique_violation then
    raise exception 'PLACEMENT_TEMPLATE_ALREADY_EXISTS';
  end;

  for v_field in
    select *
      from public.signing_placement_template_fields
     where template_id = p_source_template_id
     order by (field_type = 'DATE_SIGNED'), page_number, y, x, id
  loop
    if v_field.page_number > p_target_page_count then
      v_skipped := v_skipped + 1;
      if not (v_field.page_number = any (v_skipped_pages)) then
        v_skipped_pages := v_skipped_pages || v_field.page_number;
      end if;
      continue;
    end if;

    v_source_id := null;
    if v_field.field_type = 'DATE_SIGNED' then
      v_source_id := v_created_ids ->> v_field.linked_template_field_id::text;
      if v_source_id is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;
    end if;

    insert into public.signing_placement_template_fields (
      template_id, field_type, slot_role_code, slot_ordinal, is_required,
      page_number, x, y, width, height, linked_template_field_id
    ) values (
      v_target_id, v_field.field_type, v_field.slot_role_code,
      v_field.slot_ordinal, v_field.is_required, v_field.page_number,
      v_field.x, v_field.y, v_field.width, v_field.height,
      v_source_id::uuid
    )
    returning id into v_new_id;
    if v_field.field_type in ('SIGNATURE', 'INITIALS') then
      v_created_ids := v_created_ids || jsonb_build_object(v_field.id::text, v_new_id::text);
    end if;
    v_copied := v_copied + 1;
  end loop;

  return jsonb_build_object(
    'template_id', v_target_id,
    'copied', v_copied,
    'skipped', v_skipped,
    'skipped_pages', to_jsonb(v_skipped_pages)
  );
end;
$$;

revoke all on function public.signing_copy_placement_template(uuid, bigint, integer, uuid) from public;
revoke all on function public.signing_copy_placement_template(uuid, bigint, integer, uuid) from anon;
revoke all on function public.signing_copy_placement_template(uuid, bigint, integer, uuid) from authenticated;
grant execute on function public.signing_copy_placement_template(uuid, bigint, integer, uuid) to service_role;

commit;
