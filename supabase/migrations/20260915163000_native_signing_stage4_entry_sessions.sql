-- Native Signing Stage 4 review fix: participant entry sessions.
--
-- The invitation link carries a bearer credential as a path segment. Opening it
-- exchanges that bearer for a short-lived, HttpOnly cookie session so the raw
-- credential never remains in the address bar, browser history, bookmarks, or a
-- Referer header for the rest of the participant's visit.
--
-- These rows are access plumbing, not signer evidence: no ceremony state, no
-- adopted marks, no consent. Only the SHA-256 hex digest of the session token is
-- stored; the raw session token exists only in the participant's cookie.
-- Forward-only. Development only. Does not create ceremony tables.

begin;

create table if not exists public.signing_entry_sessions (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_participant_id uuid not null,
  signing_participant_credential_id uuid not null,

  session_token_hash text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,

  constraint ses_session_token_hash_hex
    check (session_token_hash ~ '^[0-9a-f]{64}$'),
  constraint ses_expires_after_create
    check (expires_at > create_date),
  constraint ses_signing_id_id_key
    unique (signing_id, id),
  constraint ses_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict,
  constraint ses_credential_same_signing_fkey
    foreign key (signing_id, signing_participant_credential_id)
    references public.signing_participant_credentials (signing_id, id)
    on delete restrict
);

create unique index if not exists ses_session_token_hash_uidx
  on public.signing_entry_sessions (session_token_hash);

create index if not exists ses_signing_id_idx
  on public.signing_entry_sessions (signing_id);

create index if not exists ses_credential_id_idx
  on public.signing_entry_sessions (signing_participant_credential_id);

drop trigger if exists signing_entry_sessions_set_update_date
  on public.signing_entry_sessions;
create trigger signing_entry_sessions_set_update_date
before update on public.signing_entry_sessions
for each row execute function public.set_update_date();

comment on table public.signing_entry_sessions is
  'Short-lived participant entry sessions exchanged from an invitation bearer credential. Stores session token hash only. Access plumbing, not signer evidence: not signing_document_versions, not package revisions, not participant ceremony evidence.';

-- Deny-by-default RLS, matching every other Stage 4 table.
do $$
declare
  t text := 'signing_entry_sessions';
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
