-- Deactivate catalog fields that were auto-created from native PDF AcroForm names.
-- Preserves fields explicitly created during import review and durable mapped fields.

update public.fields f
set status = 'INACTIVE'
where f.status = 'ACTIVE'
  and coalesce(f.notes, '') not ilike '%Created during AcroForm import review.%'
  and (
    coalesce(f.notes, '') ilike '%Imported from PDF AcroForm%'
    or coalesce(f.notes, '') ilike '%PDF field inventory%'
    or (
      f.field_key ~ '^[A-Z0-9_]+$'
      and length(f.field_key) >= 18
      and coalesce(f.source_type, 'manual_only') = 'manual_only'
      and nullif(trim(coalesce(f.source_path, '')), '') is null
      and nullif(trim(coalesce(f.resolver_key, '')), '') is null
    )
  )
  and not exists (
    select 1
    from public.form_field_mappings m
    where m.field_id = f.id
      and m.status = 'ACTIVE'
      and nullif(trim(coalesce(m.pdf_field_name, '')), '') is null
  );

-- Unmap AcroForm placements that pointed at deactivated placeholder fields.
update public.form_field_mappings m
set field_id = null
from public.fields f
where m.field_id = f.id
  and f.status = 'INACTIVE'
  and m.status = 'ACTIVE'
  and nullif(trim(coalesce(m.pdf_field_name, '')), '') is not null;

-- Drop remembered mappings that targeted deactivated placeholder fields.
update public.acroform_field_mapping_memory mem
set status = 'INACTIVE'
from public.fields f
where mem.field_id = f.id
  and f.status = 'INACTIVE'
  and mem.status = 'ACTIVE';
