-- Native Signing: ad hoc Signing PDFs + nullable Draft snapshot Packet provenance.
-- Forward-only. Development only. Does not relax browser deny-by-default.
-- Ad hoc PDFs are Signing-owned Draft preparation; evidence still freezes at activation.

begin;

-- ---------------------------------------------------------------------------
-- 1. signing_documents.source_kind
-- ---------------------------------------------------------------------------

alter table public.signing_documents
  add column if not exists source_kind text;

update public.signing_documents
set source_kind = case
  when source_packet_form_id is not null then 'PACKET_FORM'
  else 'AD_HOC_PDF'
end
where source_kind is null;

alter table public.signing_documents
  alter column source_kind set default 'PACKET_FORM';

alter table public.signing_documents
  alter column source_kind set not null;

alter table public.signing_documents
  drop constraint if exists signing_documents_source_kind_check;
alter table public.signing_documents
  add constraint signing_documents_source_kind_check
  check (source_kind in ('PACKET_FORM', 'AD_HOC_PDF'));

alter table public.signing_documents
  drop constraint if exists signing_documents_source_kind_provenance_check;
alter table public.signing_documents
  add constraint signing_documents_source_kind_provenance_check
  check (
    (source_kind = 'PACKET_FORM' and source_packet_form_id is not null)
    or (source_kind = 'AD_HOC_PDF' and source_packet_form_id is null)
  );

comment on column public.signing_documents.source_kind is
  'PACKET_FORM = Packet Form provenance; AD_HOC_PDF = Signing-owned uploaded PDF. Neither is evidence until activation.';

-- ---------------------------------------------------------------------------
-- 2. Draft source snapshots: Packet provenance optional for ad hoc PDFs
-- ---------------------------------------------------------------------------

alter table public.signing_draft_source_snapshots
  alter column source_packet_form_id drop not null;

alter table public.signing_draft_source_snapshots
  alter column source_packet_id drop not null;

alter table public.signing_draft_source_snapshots
  drop constraint if exists sds_snap_adhoc_or_packet_check;
alter table public.signing_draft_source_snapshots
  add constraint sds_snap_adhoc_or_packet_check
  check (
    (
      source_packet_form_id is not null
      and source_packet_id is not null
    )
    or (
      source_packet_form_id is null
      and source_packet_id is null
      and form_id is null
      and field_views_json = '[]'::jsonb
      and annotations_json = '[]'::jsonb
    )
  );

comment on table public.signing_draft_source_snapshots is
  'Signing-owned Draft preparation snapshots (Packet Form or ad hoc PDF). Not signing_document_versions, not package revisions, not participant evidence.';

commit;
