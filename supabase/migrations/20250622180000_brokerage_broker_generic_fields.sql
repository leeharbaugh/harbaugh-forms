-- Normalize generic brokerage (firm) and broker (person) field catalog entries.
-- Remaps form-specific broker/brokerage field keys; soft-deactivates legacy keys.

-- ---------------------------------------------------------------------------
-- 1. Seed generic brokerage + broker catalog fields
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
    -- Brokerage / firm
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
      'brokerage_license_number',
      'brokerage_license_number',
      'Brokerage License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage/firm license number from brokerage_settings (not broker_license_number).',
      'settings_brokerage',
      'brokerage_license_number',
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
      'brokerage_city',
      'brokerage_city',
      'Brokerage City',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage city from brokerage_settings.',
      'settings_brokerage',
      'brokerage_city',
      null::text
    ),
    (
      'brokerage_state',
      'brokerage_state',
      'Brokerage State',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage state from brokerage_settings.',
      'settings_brokerage',
      'brokerage_state',
      null::text
    ),
    (
      'brokerage_zip',
      'brokerage_zip',
      'Brokerage Zip',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Brokerage ZIP from brokerage_settings.',
      'settings_brokerage',
      'brokerage_zip',
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
      'Composite brokerage city, state, and ZIP from brokerage_settings.',
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
      'Brokerage office phone from brokerage_settings (not broker_phone).',
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
      'Brokerage/firm email from brokerage_settings (not broker_email).',
      'settings_brokerage',
      'brokerage_email',
      null::text
    ),
    -- Broker of record / person
    (
      'broker_first_name',
      'broker_first_name',
      'Broker First Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Designated broker first name from brokerage_settings.',
      'settings_brokerage',
      'broker_first_name',
      null::text
    ),
    (
      'broker_middle_name',
      'broker_middle_name',
      'Broker Middle Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Designated broker middle name from brokerage_settings.',
      'settings_brokerage',
      'broker_middle_name',
      null::text
    ),
    (
      'broker_last_name',
      'broker_last_name',
      'Broker Last Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Designated broker last name from brokerage_settings.',
      'settings_brokerage',
      'broker_last_name',
      null::text
    ),
    (
      'broker_full_name',
      'broker_full_name',
      'Broker Full Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Designated broker full name from brokerage_settings.',
      'settings_brokerage',
      'broker_full_name',
      null::text
    ),
    (
      'broker_license_number',
      'broker_license_number',
      'Broker License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Individual broker license number from brokerage_settings (not brokerage_license_number).',
      'settings_brokerage',
      'broker_license_number',
      null::text
    ),
    (
      'broker_phone',
      'broker_phone',
      'Broker Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Designated broker phone from brokerage_settings (not brokerage_office_phone).',
      'settings_brokerage',
      'broker_phone',
      null::text
    ),
    (
      'broker_email',
      'broker_email',
      'Broker Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Designated broker email from brokerage_settings (not brokerage_email).',
      'settings_brokerage',
      'broker_email',
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
-- 2. Resolve form-specific legacy field_key -> generic field_key
-- ---------------------------------------------------------------------------

with legacy_fields as (
  select
    f.id,
    lower(f.field_key) as field_key
  from public.fields f
  where f.status in ('ACTIVE', 'INACTIVE')
    and (
      f.field_key ilike 'buyer_rep_broker\_%' escape '\'
      or f.field_key ilike 'buyer_rep_brokerage\_%' escape '\'
      or f.field_key ilike 'listing_broker\_%' escape '\'
      or f.field_key ilike 'listing_brokerage\_%' escape '\'
    )
),
computed_remap as (
  select
    lf.id as old_field_id,
    lf.field_key as old_field_key,
    case
      when lf.field_key like 'buyer_rep_broker_%' then
        case substring(lf.field_key from 18)
          when 'name' then 'brokerage_name'
          when 'address' then 'brokerage_address'
          when 'city' then 'brokerage_city'
          when 'state' then 'brokerage_state'
          when 'zip' then 'brokerage_zip'
          when 'city_state_zip' then 'brokerage_city_state_zip'
          when 'phone' then 'brokerage_office_phone'
          when 'email' then 'brokerage_email'
          when 'license_number' then 'broker_license_number'
          when 'full_name' then 'broker_full_name'
          when 'first_name' then 'broker_first_name'
          when 'middle_name' then 'broker_middle_name'
          when 'last_name' then 'broker_last_name'
          else null
        end
      when lf.field_key like 'buyer_rep_brokerage_%' then
        'brokerage_' || substring(lf.field_key from 22)
      when lf.field_key like 'listing_brokerage_%' then
        'brokerage_' || substring(lf.field_key from 20)
      when lf.field_key like 'listing_broker_%' then
        case substring(lf.field_key from 16)
          when 'name' then 'broker_full_name'
          when 'full_name' then 'broker_full_name'
          when 'first_name' then 'broker_first_name'
          when 'middle_name' then 'broker_middle_name'
          when 'last_name' then 'broker_last_name'
          when 'license_number' then 'broker_license_number'
          when 'phone' then 'broker_phone'
          when 'email' then 'broker_email'
          else null
        end
      else null
    end as new_field_key
  from legacy_fields lf
),
resolved_remap as (
  select
    cr.old_field_id,
    new_f.id as new_field_id,
    cr.old_field_key,
    cr.new_field_key
  from computed_remap cr
  inner join public.fields new_f
    on lower(new_f.field_key) = cr.new_field_key
   and new_f.status = 'ACTIVE'
  where cr.new_field_key is not null
    and cr.old_field_key <> cr.new_field_key
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

-- field_instances
with legacy_fields as (
  select
    f.id,
    lower(f.field_key) as field_key
  from public.fields f
  where f.status in ('ACTIVE', 'INACTIVE')
    and (
      f.field_key ilike 'buyer_rep_broker\_%' escape '\'
      or f.field_key ilike 'buyer_rep_brokerage\_%' escape '\'
      or f.field_key ilike 'listing_broker\_%' escape '\'
      or f.field_key ilike 'listing_brokerage\_%' escape '\'
    )
),
computed_remap as (
  select
    lf.id as old_field_id,
    lf.field_key as old_field_key,
    case
      when lf.field_key like 'buyer_rep_broker_%' then
        case substring(lf.field_key from 18)
          when 'name' then 'brokerage_name'
          when 'address' then 'brokerage_address'
          when 'city' then 'brokerage_city'
          when 'state' then 'brokerage_state'
          when 'zip' then 'brokerage_zip'
          when 'city_state_zip' then 'brokerage_city_state_zip'
          when 'phone' then 'brokerage_office_phone'
          when 'email' then 'brokerage_email'
          when 'license_number' then 'broker_license_number'
          when 'full_name' then 'broker_full_name'
          when 'first_name' then 'broker_first_name'
          when 'middle_name' then 'broker_middle_name'
          when 'last_name' then 'broker_last_name'
          else null
        end
      when lf.field_key like 'buyer_rep_brokerage_%' then
        'brokerage_' || substring(lf.field_key from 22)
      when lf.field_key like 'listing_brokerage_%' then
        'brokerage_' || substring(lf.field_key from 20)
      when lf.field_key like 'listing_broker_%' then
        case substring(lf.field_key from 16)
          when 'name' then 'broker_full_name'
          when 'full_name' then 'broker_full_name'
          when 'first_name' then 'broker_first_name'
          when 'middle_name' then 'broker_middle_name'
          when 'last_name' then 'broker_last_name'
          when 'license_number' then 'broker_license_number'
          when 'phone' then 'broker_phone'
          when 'email' then 'broker_email'
          else null
        end
      else null
    end as new_field_key
  from legacy_fields lf
),
resolved_remap as (
  select cr.old_field_id, new_f.id as new_field_id
  from computed_remap cr
  inner join public.fields new_f
    on lower(new_f.field_key) = cr.new_field_key
   and new_f.status = 'ACTIVE'
  where cr.new_field_key is not null
    and cr.old_field_key <> cr.new_field_key
)
update public.field_instances target
set
  field_id = r.new_field_id,
  update_date = now()
from resolved_remap r
where target.field_id = r.old_field_id
  and target.status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 3. Deactivate form-specific broker/brokerage catalog fields
-- ---------------------------------------------------------------------------

update public.fields
set
  status = 'INACTIVE',
  update_date = now()
where status = 'ACTIVE'
  and (
    field_key ilike 'buyer_rep_broker\_%' escape '\'
    or field_key ilike 'buyer_rep_brokerage\_%' escape '\'
    or field_key ilike 'listing_broker\_%' escape '\'
    or field_key ilike 'listing_brokerage\_%' escape '\'
  );
