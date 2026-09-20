-- Native Signing recovery-access review fixes (forward-only).
-- Development apply only via deliberate tooling. Do not edit prior migrations.
--
-- Addresses PR #43 review findings:
-- 1. Prevent access_epoch rollback on signing_system_controls that would
--    revive historical credential/session epochs without re-issuance.
-- 2. Record retired epochs in an append-only history table.
-- 3. Reject control-row deletion (missing row already fails closed in app).
-- 4. Document production apply: after 20260920180000, operators must leave
--    or set access_suspended=true until deliberate resume (that migration's
--    existing-default UPDATE seeded false for active development; this
--    migration does not re-open access and does not force-suspend active
--    development rows).

begin;

-- ---------------------------------------------------------------------------
-- 1. Retired access-epoch history (append-only)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_access_epoch_history (
  access_epoch text primary key,
  retired_at timestamptz not null default now(),
  retire_note text,
  constraint saeh_epoch_not_blank check (char_length(trim(access_epoch)) > 0)
);

comment on table public.signing_access_epoch_history is
  'Append-only retired Signing access epochs. Reactivating a retired epoch as '
  'signing_system_controls.access_epoch is rejected so historical bearers cannot '
  'be revived by rolling the current epoch backward.';

alter table public.signing_access_epoch_history enable row level security;
alter table public.signing_access_epoch_history force row level security;

drop policy if exists saeh_deny_authenticated on public.signing_access_epoch_history;
create policy saeh_deny_authenticated on public.signing_access_epoch_history
  as restrictive for all to authenticated using (false) with check (false);

drop policy if exists saeh_deny_anon on public.signing_access_epoch_history;
create policy saeh_deny_anon on public.signing_access_epoch_history
  as restrictive for all to anon using (false) with check (false);

drop policy if exists account_state_application_gate
  on public.signing_access_epoch_history;
create policy account_state_application_gate on public.signing_access_epoch_history
  as restrictive for all to authenticated
  using (public.has_application_access())
  with check (public.has_application_access());

revoke all on table public.signing_access_epoch_history from public;
revoke all on table public.signing_access_epoch_history from anon;
revoke all on table public.signing_access_epoch_history from authenticated;
grant select, insert, update, delete on table public.signing_access_epoch_history
  to service_role;

-- Seed history with the pre-migration sentinel so it can never become current.
insert into public.signing_access_epoch_history (access_epoch, retire_note)
values (
  'pre-recovery-access-v0',
  'sentinel: pre-migration credential/session rows; never reactivate as current'
)
on conflict (access_epoch) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Controls mutation guards
-- ---------------------------------------------------------------------------

create or replace function public.signing_system_controls_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'signing_system_controls row cannot be deleted'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    -- Epoch change requires suspension in the same row image (atomic bump).
    if new.access_epoch is distinct from old.access_epoch then
      if new.access_suspended is not true then
        raise exception
          'signing_system_controls.access_epoch may change only while access_suspended=true'
          using errcode = 'check_violation';
      end if;
      if exists (
        select 1
        from public.signing_access_epoch_history h
        where h.access_epoch = new.access_epoch
      ) then
        raise exception
          'signing_system_controls.access_epoch cannot be set to a retired epoch'
          using errcode = 'check_violation';
      end if;
      -- Retire the previous epoch so it cannot be restored later.
      insert into public.signing_access_epoch_history (access_epoch, retire_note)
      values (
        old.access_epoch,
        coalesce(new.access_epoch_bump_note, 'retired by access epoch bump')
      )
      on conflict (access_epoch) do nothing;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.signing_system_controls_guard() is
  'Rejects controls deletion; requires access_suspended=true on epoch change; '
  'rejects reactivation of retired epochs; appends prior epoch to history.';

drop trigger if exists ssc_access_controls_guard on public.signing_system_controls;
create trigger ssc_access_controls_guard
before update or delete on public.signing_system_controls
for each row execute function public.signing_system_controls_guard();

-- Bound free-text note lengths (recovery provenance hygiene).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ssc_access_note_lengths'
      and conrelid = 'public.signing_system_controls'::regclass
  ) then
    alter table public.signing_system_controls
      add constraint ssc_access_note_lengths check (
        (access_suspended_by_note is null
          or char_length(access_suspended_by_note) <= 500)
        and (access_resumed_by_note is null
          or char_length(access_resumed_by_note) <= 500)
        and (access_epoch_bump_note is null
          or char_length(access_epoch_bump_note) <= 500)
      );
  end if;
end $$;

comment on column public.signing_system_controls.access_epoch is
  'Current access epoch (UUID text). Bump requires access_suspended=true and '
  'retires the prior epoch into signing_access_epoch_history. Retired epochs '
  'cannot be restored as current. Distinct from wrap-key rotation.';

commit;
