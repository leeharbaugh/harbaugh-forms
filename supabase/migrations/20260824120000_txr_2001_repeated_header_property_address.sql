-- Map TXR-2001's packet property address into the repeated
-- "Residential Lease concerning:" header on pages 2-16.

with target as (
  select f.id as form_id, fld.id as field_id
  from public.forms f
  join public.fields fld
    on lower(fld.field_key) = 'txr_2001_property_address'
   and fld.status = 'ACTIVE'
  where f.form_code = 'TXR-2001'
    and f.status = 'ACTIVE'
), pages as (
  select generate_series(2, 16) as page_number
)
insert into public.form_field_mappings (
  form_id,
  field_id,
  mapping_name,
  occurrence_index,
  page_number,
  x,
  y,
  width,
  height,
  page_width,
  page_height,
  font_size,
  field_widget_type,
  notes,
  status
)
select
  target.form_id,
  target.field_id,
  'Page ' || pages.page_number || ' header · Residential Lease concerning',
  null,
  pages.page_number,
  160,
  32,
  416,
  14,
  612,
  792,
  9,
  'text',
  'TXR-2001 repeated header property address',
  'ACTIVE'
from target
cross join pages
where not exists (
  select 1
  from public.form_field_mappings existing
  where existing.form_id = target.form_id
    and existing.field_id = target.field_id
    and existing.page_number = pages.page_number
    and existing.status = 'ACTIVE'
);

