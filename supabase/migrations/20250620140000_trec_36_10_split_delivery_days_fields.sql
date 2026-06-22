-- TREC 36-10 HOA Addendum: rename shared hoa_addendum_delivery_days to
-- hoa_addendum_seller_delivery_days and add separate buyer delivery-day field.
-- Does not touch public.forms.

-- ---------------------------------------------------------------------------
-- 1. Rename legacy field key in place (preserves field_id for Option 1 blank)
-- ---------------------------------------------------------------------------

update public.fields
set
  field_key = 'hoa_addendum_seller_delivery_days',
  field_name = 'hoa_addendum_seller_delivery_days',
  field_label = 'HOA Addendum Seller Delivery Days',
  field_data_type = 'integer',
  field_widget_type = 'text',
  required = false,
  notes = 'TREC 36-10 HOA Addendum · Option 1 · Seller shall obtain, pay for, and deliver the Subdivision Information within ___ days.',
  source_type = 'manual_only',
  status = 'ACTIVE',
  update_date = now()
where lower(field_key) = 'hoa_addendum_delivery_days'
  and not exists (
    select 1
    from public.fields existing
    where lower(existing.field_key) = 'hoa_addendum_seller_delivery_days'
      and existing.status = 'ACTIVE'
      and existing.id <> public.fields.id
  );

-- If a separate seller field was already seeded, re-point legacy references to it.
with field_ids as (
  select
    (
      select f.id
      from public.fields f
      where lower(f.field_key) = 'hoa_addendum_delivery_days'
      limit 1
    ) as legacy_field_id,
    (
      select f.id
      from public.fields f
      where lower(f.field_key) = 'hoa_addendum_seller_delivery_days'
        and f.status = 'ACTIVE'
      limit 1
    ) as seller_field_id
)
update public.form_field_mappings ffm
set
  field_id = ids.seller_field_id,
  update_date = now()
from field_ids ids
where ffm.field_id = ids.legacy_field_id
  and ffm.status = 'ACTIVE'
  and ids.legacy_field_id is not null
  and ids.seller_field_id is not null
  and ids.legacy_field_id <> ids.seller_field_id;

with field_ids as (
  select
    (
      select f.id
      from public.fields f
      where lower(f.field_key) = 'hoa_addendum_delivery_days'
      limit 1
    ) as legacy_field_id,
    (
      select f.id
      from public.fields f
      where lower(f.field_key) = 'hoa_addendum_seller_delivery_days'
        and f.status = 'ACTIVE'
      limit 1
    ) as seller_field_id
)
update public.field_instances fi
set
  field_id = ids.seller_field_id,
  update_date = now()
from field_ids ids
where fi.field_id = ids.legacy_field_id
  and fi.status = 'ACTIVE'
  and ids.legacy_field_id is not null
  and ids.seller_field_id is not null
  and ids.legacy_field_id <> ids.seller_field_id;

with field_ids as (
  select
    (
      select f.id
      from public.fields f
      where lower(f.field_key) = 'hoa_addendum_delivery_days'
      limit 1
    ) as legacy_field_id,
    (
      select f.id
      from public.fields f
      where lower(f.field_key) = 'hoa_addendum_seller_delivery_days'
        and f.status = 'ACTIVE'
      limit 1
    ) as seller_field_id
)
update public.field_instance_mappings fim
set
  field_id = ids.seller_field_id,
  update_date = now()
from field_ids ids
where fim.field_id = ids.legacy_field_id
  and fim.status = 'ACTIVE'
  and ids.legacy_field_id is not null
  and ids.seller_field_id is not null
  and ids.legacy_field_id <> ids.seller_field_id;

-- ---------------------------------------------------------------------------
-- 2. Seed buyer field and sync seller metadata (idempotent by field_key)
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
      'hoa_addendum_seller_delivery_days',
      'hoa_addendum_seller_delivery_days',
      'HOA Addendum Seller Delivery Days',
      'integer',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 36-10 HOA Addendum · Option 1 · Seller shall obtain, pay for, and deliver the Subdivision Information within ___ days.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_buyer_delivery_days',
      'hoa_addendum_buyer_delivery_days',
      'HOA Addendum Buyer Delivery Days',
      'integer',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 36-10 HOA Addendum · Option 2 · Buyer shall obtain, pay for, and deliver a copy of the Subdivision Information within ___ days.',
      'manual_only',
      null::text,
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
-- 3. Remap Option 2 blank to buyer field; migrate buyer instances
-- ---------------------------------------------------------------------------

