-- Native Signing Stage 1 foundation.
-- Additive schema skeleton + private signing-artifacts bucket + deny-by-default
-- browser access. No ceremony, credentials, delivery, or finalization behavior.
-- Target: harbaugh-forms-dev only during Stage 1 development.

begin;

-- ---------------------------------------------------------------------------
-- 1. Root workflow: signings
-- Pointer FKs to revisions/associations are added after those tables exist.
-- ---------------------------------------------------------------------------

create table public.signings (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  originating_organization_id uuid not null
    references public.organizations (id) on delete restrict,

  source_packet_id bigint
    references public.packets (id) on delete set null,

  original_sender_user_id uuid
    references public.profiles (id) on delete set null,
  original_sender_display_name text not null,
  original_sender_email text,

  current_primary_agent_association_id uuid,

  title text not null,
  lifecycle_state text not null default 'DRAFT',
  finalization_condition text not null default 'NOT_STARTED',

  current_package_revision_id uuid,
  frozen_package_revision_id uuid,

  sender_timezone text not null default 'America/Chicago',
  requested_completion_date date,
  reminder_frequency text not null default 'DAILY',
  reminders_enabled boolean not null default true,

  constraint signings_title_not_blank
    check (length(trim(title)) > 0),
  constraint signings_original_sender_display_name_not_blank
    check (length(trim(original_sender_display_name)) > 0),
  constraint signings_lifecycle_state_check
    check (
      lifecycle_state in (
        'DRAFT',
        'IN_PROGRESS',
        'COMPLETE',
        'DECLINED',
        'CANCELLED'
      )
    ),
  constraint signings_finalization_condition_check
    check (
      finalization_condition in (
        'NOT_STARTED',
        'IN_PROGRESS',
        'READY',
        'FAILED',
        'VERIFIED'
      )
    ),
  constraint signings_reminder_frequency_check
    check (reminder_frequency in ('DAILY', 'NONE')),
  constraint signings_frozen_implies_current
    check (
      frozen_package_revision_id is null
      or current_package_revision_id = frozen_package_revision_id
    )
);

create index signings_originating_organization_id_idx
  on public.signings (originating_organization_id);

create index signings_source_packet_id_idx
  on public.signings (source_packet_id)
  where source_packet_id is not null;

create index signings_lifecycle_state_idx
  on public.signings (lifecycle_state);

create trigger signings_set_update_date
before update on public.signings
for each row execute function public.set_update_date();

comment on table public.signings is
  'Native Signing workflow root. Stage 1 foundation; browser clients have no direct access.';

-- ---------------------------------------------------------------------------
-- 2. Agent associations
-- ---------------------------------------------------------------------------

create table public.signing_agent_associations (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  agent_user_id uuid
    references public.profiles (id) on delete set null,

  association_role text not null,
  agent_display_name text not null,
  agent_email text,
  effective_started_at timestamptz not null default now(),
  effective_ended_at timestamptz,
  end_reason text,
  added_by_user_id uuid
    references public.profiles (id) on delete set null,
  ended_by_user_id uuid
    references public.profiles (id) on delete set null,

  constraint signing_agent_associations_role_check
    check (association_role in ('PRIMARY', 'CO_AGENT')),
  constraint signing_agent_associations_display_name_not_blank
    check (length(trim(agent_display_name)) > 0),
  constraint signing_agent_associations_effective_range
    check (
      effective_ended_at is null
      or effective_ended_at >= effective_started_at
    ),
  constraint signing_agent_associations_signing_id_id_key
    unique (signing_id, id)
);

create index signing_agent_associations_signing_id_idx
  on public.signing_agent_associations (signing_id);

create unique index signing_agent_associations_one_current_primary_uidx
  on public.signing_agent_associations (signing_id)
  where association_role = 'PRIMARY' and effective_ended_at is null;

create trigger signing_agent_associations_set_update_date
before update on public.signing_agent_associations
for each row execute function public.set_update_date();

