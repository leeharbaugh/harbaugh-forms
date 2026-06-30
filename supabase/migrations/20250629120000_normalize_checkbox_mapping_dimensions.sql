-- Normalize checkbox placement dimensions to 12x12 without changing field values.

update public.form_field_mappings ffm
set
  width = 12,
  height = 12
from public.fields f
where ffm.field_id = f.id
  and ffm.status = 'ACTIVE'
  and (
    ffm.field_widget_type = 'checkbox'
    or f.field_widget_type = 'checkbox'
    or f.field_data_type = 'boolean'
  )
  and (ffm.width is distinct from 12 or ffm.height is distinct from 12);

update public.field_instance_mappings fim
set
  width = 12,
  height = 12
from public.fields f
where fim.field_id = f.id
  and fim.status = 'ACTIVE'
  and f.field_widget_type = 'checkbox'
  and (fim.width is distinct from 12 or fim.height is distinct from 12);
