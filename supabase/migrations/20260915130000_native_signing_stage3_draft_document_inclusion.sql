-- Native Signing Stage 3: Draft document inclusion flag.
-- Logical signing_documents remain retained after versions exist; Draft may
-- exclude them from later package revisions without deleting historical evidence.

begin;

alter table public.signing_documents
  add column if not exists included_in_draft boolean not null default true;

comment on column public.signing_documents.included_in_draft is
  'Mutable Draft inclusion. False excludes the logical document from the next package revision without deleting historical revision evidence.';

commit;
