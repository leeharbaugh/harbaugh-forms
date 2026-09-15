-- Native Signing Stage 3: mutable Draft field preparation + Draft document/participant metadata.
-- Forward-only. Development only. Does not relax browser deny-by-default.

begin;

-- ---------------------------------------------------------------------------
-- 1. Draft document display metadata (mutable until package promotion)
-- ---------------------------------------------------------------------------

alter table public.signing_documents
  add column if not exists display_name text,
  add column if not exists filename text;

alter table public.signing_documents
  drop constraint if exists signing_documents_display_name_not_blank;
alter table public.signing_documents
  add constraint signing_documents_display_name_not_blank
  check (display_name is null or length(trim(display_name)) > 0);

alter table public.signing_documents
  drop constraint if exists signing_documents_filename_not_blank;
alter table public.signing_documents
  add constraint signing_documents_filename_not_blank
  check (filename is null or length(trim(filename)) > 0);

-- One source packet_form per Signing when present (no duplicate logical inclusion).
create unique index if not exists signing_documents_signing_source_packet_form_uidx
  on public.signing_documents (signing_id, source_packet_form_id)
  where source_packet_form_id is not null;

-- Deterministic Draft document order within a Signing.
create unique index if not exists signing_documents_signing_display_order_uidx
  on public.signing_documents (signing_id, display_order);

-- ---------------------------------------------------------------------------
-- 2. Draft participant display order
-- ---------------------------------------------------------------------------

alter table public.signing_participants
  add column if not exists display_order integer not null default 0;

create unique index if not exists signing_participants_signing_display_order_uidx
  on public.signing_participants (signing_id, display_order);

-- ---------------------------------------------------------------------------
-- 3. Mutable Draft signer-field instructions
--    signing_fields remains revision-scoped immutable evidence and must not be
--    reused for Draft placement editing.
-- ---------------------------------------------------------------------------

create table if not exists public.signing_draft_fields (
  id uuid primary key default gen_random_uuid(),
  create_date timestamptz not null default now(),
  update_date timestamptz not null default now(),

  signing_id uuid not null
    references public.signings (id) on delete restrict,
  signing_document_id uuid not null,
  signing_participant_id uuid not null,
  field_type text not null,
  is_required boolean not null default true,
  page_number integer not null,
  x double precision not null,
  y double precision not null,
  width double precision not null,
  height double precision not null,
  linked_signature_draft_field_id uuid,

  constraint signing_draft_fields_type_check
    check (field_type in ('SIGNATURE', 'INITIALS', 'DATE_SIGNED')),
  constraint signing_draft_fields_page_positive
    check (page_number >= 1),
  constraint signing_draft_fields_size_positive
    check (width > 0 and height > 0),
  constraint signing_draft_fields_signing_id_id_key
    unique (signing_id, id),
  constraint signing_draft_fields_document_same_signing_fkey
    foreign key (signing_id, signing_document_id)
    references public.signing_documents (signing_id, id)
    on delete restrict,
  constraint signing_draft_fields_participant_same_signing_fkey
    foreign key (signing_id, signing_participant_id)
    references public.signing_participants (signing_id, id)
    on delete restrict
);

create index if not exists signing_draft_fields_signing_id_idx
  on public.signing_draft_fields (signing_id);

create index if not exists signing_draft_fields_document_id_idx
  on public.signing_draft_fields (signing_document_id);

create index if not exists signing_draft_fields_participant_id_idx
  on public.signing_draft_fields (signing_participant_id);

alter table public.signing_draft_fields
  drop constraint if exists signing_draft_fields_linked_signature_same_signing_fkey;
alter table public.signing_draft_fields
  add constraint signing_draft_fields_linked_signature_same_signing_fkey
  foreign key (signing_id, linked_signature_draft_field_id)
  references public.signing_draft_fields (signing_id, id)
  on delete restrict;

drop trigger if exists signing_draft_fields_set_update_date on public.signing_draft_fields;
create trigger signing_draft_fields_set_update_date
before update on public.signing_draft_fields
for each row execute function public.set_update_date();

-- ---------------------------------------------------------------------------
-- 4. Deny-by-default RLS for the new Draft table
-- ---------------------------------------------------------------------------

alter table public.signing_draft_fields enable row level security;
alter table public.signing_draft_fields force row level security;

drop policy if exists signing_draft_fields_deny_authenticated on public.signing_draft_fields;
create policy signing_draft_fields_deny_authenticated
  on public.signing_draft_fields
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists signing_draft_fields_deny_anon on public.signing_draft_fields;
create policy signing_draft_fields_deny_anon
  on public.signing_draft_fields
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists account_state_application_gate on public.signing_draft_fields;
create policy account_state_application_gate
  on public.signing_draft_fields
  as restrictive
  for all
  to authenticated
  using (public.has_application_access())
  with check (public.has_application_access());

revoke all on table public.signing_draft_fields from public;
revoke all on table public.signing_draft_fields from anon;
revoke all on table public.signing_draft_fields from authenticated;

commit;
