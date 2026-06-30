-- TREC 20-19 / TXR 1601 One to Four Family Residential Contract (Resale):
-- missing field catalog entries and PDF mappings.
-- Does not touch public.forms or public.contract_details. Soft-delete conventions only.

-- ---------------------------------------------------------------------------
-- Expand fields.source_type for contract_details-backed resolver paths
-- ---------------------------------------------------------------------------

alter table public.fields
  drop constraint if exists fields_source_type_check;

alter table public.fields
  add constraint fields_source_type_check
  check (
    source_type is null
    or source_type in (
      'settings_agent',
      'settings_brokerage',
      'packet_contact',
      'packet_property',
      'packet',
      'buyer_rep_details',
      'listing_agreement_details',
      'contract_details',
      'representation_agreement',
      'static_default',
      'custom_resolver',
      'manual_only',
      'packet_instance'
    )
  );

-- ---------------------------------------------------------------------------
-- Resolve TXR 1601 / TREC 20-19 One to Four Contract form
-- ---------------------------------------------------------------------------

create temp table txr_1601_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in (
      'txr-1601',
      'txr_1601',
      'trec-20-19',
      'trec_20_19'
    )
    or lower(trim(f.form_code)) like '%txr-1601%'
    or lower(trim(f.form_code)) like '%txr_1601%'
    or lower(trim(f.form_code)) like '%trec-20-19%'
    or lower(trim(f.form_code)) like '%trec_20_19%'
    or (
      lower(f.form_name) like '%one%four%'
      and lower(f.form_name) like '%contract%'
    )
    or (
      lower(f.form_name) like '%one-to-four%'
      and lower(f.form_name) like '%contract%'
    )
  )
order by
  case
    when lower(trim(f.form_code)) in ('txr-1601', 'txr_1601', 'trec-20-19', 'trec_20_19') then 0
    else 1
  end,
  case when lower(f.form_name) like '%txr-1601%' or lower(f.form_name) like '%trec-20-19%' then 0 else 1 end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Task 1 — Upsert missing field definitions (idempotent by field_key)
-- ---------------------------------------------------------------------------

create temp table txr_1601_fields_touched (
  field_key text primary key,
  action text not null
) on commit drop;

