-- Remove obsolete listing_agreement_details source mappings for current packet forms.
--
-- The listing-agreement-details review (2026-07-21) and Lee's approved decisions
-- established that current collection-based packets are not linked to
-- independently maintained Listing Agreement records. The 129 ACTIVE catalog
-- fields still configured with source_type = 'listing_agreement_details', plus
-- the three Listing compensation custom-resolver fields that depend on dormant
-- Listing Agreement compensation columns, therefore resolve through scoped
-- Personal/Organization defaults and manual Fill Form entry today.
--
-- This migration makes that real behavior explicit by converting exactly those
-- verified fields to manual_only. It does not:
--   * delete or rewrite the historical listing_agreement_details row;
--   * drop the table or legacy /listing-agreements route;
--   * modify mappings, coordinates, field types/widgets, packet instances,
--     or existing scoped defaults;
--   * recreate TXR-1102 schema defaults as scoped defaults (separate review);
--   * convert other custom_resolver keys that merely share a "listing" name
--     but have no implemented listing-details dependency.
--
-- Guarantees:
--   * only the explicitly listed field IDs are touched;
--   * each update requires the expected current source_type/status
--     (and resolver_key for the custom-resolver cohort);
--   * field status, type, widget type, mappings, coordinates, scoped
--     defaults, and packet instances are untouched;
--   * update_date changes only for rows actually updated (table trigger);
--   * idempotent: a rerun matches zero rows and passes the final assertions;
--   * listing_agreement_details table, historical row, resolver code, and
--     legacy UI remain for compatibility (separate, later cleanup decision).

