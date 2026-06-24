-- Refactor form-specific buyer_rep_broker_* fields into reusable brokerage settings fields.
-- Remaps form_field_mappings to shared catalog fields; soft-deactivates legacy field keys.

-- ---------------------------------------------------------------------------
-- 1. Seed reusable brokerage settings fields
-- ---------------------------------------------------------------------------

with seed (
  field_key,
  field_name,
  field_label,
  field_data_type,
  field_widget_type,
  default_value,
  default_checked,
  required,
  notes,
  source_type,
  source_path,
  resolver_key
) as (
  values
    (
      'brokerage_name',
      'brokerage_name',
      'Brokerage Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage/firm name from brokerage_settings.',
      'settings_brokerage',
      'brokerage_name',
      null::text
    ),
    (
      'brokerage_address',
      'brokerage_address',
      'Brokerage Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage street address from brokerage_settings.',
      'settings_brokerage',
      'brokerage_address',
      null::text
    ),
    (
      'brokerage_city_state_zip',
      'brokerage_city_state_zip',
      'Brokerage City, State, Zip',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage city, state, and ZIP from brokerage_settings.',
      'settings_brokerage',
      'brokerage_city_state_zip',
      null::text
    ),
    (
      'brokerage_office_phone',
      'brokerage_office_phone',
      'Brokerage Office Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage office phone from brokerage_settings.',
      'settings_brokerage',
      'brokerage_office_phone',
      null::text
    ),
    (
      'brokerage_email',
      'brokerage_email',
      'Brokerage Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage/firm email from brokerage_settings (not the individual broker email).',
      'settings_brokerage',
      'brokerage_email',
      null::text
    ),
    (
      'brokerage_license_number',
      'brokerage_license_number',
      'Brokerage License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage/firm license number from brokerage_settings (not the individual broker license).',
      'settings_brokerage',
      'brokerage_license_number',
      null::text
    )
),
inserted as (
  insert into public.fields (
    field_key,
    field_name,
    field_label,
    field_data_type,
    field_widget_type,
    default_value,
    default_checked,
    required,
    notes,
    source_type,
    source_path,
    resolver_key
  )
  select
    s.field_key,
    s.field_name,
    s.field_label,
    s.field_data_type,
    s.field_widget_type,
    s.default_value,
    s.default_checked,
    s.required,
    s.notes,
    s.source_type,
    s.source_path,
    s.resolver_key
  from seed s
  where not exists (
    select 1
    from public.fields existing
    where lower(existing.field_key) = lower(s.field_key)
      and existing.status = 'ACTIVE'
  )
  returning field_key
)
update public.fields target
set
  field_name = s.field_name,
  field_label = s.field_label,
  field_data_type = s.field_data_type,
  field_widget_type = s.field_widget_type,
  default_value = s.default_value,
  default_checked = s.default_checked,
  required = s.required,
  notes = s.notes,
  source_type = s.source_type,
  source_path = s.source_path,
  resolver_key = s.resolver_key,
  update_date = now()
from seed s
where lower(target.field_key) = lower(s.field_key)
  and target.status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 2. Remap form_field_mappings from buyer_rep_broker_* to reusable fields
-- ---------------------------------------------------------------------------

with field_remap(old_field_key, new_field_key) as (
  values
    ('buyer_rep_broker_name', 'brokerage_name'),
    ('buyer_rep_broker_address', 'brokerage_address'),
    ('buyer_rep_broker_city_state_zip', 'brokerage_city_state_zip'),
    ('buyer_rep_broker_phone', 'brokerage_office_phone'),
    ('buyer_rep_broker_email', 'brokerage_email')
),
resolved_remap as (
  select
    old_f.id as old_field_id,
    new_f.id as new_field_id,
    r.old_field_key,
    r.new_field_key
  from field_remap r
  inner join public.fields old_f
    on lower(old_f.field_key) = lower(r.old_field_key)
   and old_f.status in ('ACTIVE', 'INACTIVE')
  inner join public.fields new_f
    on lower(new_f.field_key) = lower(r.new_field_key)
   and new_f.status = 'ACTIVE'
),
mapping_conflicts as (
  select ffm.id as remapping_id
  from public.form_field_mappings ffm
  inner join resolved_remap r on r.old_field_id = ffm.field_id
  inner join public.form_field_mappings existing
    on existing.form_id = ffm.form_id
   and existing.field_id = r.new_field_id
   and existing.page_number = ffm.page_number
   and coalesce(existing.occurrence_index, -1) = coalesce(ffm.occurrence_index, -1)
   and existing.status = 'ACTIVE'
   and existing.id <> ffm.id
  where ffm.status = 'ACTIVE'
),
deactivated_conflicts as (
  update public.form_field_mappings target
  set
    status = 'INACTIVE',
    update_date = now()
  from mapping_conflicts c
  where target.id = c.remapping_id
  returning target.id
)
update public.form_field_mappings target
set
  field_id = r.new_field_id,
  update_date = now()
from resolved_remap r
where target.field_id = r.old_field_id
  and target.status = 'ACTIVE'
  and not exists (
    select 1
    from mapping_conflicts c
    where c.remapping_id = target.id
  );

-- Align packet field instances with remapped catalog fields
with field_remap(old_field_key, new_field_key) as (
  values
    ('buyer_rep_broker_name', 'brokerage_name'),
    ('buyer_rep_broker_address', 'brokerage_address'),
    ('buyer_rep_broker_city_state_zip', 'brokerage_city_state_zip'),
    ('buyer_rep_broker_phone', 'brokerage_office_phone'),
    ('buyer_rep_broker_email', 'brokerage_email')
),
resolved_remap as (
  select old_f.id as old_field_id, new_f.id as new_field_id
  from field_remap r
  inner join public.fields old_f
    on lower(old_f.field_key) = lower(r.old_field_key)
   and old_f.status in ('ACTIVE', 'INACTIVE')
  inner join public.fields new_f
    on lower(new_f.field_key) = lower(r.new_field_key)
   and new_f.status = 'ACTIVE'
)
update public.field_instances target
set
  field_id = r.new_field_id,
  update_date = now()
from resolved_remap r
where target.field_id = r.old_field_id
  and target.status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 3. Deactivate legacy buyer_rep_broker_* catalog fields
-- ---------------------------------------------------------------------------

update public.fields
set
  status = 'INACTIVE',
  update_date = now()
where lower(field_key) in (
    'buyer_rep_broker_name',
    'buyer_rep_broker_address',
    'buyer_rep_broker_city_state_zip',
    'buyer_rep_broker_phone',
    'buyer_rep_broker_email'
  )
  and status = 'ACTIVE';
