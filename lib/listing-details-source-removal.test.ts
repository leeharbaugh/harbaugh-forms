import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildScopedDefaultLookup,
  resolveScopedPreferenceDefault,
  type FieldDefault,
} from "./types/field-default.ts";
import {
  fieldInstanceSyncWouldWrite,
  planFieldInstanceSyncMutations,
} from "./field-instance-sync.ts";

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260722010000_remove_obsolete_listing_details_sources.sql",
);

const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
const YAHOO_USER_ID = "8d10af59-f3f8-4a48-94b5-3477656c02a6";
const DAVEY_ORG_ID = "b788f525-53f4-42ed-b5a1-cb741398a974";
const TXR_1101_FORM_ID = 7;

const KNOWN_DISTRICTS_FIELD_ID = "062cc399-475f-471e-a23e-cc4156c7a531";
const OTHER_FEES_FIELD_ID =
  "54300c4c-ffed-4dce-9fb0-e43ec9869e6a";

/**
 * The 129 ACTIVE listing_agreement_details fields verified against
 * harbaugh-forms-dev on 2026-07-21 (123 S2 + 6 Lee-approved S3 fields).
 */
const APPROVED_LISTING_FIELD_IDS: ReadonlyArray<[string, string]> = [
  ["ed020c0e-064b-4c0f-b6dc-6209a5d38eab", "buyer_broker_comp_flat_fee"],
  ["daa0c0d6-78ce-4510-96a2-05fe371bf01a", "buyer_broker_comp_percent"],
  ["998b7869-bc45-4686-a75c-e60cd3581b78", "EMPLOYER_RELOCATION_COMPANY"],
  ["888cd309-28f6-46b0-bbc3-80e9330f7b85", "FINANCING_CASH"],
  ["3311c96c-eb8f-42c7-989a-9de1bb97c6ad", "FINANCING_CONVENTIONAL"],
  ["9db19ac1-eabb-4826-9757-6c9efa83b45f", "FINANCING_FHA"],
  ["9e863c28-dd5a-4d89-ab8c-085396d6af0a", "financing_other"],
  ["eeded65d-fb2e-4b96-9358-eeb7cbfe57d1", "financing_other_description"],
  ["67b12714-8a23-4940-8c58-9ceeec67e179", "financing_owner_finance"],
  ["860c8696-5631-4e3e-a690-2a823795c173", "FINANCING_TEXAS_VETERANS"],
  ["966f8d2d-932a-4d8a-9a94-370550690cda", "FINANCING_VA"],
  ["4c8b9d81-896a-4516-8236-28266ff077a8", "KEYBOX_AUTHORIZED_YES"],
  ["062cc399-475f-471e-a23e-cc4156c7a531", "KNOWN_DISTRICTS"],
  ["b08bb4a1-95ec-4824-92cc-36a3a0601e90", "KNOWN_FINANCIAL_OBLIGATIONS_EXCEPTION"],
  ["b4fa63a8-2107-4fda-b5ec-c06ba3e85884", "KNOWN_LIENS_EXCEPTION"],
  ["cde38f91-b28d-4ac5-80e4-df29bdbcab22", "lease_add_assistance_animals"],
  ["861e9685-1a2a-497b-8680-16f68f4b71cb", "lease_add_condo_addendum"],
  ["8d53f1d6-5e95-4d6f-a906-abca79a29d08", "lease_add_flood_hazard"],
  ["4ba23528-af55-4c9c-b981-2726554158d6", "lease_add_hoa_request"],
  ["8d7f2a93-a394-433d-8294-ca546bb15ff3", "lease_add_iabs"],
  ["445cf131-d517-4e11-97f6-905c6eb30919", "lease_add_irs_forms"],
  ["66b9a9e1-4502-4d5f-b171-ccc40fd130f9", "lease_add_keybox_tenant"],
  ["13a6366e-79f0-4b1a-b2f6-21038ee58eb3", "lease_add_lead_paint"],
  ["d4339ab0-ed40-4179-bfdc-8c5d13e30373", "lease_add_onsite_sewer"],
  ["46fd4aec-61fc-47ae-9baf-349797ec9ee6", "lease_add_other_document"],
  ["f93e9ef9-64e1-435f-9fa9-7a246c8b7607", "lease_add_other_document_description"],
  ["84866398-da31-4074-bd7c-dfec96235de3", "lease_add_rental_flood_disclosure"],
  ["684f0135-35ac-4802-8513-aba11825e20d", "lease_add_unescorted_access"],
  ["88d8e554-0ed0-40a4-a496-40f50637b587", "lease_additional_late_charge_daily_amount"],
  ["65786f52-b3c1-47aa-8918-5f56057bd90e", "lease_animal_deposit"],
  ["246b792a-46ba-4584-9081-7cd749589c03", "lease_animal_monthly_rent_increase"],
  ["e85a20f3-79c8-4d34-8ff1-6acb553e693e", "lease_animal_nonrefundable_fee"],
  ["68a9dbe1-6279-4625-b9b4-159ec3f0bb7b", "lease_animal_restrictions"],
  ["f0189495-7057-4a99-9e0a-a8068c3b2a38", "lease_animal_violation_daily_charge"],
  ["210e04f0-8a82-4b2a-ae37-30d4730fa335", "lease_animal_violation_initial_charge"],
  ["d0f91c5f-17e0-49b3-a29d-f7b55caed3ad", "lease_animals_not_permitted"],
  ["2eb503cf-0f81-44a6-8a36-a82acd3c8764", "lease_animals_permitted"],
  ["d98cb166-d2cb-41ff-aaf9-39bc5fd18c94", "lease_broker_fee_all_rents_percent"],
  ["80a9d9c8-63c2-4962-ab7e-118afde564f1", "lease_broker_fee_one_month_percent"],
  ["85e5d1ed-d5f4-4549-8b46-03a45771d569", "lease_broker_fee_other"],
  ["4b0da080-698a-4037-a439-62458afaa24d", "lease_early_withdrawal_fee"],
  ["81c141e9-b296-4861-9bd5-e57222ac980b", "lease_emergency_repair_phone"],
  ["b021bc15-28df-4a53-a206-2bd496ad9634", "lease_guest_days"],
  ["3ee5158f-abb0-4264-b650-f8fa059560a8", "lease_health_safety_condition_exception"],
  ["4ca595dd-4a8e-4ae1-9dc1-e2dd0be7bb2e", "lease_hoa_is_subject"],
  ["abf614b4-7a43-4bf4-95f5-3db0115865e3", "lease_initial_late_charge_amount"],
  ["575dd856-b906-4e3d-a53e-16b6cc727271", "lease_initial_late_charge_percent"],
  ["a92062be-4b38-4344-8818-7322bc84b789", "lease_inventory_condition_form_days"],
  ["2b65e5e7-5e35-4c03-b573-b5ed7eedc624", "lease_items_not_repaired"],
  ["5a36203e-a720-4a7b-bae6-77787e00ea13", "lease_keybox_authorized_yes"],
  ["0b40ecae-ceaf-4dd3-8a61-84679baf7fdd", "lease_keybox_last_days"],
  ["caa9d332-f6c4-40ed-9377-4706f0b9539d", "lease_known_financial_obligations_exception"],
  ["c06fa26e-190c-4859-8abf-fa3ef919dfd2", "lease_known_liens_exception"],
  ["e7d93b5d-1363-4e93-a573-9fd896fb3a58", "lease_late_charges_incurred_day"],
  ["0edc25f8-0f3e-4ba9-b3fe-302779f8700f", "lease_listing_begin_date"],
  ["ca451635-4830-40ac-86b4-8888a8cc79d9", "lease_listing_end_date"],
  ["36688331-3eca-4c40-b8ac-62eef3ceed6a", "lease_listing_exclusions"],
  ["95e01faa-c1e5-4c54-b725-01e889ace000", "lease_make_ready_broker_reimbursed"],
  ["f4efec0b-ddc5-4f9e-aa72-875873c9cd93", "lease_make_ready_cost_cap"],
  ["3cf1d9b7-c6fe-4a3a-a3d4-59e18c9dc006", "lease_make_ready_direct_service_fee"],
  ["6d6524c0-545b-4d62-9a30-804eb9e86828", "lease_make_ready_landlord_pays_contractors"],
  ["26fffea6-98e4-430f-82f8-cccfd4e87e8e", "lease_make_ready_reimbursement_service_fee"],
  ["0e089390-6e61-460a-a296-5d11b3c715d5", "lease_mls_delayed_days"],
  ["e4daf38a-7766-4d69-88f7-4abb20ee16d3", "lease_mls_delayed_purpose"],
  ["16fdab10-cb33-4b9f-b36e-fe6beafa887a", "lease_monthly_rent"],
  ["8c98c455-6bcf-4284-805a-8525cc27f191", "lease_no_coop_all_rents_percent"],
  ["80d604ad-7709-4820-8f36-49ed20948dbf", "lease_no_coop_one_month_percent"],
  ["7c3a1be2-6965-4df4-87f1-3d3d297a318c", "lease_no_coop_other"],
  ["ad6e89a8-24ef-4ba7-adaa-18ef862d39df", "lease_non_real_estate_items"],
  ["fd46b700-a54b-40be-85f5-b5860c9c2c30", "lease_optional_common_area_fees_exception"],
  ["0c09c53f-b46c-4288-8d71-fd65480c18a6", "lease_other_broker_all_rents_percent"],
  ["5e71079e-1d6d-4468-9c96-d634dc11145a", "lease_other_broker_flat_fee"],
  ["696596bb-37d1-4de9-a1c5-1026dbc46c23", "lease_other_broker_one_month_percent"],
  ["9d219600-328c-4ff8-a8ee-66a32672446b", "lease_payment_county"],
  ["6dbd51c9-22a8-4390-90ca-df70c174be1b", "lease_protection_period_days"],
  ["6d96793e-2d22-4698-9efc-8c6b4cc581ca", "lease_reimbursable_expenses"],
  ["6873ddb9-1f51-4fc3-90e8-adc120f82b28", "lease_renewal_all_rents_percent"],
  ["cbadad81-daec-43f9-ab06-cbfd803a3403", "lease_renewal_one_month_percent"],
  ["615997d0-2101-4bc8-b486-dde57cfc79da", "lease_renewal_other"],
  ["18cb36cf-2605-4dda-a514-12e511b408f3", "lease_rent_due_first_day"],
  ["124b6f29-f351-41b2-ac59-cb85ea0496b1", "lease_rent_due_other"],
  ["a496985e-8330-4917-9689-95a7740df730", "lease_replacement_tenant_by_landlord_amount"],
  ["a0424ba7-3e57-465d-b319-0f7137e7d703", "lease_replacement_tenant_by_landlord_percent"],
  ["46d31f30-1d01-4588-881c-66d02299a3f7", "lease_replacement_tenant_by_tenant_amount"],
  ["eed07b60-ee1d-4063-bbae-9a74504119b1", "lease_replacement_tenant_by_tenant_percent"],
  ["3e300d54-69f1-4465-97ba-5e7ceec8af05", "lease_requirements_other"],
  ["f65af418-e26e-4240-8f6d-6dea3cc9339d", "lease_requirements_special_provisions"],
  ["1fd3cc39-888b-441c-96df-1b4e764ada05", "lease_sale_comp_other"],
  ["b27cad14-4a0b-435f-a8a3-6010fac80f96", "lease_sale_comp_percent"],
  ["72cdf8b6-cbe1-43d1-8c6e-c427bff8741d", "LEASE_SCHEDULING_COMPANY"],
  ["223818dc-8761-4532-a660-c713e54f2b04", "lease_security_deposit"],
  ["9a528faa-ffa9-43e4-9482-1e43347d78de", "lease_special_provisions"],
  ["1e3fee3a-b69c-4a19-ba72-3c5770e71f85", "lease_tenant_liability_insurance_amount"],
  ["058a7c87-4a03-4823-ad49-2ae70bf71695", "lease_tenant_utilities_except"],
  ["4ed130ce-286e-4ecc-a5df-3ae269bb051f", "lease_term_max_months"],
  ["2332dd93-1a68-45d2-b2cd-37bc92ea290c", "lease_term_min_months"],
  ["eed663c9-baec-4e74-84fd-1dc84faab4e2", "lease_trip_charge"],
  ["15014dca-295e-4b8d-a87c-f76d8972cfa4", "lease_vehicle_count"],
  ["1ddc27b2-696f-4be3-981a-75dac8a93988", "listing_add_authorization_to_advertise"],
  ["bf992d23-5386-46dc-a2c7-f626eaaf24bc", "listing_add_condo_addendum"],
  ["55b4fbd9-5b43-49da-b946-3a75eaa72d29", "listing_add_hoa_request"],
  ["bdaed756-a207-49e0-bc12-a93dca6e52a7", "listing_add_keybox_tenant"],
  ["d923dc04-8c87-47a2-b6d1-aea0c5b9cd23", "listing_add_lead_paint"],
  ["d5763dc1-8999-4644-a23a-6c8fd4e69731", "LISTING_ADD_MINERAL_INFO"],
  ["86f649c1-33a5-468e-828c-f8ea1e4be53a", "listing_add_mortgage_info_request"],
  ["9ba3280c-d0d5-4e68-ba86-39ca6970a15d", "listing_add_mud_notice"],
  ["1da6fc90-94c8-4cbe-b993-42a8faf6ef9c", "listing_add_onsite_sewer_info"],
  ["4be5d8ba-a83e-4f30-8156-d968e4946c81", "listing_add_pid_notice"],
  ["d5944d77-d968-489a-be3f-88f8b88016ec", "LISTING_ADD_SELLERS_DISCLOSURE"],
  ["ef2f3e82-ccbe-44d1-b4c7-418cee034fff", "listing_add_t47"],
  ["576bb033-ca17-44bd-9bbb-28db7557e30b", "listing_begin_date"],
  ["198de3ac-d7f2-433f-981c-5c4bcabbae9e", "listing_broker_no_coop_flat_fee"],
  ["b9a56364-5a85-404e-a38c-ccd338b4a4d1", "listing_broker_no_coop_other"],
  ["4e793615-0774-4a17-b7a0-4c9fe05bb494", "listing_broker_no_coop_percent"],
  ["517f40e5-2f2a-45ee-a87a-d4cb63f6db52", "listing_commission_percent"],
  ["fca33d6f-269d-4081-9d54-2c7e56783542", "listing_compensation_other"],
  ["10c868dd-0d54-45d9-b342-ac28eeb507f6", "LISTING_COMPENSATION_OTHER_CHECKBOX"],
  ["833e6118-82da-4266-a0a7-51af14c1af34", "listing_end_date"],
  ["4861d3dd-ad35-4a65-827b-a6266486f7da", "LISTING_EXCLUSIONS"],
  ["2fc32a2d-7d83-4cdb-9bea-1240139f5db2", "listing_flat_fee"],
  ["6a7d8db2-3eab-4cf0-b494-60cd605ccd37", "listing_hoa_is_subject"],
  ["4cb5280f-65e4-4419-8c02-aab5f283ce2a", "LISTING_INTERMEDIARY_YES"],
  ["767b8770-df87-41b3-9ff7-628d4a807824", "listing_price"],
  ["e5fb0efa-1301-475c-bc95-db0868262446", "mls_delayed_days"],
  ["adc116b2-b368-4bd3-bd77-25472b867277", "mls_delayed_purpose"],
  ["54300c4c-ffed-4dce-9fb0-e43ec9869e6a", "OTHER_FEES_REIMBURSABLE_EXPENSES"],
  ["1c7ef2a8-0842-4a84-80ac-4e69a8ec2437", "SCHEDULING_COMPANY"],
  ["4918b65c-8e05-45a4-abe4-70be98750ec8", "seller_authorizes_buyer_expense_disclosure_yes"],
  ["8f6f5e5b-b5ee-4f67-bad0-b3accfa6fd4b", "seller_is_foreign_person"],
];