with field_seed (
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
      'property_concerning_full_address',
      'property_concerning_full_address',
      'Contract Concerning Property Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 · Running page header property address from packet property.',
      'packet_property',
      'full_address',
      'property_full_address'
    ),
    (
      'contract_natural_resource_leases_delivered',
      'contract_natural_resource_leases_delivered',
      'Natural Resource Leases Delivered',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 20-19 / TXR 1601 · Natural resource leases delivered to Buyer.',
      'contract_details',
      'natural_resource_leases_delivered',
      null::text
    ),
    (
      'contract_natural_resource_leases_not_delivered',
      'contract_natural_resource_leases_not_delivered',
      'Natural Resource Leases Not Delivered',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 20-19 / TXR 1601 · Natural resource leases not delivered to Buyer.',
      'contract_details',
      'natural_resource_leases_not_delivered',
      null::text
    ),
    (
      'contract_natural_resource_lease_termination_days',
      'contract_natural_resource_lease_termination_days',
      'Natural Resource Lease Termination Days',
      'integer',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 · Days to terminate natural resource leases after closing.',
      'contract_details',
      'natural_resource_lease_termination_days',
      null::text
    ),
    (
      'contract_title_exception_amended_paid_by_buyer',
      'contract_title_exception_amended_paid_by_buyer',
      'Title Exception Amended Paid By Buyer',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 20-19 / TXR 1601 · Title exception amendment paid by Buyer.',
      'contract_details',
      'title_exception_amended_paid_by_buyer',
      null::text
    ),
    (
      'contract_title_exception_amended_paid_by_seller',
      'contract_title_exception_amended_paid_by_seller',
      'Title Exception Amended Paid By Seller',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 20-19 / TXR 1601 · Title exception amendment paid by Seller.',
      'contract_details',
      'title_exception_amended_paid_by_seller',
      null::text
    ),
    (
      'contract_buyer_attorney_phone',
      'contract_buyer_attorney_phone',
      'Buyer Attorney Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 · Buyer attorney phone (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_buyer_attorney_email',
      'contract_buyer_attorney_email',
      'Buyer Attorney Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 · Buyer attorney email (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_seller_attorney_phone',
      'contract_seller_attorney_phone',
      'Seller Attorney Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 · Seller attorney phone (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_seller_attorney_email',
      'contract_seller_attorney_email',
      'Seller Attorney Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 · Seller attorney email (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_brokerage_name',
      'contract_intermediary_brokerage_name',
      'Intermediary Brokerage Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Intermediary brokerage name from settings.',
      'settings_brokerage',
      'brokerage_name',
      null::text
    ),
    (
      'contract_intermediary_brokerage_address',
      'contract_intermediary_brokerage_address',
      'Intermediary Brokerage Address',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Intermediary brokerage address from settings.',
      'settings_brokerage',
      'brokerage_address',
      null::text
    ),
    (
      'contract_intermediary_brokerage_license_number',
      'contract_intermediary_brokerage_license_number',
      'Intermediary Brokerage License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Intermediary brokerage license number from settings.',
      'settings_brokerage',
      'brokerage_license_number',
      null::text
    ),
    (
      'contract_intermediary_seller_associate_name',
      'contract_intermediary_seller_associate_name',
      'Intermediary Seller Associate Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Seller-side intermediary associate name (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_seller_team_name',
      'contract_intermediary_seller_team_name',
      'Intermediary Seller Team Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Seller-side intermediary team name (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_seller_associate_email',
      'contract_intermediary_seller_associate_email',
      'Intermediary Seller Associate Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Seller-side intermediary associate email (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_seller_associate_phone',
      'contract_intermediary_seller_associate_phone',
      'Intermediary Seller Associate Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Seller-side intermediary associate phone (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_seller_associate_license_number',
      'contract_intermediary_seller_associate_license_number',
      'Intermediary Seller Associate License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Seller-side intermediary associate license (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_seller_supervisor_name',
      'contract_intermediary_seller_supervisor_name',
      'Intermediary Seller Supervisor Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Seller-side intermediary supervisor name (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_seller_supervisor_phone',
      'contract_intermediary_seller_supervisor_phone',
      'Intermediary Seller Supervisor Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Seller-side intermediary supervisor phone (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_seller_supervisor_license_number',
      'contract_intermediary_seller_supervisor_license_number',
      'Intermediary Seller Supervisor License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Seller-side intermediary supervisor license (manual entry).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_name',
      'contract_intermediary_buyer_associate_name',
      'Intermediary Buyer Associate Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary associate name from agent settings.',
      'settings_agent',
      'agent_full_name',
      null::text
    ),
    (
      'contract_intermediary_buyer_team_name',
      'contract_intermediary_buyer_team_name',
      'Intermediary Buyer Team Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary team name (no global settings source).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_email',
      'contract_intermediary_buyer_associate_email',
      'Intermediary Buyer Associate Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary associate email from agent settings.',
      'settings_agent',
      'agent_email',
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_phone',
      'contract_intermediary_buyer_associate_phone',
      'Intermediary Buyer Associate Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary associate phone from agent settings.',
      'settings_agent',
      'agent_phone',
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_license_number',
      'contract_intermediary_buyer_associate_license_number',
      'Intermediary Buyer Associate License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary associate license from agent settings.',
      'settings_agent',
      'agent_license_number',
      null::text
    ),
    (
      'contract_intermediary_buyer_supervisor_name',
      'contract_intermediary_buyer_supervisor_name',
      'Intermediary Buyer Supervisor Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary supervisor name from brokerage settings.',
      'settings_brokerage',
      'broker_full_name',
      null::text
    ),
    (
      'contract_intermediary_buyer_supervisor_phone',
      'contract_intermediary_buyer_supervisor_phone',
      'Intermediary Buyer Supervisor Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary supervisor phone from brokerage settings.',
      'settings_brokerage',
      'broker_phone',
      null::text
    ),
    (
      'contract_intermediary_buyer_supervisor_license_number',
      'contract_intermediary_buyer_supervisor_license_number',
      'Intermediary Buyer Supervisor License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer-side intermediary supervisor license from brokerage settings.',
      'settings_brokerage',
      'broker_license_number',
      null::text
    )
),
inserted_fields as (
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
    resolver_key,
    status
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
    s.resolver_key,
    'ACTIVE'
  from field_seed s
  where not exists (
    select 1
    from public.fields existing
    where lower(existing.field_key) = lower(s.field_key)
      and existing.status = 'ACTIVE'
  )
  returning field_key
),
updated_fields as (
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
  from field_seed s
  where lower(target.field_key) = lower(s.field_key)
    and target.status = 'ACTIVE'
  returning target.field_key
)
insert into txr_1601_fields_touched (field_key, action)
select field_key, 'inserted' from inserted_fields
union all
select field_key, 'updated' from updated_fields;

