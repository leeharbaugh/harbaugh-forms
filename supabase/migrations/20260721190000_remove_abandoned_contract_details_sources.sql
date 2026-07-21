-- Remove abandoned contract_details source mappings.
--
-- The source-object architecture audit (2026-07-21) proved that
-- public.contract_details is abandoned architecture: the table has zero rows,
-- no application code writes to it, no UI maintains it, and no packet field
-- instance has ever been sourced from it. The 64 ACTIVE catalog fields still
-- configured with source_type = 'contract_details' therefore resolve through
-- scoped Personal/Organization defaults and manual Fill Form entry today.
-- This migration makes that real behavior explicit by converting exactly those
-- verified fields to manual_only.
--
-- Also repairs one accidentally inactivated catalog field:
-- BUYER_REP_BROKER_SGN_CHECKBOX (2a32353f-0923-40ed-98f0-e60815ad4e96), the
-- TXR-1501 page 6 broker-signature checkbox. Its hand-drawn mapping
-- (d2d51f3e-a4a2-44b9-8ea1-6ec1cc0089f9) and three packet instances remained
-- ACTIVE while the field itself was left INACTIVE — the profile of the
-- 20260701200000 AcroForm-pollution sweep heuristic (all-caps key >= 18 chars,
-- effectively manual, no source path/resolver) catching a real manual field.
--
-- Guarantees:
--   * only the explicitly listed field IDs are touched;
--   * each update requires the expected current source_type/status;
--   * field status, type, widget type, mappings, coordinates, scoped
--     defaults, and packet instances are untouched;
--   * update_date changes only for rows actually updated (table trigger);
--   * idempotent: a rerun matches zero rows and passes the final assertions;
--   * contract_details table and resolver code remain for historical
--     compatibility (separate, later cleanup decision).

