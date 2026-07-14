-- Phase D: admin invitations and onboarding tracking
-- Does not alter Phase A–C RLS semantics for business records.

-- ---------------------------------------------------------------------------
-- 1. Invitation / onboarding columns on profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists onboarding_status text not null default 'ACTIVE',
  add column if not exists invited_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists invited_by_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_onboarding_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_onboarding_status_check
      check (onboarding_status in ('INVITED', 'ACTIVE', 'DISABLED'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_invited_by_user_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_invited_by_user_id_fkey
      foreign key (invited_by_user_id)
      references auth.users (id)
      on delete set null;
  end if;
end $$;

create index if not exists profiles_onboarding_status_idx
  on public.profiles (onboarding_status)
  where status = 'ACTIVE';

-- Existing active profiles remain ACTIVE for onboarding.
update public.profiles
set onboarding_status = 'ACTIVE',
    activated_at = coalesce(activated_at, create_date)
where status = 'ACTIVE'
  and onboarding_status = 'ACTIVE'
  and activated_at is null;

-- ---------------------------------------------------------------------------
-- 2. Prevent removing the final active application admin
-- ---------------------------------------------------------------------------

create or replace function public.count_active_app_admins()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.profiles
  where status = 'ACTIVE'
    and app_role = 'ADMIN'
    and onboarding_status = 'ACTIVE';
$$;

revoke all on function public.count_active_app_admins() from public;
grant execute on function public.count_active_app_admins() to authenticated;

create or replace function public.profiles_protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_active_admin boolean;
  v_is_active_admin boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  v_was_active_admin :=
    old.status = 'ACTIVE'
    and old.app_role = 'ADMIN'
    and old.onboarding_status = 'ACTIVE';

  v_is_active_admin :=
    new.status = 'ACTIVE'
    and new.app_role = 'ADMIN'
    and new.onboarding_status = 'ACTIVE';

  if v_was_active_admin and not v_is_active_admin then
    if public.count_active_app_admins() <= 1 then
      raise exception
        'Cannot demote or disable the final active application ADMIN';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin
before update on public.profiles
for each row execute function public.profiles_protect_last_admin();

-- ---------------------------------------------------------------------------
-- 3. Protect onboarding audit fields from non-admin JWT callers
-- ---------------------------------------------------------------------------

create or replace function public.profiles_protect_onboarding_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No JWT (migrations / service role SQL): allow trusted server updates.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_app_admin() then
      if new.onboarding_status is distinct from 'ACTIVE' then
        new.onboarding_status := 'ACTIVE';
      end if;
      new.invited_at := null;
      new.invited_by_user_id := null;
      if new.activated_at is null then
        new.activated_at := now();
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_app_admin() then
      -- Invitee may activate their own INVITED profile once.
      if old.id = auth.uid()
         and old.onboarding_status = 'INVITED'
         and new.onboarding_status = 'ACTIVE'
         and new.invited_at is not distinct from old.invited_at
         and new.invited_by_user_id is not distinct from old.invited_by_user_id
         and new.app_role is not distinct from old.app_role
         and new.status is not distinct from old.status
      then
        return new;
      end if;

      if new.onboarding_status is distinct from old.onboarding_status
         or new.invited_at is distinct from old.invited_at
         or new.invited_by_user_id is distinct from old.invited_by_user_id
         or new.activated_at is distinct from old.activated_at
      then
        raise exception 'Only an application ADMIN may change invitation/onboarding fields';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_onboarding_fields on public.profiles;
create trigger profiles_protect_onboarding_fields
before insert or update on public.profiles
for each row execute function public.profiles_protect_onboarding_fields();

-- ---------------------------------------------------------------------------
-- 4. Allow invitees to activate their own INVITED profile once
-- ---------------------------------------------------------------------------

create or replace function public.activate_invited_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set onboarding_status = 'ACTIVE',
      activated_at = coalesce(activated_at, now()),
      update_date = now()
  where id = auth.uid()
    and status = 'ACTIVE'
    and onboarding_status = 'INVITED'
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
    from public.profiles
    where id = auth.uid();
  end if;

  return v_row;
end;
$$;

revoke all on function public.activate_invited_profile() from public;
grant execute on function public.activate_invited_profile() to authenticated;
