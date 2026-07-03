-- Reset TXR 1901 / TREC 40-11 Third Party Financing Addendum AcroForm import.
-- Soft-deletes all mappings and inactivates form-specific fields so the form
-- can be re-imported from scratch using the new direct import workflow.

do $$
declare
  v_form_id integer;
  v_mappings_deleted integer := 0;
  v_fields_inactivated integer := 0;
  v_fields_skipped integer := 0;
  v_memory_inactivated integer := 0;
begin

  -- Task 1: Find form_id
  select id into v_form_id
  from public.forms
  where form_code in ('TXR-1901', 'TXR 1901', 'TREC-40-11', 'TREC 40-11')
    and status = 'ACTIVE'
  limit 1;

  if v_form_id is null then
    raise notice 'RESET TXR 1901: No matching form found — nothing to do.';
    return;
  end if;

  raise notice 'RESET TXR 1901: Found form_id = %', v_form_id;

  -- Task 2: Soft-delete all ACTIVE mappings for this form
  with deleted_mappings as (
    update public.form_field_mappings
    set status = 'DELETED'
    where form_id = v_form_id
      and status = 'ACTIVE'
    returning id
  )
  select count(*) into v_mappings_deleted from deleted_mappings;

  raise notice 'RESET TXR 1901: Mappings deleted = %', v_mappings_deleted;

  -- Task 3: Inactivate form-specific fields
  -- Only fields matching TXR 1901 prefixes that are NOT used by ACTIVE mappings
  -- on other forms.
  with form_specific_field_ids as (
    select f.id
    from public.fields f
    where f.status = 'ACTIVE'
      and (
        -- Form-code prefixed keys (new import style)
        f.field_key like 'txr_1901_%'
        or f.field_key like 'trec_40_11_%'
        -- Legacy uppercase keys from previous import attempts
        or f.field_key like 'TXR_1901_%'
        or f.field_key like 'TREC_40_11_%'
        -- Semantic prefixes that are clearly this-form-specific
        or f.field_key like 'third_party_financing_%'
        or f.field_key like 'financing_conventional_%'
        or f.field_key like 'financing_fha_%'
        or f.field_key like 'financing_va_%'
        or f.field_key like 'financing_usda_%'
        or f.field_key like 'financing_reverse_mortgage_%'
        or f.field_key like 'financing_other_%'
        or f.field_key like 'financing_buyer_approval_%'
        -- Fields with AcroForm import notes linked to this form's mappings
        or (
          f.notes ilike '%Imported from AcroForm field:%'
          and exists (
            select 1
            from public.form_field_mappings m
            where m.field_id = f.id
              and m.form_id = v_form_id
          )
        )
      )
      -- Safety: do NOT inactivate if used by ACTIVE mappings on OTHER forms
      and not exists (
        select 1
        from public.form_field_mappings m
        where m.field_id = f.id
          and m.form_id <> v_form_id
          and m.status = 'ACTIVE'
      )
  ),
  inactivated as (
    update public.fields
    set status = 'INACTIVE'
    where id in (select id from form_specific_field_ids)
    returning id
  )
  select count(*) into v_fields_inactivated from inactivated;

  -- Count skipped (matched pattern but used elsewhere)
  select count(*) into v_fields_skipped
  from public.fields f
  where f.status = 'ACTIVE'
    and (
      f.field_key like 'txr_1901_%'
      or f.field_key like 'trec_40_11_%'
      or f.field_key like 'TXR_1901_%'
      or f.field_key like 'TREC_40_11_%'
      or f.field_key like 'third_party_financing_%'
      or f.field_key like 'financing_conventional_%'
      or f.field_key like 'financing_fha_%'
      or f.field_key like 'financing_va_%'
      or f.field_key like 'financing_usda_%'
      or f.field_key like 'financing_reverse_mortgage_%'
      or f.field_key like 'financing_other_%'
      or f.field_key like 'financing_buyer_approval_%'
    )
    and exists (
      select 1
      from public.form_field_mappings m
      where m.field_id = f.id
        and m.form_id <> v_form_id
        and m.status = 'ACTIVE'
    );

  raise notice 'RESET TXR 1901: Fields inactivated = %, skipped (used elsewhere) = %',
    v_fields_inactivated, v_fields_skipped;

  -- Task 4: Inactivate memory entries for this form
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'acroform_field_mapping_memory'
  ) then
    with inactivated_memory as (
      update public.acroform_field_mapping_memory
      set status = 'INACTIVE'
      where status = 'ACTIVE'
        and (
          form_code in ('TXR-1901', 'TXR 1901', 'TREC-40-11', 'TREC 40-11')
          or form_name ilike '%third party financing%'
          or form_name ilike '%TXR 1901%'
          or form_name ilike '%TXR-1901%'
        )
      returning id
    )
    select count(*) into v_memory_inactivated from inactivated_memory;

    raise notice 'RESET TXR 1901: Memory records inactivated = %', v_memory_inactivated;
  else
    raise notice 'RESET TXR 1901: acroform_field_mapping_memory table does not exist — skipping.';
  end if;

  -- Task 5: Summary
  raise notice '--- RESET TXR 1901 SUMMARY ---';
  raise notice 'form_id: %', v_form_id;
  raise notice 'Mappings soft-deleted: %', v_mappings_deleted;
  raise notice 'Fields inactivated: %', v_fields_inactivated;
  raise notice 'Fields skipped (used elsewhere): %', v_fields_skipped;
  raise notice 'Memory records inactivated: %', v_memory_inactivated;
  raise notice '--- END ---';

end $$;