do $$
declare
  v_contract_rows bigint;
  v_expected constant integer := 64;
  v_pending integer;
  v_converted integer;
  v_buyer_rep integer;
  v_approved constant uuid[] := array[
    'dc54d9cb-8836-40d9-97ef-033173c2913f', -- contract_additional_earnest_money_amount
    '1e438c3c-4a1e-48a0-b5fa-7ceb90d9ed01', -- contract_additional_earnest_money_days
    'b00cae55-3d09-49f4-a31b-df49b481b886', -- CONTRACT_BROKER_DISCLOSURE_TEXT
    'acadebd1-ec33-4ac2-804f-2534b17dcabf', -- contract_buyer_contributes_to_seller_broker_comp
    'f63d04bc-4e6b-44fe-8990-f93a07e3c219', -- contract_buyer_contribution_amount
    '537f9c5d-d670-4abc-8be4-1f52c9c65cc5', -- contract_buyer_contribution_dollar_selected
    '3989abe8-f184-4cde-b216-8d1764778505', -- contract_buyer_contribution_percent
    'f346cf05-fe86-4496-8228-6f6127969454', -- contract_buyer_contribution_percent_selected
    'd96b71d9-35ef-4a5a-a2cf-22819ef889b9', -- CONTRACT_BUYER_POSSESSION_AT_CLOSING
    'b5b6ca35-ae6d-4b63-80b5-a7356b2f1453', -- contract_buyer_possession_by_lease
    'f7d78229-f99c-4c11-a5b3-082859eeac15', -- contract_closing_date
    '7c31526f-ce2c-4988-82cb-a2654f5b07a4', -- contract_earnest_money_amount
    '80c114e9-d1d9-4277-bb01-239f0437afa8', -- contract_effective_date
    '5abf0584-f253-488e-883a-8d6df97ba792', -- contract_escrow_agent_address
    'fc51201d-953c-4d8d-b6f6-892e5665c488', -- contract_escrow_agent_name
    '5f6a8134-5e28-4076-b881-0634a39389ba', -- contract_financing_loan_assumption
    '3a2bbc88-7055-402f-9224-16052012305f', -- contract_financing_seller_financing
    'ed6f557c-a451-4c77-bb75-cb1c2b0dbda6', -- contract_financing_third_party
    '67031434-c56d-464a-b9b2-bc17a186179f', -- contract_hoa_is_not_subject
    '9daa52a0-f0b7-4196-8e93-ad071f7d4abf', -- contract_hoa_is_subject
    '02611b6b-45a4-4075-bdc5-13dfbd572e87', -- contract_lease_fixture
    'f180d6b7-25f4-434d-9011-95b85dc0b575', -- contract_lease_natural_resource
    '75f612ad-a987-4de2-b6cf-5b73d79333cf', -- contract_lease_residential
    '0183ade4-81c0-4fa2-8e8c-9580f11735ff', -- contract_natural_resource_lease_termination_days
    '12617799-fb89-4c42-8520-1d59debc802a', -- contract_natural_resource_leases_delivered
    '37a1e085-6980-4a77-ab13-1116c17e3c20', -- contract_natural_resource_leases_not_delivered
    'c2891d22-e94a-4bb1-96d8-f376aa2231fa', -- contract_option_fee_amount
    'c87dbe71-747f-4f50-b82f-74c1cee5149d', -- contract_option_period_days
    '71cc5bb4-8b16-4e6d-861a-a925a650da91', -- CONTRACT_PROPERTY_AS_IS
    '38b72a74-70ff-4c92-b1f6-a340148a2b58', -- contract_property_as_is_with_repairs
    '6181a1f8-374c-4861-9d92-0d540ca3fb58', -- contract_sales_price_cash
    '5dbc036b-75f6-4de4-b327-c47581c0bc2f', -- contract_sales_price_financing
    'aa96660b-9ae0-4888-aa64-c32875bd1ad3', -- contract_sales_price_total
    '464e2e51-e04f-4501-beec-6fa8bbaaf114', -- contract_seller_contributes_to_buyer_broker_comp
    '0a47197a-3b0c-4124-994f-f36dea04a75d', -- contract_seller_contribution_amount
    '2f577094-ab1b-4b05-ae95-5be82ad440b8', -- contract_seller_contribution_dollar_selected
    'c8d807ad-10bf-4408-aeca-82c3591f7fc3', -- contract_seller_contribution_percent
    '8adc2c2c-b191-4fd5-b11f-eb71cbf2d9ee', -- contract_seller_contribution_percent_selected
    '222650d2-5bf7-4b65-a70a-988d01d6348b', -- contract_seller_disclosure_delivery_days
    'e0e827af-9b93-4a99-b51c-1564aa00a011', -- contract_seller_disclosure_not_received
    '3de072c3-3179-461b-8511-815394da97dc', -- contract_seller_disclosure_not_required
    '1eee4d1d-9801-44d1-9ebe-1a682c4969c2', -- contract_seller_disclosure_received
    '92b8cdbd-479b-44ea-8bfd-1a98d823429d', -- CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT
    'b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d', -- CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT
    '68ab207d-d60c-4262-b96d-4135f8f8e639', -- contract_specific_repairs
    '0951efa2-0263-430f-9803-ab1f572d62ff', -- contract_survey_option_1_days
    '393bde99-8472-4d5d-9de0-de1a283f019b', -- contract_survey_option_1_new_survey_paid_by_buyer
    '6c37922b-edfd-42fd-ba53-6055df10b1ba', -- contract_survey_option_1_new_survey_paid_by_seller
    'f44a3aca-5e54-444a-9b42-cb0266ce2aae', -- contract_survey_option_2_days
    'b7e28491-3d9f-44d0-a241-fef6512fd487', -- contract_survey_option_3_days
    '2512bfe5-42fa-4f17-b52c-b6cb65abf9ed', -- contract_title_company_name
    '69ab9239-742c-4bf5-a2f8-70d02c008d0a', -- contract_title_exception_amended
    '5efe697e-1954-47ad-92a5-85b8d052a411', -- contract_title_exception_amended_paid_by_buyer
    '8e414503-5610-4b08-aed6-4d54f3cf9533', -- contract_title_exception_amended_paid_by_seller
    '35d35a95-c4fc-4c6d-a7b3-20146d55651a', -- contract_title_exception_not_amended
    'e4d3b4f9-965b-4c38-bbcf-776c8758b55a', -- contract_title_objection_days
    '35dd64ff-1f22-4b93-afb0-779465316a13', -- contract_title_objection_use_activity
    'b58b520c-ee81-4a47-a61a-e0e626338f0d', -- contract_title_policy_paid_by_buyer
    '79d9b6af-a31d-4bca-9969-4f175ad4cbad', -- contract_title_policy_paid_by_seller
    'f47adc30-df80-4507-95cd-69f62d28de2e', -- contract_water_disclosure_delivery_days
    'b5d10932-10b9-43af-a50b-0c8d988ff0d5', -- contract_water_disclosure_not_received
    'a528c4e3-d980-42f8-9b90-789d746f6145', -- CONTRACT_WATER_DISCLOSURE_NOT_REQUIRED
    'fc86f756-37bf-4a8d-b565-3c784d96e3fe', -- contract_water_disclosure_received
    'dbbbbb56-655e-4f63-aeb6-bf72db1f1101' -- contract_water_provider_name
  ]::uuid[];
