-- Allow date_signed annotations on packet forms (Fill Form Date Signed tool).
-- Forward-only; does not amend 20260805220000 / 20260805230000.
-- Preserves creator-attribution trigger and RLS from prior migrations.

alter table public.packet_form_annotations
  drop constraint if exists packet_form_annotations_annotation_type_check;

alter table public.packet_form_annotations
  add constraint packet_form_annotations_annotation_type_check
  check (annotation_type in ('typed_signature', 'date_signed'));

comment on column public.packet_form_annotations.annotation_type is
  'Fill Form annotation kind: typed_signature (Caveat) or date_signed (Helvetica).';

comment on column public.packet_form_annotations.text_value is
  'Display text. For date_signed: formatted calendar date string chosen at placement (not a timestamp).';

comment on column public.packet_form_annotations.font_id is
  'Render hint: caveat for typed_signature; helvetica for date_signed.';