/**
 * The three Listing compensation custom-resolver fields that depend on
 * dormant listing_agreement_details columns.
 */
const APPROVED_CUSTOM_RESOLVER_FIELDS: ReadonlyArray<[string, string, string]> = [
  ["d4df5101-03a3-45d3-ac91-c8431415121e", "listing_broker_no_coop_other_selected", "listing_broker_no_coop_other_selected"],
  ["04809612-794c-4a41-bf92-3d3f016dbbb7", "listing_broker_no_coop_percent_or_flat_fee_selected", "listing_broker_no_coop_percent_or_flat_fee_selected"],
  ["b0548c8b-c4f7-44f9-8328-9c14899e09e7", "SELLER_IS_NOT_FOREIGN_PERSON", "seller_is_not_foreign_person"],
];

const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

function migrationUuidLiterals(sql: string): string[] {
  return [
    ...sql.matchAll(
      /'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/g,
    ),
  ].map((match) => match[1]);
}

describe("listing source cleanup migration safety", () => {
  it("targets exactly the 129 verified listing field IDs plus 3 custom resolvers", () => {
    assert.equal(APPROVED_LISTING_FIELD_IDS.length, 129);
    assert.equal(APPROVED_CUSTOM_RESOLVER_FIELDS.length, 3);

    const uuids = migrationUuidLiterals(migrationSql);
    const approved = new Set([
      ...APPROVED_LISTING_FIELD_IDS.map(([id]) => id),
      ...APPROVED_CUSTOM_RESOLVER_FIELDS.map(([id]) => id),
    ]);

    for (const [id, key] of APPROVED_LISTING_FIELD_IDS) {
      assert.ok(
        uuids.includes(id),
        `migration is missing approved listing field ${key} (${id})`,
      );
    }
    for (const [id, key] of APPROVED_CUSTOM_RESOLVER_FIELDS) {
      assert.ok(
        uuids.includes(id),
        `migration is missing approved custom field ${key} (${id})`,
      );
    }

    for (const uuid of uuids) {
      assert.ok(
        approved.has(uuid),
        `migration references unapproved uuid ${uuid}`,
      );
    }
  });

  it("converts listing fields to manual_only with a null source path", () => {
    assert.match(
      migrationSql,
      /set source_type = 'manual_only',\s*source_path = null/,
    );
  });

  it("clears resolver_key on the approved custom-resolver cohort", () => {
    assert.match(
      migrationSql,
      /set source_type = 'manual_only',\s*source_path = null,\s*resolver_key = null/,
    );
    for (const [, , resolver] of APPROVED_CUSTOM_RESOLVER_FIELDS) {
      assert.ok(
        migrationSql.includes("'" + resolver + "'"),
        `migration must require resolver_key ${resolver}`,
      );
    }
  });

  it("requires expected current source_type and status on listing rows", () => {
    assert.match(
      migrationSql,
      /where id = any \(v_listing_approved\)\s*and status = 'ACTIVE'\s*and source_type = 'listing_agreement_details'/,
    );
  });

  it("asserts no ACTIVE listing_agreement_details sources remain", () => {
    assert.match(
      migrationSql,
      /ACTIVE fields still sourced from listing_agreement_details/,
    );
  });

  it("only updates the fields table (mappings, instances, defaults untouched)", () => {
    const updateTargets = [
      ...migrationSql.matchAll(/update\s+(public\.\w+)/gi),
    ].map((match) => match[1]);
    assert.ok(updateTargets.length > 0);
    for (const target of updateTargets) {
      assert.equal(target, "public.fields");
    }
    assert.doesNotMatch(migrationSql, /delete\s+from/i);
    assert.doesNotMatch(migrationSql, /insert\s+into/i);
    assert.doesNotMatch(migrationSql, /drop\s+table/i);
    assert.doesNotMatch(migrationSql, /alter\s+table/i);
  });

  it("does not change coordinates, widget types, status, or defaults", () => {
    const setClauses = [
      ...migrationSql.matchAll(
        /update\s+public\.fields\s+set\s+([\s\S]*?)\s+where/gi,
      ),
    ].map((match) => match[1]);
    const allowed = new Set(["source_type", "source_path", "resolver_key"]);
    for (const clause of setClauses) {
      for (const assignment of clause.split(",")) {
        const column = assignment.trim().split("=")[0]?.trim();
        assert.ok(
          column && allowed.has(column),
          `migration sets unexpected column: ${column}`,
        );
      }
    }
  });

  it("does not introduce Global preference literals", () => {
    assert.doesNotMatch(migrationSql, /set\s+default_value/i);
    assert.doesNotMatch(migrationSql, /set\s+default_checked/i);
    assert.doesNotMatch(migrationSql, /set\s+fallback_value/i);
  });

  it("is rerun-safe: allows a fully converted set on rerun", () => {
    assert.match(
      migrationSql,
      /v_listing_pending <> v_listing_expected and v_listing_pending <> 0/,
    );
    assert.match(
      migrationSql,
      /v_custom_pending <> v_custom_expected and v_custom_pending <> 0/,
    );
  });

  it("does not delete the historical listing_agreement_details row or table", () => {
    assert.doesNotMatch(migrationSql, /from\s+public\.listing_agreement_details/i);
    assert.doesNotMatch(migrationSql, /drop\s+table\s+.*listing_agreement_details/i);
  });
});