begin
  -- Precondition: contract_details must still be empty (abandoned).
  select count(*) into v_contract_rows from public.contract_details;
  if v_contract_rows > 0 then
    raise exception
      'contract_details is expected to be empty but has % row(s); aborting conversion',
      v_contract_rows;
  end if;

  -- Precondition: the approved set must be fully pending (first run) or fully
  -- converted already (rerun). Anything else means assumptions changed.
  select count(*) into v_pending
  from public.fields
  where id = any (v_approved)
    and status = 'ACTIVE'
    and source_type = 'contract_details';

  if v_pending <> v_expected and v_pending <> 0 then
    raise exception
      'Expected % (first run) or 0 (rerun) pending contract_details fields, found %; aborting',
      v_expected, v_pending;
  end if;

  update public.fields
  set source_type = 'manual_only',
      source_path = null
  where id = any (v_approved)
    and status = 'ACTIVE'
    and source_type = 'contract_details';

  get diagnostics v_converted = row_count;
  raise notice 'Converted % contract_details field(s) to manual_only', v_converted;

  -- Postcondition: no ACTIVE field anywhere still sources contract_details.
  if exists (
    select 1 from public.fields
    where status = 'ACTIVE' and source_type = 'contract_details'
  ) then
    raise exception
      'ACTIVE fields still sourced from contract_details after conversion; aborting';
  end if;

  -- Postcondition: every approved field is now manual_only with a null path.
  if exists (
    select 1 from public.fields
    where id = any (v_approved)
      and (source_type is distinct from 'manual_only'
           or source_path is not null)
  ) then
    raise exception
      'Approved contract field(s) not in expected manual_only state; aborting';
  end if;

  -- Buyer Rep broker-signature checkbox reactivation (strict preconditions:
  -- exact id, exact key, currently INACTIVE, and no other ACTIVE GLOBAL field
  -- with the same key that would violate fields_global_field_key_active_uidx).
  update public.fields
  set status = 'ACTIVE',
      source_type = 'manual_only',
      source_path = null
  where id = '2a32353f-0923-40ed-98f0-e60815ad4e96'
    and field_key = 'BUYER_REP_BROKER_SGN_CHECKBOX'
    and status = 'INACTIVE'
    and default_checked = false
    and not exists (
      select 1 from public.fields f2
      where lower(f2.field_key) = lower('BUYER_REP_BROKER_SGN_CHECKBOX')
        and f2.status = 'ACTIVE'
        and f2.scope = 'GLOBAL'
        and f2.id <> '2a32353f-0923-40ed-98f0-e60815ad4e96'
    );

  get diagnostics v_buyer_rep = row_count;
  raise notice 'Buyer Rep checkbox rows reactivated: %', v_buyer_rep;

  -- Postcondition: the checkbox is ACTIVE, manual-only, and unchecked.
  if not exists (
    select 1 from public.fields
    where id = '2a32353f-0923-40ed-98f0-e60815ad4e96'
      and field_key = 'BUYER_REP_BROKER_SGN_CHECKBOX'
      and status = 'ACTIVE'
      and source_type = 'manual_only'
      and source_path is null
      and default_checked = false
  ) then
    raise exception
      'BUYER_REP_BROKER_SGN_CHECKBOX is not in the expected ACTIVE manual-only state; aborting';
  end if;
end $$;
