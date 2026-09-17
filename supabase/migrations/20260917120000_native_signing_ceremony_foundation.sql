-- Native Signing Stage 5: participant ceremony foundation.
-- Forward-only. Development only. Do not apply to production from this stage.
--
-- Adds:
--   signing_consent_disclosure_versions + participant consent evidence columns
--   signing_in_person_handoffs (supervised entry without emailed bearer)
--   signing_browser_sessions (Model B ceremony authority after I am)
--   signing_participant_presence_leases
--   signing_amendment_locks (primitive for ceremony race safety; no agent UI)
--
-- Deny-by-default FORCE RLS on every new table. No CASCADE.

begin;

-- ---------------------------------------------------------------------------
-- 1. Consent disclosure versions (immutable published copy)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_consent_disclosure_versions (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  version_key text not null,
  title text not null,
  body_text text not null,
  content_sha256 text not null,
  is_production_ready boolean not null default false,
  published_at timestamptz not null default now(),
  superseded_at timestamptz,

  constraint scdv_version_key_not_blank
    check (length(trim(version_key)) > 0),
  constraint scdv_title_not_blank
    check (length(trim(title)) > 0),
  constraint scdv_body_not_blank
    check (length(trim(body_text)) > 0),
  constraint scdv_content_sha256_hex
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint scdv_version_key_key
    unique (version_key)
);

create unique index if not exists scdv_one_current_uidx
  on public.signing_consent_disclosure_versions ((true))
  where superseded_at is null;

comment on table public.signing_consent_disclosure_versions is
  'Immutable electronic-signing disclosure versions. Historical acceptances reference a specific row + fingerprint; body text is never rewritten in place.';

-- Non-production placeholder disclosure. Production enablement still requires
-- Texas legal review of final disclosure language.
insert into public.signing_consent_disclosure_versions (
  version_key,
  title,
  body_text,
  content_sha256,
  is_production_ready
)
values (
  'dev-placeholder-2026-09-17',
  'Electronic records and signatures disclosure (development placeholder)',
  $disclosure$DEVELOPMENT PLACEHOLDER — NOT PRODUCTION LEGAL COPY.

This disclosure is a temporary development placeholder for Harbaugh Forms Native Signing ceremony testing. It is not counsel-approved Texas compliance language.

By continuing, you affirm that:
1. You can access and retain electronic records related to this Signing.
2. You agree to use electronic signatures for this Signing only.
3. You may request paper records or decline electronic signing by contacting the sending agent; Harbaugh Forms does not charge an application fee for that request.
4. You need a device, internet access, and the ability to view, download, and print PDF documents to use this electronic Signing.

This consent applies only to this Signing. Final production disclosure text requires Texas legal review before production enablement.
$disclosure$,
  -- Precomputed SHA-256 of body_text (UTF-8). Never rewrite body_text in place.
  '2bdb6aee9d0bb28adefb8925aa1989a3f31e47fdd208c29664ec29a54fa886b4',
  false
)
on conflict (version_key) do nothing;

alter table public.signing_participants
  add column if not exists consent_disclosure_version_id uuid;

alter table public.signing_participants
  add column if not exists consent_content_sha256 text;

alter table public.signing_participants
  drop constraint if exists sp_consent_content_sha256_hex;
alter table public.signing_participants
  add constraint sp_consent_content_sha256_hex
  check (
    consent_content_sha256 is null
    or consent_content_sha256 ~ '^[0-9a-f]{64}$'
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sp_consent_disclosure_version_fkey'
  ) then
    alter table public.signing_participants
      add constraint sp_consent_disclosure_version_fkey
      foreign key (consent_disclosure_version_id)
      references public.signing_consent_disclosure_versions (id)
      on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. In-person handoff entry (no emailed bearer required)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_in_person_handoffs (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_participant_id uuid not null,
  created_by_user_id uuid not null
    references public.profiles (id) on delete restrict,

  handoff_token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,

  constraint siph_token_hash_hex
    check (handoff_token_hash ~ '^[0-9a-f]{64}$'),
  constraint siph_expires_after_create
    check (expires_at > create_date),
  constraint siph_signing_id_id_key
    unique (signing_id, id),
  constraint siph_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict
);

create unique index if not exists siph_token_hash_uidx
  on public.signing_in_person_handoffs (handoff_token_hash);

create index if not exists siph_signing_participant_idx
  on public.signing_in_person_handoffs (signing_id, signing_participant_id);

drop trigger if exists signing_in_person_handoffs_set_update_date
  on public.signing_in_person_handoffs;
create trigger signing_in_person_handoffs_set_update_date
before update on public.signing_in_person_handoffs
for each row execute function public.set_update_date();

comment on table public.signing_in_person_handoffs is
  'Supervised in-person participant handoff tokens. Access plumbing only; ceremony authority is signing_browser_sessions after I am.';