alter table public.signings
  add constraint signings_current_primary_agent_association_id_fkey
  foreign key (current_primary_agent_association_id)
  references public.signing_agent_associations (id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Logical documents and immutable prepared versions
-- ---------------------------------------------------------------------------

create table public.signing_documents (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  source_packet_form_id bigint
    references public.packet_forms (id) on delete set null,
  display_order integer not null default 0,
  logical_label text,

  constraint signing_documents_signing_id_id_key
    unique (signing_id, id)
);

create index signing_documents_signing_id_idx
  on public.signing_documents (signing_id);

create trigger signing_documents_set_update_date
before update on public.signing_documents
for each row execute function public.set_update_date();

create table public.signing_package_revisions (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  revision_number integer not null,
  predecessor_revision_id uuid,
  promotion_reason text not null default 'INITIAL',
  amendment_note text,
  promoted_by_user_id uuid
    references public.profiles (id) on delete set null,
  promoted_by_display_name text,
  promoted_at timestamptz not null default now(),

  constraint signing_package_revisions_revision_number_positive
    check (revision_number >= 1),
  constraint signing_package_revisions_promotion_reason_check
    check (promotion_reason in ('INITIAL', 'AMENDMENT')),
  constraint signing_package_revisions_signing_revision_key
    unique (signing_id, revision_number),
  constraint signing_package_revisions_signing_id_id_key
    unique (signing_id, id)
);

create index signing_package_revisions_signing_id_idx
  on public.signing_package_revisions (signing_id);

alter table public.signing_package_revisions
  add constraint signing_package_revisions_predecessor_same_signing_fkey
  foreign key (signing_id, predecessor_revision_id)
  references public.signing_package_revisions (signing_id, id)
  on delete restrict;

alter table public.signings
  add constraint signings_current_package_revision_id_fkey
  foreign key (current_package_revision_id)
  references public.signing_package_revisions (id)
  on delete restrict;

alter table public.signings
  add constraint signings_frozen_package_revision_id_fkey
  foreign key (frozen_package_revision_id)
  references public.signing_package_revisions (id)
  on delete restrict;

create table public.signing_document_versions (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null,
  signing_document_id uuid not null,
  version_number integer not null,
  superseded_by_version_id uuid,
  introduced_by_package_revision_id uuid,
  creation_reason text not null default 'INITIAL_PREPARE',
  source_packet_form_id bigint
    references public.packet_forms (id) on delete set null,
  source_document_name_snapshot text,
  storage_bucket text not null default 'signing-artifacts',
  storage_object_key text,
  content_sha256 text,
  byte_size bigint,
  page_count integer,

  constraint signing_document_versions_version_number_positive
    check (version_number >= 1),
  constraint signing_document_versions_creation_reason_check
    check (
      creation_reason in (
        'INITIAL_PREPARE',
        'AMENDMENT_PREPARE',
        'REPREPARE'
      )
    ),
  constraint signing_document_versions_storage_bucket_check
    check (storage_bucket = 'signing-artifacts'),
  constraint signing_document_versions_sha256_format
    check (
      content_sha256 is null
      or content_sha256 ~ '^[a-f0-9]{64}$'
    ),
  constraint signing_document_versions_byte_size_nonnegative
    check (byte_size is null or byte_size >= 0),
  constraint signing_document_versions_page_count_positive
    check (page_count is null or page_count >= 1),
  constraint signing_document_versions_document_version_key
    unique (signing_document_id, version_number),
  constraint signing_document_versions_signing_id_id_key
    unique (signing_id, id),
  constraint signing_document_versions_document_same_signing_fkey
    foreign key (signing_id, signing_document_id)
    references public.signing_documents (signing_id, id)
    on delete restrict
);

create index signing_document_versions_signing_id_idx
  on public.signing_document_versions (signing_id);

create index signing_document_versions_document_id_idx
  on public.signing_document_versions (signing_document_id);

alter table public.signing_document_versions
  add constraint signing_document_versions_superseded_same_signing_fkey
  foreign key (signing_id, superseded_by_version_id)
  references public.signing_document_versions (signing_id, id)
  on delete restrict;

alter table public.signing_document_versions
  add constraint signing_document_versions_introduced_by_revision_fkey
  foreign key (signing_id, introduced_by_package_revision_id)
  references public.signing_package_revisions (signing_id, id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- 4. Package revision snapshots (documents + participants)
-- ---------------------------------------------------------------------------

create table public.signing_package_revision_documents (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null,
  package_revision_id uuid not null,
  signing_document_id uuid not null,
  signing_document_version_id uuid not null,
  display_order integer not null,
  frozen_display_name text not null,
  frozen_filename text not null,
  source_title_snapshot text,

  constraint signing_package_revision_documents_display_name_not_blank
    check (length(trim(frozen_display_name)) > 0),
  constraint signing_package_revision_documents_filename_not_blank
    check (length(trim(frozen_filename)) > 0),
  constraint signing_package_revision_documents_signing_id_id_key
    unique (signing_id, id),
  constraint signing_package_revision_documents_revision_document_key
    unique (package_revision_id, signing_document_id),
  constraint signing_package_revision_documents_revision_order_key
    unique (package_revision_id, display_order),
  constraint signing_package_revision_documents_revision_same_signing_fkey
    foreign key (signing_id, package_revision_id)
    references public.signing_package_revisions (signing_id, id)
    on delete restrict,
  constraint signing_package_revision_documents_document_same_signing_fkey
    foreign key (signing_id, signing_document_id)
    references public.signing_documents (signing_id, id)
    on delete restrict,
  constraint signing_package_revision_documents_version_same_signing_fkey
    foreign key (signing_id, signing_document_version_id)
    references public.signing_document_versions (signing_id, id)
    on delete restrict
);

create index signing_package_revision_documents_revision_id_idx
  on public.signing_package_revision_documents (package_revision_id);

create table public.signing_participants (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  linked_user_id uuid
    references public.profiles (id) on delete set null,
  linked_contact_id bigint
    references public.contacts (id) on delete set null,

  participant_status text not null default 'PENDING',
  full_name text not null,
  email text not null,
  optional_role text,
  identity_confirmed_at timestamptz,
  consent_accepted_at timestamptz,
  finished_at timestamptz,
  declined_at timestamptz,
  decline_reason text,

  constraint signing_participants_status_check
    check (
      participant_status in (
        'PENDING',
        'STARTED',
        'FINISHED',
        'DECLINED',
        'REMOVED'
      )
    ),
  constraint signing_participants_full_name_not_blank
    check (length(trim(full_name)) > 0),
  constraint signing_participants_email_not_blank
    check (length(trim(email)) > 0),
  constraint signing_participants_signing_id_id_key
    unique (signing_id, id)
);

create index signing_participants_signing_id_idx
  on public.signing_participants (signing_id);

create trigger signing_participants_set_update_date
before update on public.signing_participants
for each row execute function public.set_update_date();

create table public.signing_package_revision_participants (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null,
  package_revision_id uuid not null,
  signing_participant_id uuid not null,
  display_order integer not null,
  frozen_full_name text not null,
  frozen_email text not null,
  frozen_optional_role text,
  frozen_linked_user_id uuid,
  frozen_linked_contact_id bigint,

  constraint signing_package_revision_participants_name_not_blank
    check (length(trim(frozen_full_name)) > 0),
  constraint signing_package_revision_participants_email_not_blank
    check (length(trim(frozen_email)) > 0),
  constraint signing_package_revision_participants_signing_id_id_key
    unique (signing_id, id),
  constraint signing_package_revision_participants_revision_participant_key
    unique (package_revision_id, signing_participant_id),
  constraint signing_package_revision_participants_revision_order_key
    unique (package_revision_id, display_order),
  constraint signing_package_revision_participants_revision_same_signing_fkey
    foreign key (signing_id, package_revision_id)
    references public.signing_package_revisions (signing_id, id)
    on delete restrict,
  constraint signing_package_revision_participants_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict
);

create index signing_package_revision_participants_revision_id_idx
  on public.signing_package_revision_participants (package_revision_id);

-- ---------------------------------------------------------------------------
-- 5. Signer fields, adopted marks, placements
-- ---------------------------------------------------------------------------

create table public.signing_fields (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null,
  package_revision_id uuid not null,
  package_revision_document_id uuid not null,
  package_revision_participant_id uuid not null,
  field_type text not null,
  is_required boolean not null default true,
  page_number integer not null,
  x double precision not null,
  y double precision not null,
  width double precision not null,
  height double precision not null,
  linked_signature_field_id uuid,

  constraint signing_fields_type_check
    check (field_type in ('SIGNATURE', 'INITIALS', 'DATE_SIGNED')),
  constraint signing_fields_page_positive
    check (page_number >= 1),
  constraint signing_fields_size_positive
    check (width > 0 and height > 0),
  constraint signing_fields_signing_id_id_key
    unique (signing_id, id),
  constraint signing_fields_revision_same_signing_fkey
    foreign key (signing_id, package_revision_id)
    references public.signing_package_revisions (signing_id, id)
    on delete restrict,
  constraint signing_fields_revision_document_same_signing_fkey
    foreign key (signing_id, package_revision_document_id)
    references public.signing_package_revision_documents (signing_id, id)
    on delete restrict,
  constraint signing_fields_revision_participant_same_signing_fkey
    foreign key (signing_id, package_revision_participant_id)
    references public.signing_package_revision_participants (signing_id, id)
    on delete restrict
);

create index signing_fields_signing_id_idx
  on public.signing_fields (signing_id);

create index signing_fields_package_revision_id_idx
  on public.signing_fields (package_revision_id);

alter table public.signing_fields
  add constraint signing_fields_linked_signature_same_signing_fkey
  foreign key (signing_id, linked_signature_field_id)
  references public.signing_fields (signing_id, id)
  on delete restrict;

create table public.signing_adopted_marks (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null,
  signing_participant_id uuid not null,
  mark_kind text not null,
  representation_type text not null,
  typed_text text,
  drawn_path_json jsonb,
  adopted_at timestamptz not null default now(),
  locked_at timestamptz,
  source_user_preset_id uuid,

  constraint signing_adopted_marks_kind_check
    check (mark_kind in ('SIGNATURE', 'INITIALS')),
  constraint signing_adopted_marks_representation_check
    check (representation_type in ('TYPED', 'DRAWN')),
  constraint signing_adopted_marks_typed_requires_text
    check (
      representation_type <> 'TYPED'
      or (typed_text is not null and length(trim(typed_text)) > 0)
    ),
  constraint signing_adopted_marks_signing_id_id_key
    unique (signing_id, id),
  constraint signing_adopted_marks_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict
);

create index signing_adopted_marks_signing_id_idx
  on public.signing_adopted_marks (signing_id);

create trigger signing_adopted_marks_set_update_date
before update on public.signing_adopted_marks
for each row execute function public.set_update_date();

create table public.signing_field_placements (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null,
  signing_field_id uuid not null,
  signing_participant_id uuid not null,
  adopted_mark_id uuid not null,
  signing_document_version_id uuid not null,
  accepted_at timestamptz not null default now(),
  rendered_sender_local_date date,
  disposition text not null default 'ACCEPTED',
  replaced_by_placement_id uuid,
  idempotency_key text,

  constraint signing_field_placements_disposition_check
    check (disposition in ('ACCEPTED', 'REMOVED', 'REPLACED')),
  constraint signing_field_placements_signing_id_id_key
    unique (signing_id, id),
  constraint signing_field_placements_field_same_signing_fkey
    foreign key (signing_id, signing_field_id)
    references public.signing_fields (signing_id, id)
    on delete restrict,
  constraint signing_field_placements_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict,
  constraint signing_field_placements_mark_same_signing_fkey
    foreign key (signing_id, adopted_mark_id)
    references public.signing_adopted_marks (signing_id, id)
    on delete restrict,
  constraint signing_field_placements_version_same_signing_fkey
    foreign key (signing_id, signing_document_version_id)
    references public.signing_document_versions (signing_id, id)
    on delete restrict
);

create unique index signing_field_placements_one_accepted_per_field_uidx
  on public.signing_field_placements (signing_field_id)
  where disposition = 'ACCEPTED';

create unique index signing_field_placements_idempotency_uidx
  on public.signing_field_placements (signing_id, idempotency_key)
  where idempotency_key is not null;

alter table public.signing_field_placements
  add constraint signing_field_placements_replaced_by_same_signing_fkey
  foreign key (signing_id, replaced_by_placement_id)
  references public.signing_field_placements (signing_id, id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- 6. Generated artifacts (completed docs / certificate / optional combined)
-- ---------------------------------------------------------------------------

create table public.signing_artifacts (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null,
  package_revision_id uuid not null,
  signing_document_version_id uuid,
  artifact_category text not null,
  storage_bucket text not null default 'signing-artifacts',
  storage_object_key text not null,
  content_sha256 text,
  byte_size bigint,
  page_count integer,
  frozen_filename text not null,
  generated_at timestamptz not null default now(),
  verified_at timestamptz,
  audit_history_sequence_boundary bigint,
  idempotency_key text,

  constraint signing_artifacts_category_check
    check (
      artifact_category in (
        'COMPLETED_DOCUMENT',
        'AUDIT_CERTIFICATE',
        'COMBINED_PACKAGE'
      )
    ),
  constraint signing_artifacts_storage_bucket_check
    check (storage_bucket = 'signing-artifacts'),
  constraint signing_artifacts_object_key_not_blank
    check (length(trim(storage_object_key)) > 0),
  constraint signing_artifacts_filename_not_blank
    check (length(trim(frozen_filename)) > 0),
  constraint signing_artifacts_sha256_format
    check (
      content_sha256 is null
      or content_sha256 ~ '^[a-f0-9]{64}$'
    ),
  constraint signing_artifacts_completed_requires_version
    check (
      artifact_category <> 'COMPLETED_DOCUMENT'
      or signing_document_version_id is not null
    ),
  constraint signing_artifacts_signing_id_id_key
    unique (signing_id, id),
  constraint signing_artifacts_revision_same_signing_fkey
    foreign key (signing_id, package_revision_id)
    references public.signing_package_revisions (signing_id, id)
    on delete restrict,
  constraint signing_artifacts_version_same_signing_fkey
    foreign key (signing_id, signing_document_version_id)
    references public.signing_document_versions (signing_id, id)
    on delete restrict
);

create unique index signing_artifacts_storage_object_key_uidx
  on public.signing_artifacts (storage_bucket, storage_object_key);

create unique index signing_artifacts_idempotency_uidx
  on public.signing_artifacts (signing_id, idempotency_key)
  where idempotency_key is not null;

create index signing_artifacts_signing_id_idx
  on public.signing_artifacts (signing_id);

-- ---------------------------------------------------------------------------
-- 7. Append-only signing_events with server-assigned sequence
-- ---------------------------------------------------------------------------

create table public.signing_events (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  sequence_number bigint not null,
  event_type text not null,
  actor_type text not null,
  actor_user_id uuid
    references public.profiles (id) on delete set null,
  actor_participant_id uuid,
  actor_display_name text,
  visibility text not null default 'BUSINESS',
  package_revision_id uuid,
  signing_document_version_id uuid,
  signing_field_id uuid,
  signing_field_placement_id uuid,
  summary text,
  details_json jsonb,
  idempotency_key text,
  -- Reserved for future protected-key event-chain implementation.
  prior_event_digest text,
  event_digest text,
  integrity_key_id text,
  integrity_authentication_tag text,

  constraint signing_events_sequence_positive
    check (sequence_number >= 1),
  constraint signing_events_event_type_not_blank
    check (length(trim(event_type)) > 0),
  constraint signing_events_actor_type_check
    check (
      actor_type in (
        'PRIMARY_AGENT',
        'CO_AGENT',
        'BROKERAGE_ADMINISTRATOR',
        'PARTICIPANT',
        'SYSTEM_ADMINISTRATOR',
        'SYSTEM'
      )
    ),
  constraint signing_events_visibility_check
    check (
      visibility in (
        'PARTICIPANT',
        'BUSINESS',
        'SYSTEM_ADMINISTRATOR'
      )
    ),
  constraint signing_events_signing_sequence_key
    unique (signing_id, sequence_number),
  constraint signing_events_signing_id_id_key
    unique (signing_id, id)
);

create index signing_events_signing_id_idx
  on public.signing_events (signing_id);

create unique index signing_events_idempotency_uidx
  on public.signing_events (signing_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.signing_events_assign_sequence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Sequence is always server-assigned; ignore any client-supplied value.
  perform pg_advisory_xact_lock(hashtextextended(new.signing_id::text, 0));

  select coalesce(max(e.sequence_number), 0) + 1
    into new.sequence_number
  from public.signing_events e
  where e.signing_id = new.signing_id;

  return new;
end;
$$;

create trigger signing_events_assign_sequence
before insert on public.signing_events
for each row execute function public.signing_events_assign_sequence();

create or replace function public.signing_events_prevent_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'signing_events is append-only and cannot be updated'
    using errcode = 'restrict_violation';
end;
$$;

create trigger signing_events_prevent_update
before update on public.signing_events
for each row execute function public.signing_events_prevent_update();

-- Deletes remain unavailable to browser roles via RLS/grants. Service-role
-- maintenance (fixture cleanup / audited remediation) may delete rows; ordinary
-- application paths must not. A later stage may narrow this further.

alter table public.signing_events
  add constraint signing_events_actor_participant_same_signing_fkey
  foreign key (signing_id, actor_participant_id)
  references public.signing_participants (signing_id, id)
  on delete restrict;

alter table public.signing_events
  add constraint signing_events_revision_same_signing_fkey
  foreign key (signing_id, package_revision_id)
  references public.signing_package_revisions (signing_id, id)
  on delete restrict;

alter table public.signing_events
  add constraint signing_events_version_same_signing_fkey
  foreign key (signing_id, signing_document_version_id)
  references public.signing_document_versions (signing_id, id)
  on delete restrict;

alter table public.signing_events
  add constraint signing_events_field_same_signing_fkey
  foreign key (signing_id, signing_field_id)
  references public.signing_fields (signing_id, id)
  on delete restrict;

alter table public.signing_events
  add constraint signing_events_placement_same_signing_fkey
  foreign key (signing_id, signing_field_placement_id)
  references public.signing_field_placements (signing_id, id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- 8. Deny-by-default RLS + revoke browser grants
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select unnest(array[
      'signings',
      'signing_agent_associations',
      'signing_documents',
      'signing_document_versions',
      'signing_package_revisions',
      'signing_package_revision_documents',
      'signing_participants',
      'signing_package_revision_participants',
      'signing_fields',
      'signing_adopted_marks',
      'signing_field_placements',
      'signing_artifacts',
      'signing_events'
    ]) as table_name
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('alter table public.%I force row level security', r.table_name);

    execute format(
      'drop policy if exists %I on public.%I',
      r.table_name || '_deny_authenticated',
      r.table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (false) with check (false)',
      r.table_name || '_deny_authenticated',
      r.table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      r.table_name || '_deny_anon',
      r.table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to anon using (false) with check (false)',
      r.table_name || '_deny_anon',
      r.table_name
    );

    -- Account-state gate for consistency with F3/F4 (restrictive; still deny).
    execute format(
      'drop policy if exists account_state_application_gate on public.%I',
      r.table_name
    );
    execute format(
      'create policy account_state_application_gate on public.%I as restrictive for all to authenticated using (public.has_application_access()) with check (public.has_application_access())',
      r.table_name
    );

    execute format('revoke all on table public.%I from public', r.table_name);
    execute format('revoke all on table public.%I from anon', r.table_name);
    execute format('revoke all on table public.%I from authenticated', r.table_name);
  end loop;
end $$;

revoke all on function public.signing_events_assign_sequence() from public;
revoke all on function public.signing_events_prevent_update() from public;

-- ---------------------------------------------------------------------------
-- 9. Private signing-artifacts Storage bucket (no browser policies)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signing-artifacts',
  'signing-artifacts',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Explicit restrictive deny for this bucket. Other buckets remain unaffected
-- because the predicate is true for non-signing-artifacts objects.
drop policy if exists signing_artifacts_storage_deny_authenticated on storage.objects;
create policy signing_artifacts_storage_deny_authenticated
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id is distinct from 'signing-artifacts')
  with check (bucket_id is distinct from 'signing-artifacts');

drop policy if exists signing_artifacts_storage_deny_anon on storage.objects;
create policy signing_artifacts_storage_deny_anon
  on storage.objects
  as restrictive
  for all
  to anon
  using (bucket_id is distinct from 'signing-artifacts')
  with check (bucket_id is distinct from 'signing-artifacts');

commit;
