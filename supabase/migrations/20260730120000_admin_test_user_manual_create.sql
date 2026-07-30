-- Global Admin test-user cleanup + manual confirmed-account creation.
-- Adds profile flags, deleted-user snapshots, safer historical FK nulling,
-- and column protection for admin-only / password-change flags.

-- ---------------------------------------------------------------------------
-- 1. Profile flags
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_test_user boolean not null default false;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.is_test_user is
  'When true, Global Admins may use the streamlined permanent test-user deletion flow.';

comment on column public.profiles.must_change_password is
  'When true, the user must change password before accessing the rest of the application.';

create index if not exists profiles_is_test_user_idx
  on public.profiles (is_test_user)
  where is_test_user = true;

create index if not exists profiles_must_change_password_idx
  on public.profiles (must_change_password)
  where must_change_password = true;

-- ---------------------------------------------------------------------------
-- 2. Protect admin / password flags (never trust browser elevation)
-- ---------------------------------------------------------------------------

create or replace function public.profiles_protect_admin_user_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No JWT (migrations / service-role trusted writers): allow server updates.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_app_admin() then
      new.is_test_user := false;
      new.must_change_password := false;
    end if;
    return new;
  end if;

  if new.is_test_user is distinct from old.is_test_user
     and not public.is_app_admin() then
    raise exception 'Only an application ADMIN may change profiles.is_test_user';
  end if;

  if new.must_change_password is distinct from old.must_change_password then
    -- Users may clear their own forced-password flag after a successful change.
    if new.must_change_password = false
       and old.must_change_password = true
       and auth.uid() = new.id then
      return new;
    end if;

    if not public.is_app_admin() then
      raise exception 'Only an application ADMIN may set profiles.must_change_password';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_admin_user_flags on public.profiles;
create trigger profiles_protect_admin_user_flags
before insert or update on public.profiles
for each row execute function public.profiles_protect_admin_user_flags();

revoke all on function public.profiles_protect_admin_user_flags() from public;

-- ---------------------------------------------------------------------------
-- 3. Historical / lifecycle FKs: allow profile hard-delete without destroying
--    audit/history rows (nullable actor references + retained snapshots).
-- ---------------------------------------------------------------------------

alter table public.forms
  drop constraint if exists forms_published_by_user_id_fkey;

alter table public.forms
  add constraint forms_published_by_user_id_fkey
  foreign key (published_by_user_id)
  references public.profiles (id)
  on delete set null;

alter table public.form_state_events
  drop constraint if exists form_state_events_performed_by_user_id_fkey;

alter table public.form_state_events
  add constraint form_state_events_performed_by_user_id_fkey
  foreign key (performed_by_user_id)
  references public.profiles (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- 4. Deleted-user snapshots (retain identity for audit without Auth user)
-- ---------------------------------------------------------------------------

create table if not exists public.deleted_user_snapshots (
  id bigint generated always as identity primary key,
  create_date timestamptz not null default now(),
  auth_user_id uuid not null,
  email text,
  display_name text,
  app_role text,
  is_test_user boolean not null default false,
  deleted_by_user_id uuid,
  deletion_summary jsonb not null default '{}'::jsonb,
  constraint deleted_user_snapshots_auth_user_id_unique unique (auth_user_id)
);

comment on table public.deleted_user_snapshots is
  'Retained identity snapshot after hard Auth deletion of disposable/test accounts.';

create index if not exists deleted_user_snapshots_deleted_by_idx
  on public.deleted_user_snapshots (deleted_by_user_id);

alter table public.deleted_user_snapshots enable row level security;

drop policy if exists deleted_user_snapshots_admin_select
  on public.deleted_user_snapshots;
create policy deleted_user_snapshots_admin_select
  on public.deleted_user_snapshots
  for select
  to authenticated
  using (public.is_app_admin());

-- No authenticated insert/update/delete — service role only.

grant select on table public.deleted_user_snapshots to authenticated;