describe("converted listing fields resolve through scoped defaults", () => {
  function scopedDefault(
    overrides: Partial<FieldDefault> &
      Pick<FieldDefault, "id" | "scope" | "field_id">,
  ): FieldDefault {
    return {
      create_date: "2026-07-20T00:00:00Z",
      update_date: "2026-07-20T00:00:00Z",
      status: "ACTIVE",
      form_id: null,
      form_field_mapping_id: null,
      owner_user_id: overrides.scope === "PRIVATE" ? LEE_USER_ID : null,
      organization_id:
        overrides.scope === "ORGANIZATION" ? DAVEY_ORG_ID : null,
      default_value: null,
      default_checked: null,
      created_by_user_id: null,
      updated_by_user_id: null,
      notes: null,
      ...overrides,
    };
  }

  // Live + newly approved Lee Personal form-specific NA defaults for TXR-1101.
  const liveDefaults: FieldDefault[] = [
    scopedDefault({
      id: "d-exclusions",
      scope: "PRIVATE",
      field_id: "4861d3dd-ad35-4a65-827b-a6266486f7da",
      form_id: TXR_1101_FORM_ID,
      default_value: "NA",
    }),
    scopedDefault({
      id: "d-liens",
      scope: "PRIVATE",
      field_id: "b4fa63a8-2107-4fda-b5ec-c06ba3e85884",
      form_id: TXR_1101_FORM_ID,
      default_value: "NA",
    }),
    scopedDefault({
      id: "d-financial",
      scope: "PRIVATE",
      field_id: "b08bb4a1-95ec-4824-92cc-36a3a0601e90",
      form_id: TXR_1101_FORM_ID,
      default_value: "NA",
    }),
    scopedDefault({
      id: "d-employer",
      scope: "PRIVATE",
      field_id: "998b7869-bc45-4686-a75c-e60cd3581b78",
      form_id: TXR_1101_FORM_ID,
      default_value: "NA",
    }),
    scopedDefault({
      id: "d-districts",
      scope: "PRIVATE",
      field_id: KNOWN_DISTRICTS_FIELD_ID,
      form_id: TXR_1101_FORM_ID,
      default_value: "NA",
    }),
    scopedDefault({
      id: "d-other-fees",
      scope: "PRIVATE",
      field_id: OTHER_FEES_FIELD_ID,
      form_id: TXR_1101_FORM_ID,
      default_value: "NA",
    }),
    scopedDefault({
      id: "d-keybox",
      scope: "PRIVATE",
      field_id: "4c8b9d81-896a-4516-8236-28266ff077a8",
      default_checked: true,
    }),
    scopedDefault({
      id: "d-intermediary",
      scope: "PRIVATE",
      field_id: "4cb5280f-65e4-4419-8c02-aab5f283ce2a",
      default_checked: true,
    }),
    scopedDefault({
      id: "d-scheduling",
      scope: "ORGANIZATION",
      field_id: "1c7ef2a8-0842-4a84-80ac-4e69a8ec2437",
      default_value: "Broker Bay",
    }),
    scopedDefault({
      id: "d-seller-not-foreign",
      scope: "PRIVATE",
      field_id: "b0548c8b-c4f7-44f9-8328-9c14899e09e7",
      default_checked: true,
    }),
  ];

  const lookup = buildScopedDefaultLookup(liveDefaults);

  it("resolves KNOWN_DISTRICTS to Lee Personal NA", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: KNOWN_DISTRICTS_FIELD_ID,
      formId: TXR_1101_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.value, "NA");
    assert.equal(resolved?.source, "private_default");
  });

  it("resolves OTHER_FEES_REIMBURSABLE_EXPENSES to Lee Personal NA", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: OTHER_FEES_FIELD_ID,
      formId: TXR_1101_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.value, "NA");
    assert.equal(resolved?.source, "private_default");
  });

  it("keeps existing Personal NA text defaults resolving after conversion", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: "4861d3dd-ad35-4a65-827b-a6266486f7da",
      formId: TXR_1101_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.value, "NA");
    assert.equal(resolved?.source, "private_default");
  });

  it("keeps Organization Broker Bay defaults resolving", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: "1c7ef2a8-0842-4a84-80ac-4e69a8ec2437",
      formId: TXR_1101_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.value, "Broker Bay");
    assert.equal(resolved?.source, "organization_default");
  });

  it("keeps legacy all-forms checkbox-true defaults resolving", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: "4c8b9d81-896a-4516-8236-28266ff077a8",
      formId: TXR_1101_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.value, "true");
    assert.deepEqual(resolved?.value_json, { checked: true });
  });

  it("keeps unchecked-false distinct from no-default", () => {
    const noDefault = resolveScopedPreferenceDefault({
      lookup,
      fieldId: "767b8770-df87-41b3-9ff7-628d4a807824", // listing_price
      formId: TXR_1101_FORM_ID,
      mappingId: null,
    });
    assert.equal(noDefault, null);

    const booleanTail = { value: "false", value_json: { checked: false } };
    assert.equal(booleanTail.value, "false");
    assert.equal(booleanTail.value_json.checked, false);
  });

  it("preserves numeric zero as a real value, not blank", () => {
    const withZero = buildScopedDefaultLookup([
      scopedDefault({
        id: "d-zero",
        scope: "PRIVATE",
        field_id: "517f40e5-2f2a-45ee-a87a-d4cb63f6db52",
        form_id: TXR_1101_FORM_ID,
        default_value: "0",
      }),
    ]);
    const resolved = resolveScopedPreferenceDefault({
      lookup: withZero,
      fieldId: "517f40e5-2f2a-45ee-a87a-d4cb63f6db52",
      formId: TXR_1101_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.value, "0");
    assert.notEqual(resolved?.value, "");
  });

  it("does not leak Lee defaults to Yahoo", () => {
    const yahooLookup = buildScopedDefaultLookup([]);
    for (const fieldId of [KNOWN_DISTRICTS_FIELD_ID, OTHER_FEES_FIELD_ID]) {
      const resolved = resolveScopedPreferenceDefault({
        lookup: yahooLookup,
        fieldId,
        formId: TXR_1101_FORM_ID,
        mappingId: null,
      });
      assert.equal(resolved, null);
    }
    assert.notEqual(LEE_USER_ID, YAHOO_USER_ID);
  });
});

