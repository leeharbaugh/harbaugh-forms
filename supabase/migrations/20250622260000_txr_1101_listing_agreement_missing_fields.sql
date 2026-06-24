-- TXR-1101 Residential Real Estate Listing Agreement: missing Paragraph 5B(1) and 21H fields,
-- seller_is_foreign_person column, and PDF mappings (pages 2 and 11).
-- Does not touch public.forms. Soft-delete conventions only.

-- ---------------------------------------------------------------------------
-- Task 2 — Add seller_is_foreign_person column if missing
-- ---------------------------------------------------------------------------

alter table public.listing_agreement_details
  add column if not exists seller_is_foreign_person boolean not null default false;

-- ---------------------------------------------------------------------------
-- Resolve TXR-1101 form (existing app convention)
-- ---------------------------------------------------------------------------

create temp table txr_1101_missing_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in ('txr-1101', 'txr_1101')
    or lower(trim(f.form_code)) like '%txr-1101%'
    or lower(trim(f.form_code)) like '%txr_1101%'
    or (
      lower(f.form_name) like '%listing agreement%'
      and (
        lower(f.form_name) like '%residential%'
        or lower(f.form_name) like '%exclusive right to sell%'
      )
    )
  )
order by
  case when lower(trim(f.form_code)) in ('txr-1101', 'txr_1101') then 0 else 1 end,
  case when lower(f.form_name) like '%txr-1101%' then 0 else 1 end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Task 1 — Upsert missing field definitions (idempotent by field_key)
-- ---------------------------------------------------------------------------

create temp table txr_1101_missing_fields_touched (
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
      'listing_broker_no_coop_percent_or_flat_fee_selected',
      'listing_broker_no_coop_percent_or_flat_fee_selected',
      'Listing Broker Fee Without Other Broker - Percent or Flat Fee Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1101 ¶5B(1)(a) · Broker fee without other broker: percent or flat fee option selected.',
      'custom_resolver',
      null::text,
      'listing_broker_no_coop_percent_or_flat_fee_selected'
    ),
    (
      'listing_broker_no_coop_percent',
      'listing_broker_no_coop_percent',
      'Listing Broker Fee Without Other Broker Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1101 ¶5B(1)(a) · Listing commission percent when broker fee without other broker is selected.',
      'listing_agreement_details',
      'listing_commission_percent',
      null::text
    ),
    (
      'listing_broker_no_coop_flat_fee',
      'listing_broker_no_coop_flat_fee',
      'Listing Broker Fee Without Other Broker Flat Fee',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1101 ¶5B(1)(a) · Listing flat fee when broker fee without other broker is selected.',
      'listing_agreement_details',
      'listing_flat_fee',
      null::text
    ),
    (
      'listing_broker_no_coop_other_selected',
      'listing_broker_no_coop_other_selected',
      'Listing Broker Fee Without Other Broker Other Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1101 ¶5B(1)(b) · Broker fee without other broker: other compensation option selected.',
      'custom_resolver',
      null::text,
      'listing_broker_no_coop_other_selected'
    ),
    (
      'listing_broker_no_coop_other',
      'listing_broker_no_coop_other',
      'Listing Broker Fee Without Other Broker Other',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TXR-1101 ¶5B(1)(b) · Other listing compensation when broker fee without other broker is selected.',
      'listing_agreement_details',
      'listing_compensation_other',
      null::text
    ),
    (
      'seller_is_foreign_person',
      'seller_is_foreign_person',
      'Seller is a foreign person',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1101 ¶21H · Seller is a foreign person for FIRPTA certification.',
      'listing_agreement_details',
      'seller_is_foreign_person',
      null::text
    ),
    (
      'seller_is_not_foreign_person',
      'seller_is_not_foreign_person',
      'Seller is not a foreign person',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1101 ¶21H · Seller is not a foreign person (inverse of seller_is_foreign_person).',
      'custom_resolver',
      null::text,
      'seller_is_not_foreign_person'
    ),
    (
      'listing_broker_signature_checkbox',
      'listing_broker_signature_checkbox',
      'Broker Signature Checkbox',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TXR-1101 page 11 · Broker signature checkbox (manual packet placement only).',
      'manual_only',
      null::text,
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
insert into txr_1101_missing_fields_touched (field_key, action)
select field_key, 'inserted' from inserted_fields
union all
select field_key, 'updated' from updated_fields;

-- ---------------------------------------------------------------------------
-- Task 4 — Insert or update mappings (612 x 792; checkbox 14 x 14; text height 14)
-- ---------------------------------------------------------------------------

create temp table txr_1101_missing_placement_seed (
  field_key text primary key,
  mapping_name text not null,
  page_number integer not null,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  field_widget_type text not null
) on commit drop;

insert into txr_1101_missing_placement_seed (
  field_key,
  mapping_name,
  page_number,
  x,
  y,
  width,
  height,
  field_widget_type
)
values
  (
    'listing_broker_no_coop_percent_or_flat_fee_selected',
    '¶5B(1)(a) Broker fee without other broker - percent or flat fee selected',
    2,
    52,
    524,
    14,
    14,
    'checkbox'
  ),
  (
    'listing_broker_no_coop_percent',
    '¶5B(1)(a) Broker fee without other broker percent',
    2,
    106,
    524,
    55,
    14,
    'text'
  ),
  (
    'listing_broker_no_coop_flat_fee',
    '¶5B(1)(a) Broker fee without other broker flat fee',
    2,
    369,
    524,
    95,
    14,
    'text'
  ),
  (
    'listing_broker_no_coop_other_selected',
    '¶5B(1)(b) Broker fee without other broker other selected',
    2,
    52,
    539,
    14,
    14,
    'checkbox'
  ),
  (
    'listing_broker_no_coop_other',
    '¶5B(1)(b) Broker fee without other broker other',
    2,
    96,
    539,
    465,
    14,
    'text'
  ),
  (
    'seller_is_foreign_person',
    '¶21H Seller is a foreign person',
    11,
    449,
    112,
    14,
    14,
    'checkbox'
  ),
  (
    'seller_is_not_foreign_person',
    '¶21H Seller is not a foreign person',
    11,
    490,
    112,
    14,
    14,
    'checkbox'
  ),
  (
    'listing_broker_signature_checkbox',
    'Page 11 Broker signature checkbox',
    11,
    47,
    645,
    14,
    14,
    'checkbox'
  );

create temp table txr_1101_missing_mappings_touched (
  field_key text not null,
  page_number integer not null,
  action text not null,
  primary key (field_key, page_number)
) on commit drop;

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
    notes = 'TXR-1101 missing fields migration (corrected placement)',
    status = 'ACTIVE',
    update_date = now()
  from txr_1101_missing_form tf,
       txr_1101_missing_placement_seed ps,
       public.fields fld
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
    and ffm.page_number = ps.page_number
    and coalesce(ffm.occurrence_index, -1) = -1
    and ffm.status = 'ACTIVE'
  returning
    fld.field_key,
    ffm.page_number
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
    null::integer,
    ps.page_number,
    ps.x,
    ps.y,
    ps.width,
    ps.height,
    612,
    792,
    9,
    ps.field_widget_type,
    'TXR-1101 missing fields migration (corrected placement)'
  from txr_1101_missing_placement_seed ps
  inner join txr_1101_missing_form tf on true
  inner join public.fields fld
    on lower(fld.field_key) = lower(ps.field_key)
   and fld.status = 'ACTIVE'
  where not exists (
    select 1
    from public.form_field_mappings existing
    where existing.form_id = tf.form_id
      and existing.field_id = fld.id
      and existing.page_number = ps.page_number
      and coalesce(existing.occurrence_index, -1) = -1
      and existing.status = 'ACTIVE'
  )
  returning
    (select field_key from public.fields where id = field_id) as field_key,
    page_number
)
insert into txr_1101_missing_mappings_touched (field_key, page_number, action)
select field_key, page_number, 'updated' from updated_mappings
union all
select field_key, page_number, 'inserted' from inserted_mappings;

