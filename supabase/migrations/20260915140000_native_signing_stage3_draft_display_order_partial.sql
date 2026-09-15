-- Native Signing Stage 3 review fix: Draft display_order uniqueness only among
-- currently included documents so soft-excluded rows cannot block reorder.

begin;

drop index if exists public.signing_documents_signing_display_order_uidx;

create unique index signing_documents_signing_display_order_uidx
  on public.signing_documents (signing_id, display_order)
  where included_in_draft = true;

commit;