-- ---------------------------------------------------------------------------
-- Task 2 & 3 — Upsert mappings; deactivate wrong-page duplicates
-- ---------------------------------------------------------------------------

create temp table txr_1601_placement_seed (
  field_key text not null,
  mapping_name text not null,
  occurrence_index integer,
  page_number integer not null,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  field_widget_type text not null
) on commit drop;

insert into txr_1601_placement_seed (
  field_key,
  mapping_name,
  occurrence_index,
  page_number,
  x,
  y,
  width,
  height,
  field_widget_type
)
values
  -- Page 1: natural resource leases
  (
    'contract_natural_resource_leases_delivered',
    'Page 1 natural resource leases delivered',
    null::integer,
    1,
    72,
    752,
    14,
    14,
    'checkbox'
  ),
  (
    'contract_natural_resource_leases_not_delivered',
    'Page 1 natural resource leases not delivered',
    null::integer,
    1,
    72,
    770,
    14,
    14,
    'checkbox'
  ),
  (
    'contract_natural_resource_lease_termination_days',
    'Page 1 natural resource lease termination days',
    null::integer,
    1,
    392,
    770,
    50,
    14,
    'text'
  ),

  -- Pages 2–12: running property concerning header (occurrence_index 0–10)
  (
    'property_concerning_full_address',
    'Property concerning header (page 2)',
    0,
    2,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 3)',
    1,
    3,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 4)',
    2,
    4,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 5)',
    3,
    5,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 6)',
    4,
    6,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 7)',
    5,
    7,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 8)',
    6,
    8,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 9)',
    7,
    9,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 10)',
    8,
    10,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 11)',
    9,
    11,
    145,
    31,
    320,
    14,
    'text'
  ),
  (
    'property_concerning_full_address',
    'Property concerning header (page 12)',
    10,
    12,
    145,
    31,
    320,
    14,
    'text'
  ),

  -- Page 2: title exception amendment
  (
    'contract_title_exception_amended_paid_by_buyer',
    'Page 2 title exception amended paid by buyer',
    null::integer,
    2,
    398,
    721,
    14,
    14,
    'checkbox'
  ),
  (
    'contract_title_exception_amended_paid_by_seller',
    'Page 2 title exception amended paid by seller',
    null::integer,
    2,
    456,
    721,
    14,
    14,
    'checkbox'
  ),

  -- Page 9: attorney contact
  (
    'contract_buyer_attorney_phone',
    'Page 9 buyer attorney phone',
    null::integer,
    9,
    118,
    756,
    140,
    14,
    'text'
  ),
  (
    'contract_seller_attorney_phone',
    'Page 9 seller attorney phone',
    null::integer,
    9,
    390,
    756,
    140,
    14,
    'text'
  ),
  (
    'contract_buyer_attorney_email',
    'Page 9 buyer attorney email',
    null::integer,
    9,
    118,
    786,
    170,
    14,
    'text'
  ),
  (
    'contract_seller_attorney_email',
    'Page 9 seller attorney email',
    null::integer,
    9,
    390,
    786,
    170,
    14,
    'text'
  ),

  -- Page 11: intermediary section (brokerage + seller-side; buyer-side below page fold)
  (
    'contract_intermediary_brokerage_name',
    'Page 11 intermediary brokerage name',
    null::integer,
    11,
    47,
    515,
    330,
    14,
    'text'
  ),
  (
    'contract_intermediary_brokerage_address',
    'Page 11 intermediary brokerage address',
    null::integer,
    11,
    95,
    547,
    365,
    14,
    'text'
  ),
  (
    'contract_intermediary_brokerage_license_number',
    'Page 11 intermediary brokerage license number',
    null::integer,
    11,
    185,
    579,
    130,
    14,
    'text'
  ),
  (
    'contract_intermediary_seller_associate_name',
    'Page 11 intermediary seller associate name',
    null::integer,
    11,
    185,
    611,
    220,
    14,
    'text'
  ),
  (
    'contract_intermediary_seller_team_name',
    'Page 11 intermediary seller team name',
    null::integer,
    11,
    112,
    643,
    240,
    14,
    'text'
  ),
  (
    'contract_intermediary_seller_associate_email',
    'Page 11 intermediary seller associate email',
    null::integer,
    11,
    145,
    675,
    240,
    14,
    'text'
  ),
  (
    'contract_intermediary_seller_associate_phone',
    'Page 11 intermediary seller associate phone',
    null::integer,
    11,
    170,
    707,
    120,
    14,
    'text'
  ),
  (
    'contract_intermediary_seller_associate_license_number',
    'Page 11 intermediary seller associate license number',
    null::integer,
    11,
    415,
    707,
    120,
    14,
    'text'
  ),
  (
    'contract_intermediary_seller_supervisor_name',
    'Page 11 intermediary seller supervisor name',
    null::integer,
    11,
    215,
    739,
    240,
    14,
    'text'
  ),
  (
    'contract_intermediary_seller_supervisor_phone',
    'Page 11 intermediary seller supervisor phone',
    null::integer,
    11,
    240,
    771,
    120,
    14,
    'text'
  ),
  (
    'contract_intermediary_seller_supervisor_license_number',
    'Page 11 intermediary seller supervisor license number',
    null::integer,
    11,
    440,
    771,
    120,
    14,
    'text'
  );

