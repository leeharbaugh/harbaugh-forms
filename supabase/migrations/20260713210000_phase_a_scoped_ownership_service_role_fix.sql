-- Phase A follow-up: allow trusted service-role (no JWT) to create GLOBAL /
-- ORGANIZATION scoped library rows. Authenticated non-admins remain forced to
-- PRIVATE + auth.uid(). Also document temporary new-table RLS policies.

begin;

create or replace function public.set_scoped_library_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope is null then
    new.scope := 'PRIVATE';
  end if;

  -- Trusted server / service-role path (no JWT): honor explicit scope.
  -- Check constraints remain authoritative for GLOBAL/PRIVATE/ORGANIZATION.
  if auth.uid() is null then
    if new.scope = 'GLOBAL' then
      new.owner_user_id := null;
      new.organization_id := null;
    elsif new.scope = 'PRIVATE' then
      new.organization_id := null;
    elsif new.scope = 'ORGANIZATION' then
      new.owner_user_id := null;
    end if;
    return new;
  end if;

  -- Authenticated path: only app admins may create/convert GLOBAL or ORGANIZATION.
  if new.scope = 'GLOBAL' and not public.is_app_admin() then
    new.scope := 'PRIVATE';
  end if;

  if new.scope = 'ORGANIZATION' and not public.is_app_admin() then
    new.scope := 'PRIVATE';
    new.organization_id := null;
  end if;

  if new.scope = 'GLOBAL' then
    new.owner_user_id := null;
    new.organization_id := null;
  elsif new.scope = 'PRIVATE' then
    new.organization_id := null;
    if public.is_app_admin() then
      if new.owner_user_id is null then
        new.owner_user_id := auth.uid();
      end if;
    else
      new.owner_user_id := auth.uid();
    end if;
  elsif new.scope = 'ORGANIZATION' then
    new.owner_user_id := null;
  end if;

  if tg_op = 'UPDATE'
     and not public.is_app_admin()
     and (
       new.scope is distinct from old.scope
       or new.owner_user_id is distinct from old.owner_user_id
       or new.organization_id is distinct from old.organization_id
     ) then
    new.scope := old.scope;
    new.owner_user_id := old.owner_user_id;
    new.organization_id := old.organization_id;
  end if;

  return new;
end;
$$;

comment on function public.set_scoped_library_ownership() is
  'Phase A: assign scope/owner for forms, collections, and fields. '
  'Standard users are forced to PRIVATE + auth.uid(). '
  'App admins may create GLOBAL/ORGANIZATION. '
  'Service-role (auth.uid() null) may set explicit valid scope combinations.';

comment on policy "organizations_authenticated_all" on public.organizations is
  'TEMPORARY Phase A compatibility: any authenticated user full access. '
  'Replace during Phase C RLS cutover. Do not invite a second user until then.';

comment on policy "organization_members_authenticated_all" on public.organization_members is
  'TEMPORARY Phase A compatibility: any authenticated user full access. '
  'Replace during Phase C RLS cutover. Do not invite a second user until then.';

comment on policy "user_agent_settings_authenticated_all" on public.user_agent_settings is
  'TEMPORARY Phase A compatibility: any authenticated user full access. '
  'Replace during Phase C RLS cutover. Do not invite a second user until then.';

commit;
