-- Per-user UI preferences (column widths, etc.). User-scoped; does not affect
-- shared workspace data ownership elsewhere.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  status varchar(20) not null default 'ACTIVE',
  preferences jsonb not null default '{}'::jsonb,

  constraint user_preferences_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'DELETED'))
);

create index if not exists user_preferences_status_idx
  on public.user_preferences (status);

create trigger user_preferences_set_update_date
before update on public.user_preferences
for each row execute function public.set_update_date();

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences_own_row" on public.user_preferences;
create policy "user_preferences_own_row"
  on public.user_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on table public.user_preferences to authenticated;
