-- Mark Third Party Financing Addendum (TXR 1901 / TREC 40-11) dollar amount
-- fields as currency so PDF fill / packet editors comma-format values
-- (450000 → 450,000) without adding a "$".
--
-- AcroForm import previously typed every text widget as text/text. Widget type
-- stays "text" (matching TXR 1601 seeded currency fields); only data type changes.

do $$
declare
  v_updated integer := 0;
begin
  with target_fields as (
    select distinct f.id
    from public.fields f
    join public.form_field_mappings m
      on m.field_id = f.id
     and m.status = 'ACTIVE'
    join public.forms fo
      on fo.id = m.form_id
     and fo.status = 'ACTIVE'
    where f.status = 'ACTIVE'
      and lower(coalesce(f.field_data_type, '')) <> 'currency'
      and lower(coalesce(f.field_widget_type, '')) not in ('checkbox', 'signature', 'initials', 'date')
      and (
        fo.form_code in ('TXR-1901', 'TXR 1901', 'TREC-40-11', 'TREC 40-11')
        or fo.form_name ilike '%third party financing%'
        or f.field_key ilike 'txr_1901_%'
        or f.field_key ilike 'trec_40_11_%'
      )
      and (
        -- Official TREC 40-11 native AcroForm dollar blanks (allowlist wins)
        lower(trim(coalesce(m.pdf_field_name, ''))) in (
          'years with interest not to exceed',
          'excluding',
          'for a period in the total amount of',
          'excluding any financed mip amortizable monthly for not less',
          'excluding_2',
          'charges as shown on buyers loan estimate for the loan not to exceed',
          'per annum for the first_4',
          'conversion mortgage loan in the original principal amount of',
          'excluding_2-1',
          'value of the property established by the department of veterans affairs'
        )
        or (
          -- Semantic / remapped amount keys and labels
          (
            f.field_key ~* '(^|_)(amount|principal|sales_price|list_price|purchase_price|loan_amount|down_payment|cash_portion|financed_amount|financed_portion|appraised_value)(_|$)'
            or coalesce(f.field_label, '') ~* '\y(amount|principal|sales price|loan amount|down payment|cash portion|financed amount|appraised value)\y'
            or coalesce(m.mapping_name, '') ~* '\y(amount|principal|sales price|loan amount|down payment|cash portion|financed amount|appraised value)\y'
            or coalesce(m.pdf_field_name, '') ~* '\y(amount|principal|sales price|loan amount|down payment|cash portion|financed amount|appraised value)\y'
          )
          -- Never treat rates / terms / IDs as currency (semantic matches only)
          and not (
            f.field_key ~* '(percent|percentage|interest|rate|apr|origination|year|years|month|months|day|days|term|section|phone|zip|postal|license|mls|email|date)'
            or coalesce(f.field_label, '') ~* '\y(percent|percentage|interest|rate|year|years|month|months|day|days|term|section|phone|zip|license|mls)\y'
            or coalesce(m.pdf_field_name, '') ~* '\y(percent|percentage|interest|rate|year|years|month|months|day|days|term|section|phone|zip|license|mls)\y'
          )
        )
      )
  ),
  updated as (
    update public.fields f
    set field_data_type = 'currency'
    where f.id in (select id from target_fields)
    returning f.id
  )
  select count(*) into v_updated from updated;

  raise notice 'TXR 1901 currency typing: updated % field(s) to field_data_type=currency', v_updated;
end $$;
