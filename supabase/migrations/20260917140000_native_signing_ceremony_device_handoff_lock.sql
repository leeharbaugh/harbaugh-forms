-- Native Signing Stage 5: device handoff lock (agent workspace boundary).
-- Forward-only. Development only. Do not apply to production from this stage.
--
-- Locks the agent workspace on a shared device while a participant uses an
-- in-person handoff. Released only by explicit agent unlock on Return-to-Agent.

begin;

create table if not exists public.signing_device_handoff_locks (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_participant_id uuid not null,
  agent_user_id uuid not null
    references public.profiles (id) on delete restrict,

  lock_token_hash text not null,
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,

  signing_in_person_handoff_id uuid,

  constraint sdhl_lock_token_hash_hex
    check (lock_token_hash ~ '^[0-9a-f]{64}$'),
  constraint sdhl_expires_after_create
    check (expires_at > create_date),
  constraint sdhl_signing_id_id_key
    unique (signing_id, id),
  constraint sdhl_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict,
  constraint sdhl_handoff_same_signing_fkey
    foreign key (signing_id, signing_in_person_handoff_id)
    references public.signing_in_person_handoffs (signing_id, id)
    on delete restrict
);

create unique index if not exists sdhl_one_open_per_signing_uidx
  on public.signing_device_handoff_locks (signing_id)
  where released_at is null;

create unique index if not exists sdhl_lock_token_hash_uidx
  on public.signing_device_handoff_locks (lock_token_hash);

create index if not exists sdhl_agent_user_idx
  on public.signing_device_handoff_locks (agent_user_id);

drop trigger if exists signing_device_handoff_locks_set_update_date
  on public.signing_device_handoff_locks;
create trigger signing_device_handoff_locks_set_update_date
before update on public.signing_device_handoff_locks
for each row execute function public.set_update_date();

comment on table public.signing_device_handoff_locks is
  'Shared-device agent workspace lock during supervised in-person handoff. Access plumbing only; not Signing finalization.';

do $$
declare
  t text := 'signing_device_handoff_locks';
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('alter table public.%I force row level security', t);

  execute format('drop policy if exists %I on public.%I', t || '_deny_authenticated', t);
  execute format(
    'create policy %I on public.%I as restrictive for all to authenticated using (false) with check (false)',
    t || '_deny_authenticated', t
  );

  execute format('drop policy if exists %I on public.%I', t || '_deny_anon', t);
  execute format(
    'create policy %I on public.%I as restrictive for all to anon using (false) with check (false)',
    t || '_deny_anon', t
  );

  execute format('drop policy if exists account_state_application_gate on public.%I', t);
  execute format(
    'create policy account_state_application_gate on public.%I as restrictive for all to authenticated using (public.has_application_access()) with check (public.has_application_access())',
    t
  );

  execute format('revoke all on table public.%I from public', t);
  execute format('revoke all on table public.%I from anon', t);
  execute format('revoke all on table public.%I from authenticated', t);
end $$;

commit;
