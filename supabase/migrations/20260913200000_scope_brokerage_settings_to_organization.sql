-- F10: Scope brokerage profile data to one organization.
-- The existing active profile belongs to Davey Goosmann Realty, as confirmed
-- during the security remediation review.

begin;

alter table public.brokerage_settings
  add column if not exists organization_id uuid
    references public.organizations (id) on delete restrict;

do $$
declare
  v_davey_goosmann_realty_id uuid;
begin
  select id
    into v_davey_goosmann_realty_id
  from public.organizations
  where name = 'Davey Goosmann Realty'
    and status = 'ACTIVE';

  if v_davey_goosmann_realty_id is null then
    raise exception
      'scope_brokerage_settings_to_organization requires active organization Davey Goosmann Realty';
  end if;

  update public.brokerage_settings
  set organization_id = v_davey_goosmann_realty_id
  where status = 'ACTIVE'
    and organization_id is null;

  if exists (
    select 1
    from public.brokerage_settings
    where status = 'ACTIVE'
      and organization_id is null
  ) then
    raise exception
      'scope_brokerage_settings_to_organization refused: active brokerage settings remain unassigned';
  end if;
end $$;

alter table public.brokerage_settings
  drop constraint if exists brokerage_settings_active_requires_organization;
alter table public.brokerage_settings
  add constraint brokerage_settings_active_requires_organization
  check (status <> 'ACTIVE' or organization_id is not null);

create unique index if not exists brokerage_settings_organization_active_uidx
  on public.brokerage_settings (organization_id)
  where status = 'ACTIVE';

drop policy if exists "brokerage_settings_select" on public.brokerage_settings;
drop policy if exists "brokerage_settings_insert" on public.brokerage_settings;
drop policy if exists "brokerage_settings_update" on public.brokerage_settings;

create policy "brokerage_settings_select"
  on public.brokerage_settings
  for select
  to authenticated
  using (
    public.is_active_organization_member(organization_id)
    or public.is_app_admin()
  );

create policy "brokerage_settings_insert"
  on public.brokerage_settings
  for insert
  to authenticated
  with check (public.is_app_admin());

create policy "brokerage_settings_update"
  on public.brokerage_settings
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

commit;
