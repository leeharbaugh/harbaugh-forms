-- TREC 36-10 HOA Addendum reusable field catalog seeds.
-- Form metadata and PDF placements are managed separately (do not touch public.forms).

-- ---------------------------------------------------------------------------
-- fields — idempotent upsert by field_key (active rows)
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
    -- Property-sourced (property_hoas via custom resolver)
    (
      'property_hoa_name',
      'property_hoa_name',
      'HOA Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 36-10 HOA Addendum · Property HOA name from property_hoas for the packet property.',
      'custom_resolver',
      null::text,
      'property_hoa_name'
    ),
    (
      'property_hoa_phone',
      'property_hoa_phone',
      'HOA Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 36-10 HOA Addendum · Property HOA phone from property_hoas for the packet property.',
      'custom_resolver',
      null::text,
      'property_hoa_phone'
    ),

    -- Packet-specific / manual (field_instances)
    (
      'hoa_addendum_option_1_selected',
      'hoa_addendum_option_1_selected',
      'HOA Addendum Option 1 Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_option_2_selected',
      'hoa_addendum_option_2_selected',
      'HOA Addendum Option 2 Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_option_3_selected',
      'hoa_addendum_option_3_selected',
      'HOA Addendum Option 3 Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_option_4_selected',
      'hoa_addendum_option_4_selected',
      'HOA Addendum Option 4 Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_delivery_days',
      'hoa_addendum_delivery_days',
      'HOA Document Delivery Days',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_buyer_requires_updated_resale_certificate',
      'hoa_addendum_buyer_requires_updated_resale_certificate',
      'Buyer Requires Updated Resale Certificate',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_buyer_does_not_require_updated_resale_certificate',
      'hoa_addendum_buyer_does_not_require_updated_resale_certificate',
      'Buyer Does Not Require Updated Resale Certificate',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_transfer_fee_cap',
      'hoa_addendum_transfer_fee_cap',
      'HOA Transfer Fee Cap',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_title_info_cost_paid_by_buyer',
      'hoa_addendum_title_info_cost_paid_by_buyer',
      'Title Information Cost Paid by Buyer',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'hoa_addendum_title_info_cost_paid_by_seller',
      'hoa_addendum_title_info_cost_paid_by_seller',
      'Title Information Cost Paid by Seller',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 36-10 HOA Addendum · Packet-specific value stored in field_instances.',
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
