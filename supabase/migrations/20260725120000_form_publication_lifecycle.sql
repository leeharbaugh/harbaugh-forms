-- Form publication lifecycle: Draft / Published / Retired
-- Separates record status (ACTIVE/INACTIVE/DELETED) from publication_state
-- (DRAFT/PUBLISHED) and packet_form availability_state (AVAILABLE/PENDING_PUBLICATION).
-- Development-only forward migration; does not rewrite packet field instances.

begin;

-- ---------------------------------------------------------------------------
-- 1. forms: publication + family identity
-- ---------------------------------------------------------------------------

alter table public.forms
  add column if not exists publication_state text,
  add column if not exists published_at timestamptz,
  add column if not exists published_by_user_id uuid,
  add column if not exists form_family_key text;

update public.forms
set form_family_key = upper(trim(form_code))
where form_family_key is null
  and form_code is not null
  and trim(form_code) <> '';

update public.forms
set form_family_key = 'FORM-' || id::text
where form_family_key is null;

update public.forms
set publication_state = case
  when status = 'ACTIVE' then 'PUBLISHED'
  when status = 'INACTIVE' then 'DRAFT'
  else coalesce(publication_state, 'DRAFT')
end
where publication_state is null;

update public.forms
set publication_state = 'DRAFT'
where status = 'INACTIVE'
  and publication_state = 'PUBLISHED';

alter table public.forms
  alter column publication_state set default 'DRAFT',
  alter column publication_state set not null,
  alter column form_family_key set not null;

alter table public.forms
  drop constraint if exists forms_publication_state_check;

alter table public.forms
  add constraint forms_publication_state_check
  check (publication_state in ('DRAFT', 'PUBLISHED'));

alter table public.forms
  drop constraint if exists forms_inactive_not_published_check;

