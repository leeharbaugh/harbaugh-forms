-- Stage 1 corrective follow-up: enforce same-Signing root pointers and
-- tighter package-revision composition FKs. Forward-only; does not rewrite
-- 20260914200000. Target: harbaugh-forms-dev during Stage 1 review.

begin;

-- ---------------------------------------------------------------------------
-- 1. Root pointers must reference rows from the same Signing
-- ---------------------------------------------------------------------------

alter table public.signings
  drop constraint if exists signings_current_package_revision_id_fkey;

alter table public.signings
  drop constraint if exists signings_frozen_package_revision_id_fkey;

alter table public.signings
  drop constraint if exists signings_current_primary_agent_association_id_fkey;

alter table public.signings
  add constraint signings_current_package_revision_same_signing_fkey
  foreign key (id, current_package_revision_id)
  references public.signing_package_revisions (signing_id, id)
  on delete restrict;

alter table public.signings
  add constraint signings_frozen_package_revision_same_signing_fkey
  foreign key (id, frozen_package_revision_id)
  references public.signing_package_revisions (signing_id, id)
  on delete restrict;

alter table public.signings
  add constraint signings_current_primary_agent_association_same_signing_fkey
  foreign key (id, current_primary_agent_association_id)
  references public.signing_agent_associations (signing_id, id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- 2. Revision document snapshot must cite a version of that logical document
-- ---------------------------------------------------------------------------

alter table public.signing_document_versions
  drop constraint if exists signing_document_versions_document_id_id_key;

alter table public.signing_document_versions
  add constraint signing_document_versions_document_id_id_key
  unique (signing_document_id, id);

alter table public.signing_package_revision_documents
  drop constraint if exists signing_package_revision_documents_version_belongs_to_document_fkey;

alter table public.signing_package_revision_documents
  add constraint signing_package_revision_documents_version_belongs_to_document_fkey
  foreign key (signing_document_id, signing_document_version_id)
  references public.signing_document_versions (signing_document_id, id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Signer fields must assign document/participant snapshots from the same
--    package revision (not merely the same Signing)
-- ---------------------------------------------------------------------------

alter table public.signing_package_revision_documents
  drop constraint if exists signing_package_revision_documents_revision_id_id_key;

alter table public.signing_package_revision_documents
  add constraint signing_package_revision_documents_revision_id_id_key
  unique (package_revision_id, id);

alter table public.signing_package_revision_participants
  drop constraint if exists signing_package_revision_participants_revision_id_id_key;

alter table public.signing_package_revision_participants
  add constraint signing_package_revision_participants_revision_id_id_key
  unique (package_revision_id, id);

alter table public.signing_fields
  drop constraint if exists signing_fields_revision_document_same_revision_fkey;

alter table public.signing_fields
  add constraint signing_fields_revision_document_same_revision_fkey
  foreign key (package_revision_id, package_revision_document_id)
  references public.signing_package_revision_documents (package_revision_id, id)
  on delete restrict;

alter table public.signing_fields
  drop constraint if exists signing_fields_revision_participant_same_revision_fkey;

alter table public.signing_fields
  add constraint signing_fields_revision_participant_same_revision_fkey
  foreign key (package_revision_id, package_revision_participant_id)
  references public.signing_package_revision_participants (package_revision_id, id)
  on delete restrict;

commit;
