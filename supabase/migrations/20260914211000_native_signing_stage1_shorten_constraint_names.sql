-- Stage 1 hygiene: shorten PostgreSQL-truncated FK name from
-- 20260914210000 to a stable identifier under the 63-char limit.

begin;

alter table public.signing_package_revision_documents
  rename constraint signing_package_revision_documents_version_belongs_to_document_
  to signing_pkg_rev_docs_version_document_fkey;

commit;