alter table public.forms
  add constraint forms_inactive_not_published_check
  check (not (status = 'INACTIVE' and publication_state = 'PUBLISHED'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'forms_published_by_user_id_fkey'
  ) then
    alter table public.forms
      add constraint forms_published_by_user_id_fkey
      foreign key (published_by_user_id) references public.profiles (id);
  end if;
end $$;

create unique index if not exists forms_global_family_published_uidx
  on public.forms (lower(form_family_key))
  where status = 'ACTIVE'
    and publication_state = 'PUBLISHED'
    and scope = 'GLOBAL';

create unique index if not exists forms_private_family_published_uidx
  on public.forms (owner_user_id, lower(form_family_key))
  where status = 'ACTIVE'
    and publication_state = 'PUBLISHED'
    and scope = 'PRIVATE'
    and owner_user_id is not null;

create unique index if not exists forms_organization_family_published_uidx
  on public.forms (organization_id, lower(form_family_key))
  where status = 'ACTIVE'
    and publication_state = 'PUBLISHED'
    and scope = 'ORGANIZATION'
    and organization_id is not null;

create index if not exists forms_family_key_idx
  on public.forms (lower(form_family_key));

comment on column public.forms.publication_state is
  'DRAFT or PUBLISHED. Independent of record status ACTIVE/INACTIVE/DELETED.';
comment on column public.forms.form_family_key is
  'Stable family identity across revisions (typically form_code, e.g. TXR-1601).';

-- ---------------------------------------------------------------------------
-- 2. packet_forms: availability_state
-- ---------------------------------------------------------------------------

alter table public.packet_forms
  add column if not exists availability_state text;

update public.packet_forms
set availability_state = 'AVAILABLE'
where availability_state is null;

alter table public.packet_forms
  alter column availability_state set default 'AVAILABLE',
  alter column availability_state set not null;

alter table public.packet_forms
  drop constraint if exists packet_forms_availability_state_check;

alter table public.packet_forms
  add constraint packet_forms_availability_state_check
  check (availability_state in ('AVAILABLE', 'PENDING_PUBLICATION'));

comment on column public.packet_forms.availability_state is
  'AVAILABLE = usable document; PENDING_PUBLICATION = placeholder waiting for template publish.';

-- ---------------------------------------------------------------------------
-- 3. form_state_events audit table
-- ---------------------------------------------------------------------------

create table if not exists public.form_state_events (
  id bigint generated always as identity primary key,
  form_id bigint not null references public.forms (id),
  event_type text not null,
  from_status text,
  to_status text,
  from_publication_state text,
  to_publication_state text,
  reason text,
  performed_by_user_id uuid references public.profiles (id),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status text not null default 'ACTIVE',
  constraint form_state_events_event_type_check
    check (event_type in (
      'FORM_CREATED',
      'FORM_PUBLISHED',
      'FORM_UNPUBLISHED',
      'FORM_RETIRED',
      'FORM_RESTORED',
      'FORM_DELETED'
    )),
  constraint form_state_events_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED'))
);

create index if not exists form_state_events_form_id_create_date_idx
  on public.form_state_events (form_id, create_date desc);

drop trigger if exists form_state_events_set_update_date on public.form_state_events;
create trigger form_state_events_set_update_date
before update on public.form_state_events
for each row
execute function public.set_update_date();

grant select, insert, update, delete on table public.form_state_events to authenticated;
grant usage, select on sequence public.form_state_events_id_seq to authenticated;

alter table public.form_state_events enable row level security;

drop policy if exists "form_state_events_select" on public.form_state_events;
drop policy if exists "form_state_events_insert" on public.form_state_events;
drop policy if exists "form_state_events_update" on public.form_state_events;

create policy "form_state_events_select"
  on public.form_state_events
  for select
  to authenticated
  using (public.can_read_form(form_id));

-- Inserts are performed by security definer helpers / privileged sessions.
create policy "form_state_events_insert"
  on public.form_state_events
  for insert
  to authenticated
  with check (public.is_app_admin() or public.can_mutate_form(form_id));

create policy "form_state_events_update"
  on public.form_state_events
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- 4. Audit helper
-- ---------------------------------------------------------------------------

create or replace function public.insert_form_state_event(
  p_form_id bigint,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_from_publication_state text,
  p_to_publication_state text,
  p_reason text default null,
  p_performed_by_user_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_actor uuid;
begin
  v_actor := coalesce(p_performed_by_user_id, auth.uid());

  insert into public.form_state_events (
    form_id,
    event_type,
    from_status,
    to_status,
    from_publication_state,
    to_publication_state,
    reason,
    performed_by_user_id
  ) values (
    p_form_id,
    p_event_type,
    p_from_status,
    p_to_status,
    p_from_publication_state,
    p_to_publication_state,
    nullif(trim(coalesce(p_reason, '')), ''),
    v_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_form_state_event(
  bigint, text, text, text, text, text, text, uuid
) from public;
grant execute on function public.insert_form_state_event(
  bigint, text, text, text, text, text, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Form lifecycle state-machine trigger
-- ---------------------------------------------------------------------------

create or replace function public.enforce_form_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  status_changed boolean;
  pub_changed boolean;
begin
  -- Keep family key populated.
  if new.form_family_key is null or trim(new.form_family_key) = '' then
    new.form_family_key := upper(trim(coalesce(new.form_code, 'FORM-' || new.id::text)));
  else
    new.form_family_key := upper(trim(new.form_family_key));
  end if;

  if new.publication_state is null then
    new.publication_state := 'DRAFT';
  end if;

  -- Invalid combination always blocked (including privileged sessions).
  if new.status = 'INACTIVE' and new.publication_state = 'PUBLISHED' then
    raise exception
      'INACTIVE forms cannot be PUBLISHED (form_id=%)',
      new.id
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if new.publication_state not in ('DRAFT', 'PUBLISHED') then
      raise exception 'invalid publication_state %', new.publication_state
        using errcode = 'check_violation';
    end if;
    -- New forms must start as ACTIVE + DRAFT for authenticated clients.
    if auth.uid() is not null then
      if new.status is distinct from 'ACTIVE' then
        raise exception
          'new forms must be created as ACTIVE (form_id=%)',
          coalesce(new.id, 0)
          using errcode = 'check_violation';
      end if;
      if new.publication_state is distinct from 'DRAFT' then
        raise exception
          'new forms must be created as DRAFT (form_id=%)',
          coalesce(new.id, 0)
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  status_changed := new.status is distinct from old.status;
  pub_changed := new.publication_state is distinct from old.publication_state;

  if not status_changed and not pub_changed then
    return new;
  end if;

  -- Privileged / migration sessions may repair rows (still blocked from INACTIVE+PUBLISHED above).
  if auth.uid() is null then
    return new;
  end if;

  -- Soft-delete
  if new.status = 'DELETED' and old.status in ('ACTIVE', 'INACTIVE') then
    new.publication_state := case
      when old.publication_state = 'PUBLISHED' then 'DRAFT'
      else coalesce(new.publication_state, old.publication_state, 'DRAFT')
    end;
    if new.publication_state = 'PUBLISHED' then
      new.publication_state := 'DRAFT';
    end if;
    return new;
  end if;

  -- Disallow restoring DELETED via ordinary update
  if old.status = 'DELETED' and new.status is distinct from 'DELETED' then
    raise exception
      'deleted forms cannot be restored through ordinary update (form_id=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- Publish: ACTIVE+DRAFT → ACTIVE+PUBLISHED
  if old.status = 'ACTIVE'
     and old.publication_state = 'DRAFT'
     and new.status = 'ACTIVE'
     and new.publication_state = 'PUBLISHED'
     and not status_changed then
    return new;
  end if;

  -- Unpublish: ACTIVE+PUBLISHED → ACTIVE+DRAFT
  if old.status = 'ACTIVE'
     and old.publication_state = 'PUBLISHED'
     and new.status = 'ACTIVE'
     and new.publication_state = 'DRAFT'
     and not status_changed then
    new.published_at := null;
    new.published_by_user_id := null;
    return new;
  end if;

  -- Retire: ACTIVE+(DRAFT|PUBLISHED) → INACTIVE+DRAFT
  if old.status = 'ACTIVE'
     and new.status = 'INACTIVE'
     and new.publication_state = 'DRAFT' then
    new.published_at := null;
    new.published_by_user_id := null;
    return new;
  end if;

  -- Restore (restricted): INACTIVE+DRAFT → ACTIVE+DRAFT, app admin only
  if old.status = 'INACTIVE'
     and old.publication_state = 'DRAFT'
     and new.status = 'ACTIVE'
     and new.publication_state = 'DRAFT' then
    if not public.is_app_admin() then
      raise exception
        'only application admins can restore retired forms (form_id=%)',
        old.id
        using errcode = 'insufficient_privilege';
    end if;
    new.published_at := null;
    new.published_by_user_id := null;
    return new;
  end if;

  raise exception
    'invalid form lifecycle transition: %(%) → %(%) (form_id=%)',
    old.status,
    old.publication_state,
    new.status,
    new.publication_state,
    old.id
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists forms_enforce_lifecycle_transition on public.forms;
create trigger forms_enforce_lifecycle_transition
before insert or update of status, publication_state, form_family_key, form_code
on public.forms
for each row
execute function public.enforce_form_lifecycle_transition();

-- ---------------------------------------------------------------------------
-- 6. Audit trigger for lifecycle transitions
-- ---------------------------------------------------------------------------

create or replace function public.audit_form_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  begin
    v_reason := nullif(trim(current_setting('app.form_lifecycle_reason', true)), '');
  exception
    when others then
      v_reason := null;
  end;

  if tg_op = 'INSERT' then
    perform public.insert_form_state_event(
      new.id,
      'FORM_CREATED',
      null,
      new.status,
      null,
      new.publication_state,
      v_reason,
      auth.uid()
    );
    return new;
  end if;

  if new.status = 'DELETED' and old.status is distinct from 'DELETED' then
    perform public.insert_form_state_event(
      new.id,
      'FORM_DELETED',
      old.status,
      new.status,
      old.publication_state,
      new.publication_state,
      v_reason,
      auth.uid()
    );
    return new;
  end if;

  if old.status = 'ACTIVE'
     and old.publication_state = 'DRAFT'
     and new.status = 'ACTIVE'
     and new.publication_state = 'PUBLISHED' then
    perform public.insert_form_state_event(
      new.id,
      'FORM_PUBLISHED',
      old.status,
      new.status,
      old.publication_state,
      new.publication_state,
      v_reason,
      auth.uid()
    );
    return new;
  end if;

  if old.status = 'ACTIVE'
     and old.publication_state = 'PUBLISHED'
     and new.status = 'ACTIVE'
     and new.publication_state = 'DRAFT' then
    perform public.insert_form_state_event(
      new.id,
      'FORM_UNPUBLISHED',
      old.status,
      new.status,
      old.publication_state,
      new.publication_state,
      v_reason,
      auth.uid()
    );
    return new;
  end if;

  if old.status = 'ACTIVE' and new.status = 'INACTIVE' then
    perform public.insert_form_state_event(
      new.id,
      'FORM_RETIRED',
      old.status,
      new.status,
      old.publication_state,
      new.publication_state,
      v_reason,
      auth.uid()
    );
    return new;
  end if;

  if old.status = 'INACTIVE' and new.status = 'ACTIVE' then
    perform public.insert_form_state_event(
      new.id,
      'FORM_RESTORED',
      old.status,
      new.status,
      old.publication_state,
      new.publication_state,
      v_reason,
      auth.uid()
    );
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists forms_audit_lifecycle_transition on public.forms;
create trigger forms_audit_lifecycle_transition
after insert or update of status, publication_state
on public.forms
for each row
execute function public.audit_form_lifecycle_transition();

-- ---------------------------------------------------------------------------
-- 7. Structural edit protection (published / retired)
-- ---------------------------------------------------------------------------

create or replace function public.form_allows_structural_edit(p_form_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.forms f
    where f.id = p_form_id
      and f.status = 'ACTIVE'
      and f.publication_state = 'DRAFT'
  );
$$;

revoke all on function public.form_allows_structural_edit(bigint) from public;
grant execute on function public.form_allows_structural_edit(bigint) to authenticated;

create or replace function public.enforce_form_structural_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'forms' then
    if tg_op = 'UPDATE'
       and (
         new.source_storage_path is distinct from old.source_storage_path
         or new.form_code is distinct from old.form_code
         or new.form_family_key is distinct from old.form_family_key
         or new.version_label is distinct from old.version_label
         or new.form_name is distinct from old.form_name
         or new.form_category is distinct from old.form_category
         or new.state_code is distinct from old.state_code
       )
       and not (
         -- Allow lifecycle-only updates that also clear published_* metadata
         (new.status is distinct from old.status
          or new.publication_state is distinct from old.publication_state)
       )
       and old.status = 'ACTIVE'
       and old.publication_state = 'PUBLISHED'
       and new.status = 'ACTIVE'
       and new.publication_state = 'PUBLISHED' then
      raise exception
        'This form is published. Unpublish it before changing its structure.'
        using errcode = 'check_violation';
    end if;

    if tg_op = 'UPDATE'
       and old.status = 'INACTIVE'
       and (
         new.source_storage_path is distinct from old.source_storage_path
         or new.form_code is distinct from old.form_code
         or new.form_family_key is distinct from old.form_family_key
         or new.version_label is distinct from old.version_label
         or new.form_name is distinct from old.form_name
         or new.form_category is distinct from old.form_category
         or new.state_code is distinct from old.state_code
         or new.description is distinct from old.description
       )
       and new.status = 'INACTIVE' then
      raise exception
        'Retired form versions are read-only.'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- form_field_mappings
  if tg_op = 'DELETE' then
    return old;
  end if;

  if not public.form_allows_structural_edit(coalesce(new.form_id, old.form_id)) then
    if exists (
      select 1 from public.forms f
      where f.id = coalesce(new.form_id, old.form_id)
        and f.status = 'INACTIVE'
    ) then
      raise exception
        'Retired form versions are read-only.'
        using errcode = 'check_violation';
    end if;
    raise exception
      'This form is published. Unpublish it before changing its structure.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists forms_enforce_structural_edit on public.forms;
create trigger forms_enforce_structural_edit
before update on public.forms
for each row
execute function public.enforce_form_structural_edit();

drop trigger if exists form_field_mappings_enforce_structural_edit
  on public.form_field_mappings;
create trigger form_field_mappings_enforce_structural_edit
before insert or update on public.form_field_mappings
for each row
execute function public.enforce_form_structural_edit();

-- Soft-delete of mappings is an UPDATE of status; covered above.
-- Also block soft-delete updates that only change status on published/retired forms:
create or replace function public.enforce_form_mapping_status_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.status is distinct from old.status
     and not public.form_allows_structural_edit(old.form_id) then
    if exists (
      select 1 from public.forms f
      where f.id = old.form_id and f.status = 'INACTIVE'
    ) then
      raise exception
        'Retired form versions are read-only.'
        using errcode = 'check_violation';
    end if;
    raise exception
      'This form is published. Unpublish it before changing its structure.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists form_field_mappings_enforce_status_edit
  on public.form_field_mappings;
create trigger form_field_mappings_enforce_status_edit
before update of status on public.form_field_mappings
for each row
execute function public.enforce_form_mapping_status_edit();

-- ---------------------------------------------------------------------------
-- 8. Default family key on insert when omitted
-- ---------------------------------------------------------------------------

create or replace function public.set_form_family_key_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.form_family_key is null or trim(new.form_family_key) = '' then
    new.form_family_key := upper(trim(coalesce(nullif(new.form_code, ''), 'FORM')));
  end if;
  if new.publication_state is null then
    new.publication_state := 'DRAFT';
  end if;
  return new;
end;
$$;

drop trigger if exists forms_set_family_key_default on public.forms;
create trigger forms_set_family_key_default
before insert on public.forms
for each row
execute function public.set_form_family_key_default();

-- ---------------------------------------------------------------------------
-- 9. Guarded lifecycle RPCs (auth.uid() required)
-- ---------------------------------------------------------------------------

create or replace function public.set_config_form_lifecycle_reason(p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config(
    'app.form_lifecycle_reason',
    coalesce(nullif(trim(p_reason), ''), ''),
    true
  );
end;
$$;

revoke all on function public.set_config_form_lifecycle_reason(text) from public;
grant execute on function public.set_config_form_lifecycle_reason(text) to authenticated;

create or replace function public.publish_form_template(
  p_form_id bigint,
  p_retire_form_id bigint default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.forms%rowtype;
  v_prev public.forms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_mutate_form(p_form_id) then
    raise exception 'not authorized to publish form_id=%', p_form_id
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_form from public.forms where id = p_form_id for update;
  if not found then
    raise exception 'form not found: %', p_form_id using errcode = 'no_data_found';
  end if;

  if v_form.status <> 'ACTIVE' or v_form.publication_state <> 'DRAFT' then
    raise exception 'form must be ACTIVE + DRAFT to publish (form_id=%)', p_form_id
      using errcode = 'check_violation';
  end if;

  perform public.set_config_form_lifecycle_reason(p_reason);

  if p_retire_form_id is not null then
    if p_retire_form_id = p_form_id then
      raise exception 'cannot retire the same form being published'
        using errcode = 'check_violation';
    end if;

    select * into v_prev from public.forms where id = p_retire_form_id for update;
    if not found then
      raise exception 'previous form not found: %', p_retire_form_id
        using errcode = 'no_data_found';
    end if;

    if not public.can_mutate_form(p_retire_form_id) and not public.is_app_admin() then
      raise exception 'not authorized to retire form_id=%', p_retire_form_id
        using errcode = 'insufficient_privilege';
    end if;

    if v_prev.status <> 'ACTIVE' or v_prev.publication_state <> 'PUBLISHED' then
      raise exception 'previous form must be ACTIVE + PUBLISHED to retire atomically'
        using errcode = 'check_violation';
    end if;

    if lower(v_prev.form_family_key) <> lower(v_form.form_family_key)
       or v_prev.scope is distinct from v_form.scope
       or (v_form.scope = 'PRIVATE' and v_prev.owner_user_id is distinct from v_form.owner_user_id)
       or (v_form.scope = 'ORGANIZATION' and v_prev.organization_id is distinct from v_form.organization_id) then
      raise exception 'previous form is not in the same publish family'
        using errcode = 'check_violation';
    end if;

    update public.forms
    set status = 'INACTIVE',
        publication_state = 'DRAFT',
        published_at = null,
        published_by_user_id = null
    where id = p_retire_form_id;
  end if;

  update public.forms
  set publication_state = 'PUBLISHED',
      published_at = now(),
      published_by_user_id = auth.uid()
  where id = p_form_id;

  return jsonb_build_object(
    'form_id', p_form_id,
    'retired_form_id', p_retire_form_id,
    'publication_state', 'PUBLISHED'
  );
end;
$$;

revoke all on function public.publish_form_template(bigint, bigint, text) from public;
grant execute on function public.publish_form_template(bigint, bigint, text) to authenticated;

create or replace function public.unpublish_form_template(
  p_form_id bigint,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_mutate_form(p_form_id) then
    raise exception 'not authorized to unpublish form_id=%', p_form_id
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.forms
    where id = p_form_id and status = 'ACTIVE' and publication_state = 'PUBLISHED'
  ) then
    raise exception 'form must be ACTIVE + PUBLISHED to unpublish (form_id=%)', p_form_id
      using errcode = 'check_violation';
  end if;

  perform public.set_config_form_lifecycle_reason(p_reason);

  update public.forms
  set publication_state = 'DRAFT',
      published_at = null,
      published_by_user_id = null
  where id = p_form_id;

  return jsonb_build_object('form_id', p_form_id, 'publication_state', 'DRAFT');
end;
$$;

revoke all on function public.unpublish_form_template(bigint, text) from public;
grant execute on function public.unpublish_form_template(bigint, text) to authenticated;

create or replace function public.retire_form_template(
  p_form_id bigint,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_mutate_form(p_form_id) then
    raise exception 'not authorized to retire form_id=%', p_form_id
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.forms
    where id = p_form_id and status = 'ACTIVE'
  ) then
    raise exception 'form must be ACTIVE to retire (form_id=%)', p_form_id
      using errcode = 'check_violation';
  end if;

  perform public.set_config_form_lifecycle_reason(p_reason);

  update public.forms
  set status = 'INACTIVE',
      publication_state = 'DRAFT',
      published_at = null,
      published_by_user_id = null
  where id = p_form_id;

  return jsonb_build_object('form_id', p_form_id, 'status', 'INACTIVE', 'publication_state', 'DRAFT');
end;
$$;

revoke all on function public.retire_form_template(bigint, text) from public;
grant execute on function public.retire_form_template(bigint, text) to authenticated;

create or replace function public.restore_form_template(
  p_form_id bigint,
  p_reason text,
  p_confirm_newer_published boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.forms%rowtype;
  v_conflict public.forms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if not public.is_app_admin() then
    raise exception 'only application admins can restore retired forms'
      using errcode = 'insufficient_privilege';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'a written reason is required to restore a retired form'
      using errcode = 'check_violation';
  end if;

  select * into v_form from public.forms where id = p_form_id for update;
  if not found then
    raise exception 'form not found: %', p_form_id using errcode = 'no_data_found';
  end if;

  if v_form.status <> 'INACTIVE' or v_form.publication_state <> 'DRAFT' then
    raise exception 'form must be INACTIVE + DRAFT to restore (form_id=%)', p_form_id
      using errcode = 'check_violation';
  end if;

  select * into v_conflict
  from public.forms f
  where f.status = 'ACTIVE'
    and f.publication_state = 'PUBLISHED'
    and lower(f.form_family_key) = lower(v_form.form_family_key)
    and f.scope = v_form.scope
    and (
      (f.scope = 'GLOBAL')
      or (f.scope = 'PRIVATE' and f.owner_user_id is not distinct from v_form.owner_user_id)
      or (f.scope = 'ORGANIZATION' and f.organization_id is not distinct from v_form.organization_id)
    )
  limit 1;

  if found and not p_confirm_newer_published then
    raise exception
      'A newer PUBLISHED version exists in this form family (form_id=%). Confirm to restore as Draft anyway.',
      v_conflict.id
      using errcode = 'check_violation';
  end if;

  perform public.set_config_form_lifecycle_reason(p_reason);

  update public.forms
  set status = 'ACTIVE',
      publication_state = 'DRAFT',
      published_at = null,
      published_by_user_id = null
  where id = p_form_id;

  return jsonb_build_object(
    'form_id', p_form_id,
    'status', 'ACTIVE',
    'publication_state', 'DRAFT',
    'conflict_published_form_id', v_conflict.id
  );
end;
$$;

revoke all on function public.restore_form_template(bigint, text, boolean) from public;
grant execute on function public.restore_form_template(bigint, text, boolean) to authenticated;

commit;