do $$
declare
  v_listing_expected constant integer := 129;
  v_custom_expected constant integer := 3;
  v_listing_pending integer;
  v_custom_pending integer;
  v_listing_converted integer;
  v_custom_converted integer;
  v_listing_approved constant uuid[] := array[
    'ed020c0e-064b-4c0f-b6dc-6209a5d38eab', -- buyer_broker_comp_flat_fee
    'daa0c0d6-78ce-4510-96a2-05fe371bf01a', -- buyer_broker_comp_percent
    '998b7869-bc45-4686-a75c-e60cd3581b78', -- EMPLOYER_RELOCATION_COMPANY
    '888cd309-28f6-46b0-bbc3-80e9330f7b85', -- FINANCING_CASH
    '3311c96c-eb8f-42c7-989a-9de1bb97c6ad', -- FINANCING_CONVENTIONAL
    '9db19ac1-eabb-4826-9757-6c9efa83b45f', -- FINANCING_FHA
    '9e863c28-dd5a-4d89-ab8c-085396d6af0a', -- financing_other
    'eeded65d-fb2e-4b96-9358-eeb7cbfe57d1', -- financing_other_description
    '67b12714-8a23-4940-8c58-9ceeec67e179', -- financing_owner_finance
    '860c8696-5631-4e3e-a690-2a823795c173', -- FINANCING_TEXAS_VETERANS
    '966f8d2d-932a-4d8a-9a94-370550690cda', -- FINANCING_VA
    '4c8b9d81-896a-4516-8236-28266ff077a8', -- KEYBOX_AUTHORIZED_YES
    '062cc399-475f-471e-a23e-cc4156c7a531', -- KNOWN_DISTRICTS
    'b08bb4a1-95ec-4824-92cc-36a3a0601e90', -- KNOWN_FINANCIAL_OBLIGATIONS_EXCEPTION
    'b4fa63a8-2107-4fda-b5ec-c06ba3e85884', -- KNOWN_LIENS_EXCEPTION
    'cde38f91-b28d-4ac5-80e4-df29bdbcab22', -- lease_add_assistance_animals
    '861e9685-1a2a-497b-8680-16f68f4b71cb', -- lease_add_condo_addendum
    '8d53f1d6-5e95-4d6f-a906-abca79a29d08', -- lease_add_flood_hazard
    '4ba23528-af55-4c9c-b981-2726554158d6', -- lease_add_hoa_request
    '8d7f2a93-a394-433d-8294-ca546bb15ff3', -- lease_add_iabs
    '445cf131-d517-4e11-97f6-905c6eb30919', -- lease_add_irs_forms
    '66b9a9e1-4502-4d5f-b171-ccc40fd130f9', -- lease_add_keybox_tenant
    '13a6366e-79f0-4b1a-b2f6-21038ee58eb3', -- lease_add_lead_paint
    'd4339ab0-ed40-4179-bfdc-8c5d13e30373', -- lease_add_onsite_sewer
    '46fd4aec-61fc-47ae-9baf-349797ec9ee6', -- lease_add_other_document
    'f93e9ef9-64e1-435f-9fa9-7a246c8b7607', -- lease_add_other_document_description
    '84866398-da31-4074-bd7c-dfec96235de3', -- lease_add_rental_flood_disclosure
    '684f0135-35ac-4802-8513-aba11825e20d', -- lease_add_unescorted_access
    '88d8e554-0ed0-40a4-a496-40f50637b587', -- lease_additional_late_charge_daily_amount
    '65786f52-b3c1-47aa-8918-5f56057bd90e', -- lease_animal_deposit
    '246b792a-46ba-4584-9081-7cd749589c03', -- lease_animal_monthly_rent_increase
    'e85a20f3-79c8-4d34-8ff1-6acb553e693e', -- lease_animal_nonrefundable_fee
    '68a9dbe1-6279-4625-b9b4-159ec3f0bb7b', -- lease_animal_restrictions
    'f0189495-7057-4a99-9e0a-a8068c3b2a38', -- lease_animal_violation_daily_charge
    '210e04f0-8a82-4b2a-ae37-30d4730fa335', -- lease_animal_violation_initial_charge
    'd0f91c5f-17e0-49b3-a29d-f7b55caed3ad', -- lease_animals_not_permitted
    '2eb503cf-0f81-44a6-8a36-a82acd3c8764', -- lease_animals_permitted
    'd98cb166-d2cb-41ff-aaf9-39bc5fd18c94', -- lease_broker_fee_all_rents_percent
    '80a9d9c8-63c2-4962-ab7e-118afde564f1', -- lease_broker_fee_one_month_percent
    '85e5d1ed-d5f4-4549-8b46-03a45771d569', -- lease_broker_fee_other
    '4b0da080-698a-4037-a439-62458afaa24d', -- lease_early_withdrawal_fee
    '81c141e9-b296-4861-9bd5-e57222ac980b', -- lease_emergency_repair_phone
    'b021bc15-28df-4a53-a206-2bd496ad9634', -- lease_guest_days
    '3ee5158f-abb0-4264-b650-f8fa059560a8', -- lease_health_safety_condition_exception
    '4ca595dd-4a8e-4ae1-9dc1-e2dd0be7bb2e', -- lease_hoa_is_subject
    'abf614b4-7a43-4bf4-95f5-3db0115865e3', -- lease_initial_late_charge_amount
    '575dd856-b906-4e3d-a53e-16b6cc727271', -- lease_initial_late_charge_percent
    'a92062be-4b38-4344-8818-7322bc84b789', -- lease_inventory_condition_form_days
    '2b65e5e7-5e35-4c03-b573-b5ed7eedc624', -- lease_items_not_repaired
    '5a36203e-a720-4a7b-bae6-77787e00ea13', -- lease_keybox_authorized_yes
    '0b40ecae-ceaf-4dd3-8a61-84679baf7fdd', -- lease_keybox_last_days
    'caa9d332-f6c4-40ed-9377-4706f0b9539d', -- lease_known_financial_obligations_exception
    'c06fa26e-190c-4859-8abf-fa3ef919dfd2', -- lease_known_liens_exception
    'e7d93b5d-1363-4e93-a573-9fd896fb3a58', -- lease_late_charges_incurred_day
    '0edc25f8-0f3e-4ba9-b3fe-302779f8700f', -- lease_listing_begin_date
    'ca451635-4830-40ac-86b4-8888a8cc79d9', -- lease_listing_end_date
    '36688331-3eca-4c40-b8ac-62eef3ceed6a', -- lease_listing_exclusions
    '95e01faa-c1e5-4c54-b725-01e889ace000', -- lease_make_ready_broker_reimbursed
    'f4efec0b-ddc5-4f9e-aa72-875873c9cd93', -- lease_make_ready_cost_cap
    '3cf1d9b7-c6fe-4a3a-a3d4-59e18c9dc006', -- lease_make_ready_direct_service_fee
    '6d6524c0-545b-4d62-9a30-804eb9e86828', -- lease_make_ready_landlord_pays_contractors
    '26fffea6-98e4-430f-82f8-cccfd4e87e8e', -- lease_make_ready_reimbursement_service_fee
    '0e089390-6e61-460a-a296-5d11b3c715d5', -- lease_mls_delayed_days
    'e4daf38a-7766-4d69-88f7-4abb20ee16d3', -- lease_mls_delayed_purpose
    '16fdab10-cb33-4b9f-b36e-fe6beafa887a', -- lease_monthly_rent
    '8c98c455-6bcf-4284-805a-8525cc27f191', -- lease_no_coop_all_rents_percent
    '80d604ad-7709-4820-8f36-49ed20948dbf', -- lease_no_coop_one_month_percent
    '7c3a1be2-6965-4df4-87f1-3d3d297a318c', -- lease_no_coop_other
    'ad6e89a8-24ef-4ba7-adaa-18ef862d39df', -- lease_non_real_estate_items
    'fd46b700-a54b-40be-85f5-b5860c9c2c30', -- lease_optional_common_area_fees_exception
    '0c09c53f-b46c-4288-8d71-fd65480c18a6', -- lease_other_broker_all_rents_percent
    '5e71079e-1d6d-4468-9c96-d634dc11145a', -- lease_other_broker_flat_fee
    '696596bb-37d1-4de9-a1c5-1026dbc46c23', -- lease_other_broker_one_month_percent
    '9d219600-328c-4ff8-a8ee-66a32672446b', -- lease_payment_county
    '6dbd51c9-22a8-4390-90ca-df70c174be1b', -- lease_protection_period_days
    '6d96793e-2d22-4698-9efc-8c6b4cc581ca', -- lease_reimbursable_expenses
    '6873ddb9-1f51-4fc3-90e8-adc120f82b28', -- lease_renewal_all_rents_percent
    'cbadad81-daec-43f9-ab06-cbfd803a3403', -- lease_renewal_one_month_percent
    '615997d0-2101-4bc8-b486-dde57cfc79da', -- lease_renewal_other
    '18cb36cf-2605-4dda-a514-12e511b408f3', -- lease_rent_due_first_day
    '124b6f29-f351-41b2-ac59-cb85ea0496b1', -- lease_rent_due_other
    'a496985e-8330-4917-9689-95a7740df730', -- lease_replacement_tenant_by_landlord_amount
    'a0424ba7-3e57-465d-b319-0f7137e7d703', -- lease_replacement_tenant_by_landlord_percent
    '46d31f30-1d01-4588-881c-66d02299a3f7', -- lease_replacement_tenant_by_tenant_amount
    'eed07b60-ee1d-4063-bbae-9a74504119b1', -- lease_replacement_tenant_by_tenant_percent
    '3e300d54-69f1-4465-97ba-5e7ceec8af05', -- lease_requirements_other
    'f65af418-e26e-4240-8f6d-6dea3cc9339d', -- lease_requirements_special_provisions
    '1fd3cc39-888b-441c-96df-1b4e764ada05', -- lease_sale_comp_other
    'b27cad14-4a0b-435f-a8a3-6010fac80f96', -- lease_sale_comp_percent
    '72cdf8b6-cbe1-43d1-8c6e-c427bff8741d', -- LEASE_SCHEDULING_COMPANY
    '223818dc-8761-4532-a660-c713e54f2b04', -- lease_security_deposit
    '9a528faa-ffa9-43e4-9482-1e43347d78de', -- lease_special_provisions
    '1e3fee3a-b69c-4a19-ba72-3c5770e71f85', -- lease_tenant_liability_insurance_amount
    '058a7c87-4a03-4823-ad49-2ae70bf71695', -- lease_tenant_utilities_except
    '4ed130ce-286e-4ecc-a5df-3ae269bb051f', -- lease_term_max_months
    '2332dd93-1a68-45d2-b2cd-37bc92ea290c', -- lease_term_min_months
    'eed663c9-baec-4e74-84fd-1dc84faab4e2', -- lease_trip_charge
    '15014dca-295e-4b8d-a87c-f76d8972cfa4', -- lease_vehicle_count
    '1ddc27b2-696f-4be3-981a-75dac8a93988', -- listing_add_authorization_to_advertise
    'bf992d23-5386-46dc-a2c7-f626eaaf24bc', -- listing_add_condo_addendum
    '55b4fbd9-5b43-49da-b946-3a75eaa72d29', -- listing_add_hoa_request
    'bdaed756-a207-49e0-bc12-a93dca6e52a7', -- listing_add_keybox_tenant
    'd923dc04-8c87-47a2-b6d1-aea0c5b9cd23', -- listing_add_lead_paint
    'd5763dc1-8999-4644-a23a-6c8fd4e69731', -- LISTING_ADD_MINERAL_INFO
    '86f649c1-33a5-468e-828c-f8ea1e4be53a', -- listing_add_mortgage_info_request
    '9ba3280c-d0d5-4e68-ba86-39ca6970a15d', -- listing_add_mud_notice
    '1da6fc90-94c8-4cbe-b993-42a8faf6ef9c', -- listing_add_onsite_sewer_info
    '4be5d8ba-a83e-4f30-8156-d968e4946c81', -- listing_add_pid_notice
    'd5944d77-d968-489a-be3f-88f8b88016ec', -- LISTING_ADD_SELLERS_DISCLOSURE
    'ef2f3e82-ccbe-44d1-b4c7-418cee034fff', -- listing_add_t47
    '576bb033-ca17-44bd-9bbb-28db7557e30b', -- listing_begin_date
    '198de3ac-d7f2-433f-981c-5c4bcabbae9e', -- listing_broker_no_coop_flat_fee
    'b9a56364-5a85-404e-a38c-ccd338b4a4d1', -- listing_broker_no_coop_other
    '4e793615-0774-4a17-b7a0-4c9fe05bb494', -- listing_broker_no_coop_percent
    '517f40e5-2f2a-45ee-a87a-d4cb63f6db52', -- listing_commission_percent
    'fca33d6f-269d-4081-9d54-2c7e56783542', -- listing_compensation_other
    '10c868dd-0d54-45d9-b342-ac28eeb507f6', -- LISTING_COMPENSATION_OTHER_CHECKBOX
    '833e6118-82da-4266-a0a7-51af14c1af34', -- listing_end_date
    '4861d3dd-ad35-4a65-827b-a6266486f7da', -- LISTING_EXCLUSIONS
    '2fc32a2d-7d83-4cdb-9bea-1240139f5db2', -- listing_flat_fee
    '6a7d8db2-3eab-4cf0-b494-60cd605ccd37', -- listing_hoa_is_subject
    '4cb5280f-65e4-4419-8c02-aab5f283ce2a', -- LISTING_INTERMEDIARY_YES
    '767b8770-df87-41b3-9ff7-628d4a807824', -- listing_price
    'e5fb0efa-1301-475c-bc95-db0868262446', -- mls_delayed_days
    'adc116b2-b368-4bd3-bd77-25472b867277', -- mls_delayed_purpose
    '54300c4c-ffed-4dce-9fb0-e43ec9869e6a', -- OTHER_FEES_REIMBURSABLE_EXPENSES
    '1c7ef2a8-0842-4a84-80ac-4e69a8ec2437', -- SCHEDULING_COMPANY
    '4918b65c-8e05-45a4-abe4-70be98750ec8', -- seller_authorizes_buyer_expense_disclosure_yes
    '8f6f5e5b-b5ee-4f67-bad0-b3accfa6fd4b' -- seller_is_foreign_person
  ]::uuid[];
  v_custom_approved constant uuid[] := array[
    'd4df5101-03a3-45d3-ac91-c8431415121e', -- listing_broker_no_coop_other_selected (listing_broker_no_coop_other_selected)
    '04809612-794c-4a41-bf92-3d3f016dbbb7', -- listing_broker_no_coop_percent_or_flat_fee_selected (listing_broker_no_coop_percent_or_flat_fee_selected)
    'b0548c8b-c4f7-44f9-8328-9c14899e09e7' -- SELLER_IS_NOT_FOREIGN_PERSON (seller_is_not_foreign_person)
  ]::uuid[];