-- ---------------------------------------------------------------------------
-- Task 5 — Report
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
begin
  select form_id into v_form_id from txr_1101_missing_form limit 1;

  select count(*) into v_fields_inserted
  from txr_1101_missing_fields_touched
  where action = 'inserted';

  select count(*) into v_fields_updated
  from txr_1101_missing_fields_touched
  where action = 'updated';

  select count(*) into v_mappings_inserted
  from txr_1101_missing_mappings_touched
  where action = 'inserted';

  select count(*) into v_mappings_updated
  from txr_1101_missing_mappings_touched
  where action = 'updated';

  select string_agg(expected.field_key, ', ' order by expected.field_key)
  into v_unresolved_fields
  from (
    values
      ('listing_broker_no_coop_percent_or_flat_fee_selected'),
      ('listing_broker_no_coop_percent'),
      ('listing_broker_no_coop_flat_fee'),
      ('listing_broker_no_coop_other_selected'),
      ('listing_broker_no_coop_other'),
      ('seller_is_foreign_person'),
      ('seller_is_not_foreign_person'),
      ('listing_broker_signature_checkbox')
  ) as expected(field_key)
  left join txr_1101_missing_fields_touched touched
    on lower(touched.field_key) = lower(expected.field_key)
  where touched.field_key is null;

  select string_agg(ps.field_key || ' (page ' || ps.page_number || ')', ', ' order by ps.field_key)
  into v_unresolved_mappings
  from txr_1101_missing_placement_seed ps
  left join txr_1101_missing_mappings_touched touched
    on lower(touched.field_key) = lower(ps.field_key)
   and touched.page_number = ps.page_number
  where touched.field_key is null
    and v_form_id is not null;

  raise notice 'TXR-1101 missing fields migration report';
  raise notice '  form_id: %', coalesce(v_form_id::text, 'NOT FOUND');
  raise notice '  DB column seller_is_foreign_person: ensured (ADD COLUMN IF NOT EXISTS)';
  raise notice '  fields inserted: %', v_fields_inserted;
  raise notice '  fields updated: %', v_fields_updated;
  raise notice '  mappings inserted: %', v_mappings_inserted;
  raise notice '  mappings updated: %', v_mappings_updated;

  if v_unresolved_fields is not null then
    raise notice '  unresolved fields (no active catalog row): %', v_unresolved_fields;
  end if;

  if v_form_id is null then
    raise notice '  unresolved mappings: TXR-1101 form not found; no mappings applied';
  elsif v_unresolved_mappings is not null then
    raise notice '  unresolved mappings: %', v_unresolved_mappings;
  end if;

  raise notice '  resolver keys (application code): seller_is_not_foreign_person, listing_broker_no_coop_other_selected, listing_broker_no_coop_percent_or_flat_fee_selected';
  raise notice '  source paths (listing_agreement_details): listing_commission_percent, listing_flat_fee, listing_compensation_other, seller_is_foreign_person';
end $$;