describe("packet snapshots are unchanged by the listing conversion", () => {
  it("ordinary open (ensure_missing) plans no writes for existing instances", () => {
    const existing = new Map([
      [
        "767b8770-df87-41b3-9ff7-628d4a807824",
        {
          id: "inst-price",
          field_id: "767b8770-df87-41b3-9ff7-628d4a807824",
          value: "421,000",
          value_json: null,
          source: "manual_override",
          is_override: true,
        },
      ],
      [
        KNOWN_DISTRICTS_FIELD_ID,
        {
          id: "inst-districts",
          field_id: KNOWN_DISTRICTS_FIELD_ID,
          value: "NA",
          value_json: null,
          source: "field_default",
          is_override: false,
        },
      ],
    ]);

    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: [...existing.keys()],
      existingByFieldId: existing,
      resolveForFieldId: () => {
        throw new Error(
          "ordinary open must not re-resolve fields with existing instances",
        );
      },
    });

    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.updates.length, 0);
    assert.equal(fieldInstanceSyncWouldWrite(plan), false);
  });

  it("new instances for converted fields never carry a listing_agreement_details source", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: [KNOWN_DISTRICTS_FIELD_ID],
      existingByFieldId: new Map(),
      resolveForFieldId: () => ({
        value: "NA",
        value_json: null,
        source: "private_default",
      }),
    });

    assert.equal(plan.inserts.length, 1);
    assert.notEqual(plan.inserts[0].resolved.source, "listing_agreement_details");
    assert.notEqual(plan.inserts[0].resolved.source, "packet");
    assert.equal(plan.inserts[0].resolved.source, "private_default");
  });

  it("converted custom-resolver fields initialize from scoped defaults, not resolvers", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["b0548c8b-c4f7-44f9-8328-9c14899e09e7"],
      existingByFieldId: new Map(),
      resolveForFieldId: () => ({
        value: "true",
        value_json: { checked: true },
        source: "private_default",
      }),
    });

    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0].resolved.source, "private_default");
    assert.notEqual(plan.inserts[0].resolved.source, "packet");
  });

  it("manual Fill Form values override defaults and stay overridden", () => {
    const existing = new Map([
      [
        "4861d3dd-ad35-4a65-827b-a6266486f7da",
        {
          id: "inst-exclusions",
          field_id: "4861d3dd-ad35-4a65-827b-a6266486f7da",
          value: "Washer and dryer",
          value_json: null,
          source: "manual_override",
          is_override: true,
        },
      ],
    ]);

    const plan = planFieldInstanceSyncMutations({
      mode: "refresh_non_overrides",
      fieldIds: [...existing.keys()],
      existingByFieldId: existing,
      resolveForFieldId: () => ({
        value: "NA",
        value_json: null,
        source: "private_default",
      }),
    });

    assert.equal(plan.updates.length, 0);
    assert.equal(fieldInstanceSyncWouldWrite(plan), false);
  });
});
