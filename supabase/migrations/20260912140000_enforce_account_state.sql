-- Enforce account eligibility at the database and Storage boundaries.
-- Browser redirects are convenience controls; a valid JWT must not retain data access.

begin;

create or replace function public.has_active_application_account()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ACTIVE'
      and p.onboarding_status in ('ACTIVE', 'INVITED')
  );
$$;

create or replace function public.has_application_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_active_application_account()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.must_change_password = false
    );
$$;

create or replace function public.is_active_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_application_access() and exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
      and o.status = 'ACTIVE'
  );
$$;

revoke all on function public.has_active_application_account() from public;
revoke all on function public.has_application_access() from public;
grant execute on function public.has_active_application_account() to authenticated;
grant execute on function public.has_application_access() to authenticated;

-- The profile row remains readable while a password change is required so the
-- change-password flow can complete. Every other RLS-protected application
-- table requires a fully eligible account.
drop policy if exists account_state_profile_gate on public.profiles;
create policy account_state_profile_gate on public.profiles as restrictive
  for all to authenticated
  using (public.has_active_application_account())
  with check (public.has_active_application_account());

do $$
declare r record;
begin
  for r in
    select c.oid::regclass as table_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname <> 'profiles'
  loop
    execute format('drop policy if exists account_state_application_gate on %s', r.table_name);
    execute format(
      'create policy account_state_application_gate on %s as restrictive for all to authenticated using (public.has_application_access()) with check (public.has_application_access())',
      r.table_name
    );
  end loop;
end $$;

drop policy if exists account_state_storage_gate on storage.objects;
create policy account_state_storage_gate on storage.objects as restrictive
  for all to authenticated
  using (public.has_application_access())
  with check (public.has_application_access());

-- A browser client may never clear this flag directly. The application clears
-- it through its service-role path only after Auth accepts a new password.
create or replace function public.profiles_protect_admin_user_flags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if not public.is_app_admin() then
      new.is_test_user := false;
      new.must_change_password := false;
    end if;
    return new;
  end if;
  if new.is_test_user is distinct from old.is_test_user and not public.is_app_admin() then
    raise exception 'Only an application ADMIN may change profiles.is_test_user';
  end if;
  if new.must_change_password is distinct from old.must_change_password and not public.is_app_admin() then
    raise exception 'Only an application ADMIN may change profiles.must_change_password';
  end if;
  return new;
end;
$$;

commit;
