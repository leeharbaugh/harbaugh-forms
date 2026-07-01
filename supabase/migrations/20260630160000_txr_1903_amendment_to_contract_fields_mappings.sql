-- TREC 39-11 / TXR 1903 Amendment to Contract field catalog and first-pass PDF mappings.
-- Does not touch public.forms or contract_details. Packet/form-specific values via field_instances.

-- ---------------------------------------------------------------------------
-- Resolve TXR 1903 / TREC 39-11 Amendment to Contract form
-- ---------------------------------------------------------------------------

create temp table txr_1903_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in (
      'txr-1903',
      'txr_1903',
      'trec-39-11',
      'trec_39_11'
    )
    or lower(trim(f.form_code)) like '%txr-1903%'
    or lower(trim(f.form_code)) like '%txr_1903%'
    or lower(trim(f.form_code)) like '%trec-39-11%'
    or lower(trim(f.form_code)) like '%trec_39_11%'
    or (
      lower(f.form_name) like '%amendment%'
      and lower(f.form_name) like '%contract%'
    )
  )
order by
  case
    when lower(trim(f.form_code)) in ('txr-1903', 'txr_1903', 'trec-39-11', 'trec_39_11') then 0
    else 1
  end,
  case
    when lower(f.form_name) like '%txr-1903%' or lower(f.form_name) like '%trec-39-11%' then 0
    else 1
  end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Task 1 — Upsert field definitions (idempotent by field_key)
-- ---------------------------------------------------------------------------