-- ---------------------------------------------------------------------------
-- 3. Ceremony browser sessions (Model B)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_browser_sessions (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_participant_id uuid not null,

  signing_participant_credential_id uuid,
  signing_in_person_handoff_id uuid,

  session_token_hash text not null,
  status text not null default 'ACTIVE',

  identity_affirmed_at timestamptz not null default now(),
  last_meaningful_activity_at timestamptz not null default now(),
  inactivity_expires_at timestamptz not null,

  ended_at timestamptz,
  ended_reason text,
  superseded_by_session_id uuid,

  constraint sbs_session_token_hash_hex
    check (session_token_hash ~ '^[0-9a-f]{64}$'),
  constraint sbs_status_check
    check (
      status in (
        'ACTIVE',
        'SUPERSEDED',
        'EXPIRED',
        'REVOKED',
        'ENDED'
      )
    ),
  constraint sbs_inactivity_after_create
    check (inactivity_expires_at > create_date),
  constraint sbs_provenance_xor
    check (
      (
        signing_participant_credential_id is not null
        and signing_in_person_handoff_id is null
      )
      or (
        signing_participant_credential_id is null
        and signing_in_person_handoff_id is not null
      )
    ),
  constraint sbs_ended_requires_timestamp
    check (
      (status = 'ACTIVE' and ended_at is null)
      or (status <> 'ACTIVE' and ended_at is not null)
    ),
  constraint sbs_signing_id_id_key
    unique (signing_id, id),
  constraint sbs_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict,
  constraint sbs_credential_same_signing_fkey
    foreign key (signing_id, signing_participant_credential_id)
    references public.signing_participant_credentials (signing_id, id)
    on delete restrict,
  constraint sbs_handoff_same_signing_fkey
    foreign key (signing_id, signing_in_person_handoff_id)
    references public.signing_in_person_handoffs (signing_id, id)
    on delete restrict
);

create unique index if not exists sbs_session_token_hash_uidx
  on public.signing_browser_sessions (session_token_hash);

-- Exactly one ACTIVE ceremony session per participant per Signing.
create unique index if not exists sbs_one_active_per_participant_uidx
  on public.signing_browser_sessions (signing_id, signing_participant_id)
  where status = 'ACTIVE';

create index if not exists sbs_signing_participant_idx
  on public.signing_browser_sessions (signing_id, signing_participant_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sbs_superseded_by_same_signing_fkey'
  ) then
    alter table public.signing_browser_sessions
      add constraint sbs_superseded_by_same_signing_fkey
      foreign key (signing_id, superseded_by_session_id)
      references public.signing_browser_sessions (signing_id, id)
      on delete restrict;
  end if;
end $$;

drop trigger if exists signing_browser_sessions_set_update_date
  on public.signing_browser_sessions;
create trigger signing_browser_sessions_set_update_date
before update on public.signing_browser_sessions
for each row execute function public.set_update_date();

comment on table public.signing_browser_sessions is
  'Temporary ceremony browser sessions created after I am [Name]. Hash-only secrets. Not general app login. One ACTIVE session per participant per Signing.';

-- ---------------------------------------------------------------------------
-- 4. Participant presence leases
-- ---------------------------------------------------------------------------

create table if not exists public.signing_participant_presence_leases (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_participant_id uuid not null,
  signing_browser_session_id uuid not null,

  acquired_at timestamptz not null default now(),
  renewed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,

  constraint sppl_expires_after_acquired
    check (expires_at > acquired_at),
  constraint sppl_signing_id_id_key
    unique (signing_id, id),
  constraint sppl_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict,
  constraint sppl_session_same_signing_fkey
    foreign key (signing_id, signing_browser_session_id)
    references public.signing_browser_sessions (signing_id, id)
    on delete restrict
);

-- Only one unreleased lease per participant (owned by the active ceremony session).
create unique index if not exists sppl_one_open_per_participant_uidx
  on public.signing_participant_presence_leases (signing_id, signing_participant_id)
  where released_at is null;

create index if not exists sppl_session_idx
  on public.signing_participant_presence_leases (signing_browser_session_id);

drop trigger if exists signing_participant_presence_leases_set_update_date
  on public.signing_participant_presence_leases;
create trigger signing_participant_presence_leases_set_update_date
before update on public.signing_participant_presence_leases
for each row execute function public.set_update_date();

comment on table public.signing_participant_presence_leases is
  'Short renewable participant presence leases owned by an active ceremony browser session. Valid leases block amendment-lock acquisition. Server expiry is authoritative.';

-- ---------------------------------------------------------------------------
-- 5. Amendment locks (primitive only; no agent amendment UI in this stage)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_amendment_locks (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  held_by_agent_association_id uuid not null,
  expected_package_revision_id uuid not null,

  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,

  constraint sal_expires_after_acquired
    check (expires_at > acquired_at),
  constraint sal_signing_id_id_key
    unique (signing_id, id),
  constraint sal_agent_same_signing_fkey
    foreign key (signing_id, held_by_agent_association_id)
    references public.signing_agent_associations (signing_id, id)
    on delete restrict,
  constraint sal_revision_same_signing_fkey
    foreign key (signing_id, expected_package_revision_id)
    references public.signing_package_revisions (signing_id, id)
    on delete restrict
);

create unique index if not exists sal_one_open_per_signing_uidx
  on public.signing_amendment_locks (signing_id)
  where released_at is null;

drop trigger if exists signing_amendment_locks_set_update_date
  on public.signing_amendment_locks;
create trigger signing_amendment_locks_set_update_date
before update on public.signing_amendment_locks
for each row execute function public.set_update_date();

comment on table public.signing_amendment_locks is
  'Exclusive pre-signature amendment locks. Ceremony placements fail closed while a valid lock exists. Agent amendment UI remains a later stage.';

-- ---------------------------------------------------------------------------
-- 6. Deny-by-default RLS for every new table
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'signing_consent_disclosure_versions',
    'signing_in_person_handoffs',
    'signing_browser_sessions',
    'signing_participant_presence_leases',
    'signing_amendment_locks'
  ]
  loop
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
  end loop;
end $$;

commit;