begin
  -- Precondition: approved listing set must be fully pending (first run) or
  -- fully converted already (rerun). Anything else means assumptions changed.
  select count(*) into v_listing_pending
  from public.fields
  where id = any (v_listing_approved)
    and status = 'ACTIVE'
    and source_type = 'listing_agreement_details';

  if v_listing_pending <> v_listing_expected and v_listing_pending <> 0 then
    raise exception
      'Expected % (first run) or 0 (rerun) pending listing_agreement_details fields, found %; aborting',
      v_listing_expected, v_listing_pending;
  end if;

  -- Precondition: each approved custom-resolver field is either still pending
  -- with its exact resolver_key, or already converted to manual_only.
  if not exists (
    select 1 from public.fields
    where id = 'd4df5101-03a3-45d3-ac91-c8431415121e'
      and status = 'ACTIVE'
      and source_type = 'custom_resolver'
      and resolver_key = 'listing_broker_no_coop_other_selected'
  ) and not exists (
    select 1 from public.fields
    where id = 'd4df5101-03a3-45d3-ac91-c8431415121e'
      and status = 'ACTIVE'
      and source_type = 'manual_only'
      and source_path is null
      and resolver_key is null
  ) then
    raise exception
      'Approved custom resolver field listing_broker_no_coop_other_selected (%) is not in expected pending or converted state; aborting',
      'd4df5101-03a3-45d3-ac91-c8431415121e';
  end if;

  if not exists (
    select 1 from public.fields
    where id = '04809612-794c-4a41-bf92-3d3f016dbbb7'
      and status = 'ACTIVE'
      and source_type = 'custom_resolver'
      and resolver_key = 'listing_broker_no_coop_percent_or_flat_fee_selected'
  ) and not exists (
    select 1 from public.fields
    where id = '04809612-794c-4a41-bf92-3d3f016dbbb7'
      and status = 'ACTIVE'
      and source_type = 'manual_only'
      and source_path is null
      and resolver_key is null
  ) then
    raise exception
      'Approved custom resolver field listing_broker_no_coop_percent_or_flat_fee_selected (%) is not in expected pending or converted state; aborting',
      '04809612-794c-4a41-bf92-3d3f016dbbb7';
  end if;

  if not exists (
    select 1 from public.fields
    where id = 'b0548c8b-c4f7-44f9-8328-9c14899e09e7'
      and status = 'ACTIVE'
      and source_type = 'custom_resolver'
      and resolver_key = 'seller_is_not_foreign_person'
  ) and not exists (
    select 1 from public.fields
    where id = 'b0548c8b-c4f7-44f9-8328-9c14899e09e7'
      and status = 'ACTIVE'
      and source_type = 'manual_only'
      and source_path is null
      and resolver_key is null
  ) then
    raise exception
      'Approved custom resolver field SELLER_IS_NOT_FOREIGN_PERSON (%) is not in expected pending or converted state; aborting',
      'b0548c8b-c4f7-44f9-8328-9c14899e09e7';
  end if;

  select count(*) into v_custom_pending
  from public.fields
  where id = any (v_custom_approved)
    and status = 'ACTIVE'
    and source_type = 'custom_resolver';

  if v_custom_pending <> v_custom_expected and v_custom_pending <> 0 then
    raise exception
      'Expected % (first run) or 0 (rerun) pending listing custom_resolver fields, found %; aborting',
      v_custom_expected, v_custom_pending;
  end if;

  update public.fields
  set source_type = 'manual_only',
      source_path = null
  where id = any (v_listing_approved)
    and status = 'ACTIVE'
    and source_type = 'listing_agreement_details';

  get diagnostics v_listing_converted = row_count;
  raise notice 'Converted % listing_agreement_details field(s) to manual_only', v_listing_converted;

  update public.fields
  set source_type = 'manual_only',
      source_path = null,
      resolver_key = null
  where id = any (v_custom_approved)
    and status = 'ACTIVE'
    and source_type = 'custom_resolver'
    and resolver_key in (
      'seller_is_not_foreign_person',
      'listing_broker_no_coop_other_selected',
      'listing_broker_no_coop_percent_or_flat_fee_selected'
    );

  get diagnostics v_custom_converted = row_count;
  raise notice 'Converted % listing custom_resolver field(s) to manual_only', v_custom_converted;

  -- Postcondition: no ACTIVE field anywhere still sources listing_agreement_details.
  if exists (
    select 1 from public.fields
    where status = 'ACTIVE' and source_type = 'listing_agreement_details'
  ) then
    raise exception
      'ACTIVE fields still sourced from listing_agreement_details after conversion; aborting';
  end if;

  -- Postcondition: every approved listing field is now manual_only with a null path.
  if exists (
    select 1 from public.fields
    where id = any (v_listing_approved)
      and (source_type is distinct from 'manual_only'
           or source_path is not null)
  ) then
    raise exception
      'Approved listing field(s) not in expected manual_only state; aborting';
  end if;

  -- Postcondition: every approved custom-resolver field is manual_only with
  -- null path and null resolver_key.
  if exists (
    select 1 from public.fields
    where id = any (v_custom_approved)
      and (source_type is distinct from 'manual_only'
           or source_path is not null
           or resolver_key is not null)
  ) then
    raise exception
      'Approved listing custom_resolver field(s) not in expected manual_only state; aborting';
  end if;
end $$;