create temp table txr_1903_fields_touched (
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
      'property_address_city',
      'property_address_city',
      'Property Street Address and City',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'Shared catalog · Property street address and city from packet property via property_address_city resolver.',
      'packet_property',
      null::text,
      'property_address_city'
    ),
    (
      'contract_amend_sales_price_selected',
      'contract_amend_sales_price_selected',
      'Amendment Sales Price Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Sales price amendment selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_cash_price',
      'contract_amend_cash_price',
      'Amendment Cash Portion of Sales Price',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amended cash portion of sales price (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_financing_amount',
      'contract_amend_financing_amount',
      'Amendment Financing Amount',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amended sum of all financing (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_total_sales_price',
      'contract_amend_total_sales_price',
      'Amendment Total Sales Price',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amended total sales price (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_repairs_selected',
      'contract_amend_repairs_selected',
      'Amendment Repairs Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Repairs amendment selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_repairs_text',
      'contract_amend_repairs_text',
      'Amendment Repairs Text',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amended repairs description (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_closing_date_selected',
      'contract_amend_closing_date_selected',
      'Amendment Closing Date Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Closing date amendment selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_closing_month_day',
      'contract_amend_closing_month_day',
      'Amendment Closing Month and Day',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amended closing month and day (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_closing_year',
      'contract_amend_closing_year',
      'Amendment Closing Year',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amended closing year (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_seller_expense_contribution_selected',
      'contract_amend_seller_expense_contribution_selected',
      'Amendment Seller Expense Contribution Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Seller expense contribution amendment selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_seller_expense_contribution_amount',
      'contract_amend_seller_expense_contribution_amount',
      'Amendment Seller Expense Contribution Amount',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amended seller expense contribution amount (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_brokerage_comp_selected',
      'contract_amend_brokerage_comp_selected',
      'Amendment Brokerage Compensation Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Brokerage compensation amendment selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_seller_pay_selected',
      'contract_amend_seller_pay_selected',
      'Amendment Seller Pays Broker Compensation Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Seller pays broker compensation selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_seller_pay_dollar_selected',
      'contract_amend_seller_pay_dollar_selected',
      'Amendment Seller Pay Dollar Amount Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Seller pays dollar amount selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_seller_pay_amount',
      'contract_amend_seller_pay_amount',
      'Amendment Seller Pay Amount',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Seller broker compensation dollar amount (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_seller_pay_percent_selected',
      'contract_amend_seller_pay_percent_selected',
      'Amendment Seller Pay Percent Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Seller pays percent selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_seller_pay_percent',
      'contract_amend_seller_pay_percent',
      'Amendment Seller Pay Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Seller broker compensation percent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_buyer_pay_selected',
      'contract_amend_buyer_pay_selected',
      'Amendment Buyer Pays Broker Compensation Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Buyer pays broker compensation selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_buyer_pay_dollar_selected',
      'contract_amend_buyer_pay_dollar_selected',
      'Amendment Buyer Pay Dollar Amount Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Buyer pays dollar amount selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_buyer_pay_amount',
      'contract_amend_buyer_pay_amount',
      'Amendment Buyer Pay Amount',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Buyer broker compensation dollar amount (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_buyer_pay_percent_selected',
      'contract_amend_buyer_pay_percent_selected',
      'Amendment Buyer Pay Percent Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Buyer pays percent selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_buyer_pay_percent',
      'contract_amend_buyer_pay_percent',
      'Amendment Buyer Pay Percent',
      'number',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Buyer broker compensation percent (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_lender_repairs_selected',
      'contract_amend_lender_repairs_selected',
      'Amendment Lender Required Repairs Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Lender required repairs amendment selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_lender_repairs_seller_amount',
      'contract_amend_lender_repairs_seller_amount',
      'Amendment Lender Repairs Seller Amount',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Seller lender-required repairs amount (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_lender_repairs_buyer_amount',
      'contract_amend_lender_repairs_buyer_amount',
      'Amendment Lender Repairs Buyer Amount',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Buyer lender-required repairs amount (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_option_extension_selected',
      'contract_amend_option_extension_selected',
      'Amendment Option Period Extension Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Option period extension selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_additional_option_fee',
      'contract_amend_additional_option_fee',
      'Amendment Additional Option Fee',
      'currency',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Additional option fee amount (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_option_extension_date',
      'contract_amend_option_extension_date',
      'Amendment Option Extension Date',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Extended option period end month and day (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_option_extension_year',
      'contract_amend_option_extension_year',
      'Amendment Option Extension Year',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Extended option period end year (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_option_fee_will_credit',
      'contract_amend_option_fee_will_credit',
      'Amendment Option Fee Will Credit',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Additional option fee will credit against sales price (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_option_fee_will_not_credit',
      'contract_amend_option_fee_will_not_credit',
      'Amendment Option Fee Will Not Credit',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Additional option fee will not credit against sales price (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_waives_option_selected',
      'contract_amend_waives_option_selected',
      'Amendment Waives Option Period Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Buyer waives option period selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_buyer_approval_date_selected',
      'contract_amend_buyer_approval_date_selected',
      'Amendment Buyer Approval Date Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Buyer approval date amendment selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_buyer_approval_month_day',
      'contract_amend_buyer_approval_month_day',
      'Amendment Buyer Approval Month and Day',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amended buyer approval month and day (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_buyer_approval_year',
      'contract_amend_buyer_approval_year',
      'Amendment Buyer Approval Year',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amended buyer approval year (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_other_modifications_selected',
      'contract_amend_other_modifications_selected',
      'Amendment Other Modifications Selected',
      'boolean',
      'checkbox',
      null::text,
      false,
      false,
      'TREC 39-11 / TXR 1903 · Other modifications amendment selected (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_other_modifications_text',
      'contract_amend_other_modifications_text',
      'Amendment Other Modifications Text',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Other modifications text (packet/form-specific).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_executed_day',
      'contract_amend_executed_day',
      'Amendment Executed Day',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amendment execution day (packet/form-specific; not mapped).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_executed_month',
      'contract_amend_executed_month',
      'Amendment Executed Month',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amendment execution month (packet/form-specific; not mapped).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_amend_executed_year',
      'contract_amend_executed_year',
      'Amendment Executed Year',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 39-11 / TXR 1903 · Amendment execution year (packet/form-specific; not mapped).',
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
insert into txr_1903_fields_touched (field_key, action)
select field_key, 'inserted' from inserted_fields
union all
select field_key, 'updated' from updated_fields;

-- ---------------------------------------------------------------------------
-- Task 2 & 3 — First-pass page 1 mappings; duplicate prevention
-- ---------------------------------------------------------------------------

create temp table txr_1903_placement_seed (
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

insert into txr_1903_placement_seed (
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
  ('property_address_city', 'Page 1 property address and city', null::integer, 1, 210, 122, 330, 14, 'text'),
  ('contract_amend_sales_price_selected', 'Page 1 sales price amendment selected', null::integer, 1, 47, 185, 14, 14, 'checkbox'),
  ('contract_amend_cash_price', 'Page 1 amended cash price', null::integer, 1, 488, 211, 75, 14, 'text'),
  ('contract_amend_financing_amount', 'Page 1 amended financing amount', null::integer, 1, 488, 235, 75, 14, 'text'),
  ('contract_amend_total_sales_price', 'Page 1 amended total sales price', null::integer, 1, 488, 260, 75, 14, 'text'),
  ('contract_amend_repairs_selected', 'Page 1 repairs amendment selected', null::integer, 1, 47, 286, 14, 14, 'checkbox'),
  ('contract_amend_repairs_text', 'Page 1 amended repairs text', null::integer, 1, 72, 333, 490, 42, 'text'),
  ('contract_amend_closing_date_selected', 'Page 1 closing date amendment selected', null::integer, 1, 47, 384, 14, 14, 'checkbox'),
  ('contract_amend_closing_month_day', 'Page 1 amended closing month and day', null::integer, 1, 315, 384, 105, 14, 'text'),
  ('contract_amend_closing_year', 'Page 1 amended closing year', null::integer, 1, 455, 384, 45, 14, 'text'),
  ('contract_amend_seller_expense_contribution_selected', 'Page 1 seller expense contribution selected', null::integer, 1, 47, 415, 14, 14, 'checkbox'),
  ('contract_amend_seller_expense_contribution_amount', 'Page 1 seller expense contribution amount', null::integer, 1, 410, 415, 85, 14, 'text'),
  ('contract_amend_brokerage_comp_selected', 'Page 1 brokerage compensation selected', null::integer, 1, 47, 445, 14, 14, 'checkbox'),
  ('contract_amend_seller_pay_selected', 'Page 1 seller pays broker comp selected', null::integer, 1, 72, 475, 14, 14, 'checkbox'),
  ('contract_amend_seller_pay_dollar_selected', 'Page 1 seller pay dollar selected', null::integer, 1, 250, 475, 14, 14, 'checkbox'),
  ('contract_amend_seller_pay_amount', 'Page 1 seller pay amount', null::integer, 1, 270, 475, 75, 14, 'text'),
  ('contract_amend_seller_pay_percent_selected', 'Page 1 seller pay percent selected', null::integer, 1, 370, 475, 14, 14, 'checkbox'),
  ('contract_amend_seller_pay_percent', 'Page 1 seller pay percent', null::integer, 1, 390, 475, 55, 14, 'text'),
  ('contract_amend_buyer_pay_selected', 'Page 1 buyer pays broker comp selected', null::integer, 1, 72, 503, 14, 14, 'checkbox'),
  ('contract_amend_buyer_pay_dollar_selected', 'Page 1 buyer pay dollar selected', null::integer, 1, 250, 503, 14, 14, 'checkbox'),
  ('contract_amend_buyer_pay_amount', 'Page 1 buyer pay amount', null::integer, 1, 270, 503, 75, 14, 'text'),
  ('contract_amend_buyer_pay_percent_selected', 'Page 1 buyer pay percent selected', null::integer, 1, 370, 503, 14, 14, 'checkbox'),
  ('contract_amend_buyer_pay_percent', 'Page 1 buyer pay percent', null::integer, 1, 390, 503, 55, 14, 'text'),
  ('contract_amend_lender_repairs_selected', 'Page 1 lender repairs selected', null::integer, 1, 47, 535, 14, 14, 'checkbox'),
  ('contract_amend_lender_repairs_seller_amount', 'Page 1 lender repairs seller amount', null::integer, 1, 115, 565, 80, 14, 'text'),
  ('contract_amend_lender_repairs_buyer_amount', 'Page 1 lender repairs buyer amount', null::integer, 1, 245, 565, 80, 14, 'text'),
  ('contract_amend_option_extension_selected', 'Page 1 option extension selected', null::integer, 1, 47, 594, 14, 14, 'checkbox'),
  ('contract_amend_additional_option_fee', 'Page 1 additional option fee', null::integer, 1, 290, 594, 80, 14, 'text'),
  ('contract_amend_option_extension_date', 'Page 1 option extension date', null::integer, 1, 210, 624, 130, 14, 'text'),
  ('contract_amend_option_extension_year', 'Page 1 option extension year', null::integer, 1, 375, 624, 45, 14, 'text'),
  ('contract_amend_option_fee_will_credit', 'Page 1 option fee will credit', null::integer, 1, 455, 624, 14, 14, 'checkbox'),
  ('contract_amend_option_fee_will_not_credit', 'Page 1 option fee will not credit', null::integer, 1, 505, 624, 14, 14, 'checkbox'),
  ('contract_amend_waives_option_selected', 'Page 1 waives option period selected', null::integer, 1, 47, 653, 14, 14, 'checkbox'),
  ('contract_amend_buyer_approval_date_selected', 'Page 1 buyer approval date selected', null::integer, 1, 47, 682, 14, 14, 'checkbox'),
  ('contract_amend_buyer_approval_month_day', 'Page 1 buyer approval month and day', null::integer, 1, 430, 682, 95, 14, 'text'),
  ('contract_amend_buyer_approval_year', 'Page 1 buyer approval year', null::integer, 1, 550, 682, 40, 14, 'text'),
  ('contract_amend_other_modifications_selected', 'Page 1 other modifications selected', null::integer, 1, 47, 712, 14, 14, 'checkbox'),
  ('contract_amend_other_modifications_text', 'Page 1 other modifications text', null::integer, 1, 72, 742, 490, 35, 'text');

create temp table txr_1903_mappings_touched (
  field_key text not null,
  page_number integer not null,
  occurrence_index integer,
  action text not null
) on commit drop;

-- Deactivate active mappings with no matching seeded placement (wrong page/occurrence)
update public.form_field_mappings ffm
set
  status = 'INACTIVE',
  update_date = now()
from txr_1903_form tf,
     public.fields fld
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.id
  and fld.status = 'ACTIVE'
  and ffm.status = 'ACTIVE'
  and exists (
    select 1
    from txr_1903_placement_seed ps
    where lower(ps.field_key) = lower(fld.field_key)
  )
  and not exists (
    select 1
    from txr_1903_placement_seed ps
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
    notes = 'TREC 39-11 / TXR 1903 Amendment to Contract first-pass placement',
    status = 'ACTIVE',
    update_date = now()
  from txr_1903_form tf,
       txr_1903_placement_seed ps,
       public.fields fld
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
    and ffm.page_number = ps.page_number
    and coalesce(ffm.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
    and ffm.status = 'ACTIVE'
  returning fld.field_key, ffm.page_number, ffm.occurrence_index
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
    'TREC 39-11 / TXR 1903 Amendment to Contract first-pass placement'
  from txr_1903_placement_seed ps
  inner join txr_1903_form tf on true
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
insert into txr_1903_mappings_touched (field_key, page_number, occurrence_index, action)
select field_key, page_number, occurrence_index, 'updated' from updated_mappings
union all
select field_key, page_number, occurrence_index, 'inserted' from inserted_mappings;

-- ---------------------------------------------------------------------------
-- Report
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
  select form_id into v_form_id from txr_1903_form limit 1;

  select count(*) into v_fields_inserted
  from txr_1903_fields_touched where action = 'inserted';

  select count(*) into v_fields_updated
  from txr_1903_fields_touched where action = 'updated';

  select count(*) into v_mappings_inserted
  from txr_1903_mappings_touched where action = 'inserted';

  select count(*) into v_mappings_updated
  from txr_1903_mappings_touched where action = 'updated';

  select string_agg(expected.field_key, ', ' order by expected.field_key)
  into v_unresolved_fields
  from (
    values
      ('property_address_city'),
      ('contract_amend_sales_price_selected'),
      ('contract_amend_cash_price'),
      ('contract_amend_financing_amount'),
      ('contract_amend_total_sales_price'),
      ('contract_amend_repairs_selected'),
      ('contract_amend_repairs_text'),
      ('contract_amend_closing_date_selected'),
      ('contract_amend_closing_month_day'),
      ('contract_amend_closing_year'),
      ('contract_amend_seller_expense_contribution_selected'),
      ('contract_amend_seller_expense_contribution_amount'),
      ('contract_amend_brokerage_comp_selected'),
      ('contract_amend_seller_pay_selected'),
      ('contract_amend_seller_pay_dollar_selected'),
      ('contract_amend_seller_pay_amount'),
      ('contract_amend_seller_pay_percent_selected'),
      ('contract_amend_seller_pay_percent'),
      ('contract_amend_buyer_pay_selected'),
      ('contract_amend_buyer_pay_dollar_selected'),
      ('contract_amend_buyer_pay_amount'),
      ('contract_amend_buyer_pay_percent_selected'),
      ('contract_amend_buyer_pay_percent'),
      ('contract_amend_lender_repairs_selected'),
      ('contract_amend_lender_repairs_seller_amount'),
      ('contract_amend_lender_repairs_buyer_amount'),
      ('contract_amend_option_extension_selected'),
      ('contract_amend_additional_option_fee'),
      ('contract_amend_option_extension_date'),
      ('contract_amend_option_extension_year'),
      ('contract_amend_option_fee_will_credit'),
      ('contract_amend_option_fee_will_not_credit'),
      ('contract_amend_waives_option_selected'),
      ('contract_amend_buyer_approval_date_selected'),
      ('contract_amend_buyer_approval_month_day'),
      ('contract_amend_buyer_approval_year'),
      ('contract_amend_other_modifications_selected'),
      ('contract_amend_other_modifications_text'),
      ('contract_amend_executed_day'),
      ('contract_amend_executed_month'),
      ('contract_amend_executed_year')
  ) as expected(field_key)
  left join txr_1903_fields_touched touched
    on lower(touched.field_key) = lower(expected.field_key)
  where touched.field_key is null;

  select string_agg(
    ps.field_key || ' (page ' || ps.page_number || ')',
    ', '
    order by ps.field_key
  )
  into v_unresolved_mappings
  from txr_1903_placement_seed ps
  left join txr_1903_mappings_touched touched
    on lower(touched.field_key) = lower(ps.field_key)
   and touched.page_number = ps.page_number
   and coalesce(touched.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
  where touched.field_key is null
    and v_form_id is not null;

  raise notice 'TREC 39-11 / TXR 1903 Amendment to Contract migration report';
  raise notice '  form_id: %', coalesce(v_form_id::text, 'NOT FOUND');
  raise notice '  fields inserted: %', v_fields_inserted;
  raise notice '  fields updated: %', v_fields_updated;
  raise notice '  mappings inserted: %', v_mappings_inserted;
  raise notice '  mappings updated: %', v_mappings_updated;

  if v_unresolved_fields is not null then
    raise notice '  unresolved fields: %', v_unresolved_fields;
  end if;

  if v_form_id is null then
    raise notice '  unresolved mappings: form not found; no mappings applied';
  elsif v_unresolved_mappings is not null then
    raise notice '  unresolved mappings: %', v_unresolved_mappings;
  end if;
end $$;
