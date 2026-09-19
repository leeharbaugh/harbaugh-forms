-- Native Signing Stage 6 review hardening (development only).
-- completed_at immutability once set; no CASCADE; forward-only.

begin;

create or replace function public.signings_protect_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.completed_at is not null
     and new.completed_at is distinct from old.completed_at then
    raise exception 'signings.completed_at is immutable once set'
      using errcode = 'check_violation';
  end if;

  if old.lifecycle_state = 'COMPLETE'
     and new.lifecycle_state is distinct from old.lifecycle_state then
    raise exception 'signings.lifecycle_state COMPLETE is terminal'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists signings_protect_completed_at on public.signings;
create trigger signings_protect_completed_at
before update on public.signings
for each row execute function public.signings_protect_completed_at();

comment on function public.signings_protect_completed_at() is
  'Stage 6: completed_at and COMPLETE lifecycle are immutable after success.';

commit;
