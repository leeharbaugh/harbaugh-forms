-- Native Signing Stage 4: Draft source snapshots, activation foundation,
-- participant credentials, operation idempotency, and delivery work items.
-- Forward-only. Development only. Does not relax browser deny-by-default.
-- Does not create ceremony/finalization tables.

begin;

-- ---------------------------------------------------------------------------
-- 1. Draft source snapshots (preparation state — not evidence)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_draft_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_document_id uuid not null,
  source_packet_form_id bigint not null,
  source_packet_id bigint not null,
  form_id bigint,
  document_name_snapshot text not null,

  source_pdf_storage_bucket text not null default 'signing-artifacts',
  source_pdf_object_key text not null,
  source_pdf_sha256 text not null,
  source_pdf_byte_size integer not null,

  -- Canonical render inputs for fillPacketFormPdfBytes (empty array when form_id is null).
  field_views_json jsonb not null default '[]'::jsonb,
  annotations_json jsonb not null default '[]'::jsonb,

  -- SHA-256 hex of canonical fingerprint payload (source PDF + render inputs).
  content_fingerprint text not null,

  constraint sds_snap_doc_name_not_blank
    check (length(trim(document_name_snapshot)) > 0),
  constraint sds_snap_bucket_signing_artifacts
    check (source_pdf_storage_bucket = 'signing-artifacts'),
  constraint sds_snap_object_key_not_blank
    check (length(trim(source_pdf_object_key)) > 0),
  constraint sds_snap_sha256_hex
    check (source_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  constraint sds_snap_fingerprint_hex
    check (content_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint sds_snap_byte_size_positive
    check (source_pdf_byte_size > 0),
  constraint sds_snap_signing_id_id_key
    unique (signing_id, id),
  constraint sds_snap_document_same_signing_fkey
    foreign key (signing_id, signing_document_id)
    references public.signing_documents (signing_id, id)
    on delete restrict
);

create index if not exists sds_snap_signing_id_idx
  on public.signing_draft_source_snapshots (signing_id);

create index if not exists sds_snap_document_id_idx
  on public.signing_draft_source_snapshots (signing_document_id);

create index if not exists sds_snap_packet_form_id_idx
  on public.signing_draft_source_snapshots (source_packet_form_id);

comment on table public.signing_draft_source_snapshots is
  'Signing-owned Draft preparation snapshots. Not signing_document_versions, not package revisions, not participant evidence.';

-- Selected snapshot + Keep-Current acknowledgement (live fingerprint acknowledged while keeping snapshot).
alter table public.signing_documents
  add column if not exists selected_draft_source_snapshot_id uuid,
  add column if not exists acknowledged_live_content_fingerprint text;

alter table public.signing_documents
  drop constraint if exists sd_ack_fingerprint_hex;
alter table public.signing_documents
  add constraint sd_ack_fingerprint_hex
  check (
    acknowledged_live_content_fingerprint is null
    or acknowledged_live_content_fingerprint ~ '^[0-9a-f]{64}$'
  );

-- Same-Signing pointer: selected snapshot must belong to this document.
alter table public.signing_documents
  drop constraint if exists sd_selected_snapshot_same_signing_fkey;
alter table public.signing_documents
  add constraint sd_selected_snapshot_same_signing_fkey
  foreign key (signing_id, selected_draft_source_snapshot_id)
  references public.signing_draft_source_snapshots (signing_id, id)
  on delete restrict;

create index if not exists sd_selected_snapshot_id_idx
  on public.signing_documents (selected_draft_source_snapshot_id)
  where selected_draft_source_snapshot_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Activation metadata on signings
-- ---------------------------------------------------------------------------

alter table public.signings
  add column if not exists activation_mode text,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by_user_id uuid;

alter table public.signings
  drop constraint if exists signings_activation_mode_check;
alter table public.signings
  add constraint signings_activation_mode_check
  check (
    activation_mode is null
    or activation_mode in ('REMOTE_SEND', 'IN_PERSON')
  );

-- ---------------------------------------------------------------------------
-- 3. Participant access credentials (hash only — no raw bearer)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_participant_credentials (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_participant_id uuid not null,

  token_hash text not null,
  issued_at timestamptz not null default now(),
  issued_by_user_id uuid,
  first_used_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  replaced_by_credential_id uuid,
  is_current boolean not null default true,

  constraint spc_token_hash_hex
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint spc_signing_id_id_key
    unique (signing_id, id),
  constraint spc_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict
);

-- At most one current credential per participant.
create unique index if not exists spc_one_current_per_participant_uidx
  on public.signing_participant_credentials (signing_participant_id)
  where is_current = true and revoked_at is null;

create index if not exists spc_signing_id_idx
  on public.signing_participant_credentials (signing_id);

create index if not exists spc_token_hash_idx
  on public.signing_participant_credentials (token_hash);

create index if not exists spc_participant_id_idx
  on public.signing_participant_credentials (signing_participant_id);

comment on table public.signing_participant_credentials is
  'Participant Signing-link credentials. Stores token hash only; raw bearer never persisted.';

-- ---------------------------------------------------------------------------
-- 4. Operation idempotency
-- ---------------------------------------------------------------------------

create table if not exists public.signing_operation_idempotency (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  operation_type text not null,
  actor_user_id uuid,
  client_request_id text not null,
  request_fingerprint text not null,
  processing_state text not null,
  result_json jsonb,
  error_code text,
  error_message text,

  constraint soi_operation_type_not_blank
    check (length(trim(operation_type)) > 0),
  constraint soi_client_request_id_not_blank
    check (length(trim(client_request_id)) > 0),
  constraint soi_request_fingerprint_not_blank
    check (length(trim(request_fingerprint)) > 0),
  constraint soi_processing_state_check
    check (processing_state in ('IN_PROGRESS', 'SUCCEEDED', 'FAILED')),
  constraint soi_signing_request_uidx
    unique (signing_id, operation_type, client_request_id)
);

drop trigger if exists signing_operation_idempotency_set_update_date
  on public.signing_operation_idempotency;
create trigger signing_operation_idempotency_set_update_date
before update on public.signing_operation_idempotency
for each row execute function public.set_update_date();

create index if not exists soi_signing_id_idx
  on public.signing_operation_idempotency (signing_id);

-- ---------------------------------------------------------------------------
-- 5. Durable delivery work items (outbox) — no secrets / no document bytes
-- ---------------------------------------------------------------------------

create table if not exists public.signing_work_items (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  work_type text not null,
  idempotency_key text not null,
  reference_json jsonb not null default '{}'::jsonb,
  processing_state text not null default 'PENDING',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error_safe text,
  completed_at timestamptz,

  constraint swi_work_type_not_blank
    check (length(trim(work_type)) > 0),
  constraint swi_idempotency_key_not_blank
    check (length(trim(idempotency_key)) > 0),
  constraint swi_processing_state_check
    check (processing_state in ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  constraint swi_attempt_count_nonneg
    check (attempt_count >= 0),
  constraint swi_signing_work_uidx
    unique (signing_id, work_type, idempotency_key)
);

drop trigger if exists signing_work_items_set_update_date on public.signing_work_items;
create trigger signing_work_items_set_update_date
before update on public.signing_work_items
for each row execute function public.set_update_date();

create index if not exists swi_signing_id_idx
  on public.signing_work_items (signing_id);

create index if not exists swi_pending_next_attempt_idx
  on public.signing_work_items (processing_state, next_attempt_at)
  where processing_state in ('PENDING', 'FAILED');

-- ---------------------------------------------------------------------------
-- 6. Delivery instructions + attempts (invitation / operational)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_delivery_instructions (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_participant_id uuid not null,
  purpose text not null,
  recipient_email_snapshot text not null,
  recipient_name_snapshot text not null,
  signing_participant_credential_id uuid,
  package_revision_id uuid,
  delivery_state text not null default 'PENDING',
  initiated_by_user_id uuid,

  constraint sdi_purpose_check
    check (purpose in ('INVITATION')),
  constraint sdi_delivery_state_check
    check (delivery_state in ('PENDING', 'QUEUED', 'ACCEPTED', 'FAILED')),
  constraint sdi_email_not_blank
    check (length(trim(recipient_email_snapshot)) > 0),
  constraint sdi_name_not_blank
    check (length(trim(recipient_name_snapshot)) > 0),
  constraint sdi_signing_id_id_key
    unique (signing_id, id),
  constraint sdi_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict,
  constraint sdi_credential_same_signing_fkey
    foreign key (signing_id, signing_participant_credential_id)
    references public.signing_participant_credentials (signing_id, id)
    on delete restrict,
  constraint sdi_revision_same_signing_fkey
    foreign key (signing_id, package_revision_id)
    references public.signing_package_revisions (signing_id, id)
    on delete restrict
);

drop trigger if exists signing_delivery_instructions_set_update_date
  on public.signing_delivery_instructions;
create trigger signing_delivery_instructions_set_update_date
before update on public.signing_delivery_instructions
for each row execute function public.set_update_date();

create index if not exists sdi_signing_id_idx
  on public.signing_delivery_instructions (signing_id);

create table if not exists public.signing_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  delivery_instruction_id uuid not null,
  attempt_number integer not null,
  attempted_at timestamptz not null default now(),
  outcome text not null,
  provider_reference text,
  failure_detail_safe text,

  constraint sda_attempt_number_positive
    check (attempt_number >= 1),
  constraint sda_outcome_check
    check (outcome in ('ACCEPTED', 'FAILED')),
  constraint sda_signing_id_id_key
    unique (signing_id, id),
  constraint sda_instruction_same_signing_fkey
    foreign key (signing_id, delivery_instruction_id)
    references public.signing_delivery_instructions (signing_id, id)
    on delete restrict,
  constraint sda_instruction_attempt_uidx
    unique (delivery_instruction_id, attempt_number)
);

create index if not exists sda_signing_id_idx
  on public.signing_delivery_attempts (signing_id);

-- ---------------------------------------------------------------------------
-- 7. Deny-by-default RLS for all Stage 4 tables
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'signing_draft_source_snapshots',
    'signing_participant_credentials',
    'signing_operation_idempotency',
    'signing_work_items',
    'signing_delivery_instructions',
    'signing_delivery_attempts'
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