with field_ids as (
  select
    (
      select f.id
      from public.fields f
      where lower(f.field_key) = 'hoa_addendum_seller_delivery_days'
        and f.status = 'ACTIVE'
      limit 1
    ) as seller_field_id,
    (
      select f.id
      from public.fields f
      where lower(f.field_key) = 'hoa_addendum_buyer_delivery_days'
        and f.status = 'ACTIVE'
      limit 1
    ) as buyer_field_id,
    (
      select f.id
      from public.fields f
      where lower(f.field_key) = 'hoa_addendum_option_2_selected'
        and f.status = 'ACTIVE'
      limit 1
    ) as option_2_field_id
),
ranked_mappings as (
  select
    ranked.id,
    ids.buyer_field_id as new_field_id
  from (
    select
      ffm.id,
      row_number() over (
        partition by ffm.form_id
        order by
          coalesce(
            case
              when coalesce(ffm.mapping_name, ffm.notes, '') ~* '(seller|option[\s_]*1)'
                then 1
              when coalesce(ffm.mapping_name, ffm.notes, '') ~* '(buyer|option[\s_]*2)'
                then 2
              else null
            end,
            case coalesce(ffm.occurrence_index, -1)
              when 0 then 1
              when 1 then 2
              else null
            end,
            999
          ),
          ffm.page_number,
          ffm.y,
          ffm.x,
          ffm.id
      ) as placement_rank
    from public.form_field_mappings ffm
    cross join field_ids ids
    where ffm.field_id = ids.seller_field_id
      and ffm.status = 'ACTIVE'
      and ids.seller_field_id is not null
      and ids.buyer_field_id is not null
  ) ranked
  cross join field_ids ids
  where ranked.placement_rank > 1
),
updated_mappings as (
  update public.form_field_mappings target
  set
    field_id = rm.new_field_id,
    update_date = now()
  from ranked_mappings rm
  where target.id = rm.id
  returning target.id
),
buyer_instances as (
  insert into public.field_instances (
    packet_id,
    packet_form_id,
    field_id,
    value,
    value_json,
    source,
    is_override,
    notes
  )
  select
    seller_fi.packet_id,
    seller_fi.packet_form_id,
    ids.buyer_field_id,
    case
      when coalesce(opt2.value, '') in ('true', '1', 'yes', 'on')
        or opt2.value_json = 'true'::jsonb
        then seller_fi.value
      else null
    end,
    case
      when coalesce(opt2.value, '') in ('true', '1', 'yes', 'on')
        or opt2.value_json = 'true'::jsonb
        then seller_fi.value_json
      else null
    end,
    seller_fi.source,
    seller_fi.is_override,
    'Split from hoa_addendum_seller_delivery_days for Option 2 buyer blank.'
  from public.field_instances seller_fi
  cross join field_ids ids
  left join public.field_instances opt2
    on opt2.packet_form_id = seller_fi.packet_form_id
   and opt2.field_id = ids.option_2_field_id
   and opt2.status = 'ACTIVE'
  where seller_fi.field_id = ids.seller_field_id
    and seller_fi.status = 'ACTIVE'
    and ids.buyer_field_id is not null
    and not exists (
      select 1
      from public.field_instances existing
      where existing.packet_form_id = seller_fi.packet_form_id
        and existing.field_id = ids.buyer_field_id
        and existing.status = 'ACTIVE'
    )
  returning id, packet_form_id, field_id
),
remapped_instance_mappings as (
  select
    fim.id as field_instance_mapping_id,
    ffm.field_id as new_field_id,
    buyer_inst.id as new_field_instance_id
  from public.field_instance_mappings fim
  inner join public.form_field_mappings ffm
    on fim.form_field_mapping_id = ffm.id
  cross join field_ids ids
  left join buyer_instances buyer_inst
    on buyer_inst.packet_form_id = fim.packet_form_id
   and buyer_inst.field_id = ids.buyer_field_id
  where fim.status = 'ACTIVE'
    and ffm.status = 'ACTIVE'
    and ffm.field_id = ids.buyer_field_id
)
update public.field_instance_mappings fim
set
  field_id = rim.new_field_id,
  field_instance_id = coalesce(rim.new_field_instance_id, fim.field_instance_id),
  update_date = now()
from remapped_instance_mappings rim
where fim.id = rim.field_instance_mapping_id;
