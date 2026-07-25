-- Secure publish pathway: restrict publish_form_template to the trusted
-- service-role / server client, require an explicit verified actor ID, and
-- reject publication when the structural fingerprint changed after validation.
-- PDF download/parse remains in the application server (not PostgreSQL).
-- Forward-only; does not edit 20260725120000_form_publication_lifecycle.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Actor helpers (do not rely on auth.uid() under service_role)
-- ---------------------------------------------------------------------------

create or replace function public.is_active_app_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'ACTIVE'
      and p.app_role = 'ADMIN'
  );
$$;

revoke all on function public.is_active_app_admin_user(uuid) from public;
revoke all on function public.is_active_app_admin_user(uuid) from anon;
revoke all on function public.is_active_app_admin_user(uuid) from authenticated;
grant execute on function public.is_active_app_admin_user(uuid) to service_role;

create or replace function public.can_publish_form_as(p_form_id bigint, p_actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_app_admin_user(p_actor_user_id)
    or exists (
      select 1
      from public.forms f
      where f.id = p_form_id
        and f.scope = 'PRIVATE'
        and f.owner_user_id = p_actor_user_id
    );
$$;

revoke all on function public.can_publish_form_as(bigint, uuid) from public;
revoke all on function public.can_publish_form_as(bigint, uuid) from anon;
revoke all on function public.can_publish_form_as(bigint, uuid) from authenticated;
grant execute on function public.can_publish_form_as(bigint, uuid) to service_role;

create or replace function public.set_config_form_lifecycle_actor(p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config(
    'app.form_lifecycle_actor',
    coalesce(p_actor_user_id::text, ''),
    true
  );
end;
$$;

revoke all on function public.set_config_form_lifecycle_actor(uuid) from public;
revoke all on function public.set_config_form_lifecycle_actor(uuid) from anon;
revoke all on function public.set_config_form_lifecycle_actor(uuid) from authenticated;
grant execute on function public.set_config_form_lifecycle_actor(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Structural fingerprint for TOCTOU protection
-- ---------------------------------------------------------------------------

create or replace function public.form_publish_structure_fingerprint(p_form_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce(
      (
        select format(
          'form:%s|path:%s|updated:%s|status:%s|pub:%s',
          f.id::text,
          coalesce(f.source_storage_path, ''),
          coalesce(f.update_date::text, ''),
          coalesce(f.status, ''),
          coalesce(f.publication_state, '')
        )
        from public.forms f
        where f.id = p_form_id
      ),
      'form:missing'
    )
    || '|mappings:' ||
    coalesce(
      (
        select string_agg(
          format(
            '%s:%s:%s:%s:%s:%s',
            m.id::text,
            coalesce(m.field_id::text, ''),
            coalesce(m.page_number::text, ''),
            coalesce(m.pdf_field_name, ''),
            coalesce(m.occurrence_index::text, ''),
            coalesce(m.status, '')
          ),
          ','
          order by m.id
        )
        from public.form_field_mappings m
        where m.form_id = p_form_id
          and m.status = 'ACTIVE'
      ),
      ''
    )
    || '|fields:' ||
    coalesce(
      (
        select string_agg(
          format(
            '%s:%s:%s:%s',
            fld.id::text,
            coalesce(fld.status, ''),
            coalesce(fld.source_type, ''),
            coalesce(fld.resolver_key, '')
          ),
          ','
          order by fld.id
        )
        from public.fields fld
        where fld.id in (
          select m.field_id
          from public.form_field_mappings m
          where m.form_id = p_form_id
            and m.status = 'ACTIVE'
            and m.field_id is not null
        )
      ),
      ''
    )
  );
$$;

revoke all on function public.form_publish_structure_fingerprint(bigint) from public;
revoke all on function public.form_publish_structure_fingerprint(bigint) from anon;
revoke all on function public.form_publish_structure_fingerprint(bigint) from authenticated;
grant execute on function public.form_publish_structure_fingerprint(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Audit trigger: prefer verified session actor over auth.uid()
-- ---------------------------------------------------------------------------

create or replace function public.audit_form_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  v_actor uuid;
begin
  begin
    v_reason := nullif(trim(current_setting('app.form_lifecycle_reason', true)), '');
  exception
    when others then
      v_reason := null;
  end;

  begin
    v_actor := nullif(trim(current_setting('app.form_lifecycle_actor', true)), '')::uuid;
  exception
    when others then
      v_actor := null;
  end;

  v_actor := coalesce(v_actor, auth.uid());

  if tg_op = 'INSERT' then
    perform public.insert_form_state_event(
      new.id,
      'FORM_CREATED',
      null,
      new.status,
      null,
      new.publication_state,
      v_reason,
      v_actor
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
      v_actor
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
      v_actor
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
      v_actor
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
      v_actor
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
      v_actor
    );
    return new;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Replace publish_form_template with service-role-only signature
-- ---------------------------------------------------------------------------

drop function if exists public.publish_form_template(bigint, bigint, text);

create or replace function public.publish_form_template(
  p_form_id bigint,
  p_retire_form_id bigint default null,
  p_reason text default null,
  p_actor_user_id uuid default null,
  p_expected_structure_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.forms%rowtype;
  v_prev public.forms%rowtype;
  v_fingerprint text;
  v_caller_role text;
begin
  -- Defense in depth beyond EXECUTE grants. Use JWT role (auth.role), not
  -- current_user — SECURITY DEFINER runs as the function owner.
  begin
    v_caller_role := coalesce(auth.role(), '');
  exception
    when others then
      v_caller_role := '';
  end;

  if v_caller_role in ('authenticated', 'anon') then
    raise exception 'publish_form_template is restricted to the trusted server pathway'
      using errcode = 'insufficient_privilege';
  end if;

  if p_actor_user_id is null then
    raise exception 'verified actor is required for publish'
      using errcode = 'insufficient_privilege';
  end if;

  if p_expected_structure_fingerprint is null
     or trim(p_expected_structure_fingerprint) = '' then
    raise exception 'structure fingerprint is required for publish'
      using errcode = 'check_violation';
  end if;

  if not public.can_publish_form_as(p_form_id, p_actor_user_id) then
    raise exception 'not authorized to publish form_id=%', p_form_id
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_form from public.forms where id = p_form_id for update;
  if not found then
    raise exception 'form not found: %', p_form_id using errcode = 'no_data_found';
  end if;

  -- Serialize against concurrent mapping edits for this form.
  perform 1
  from public.form_field_mappings m
  where m.form_id = p_form_id
  for update;

  v_fingerprint := public.form_publish_structure_fingerprint(p_form_id);
  if v_fingerprint is distinct from trim(p_expected_structure_fingerprint) then
    raise exception
      'form structure changed after validation; publish aborted (form_id=%)',
      p_form_id
      using errcode = 'check_violation';
  end if;

  if v_form.status <> 'ACTIVE' or v_form.publication_state <> 'DRAFT' then
    raise exception 'form must be ACTIVE + DRAFT to publish (form_id=%)', p_form_id
      using errcode = 'check_violation';
  end if;

  perform public.set_config_form_lifecycle_reason(p_reason);
  perform public.set_config_form_lifecycle_actor(p_actor_user_id);

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

    if not public.can_publish_form_as(p_retire_form_id, p_actor_user_id)
       and not public.is_active_app_admin_user(p_actor_user_id) then
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
      published_by_user_id = p_actor_user_id
  where id = p_form_id;

  return jsonb_build_object(
    'form_id', p_form_id,
    'retired_form_id', p_retire_form_id,
    'publication_state', 'PUBLISHED',
    'published_by_user_id', p_actor_user_id,
    'structure_fingerprint', v_fingerprint
  );
end;
$$;

revoke all on function public.publish_form_template(bigint, bigint, text, uuid, text) from public;
revoke all on function public.publish_form_template(bigint, bigint, text, uuid, text) from anon;
revoke all on function public.publish_form_template(bigint, bigint, text, uuid, text) from authenticated;
grant execute on function public.publish_form_template(bigint, bigint, text, uuid, text) to service_role;

commit;