create temp table txr_1601_skipped_mappings (
  field_key text primary key,
  reason text not null
) on commit drop;

insert into txr_1601_skipped_mappings (field_key, reason)
values
  (
    'contract_intermediary_buyer_associate_name',
    'Buyer-side intermediary block falls below visible page 11 area (y > 792); manual placement required'
  ),
  (
    'contract_intermediary_buyer_team_name',
    'Buyer-side intermediary block falls below visible page 11 area (y > 792); manual placement required'
  ),
  (
    'contract_intermediary_buyer_associate_email',
    'Buyer-side intermediary block falls below visible page 11 area (y > 792); manual placement required'
  ),
  (
    'contract_intermediary_buyer_associate_phone',
    'Buyer-side intermediary block falls below visible page 11 area (y > 792); manual placement required'
  ),
  (
    'contract_intermediary_buyer_associate_license_number',
    'Buyer-side intermediary block falls below visible page 11 area (y > 792); manual placement required'
  ),
  (
    'contract_intermediary_buyer_supervisor_name',
    'Buyer-side intermediary block falls below visible page 11 area (y > 792); manual placement required'
  ),
  (
    'contract_intermediary_buyer_supervisor_phone',
    'Buyer-side intermediary block falls below visible page 11 area (y > 792); manual placement required'
  ),
  (
    'contract_intermediary_buyer_supervisor_license_number',
    'Buyer-side intermediary block falls below visible page 11 area (y > 792); manual placement required'
  );

