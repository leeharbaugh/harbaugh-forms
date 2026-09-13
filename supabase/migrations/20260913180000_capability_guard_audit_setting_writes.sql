-- Security remediation F9: only the service-role-only RPC can set this
-- transaction-local capability immediately before changing audit_settings.
-- Browser clients cannot set PostgreSQL transaction settings through PostgREST.

begin;

create or replace function public.audit_settings_trusted_write_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_setting('app.audit_settings_trusted_write', true) is distinct from 'enabled' then
    raise exception 'audit settings can only be changed through the trusted audit operation'
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.set_ordinary_audit_logging_enabled(
  p_enabled boolean,
  p_actor_user_id uuid,
  p_actor_display_name text default null,
  p_actor_role_snapshot text default 'ADMIN'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting public.audit_settings%rowtype;
  v_event_id bigint;
  v_action text;
  v_summary text;
begin
  if p_actor_user_id is null then
    raise exception 'An audit-setting change requires an actor'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_actor_user_id and status = 'ACTIVE' and app_role = 'ADMIN'
  ) then
    raise exception 'Only an active application ADMIN may change audit logging'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_setting from public.audit_settings
  where status = 'ACTIVE' for update;
  if not found then
    raise exception 'Audit settings row is missing' using errcode = 'no_data_found';
  end if;

  perform set_config('app.audit_settings_trusted_write', 'enabled', true);

  update public.audit_settings
  set ordinary_logging_enabled = p_enabled,
      last_changed_by_user_id = p_actor_user_id,
      last_changed_at = now()
  where id = v_setting.id;

  v_action := case when p_enabled then 'audit_logging_enabled' else 'audit_logging_disabled' end;
  v_summary := case when p_enabled then 'Ordinary business audit logging was enabled.' else 'Ordinary business audit logging was disabled.' end;

  insert into public.audit_events (
    event_at, actor_user_id, actor_profile_id, actor_display_name,
    actor_role_snapshot, event_category, action, target_entity_type,
    target_entity_id, summary, metadata, success, is_mandatory, status
  ) values (
    now(), p_actor_user_id, p_actor_user_id, p_actor_display_name,
    coalesce(nullif(trim(p_actor_role_snapshot), ''), 'ADMIN'), 'audit_config',
    v_action, 'audit_settings', v_setting.id::text, v_summary,
    jsonb_build_object(
      'changedFields', jsonb_build_array('ordinary_logging_enabled'),
      'safeOldValues', jsonb_build_object('ordinary_logging_enabled', v_setting.ordinary_logging_enabled),
      'safeNewValues', jsonb_build_object('ordinary_logging_enabled', p_enabled)
    ), true, true, 'ACTIVE'
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.set_ordinary_audit_logging_enabled(boolean, uuid, text, text) from public;
revoke all on function public.set_ordinary_audit_logging_enabled(boolean, uuid, text, text) from anon;
revoke all on function public.set_ordinary_audit_logging_enabled(boolean, uuid, text, text) from authenticated;
grant execute on function public.set_ordinary_audit_logging_enabled(boolean, uuid, text, text) to service_role;

commit;