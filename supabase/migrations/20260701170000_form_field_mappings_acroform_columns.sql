-- AcroForm-aware PDF template mappings: store native PDF field metadata on placements.

alter table public.form_field_mappings
  add column if not exists pdf_field_name text,
  add column if not exists pdf_field_type text,
  add column if not exists pdf_export_value text;

create unique index if not exists form_field_mappings_form_pdf_field_active_uidx
  on public.form_field_mappings (
    form_id,
    lower(trim(pdf_field_name)),
    coalesce(occurrence_index, -1)
  )
  where status = 'ACTIVE'
    and pdf_field_name is not null
    and trim(pdf_field_name) <> '';