create temp table txr_1601_mappings_touched (
  field_key text not null,
  page_number integer not null,
  occurrence_index integer,
  action text not null
) on commit drop;

-- Deactivate active mappings with no matching seeded placement (duplicate prevention)
update public.form_field_mappings ffm
set
  status = 'INACTIVE',
  update_date = now()
from txr_1601_form tf,
     public.fields fld
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.id
  and fld.status = 'ACTIVE'
  and ffm.status = 'ACTIVE'
  and exists (
    select 1
    from txr_1601_placement_seed ps
    where lower(ps.field_key) = lower(fld.field_key)
  )
  and not exists (
    select 1
    from txr_1601_placement_seed ps
    where lower(ps.field_key) = lower(fld.field_key)
      and ps.page_number = ffm.page_number
      and coalesce(ps.occurrence_index, -1) = coalesce(ffm.occurrence_index, -1)
  );

with updated_mappings as (
  update public.form_field_mappings ffm
  set
    mapping_name = ps.mapping_name,
    x = ps.x,
    y = ps.y,
    width = ps.width,
    height = ps.height,
    page_width = 612,
    page_height = 792,
    font_size = 9,
    field_widget_type = ps.field_widget_type,
    notes = 'TREC 20-19 / TXR 1601 One to Four Contract missing fields migration',
    status = 'ACTIVE',
    update_date = now()
  from txr_1601_form tf,
       txr_1601_placement_seed ps,
       public.fields fld
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
    and ffm.page_number = ps.page_number
    and coalesce(ffm.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
    and ffm.status = 'ACTIVE'
  returning
    fld.field_key,
    ffm.page_number,
    ffm.occurrence_index
),
inserted_mappings as (
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
    notes
  )
  select
    tf.form_id,
    fld.id,
    ps.mapping_name,
    ps.occurrence_index,
    ps.page_number,
    ps.x,
    ps.y,
    ps.width,
    ps.height,
    612,
    792,
    9,
    ps.field_widget_type,
    'TREC 20-19 / TXR 1601 One to Four Contract missing fields migration'
  from txr_1601_placement_seed ps
  inner join txr_1601_form tf on true
  inner join public.fields fld
    on lower(fld.field_key) = lower(ps.field_key)
   and fld.status = 'ACTIVE'
  where not exists (
    select 1
    from public.form_field_mappings existing
    where existing.form_id = tf.form_id
      and existing.field_id = fld.id
      and existing.page_number = ps.page_number
      and coalesce(existing.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
      and existing.status = 'ACTIVE'
  )
  returning
    (select field_key from public.fields where id = field_id) as field_key,
    page_number,
    occurrence_index
)
insert into txr_1601_mappings_touched (field_key, page_number, occurrence_index, action)
select field_key, page_number, occurrence_index, 'updated' from updated_mappings
union all
select field_key, page_number, occurrence_index, 'inserted' from inserted_mappings;

-- ---------------------------------------------------------------------------
-- Task 4 — Report
-- ---------------------------------------------------------------------------

do $$
declare
  v_form_id bigint;
  v_fields_inserted integer;
  v_fields_updated integer;
  v_mappings_inserted integer;
  v_mappings_updated integer;
  v_unresolved_fields text;
  v_unresolved_mappings text;
  v_skipped_mappings text;
  v_manual_placement text;
begin
  select form_id into v_form_id from txr_1601_form limit 1;

  select count(*) into v_fields_inserted
  from txr_1601_fields_touched
  where action = 'inserted';

  select count(*) into v_fields_updated
  from txr_1601_fields_touched
  where action = 'updated';

  select count(*) into v_mappings_inserted
  from txr_1601_mappings_touched
  where action = 'inserted';

  select count(*) into v_mappings_updated
  from txr_1601_mappings_touched
  where action = 'updated';

  select string_agg(expected.field_key, ', ' order by expected.field_key)
  into v_unresolved_fields
  from (
    values
      ('property_concerning_full_address'),
      ('contract_natural_resource_leases_delivered'),
      ('contract_natural_resource_leases_not_delivered'),
      ('contract_natural_resource_lease_termination_days'),
      ('contract_title_exception_amended_paid_by_buyer'),
      ('contract_title_exception_amended_paid_by_seller'),
      ('contract_buyer_attorney_phone'),
      ('contract_buyer_attorney_email'),
      ('contract_seller_attorney_phone'),
      ('contract_seller_attorney_email'),
      ('contract_intermediary_brokerage_name'),
      ('contract_intermediary_brokerage_address'),
      ('contract_intermediary_brokerage_license_number'),
      ('contract_intermediary_seller_associate_name'),
      ('contract_intermediary_seller_team_name'),
      ('contract_intermediary_seller_associate_email'),
      ('contract_intermediary_seller_associate_phone'),
      ('contract_intermediary_seller_associate_license_number'),
      ('contract_intermediary_seller_supervisor_name'),
      ('contract_intermediary_seller_supervisor_phone'),
      ('contract_intermediary_seller_supervisor_license_number'),
      ('contract_intermediary_buyer_associate_name'),
      ('contract_intermediary_buyer_team_name'),
      ('contract_intermediary_buyer_associate_email'),
      ('contract_intermediary_buyer_associate_phone'),
      ('contract_intermediary_buyer_associate_license_number'),
      ('contract_intermediary_buyer_supervisor_name'),
      ('contract_intermediary_buyer_supervisor_phone'),
      ('contract_intermediary_buyer_supervisor_license_number')
  ) as expected(field_key)
  left join txr_1601_fields_touched touched
    on lower(touched.field_key) = lower(expected.field_key)
  where touched.field_key is null;

  select string_agg(
    ps.field_key || ' (page ' || ps.page_number
      || coalesce(', occurrence ' || ps.occurrence_index::text, '')
      || ')',
    ', '
    order by ps.page_number, ps.field_key
  )
  into v_unresolved_mappings
  from txr_1601_placement_seed ps
  left join txr_1601_mappings_touched touched
    on lower(touched.field_key) = lower(ps.field_key)
   and touched.page_number = ps.page_number
   and coalesce(touched.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
  where touched.field_key is null
    and v_form_id is not null;

  select string_agg(field_key || ': ' || reason, '; ' order by field_key)
  into v_skipped_mappings
  from txr_1601_skipped_mappings;

  select string_agg(field_key, ', ' order by field_key)
  into v_manual_placement
  from txr_1601_skipped_mappings;

  raise notice 'TREC 20-19 / TXR 1601 One to Four Contract migration report';
  raise notice '  form_id: %', coalesce(v_form_id::text, 'NOT FOUND');
  raise notice '  fields inserted: %', v_fields_inserted;
  raise notice '  fields updated: %', v_fields_updated;
  raise notice '  mappings inserted: %', v_mappings_inserted;
  raise notice '  mappings updated: %', v_mappings_updated;

  if v_unresolved_fields is not null then
    raise notice '  unresolved fields (no active catalog row): %', v_unresolved_fields;
  end if;

  if v_form_id is null then
    raise notice '  unresolved mappings: form not found; no mappings applied';
  elsif v_unresolved_mappings is not null then
    raise notice '  unresolved mappings: %', v_unresolved_mappings;
  end if;

  if v_skipped_mappings is not null then
    raise notice '  mappings skipped: %', v_skipped_mappings;
  end if;

  if v_manual_placement is not null then
    raise notice '  fields needing manual placement: %', v_manual_placement;
  end if;
end $$;
