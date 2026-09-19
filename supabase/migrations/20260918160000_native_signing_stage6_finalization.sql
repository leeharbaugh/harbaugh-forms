-- Native Signing Stage 6 finalization foundation (development only).
-- Work-item claim lease, completion timestamp, artifact traceability,
-- verified-artifact uniqueness, and per-Signing event-chain genesis state.
-- Does not enable production Native Signing.

begin;

-- ---------------------------------------------------------------------------
-- 1. Work-item durable claim lease
-- ---------------------------------------------------------------------------

alter table public.signing_work_items
  add column if not exists claimed_by text,
  add column if not exists claimed_until timestamptz,
  add column if not exists processing_started_at timestamptz;

comment on column public.signing_work_items.claimed_by is
  'Opaque worker identity holding the current lease; never authority.';
comment on column public.signing_work_items.claimed_until is
  'Exclusive claim expiry. Stale workers must re-claim before completing work.';

create index if not exists swi_claimable_idx
  on public.signing_work_items (processing_state, next_attempt_at, claimed_until)
  where processing_state in ('PENDING', 'FAILED', 'PROCESSING');

-- ---------------------------------------------------------------------------
-- 2. Signing completion / finalization diagnostics
-- ---------------------------------------------------------------------------

alter table public.signings
  add column if not exists completed_at timestamptz,
  add column if not exists finalization_last_error_safe text;

comment on column public.signings.completed_at is
  'Server-controlled lifecycle Complete timestamp; set once; never recomputed.';
comment on column public.signings.finalization_last_error_safe is
  'Business-safe finalization diagnostic; no secrets or key material.';

-- ---------------------------------------------------------------------------
-- 3. Artifact traceability + one verified effective artifact invariants
-- ---------------------------------------------------------------------------

alter table public.signing_artifacts
  add column if not exists signing_document_id uuid,
  add column if not exists package_revision_document_id uuid;

alter table public.signing_artifacts
  drop constraint if exists signing_artifacts_document_same_signing_fkey;
alter table public.signing_artifacts
  add constraint signing_artifacts_document_same_signing_fkey
  foreign key (signing_id, signing_document_id)
  references public.signing_documents (signing_id, id)
  on delete restrict;

alter table public.signing_artifacts
  drop constraint if exists signing_artifacts_rev_doc_same_signing_fkey;
alter table public.signing_artifacts
  add constraint signing_artifacts_rev_doc_same_signing_fkey
  foreign key (signing_id, package_revision_document_id)
  references public.signing_package_revision_documents (signing_id, id)
  on delete restrict;

alter table public.signing_artifacts
  drop constraint if exists signing_artifacts_completed_traceability_check;
alter table public.signing_artifacts
  add constraint signing_artifacts_completed_traceability_check
  check (
    artifact_category <> 'COMPLETED_DOCUMENT'
    or (
      signing_document_version_id is not null
      and signing_document_id is not null
      and package_revision_document_id is not null
    )
  );

-- Exactly one verified effective completed document per revision document.
create unique index if not exists signing_artifacts_verified_completed_doc_uidx
  on public.signing_artifacts (
    signing_id,
    package_revision_id,
    package_revision_document_id
  )
  where artifact_category = 'COMPLETED_DOCUMENT'
    and verified_at is not null
    and package_revision_document_id is not null;

-- Exactly one verified canonical audit certificate per frozen revision.
create unique index if not exists signing_artifacts_verified_certificate_uidx
  on public.signing_artifacts (signing_id, package_revision_id)
  where artifact_category = 'AUDIT_CERTIFICATE'
    and verified_at is not null;

-- Exactly one verified combined package per frozen revision (optional).
create unique index if not exists signing_artifacts_verified_combined_uidx
  on public.signing_artifacts (signing_id, package_revision_id)
  where artifact_category = 'COMBINED_PACKAGE'
    and verified_at is not null;

-- ---------------------------------------------------------------------------
-- 4. Event-chain genesis / checkpoint (do not rewrite historical events)
-- ---------------------------------------------------------------------------

create table if not exists public.signing_event_chain_state (
  signing_id uuid primary key
    references public.signings (id) on delete restrict,
  create_date timestamptz not null default now(),
  chain_format_version text not null default 'v1',
  unprotected_prefix_end_sequence bigint not null default 0,
  genesis_prior_digest text not null,
  started_at timestamptz not null default now(),

  constraint secs_format_version_check
    check (chain_format_version = 'v1'),
  constraint secs_prefix_nonneg
    check (unprotected_prefix_end_sequence >= 0),
  constraint secs_genesis_digest_not_blank
    check (length(trim(genesis_prior_digest)) > 0)
);

comment on table public.signing_event_chain_state is
  'Per-Signing protected event-chain genesis. Pre-chain events remain '
  'unprotected through unprotected_prefix_end_sequence; later events must '
  'carry integrity digests/tags. Never rewrites historical rows.';

alter table public.signing_event_chain_state enable row level security;
alter table public.signing_event_chain_state force row level security;

drop policy if exists signing_event_chain_state_deny_all
  on public.signing_event_chain_state;
create policy signing_event_chain_state_deny_all
  on public.signing_event_chain_state
  for all
  using (false)
  with check (false);

revoke all on table public.signing_event_chain_state from anon, authenticated;
grant select, insert, update, delete on table public.signing_event_chain_state
  to service_role;

-- After sequence assignment: require integrity past genesis and validate that
-- prior_event_digest matches the actual chain tip (CAS against concurrent
-- appends). HMAC secrets never live in the database.
create or replace function public.signing_events_require_chain_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  chain public.signing_event_chain_state%rowtype;
  expected_prior text;
  prior_row public.signing_events%rowtype;
begin
  select *
    into chain
  from public.signing_event_chain_state
  where signing_id = new.signing_id;

  if not found then
    return new;
  end if;

  if new.sequence_number <= chain.unprotected_prefix_end_sequence then
    return new;
  end if;

  if new.prior_event_digest is null
     or new.event_digest is null
     or new.integrity_key_id is null
     or new.integrity_authentication_tag is null then
    raise exception
      'signing_events past chain genesis require protected integrity fields'
      using errcode = 'check_violation';
  end if;

  if new.sequence_number = chain.unprotected_prefix_end_sequence + 1 then
    expected_prior := chain.genesis_prior_digest;
  else
    select *
      into prior_row
    from public.signing_events e
    where e.signing_id = new.signing_id
      and e.sequence_number = new.sequence_number - 1;

    if not found or prior_row.event_digest is null then
      raise exception
        'signing_events chain tip missing for prior digest validation'
        using errcode = 'check_violation';
    end if;
    expected_prior := prior_row.event_digest;
  end if;

  if new.prior_event_digest is distinct from expected_prior then
    raise exception
      'signing_events prior_event_digest does not match chain tip'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists signing_events_require_chain_integrity
  on public.signing_events;
-- Runs after signing_events_assign_sequence (same BEFORE INSERT; name order
-- places require_* after assign_*).
create trigger signing_events_require_chain_integrity
before insert on public.signing_events
for each row execute function public.signing_events_require_chain_integrity();

commit;
