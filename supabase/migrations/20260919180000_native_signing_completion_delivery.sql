-- Native Signing completion delivery + copy recipients + package sessions
-- + access log + delivery purpose extension (development only).
-- Forward-only. No CASCADE into evidence. Production Native Signing remains off.

begin;

-- ---------------------------------------------------------------------------
-- 1. Copy recipients
-- ---------------------------------------------------------------------------

create table if not exists public.signing_copy_recipients (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  email text not null,
  display_name text,
  role_label text,
  associated_user_id uuid,
  associated_contact_id uuid,
  added_by_user_id uuid,
  status text not null default 'ACTIVE',
  removed_at timestamptz,
  removed_by_user_id uuid,
  removal_reason text,

  constraint scr_status_check
    check (status in ('ACTIVE', 'REMOVED')),
  constraint scr_email_not_blank
    check (length(trim(email)) > 0),
  constraint scr_signing_id_id_key
    unique (signing_id, id),
  constraint scr_removed_consistency
    check (
      (status = 'ACTIVE' and removed_at is null)
      or (status = 'REMOVED' and removed_at is not null)
    )
);

create index if not exists scr_signing_id_idx
  on public.signing_copy_recipients (signing_id);

create index if not exists scr_active_email_idx
  on public.signing_copy_recipients (signing_id, lower(email))
  where status = 'ACTIVE';

drop trigger if exists signing_copy_recipients_set_update_date
  on public.signing_copy_recipients;
create trigger signing_copy_recipients_set_update_date
before update on public.signing_copy_recipients
for each row execute function public.set_update_date();

comment on table public.signing_copy_recipients is
  'Non-signer recipients of completed materials. Soft-remove only; never '
  'affects Signing completion or frozen evidence.';

-- ---------------------------------------------------------------------------
-- 2. Completed-package credentials (distinct from ceremony credentials)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_completed_package_credentials (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_participant_id uuid,
  signing_copy_recipient_id uuid,

  token_hash text not null,
  token_wrapped text,
  wrap_key_id text,

  is_current boolean not null default true,
  issued_at timestamptz not null default now(),
  issued_by_user_id uuid,
  first_used_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  revoked_reason text,
  replaced_by_credential_id uuid,

  constraint scpc_token_hash_not_blank
    check (length(trim(token_hash)) > 0),
  constraint scpc_recipient_xor
    check (
      (signing_participant_id is not null and signing_copy_recipient_id is null)
      or (signing_participant_id is null and signing_copy_recipient_id is not null)
    ),
  constraint scpc_signing_id_id_key
    unique (signing_id, id),
  constraint scpc_token_hash_uidx
    unique (token_hash),
  constraint scpc_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict,
  constraint scpc_copy_recipient_same_signing_fkey
    foreign key (signing_id, signing_copy_recipient_id)
    references public.signing_copy_recipients (signing_id, id)
    on delete restrict
);

-- Exactly one current credential per participant (when current).
create unique index if not exists scpc_current_participant_uidx
  on public.signing_completed_package_credentials (
    signing_id,
    signing_participant_id
  )
  where is_current and signing_participant_id is not null and revoked_at is null;

create unique index if not exists scpc_current_copy_recipient_uidx
  on public.signing_completed_package_credentials (
    signing_id,
    signing_copy_recipient_id
  )
  where is_current and signing_copy_recipient_id is not null and revoked_at is null;

create index if not exists scpc_signing_id_idx
  on public.signing_completed_package_credentials (signing_id);

drop trigger if exists signing_completed_package_credentials_set_update_date
  on public.signing_completed_package_credentials;
create trigger signing_completed_package_credentials_set_update_date
before update on public.signing_completed_package_credentials
for each row execute function public.set_update_date();

alter table public.signing_completed_package_credentials
  drop constraint if exists scpc_replaced_by_same_signing_fkey;
alter table public.signing_completed_package_credentials
  add constraint scpc_replaced_by_same_signing_fkey
  foreign key (signing_id, replaced_by_credential_id)
  references public.signing_completed_package_credentials (signing_id, id)
  on delete restrict;

comment on table public.signing_completed_package_credentials is
  'Account-free completed-package access credentials. Hash-only auth; optional '
  'server wrap for same-link resend. Never grants ceremony or app login.';

-- ---------------------------------------------------------------------------
-- 3. Completed-package browser sessions
-- ---------------------------------------------------------------------------

create table if not exists public.signing_completed_package_sessions (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  completed_package_credential_id uuid not null,
  signing_participant_id uuid,
  signing_copy_recipient_id uuid,

  session_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,

  constraint scps_token_hash_not_blank
    check (length(trim(session_token_hash)) > 0),
  constraint scps_recipient_xor
    check (
      (signing_participant_id is not null and signing_copy_recipient_id is null)
      or (signing_participant_id is null and signing_copy_recipient_id is not null)
    ),
  constraint scps_signing_id_id_key
    unique (signing_id, id),
  constraint scps_token_hash_uidx
    unique (session_token_hash),
  constraint scps_credential_same_signing_fkey
    foreign key (signing_id, completed_package_credential_id)
    references public.signing_completed_package_credentials (signing_id, id)
    on delete restrict,
  constraint scps_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict,
  constraint scps_copy_recipient_same_signing_fkey
    foreign key (signing_id, signing_copy_recipient_id)
    references public.signing_copy_recipients (signing_id, id)
    on delete restrict
);

create index if not exists scps_signing_id_idx
  on public.signing_completed_package_sessions (signing_id);

