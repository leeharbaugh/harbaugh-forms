-- Allow unmapped AcroForm template placements while keeping manual mappings linked.

alter table public.form_field_mappings
  alter column field_id drop not null;

alter table public.form_field_mappings
  drop constraint if exists form_field_mappings_field_id_or_acroform_check;

alter table public.form_field_mappings
  add constraint form_field_mappings_field_id_or_acroform_check
  check (
    field_id is not null
    or (
      pdf_field_name is not null
      and trim(pdf_field_name) <> ''
    )
  );