create index if not exists scps_credential_id_idx
  on public.signing_completed_package_sessions (completed_package_credential_id);

drop trigger if exists signing_completed_package_sessions_set_update_date
  on public.signing_completed_package_sessions;
create trigger signing_completed_package_sessions_set_update_date
before update on public.signing_completed_package_sessions
for each row execute function public.set_update_date();

comment on table public.signing_completed_package_sessions is
  'Short-lived HttpOnly package sessions after bearer exchange. Expire '
  'independently of non-expiring completed-package credentials.';

-- ---------------------------------------------------------------------------
-- 4. Operational completed-package access log (not Signing event chain)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_completed_package_access_log (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  completed_package_credential_id uuid,
  completed_package_session_id uuid,
  signing_participant_id uuid,
  signing_copy_recipient_id uuid,
  signing_artifact_id uuid,
  access_kind text not null,
  outcome text not null default 'SUCCEEDED',
  safe_detail text,

  constraint scpal_access_kind_check
    check (access_kind in (
      'PACKAGE_SESSION_OPENED',
      'ARTIFACT_DOWNLOADED',
      'CREDENTIAL_REJECTED',
      'SESSION_REJECTED'
    )),
  constraint scpal_outcome_check
    check (outcome in ('SUCCEEDED', 'DENIED', 'FAILED')),
  constraint scpal_signing_id_id_key
    unique (signing_id, id)
);

create index if not exists scpal_signing_id_idx
  on public.signing_completed_package_access_log (signing_id);

comment on table public.signing_completed_package_access_log is
  'Operational completed-package access activity. Not protected Signing events; '
  'no bearer/session secrets.';

-- ---------------------------------------------------------------------------
-- 5. Extend delivery instructions for completed-package + copy recipients
-- ---------------------------------------------------------------------------

alter table public.signing_delivery_instructions
  alter column signing_participant_id drop not null;

alter table public.signing_delivery_instructions
  add column if not exists signing_copy_recipient_id uuid;

alter table public.signing_delivery_instructions
  add column if not exists completed_package_credential_id uuid;

alter table public.signing_delivery_instructions
  add column if not exists delivery_channel text not null default 'LINK';

alter table public.signing_delivery_instructions
  drop constraint if exists sdi_purpose_check;
alter table public.signing_delivery_instructions
  add constraint sdi_purpose_check
  check (purpose in ('INVITATION', 'COMPLETED_PACKAGE'));

alter table public.signing_delivery_instructions
  drop constraint if exists sdi_channel_check;
alter table public.signing_delivery_instructions
  add constraint sdi_channel_check
  check (delivery_channel in ('LINK', 'ATTACHMENT', 'LINK_AND_ATTACHMENT'));

alter table public.signing_delivery_instructions
  drop constraint if exists sdi_destination_xor;
alter table public.signing_delivery_instructions
  add constraint sdi_destination_xor
  check (
    (signing_participant_id is not null and signing_copy_recipient_id is null)
    or (signing_participant_id is null and signing_copy_recipient_id is not null)
  );

alter table public.signing_delivery_instructions
  drop constraint if exists sdi_copy_recipient_same_signing_fkey;
alter table public.signing_delivery_instructions
  add constraint sdi_copy_recipient_same_signing_fkey
  foreign key (signing_id, signing_copy_recipient_id)
  references public.signing_copy_recipients (signing_id, id)
  on delete restrict;

alter table public.signing_delivery_instructions
  drop constraint if exists sdi_completed_credential_same_signing_fkey;
alter table public.signing_delivery_instructions
  add constraint sdi_completed_credential_same_signing_fkey
  foreign key (signing_id, completed_package_credential_id)
  references public.signing_completed_package_credentials (signing_id, id)
  on delete restrict;

-- Invitation rows must keep participant destination (existing data).
alter table public.signing_delivery_instructions
  drop constraint if exists sdi_invitation_requires_participant;
alter table public.signing_delivery_instructions
  add constraint sdi_invitation_requires_participant
  check (
    purpose <> 'INVITATION'
    or signing_participant_id is not null
  );

alter table public.signing_delivery_instructions
  drop constraint if exists sdi_completed_requires_credential;
alter table public.signing_delivery_instructions
  add constraint sdi_completed_requires_credential
  check (
    purpose <> 'COMPLETED_PACKAGE'
    or completed_package_credential_id is not null
  );

-- ---------------------------------------------------------------------------
-- 6. System recovery-safe work suspension (not per-Signing)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_system_controls (
  id text primary key default 'default',
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),
  work_suspended boolean not null default false,
  suspension_reason text,
  suspended_at timestamptz,
  suspended_by_note text,
  resumed_at timestamptz,
  resumed_by_note text,
  constraint ssc_single_row check (id = 'default')
);

insert into public.signing_system_controls (id, work_suspended)
values ('default', false)
on conflict (id) do nothing;

drop trigger if exists signing_system_controls_set_update_date
  on public.signing_system_controls;
create trigger signing_system_controls_set_update_date
before update on public.signing_system_controls
for each row execute function public.set_update_date();

comment on table public.signing_system_controls is
  'Global Signing worker suspension for recovery-safe mode. When suspended, '
  'finalization/delivery/combined workers must not process or send email.';

-- ---------------------------------------------------------------------------
-- 7. Deny-by-default RLS
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'signing_copy_recipients',
    'signing_completed_package_credentials',
    'signing_completed_package_sessions',
    'signing_completed_package_access_log',
    'signing_system_controls'
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
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      t
    );
  end loop;
end $$;

commit;
