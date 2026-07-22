import assert from "node:assert/strict";
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

const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
const YAHOO_USER_ID = "8d10af59-f3f8-4a48-94b5-3477656c02a6";
const DAVEY_ORG_ID = "b788f525-53f4-42ed-b5a1-cb741398a974";
const TXR_1102_FORM_ID = 15;

/** Reviewed Lee Personal TXR-1102 form-specific defaults created 2026-07-22. */
const NA_FIELDS: ReadonlyArray<[string, string]> = [
  ["ad6e89a8-24ef-4ba7-adaa-18ef862d39df", "lease_non_real_estate_items"],
  ["36688331-3eca-4c40-b8ac-62eef3ceed6a", "lease_listing_exclusions"],
  ["6d96793e-2d22-4698-9efc-8c6b4cc581ca", "lease_reimbursable_expenses"],
  ["caa9d332-f6c4-40ed-9377-4706f0b9539d", "lease_known_financial_obligations_exception"],
  ["c06fa26e-190c-4859-8abf-fa3ef919dfd2", "lease_known_liens_exception"],
  ["fd46b700-a54b-40be-85f5-b5860c9c2c30", "lease_optional_common_area_fees_exception"],
  ["3ee5158f-abb0-4264-b650-f8fa059560a8", "lease_health_safety_condition_exception"],
  ["9a528faa-ffa9-43e4-9482-1e43347d78de", "lease_special_provisions"],
  ["058a7c87-4a03-4823-ad49-2ae70bf71695", "lease_tenant_utilities_except"],
  ["2b65e5e7-5e35-4c03-b573-b5ed7eedc624", "lease_items_not_repaired"],
  ["f65af418-e26e-4240-8f6d-6dea3cc9339d", "lease_requirements_special_provisions"],
  ["3e300d54-69f1-4465-97ba-5e7ceec8af05", "lease_requirements_other"],
];

const TEXT_NUM_FIELDS: ReadonlyArray<[string, string, string]> = [
  ["6dbd51c9-22a8-4390-90ca-df70c174be1b", "lease_protection_period_days", "30"],
  ["9d219600-328c-4ff8-a8ee-66a32672446b", "lease_payment_county", "Dallas/Tarrant"],
  ["e7d93b5d-1363-4e93-a573-9fd896fb3a58", "lease_late_charges_incurred_day", "2"],
];

const CHECKED_FIELDS: ReadonlyArray<[string, string]> = [
  ["ef8a543e-e67e-4969-95bf-9df7237e5240", "lease_mls_file_immediately"],
  ["5a36203e-a720-4a7b-bae6-77787e00ea13", "lease_keybox_authorized_yes"],
  ["7c7f3f2f-8be3-4f5a-a607-3af47fe20a55", "lease_intermediary_yes"],
  ["8d7f2a93-a394-433d-8294-ca546bb15ff3", "lease_add_iabs"],
  ["18cb36cf-2605-4dda-a514-12e511b408f3", "lease_rent_due_first_day"],
];

const CONDITIONAL_BLANK_FIELDS: ReadonlyArray<[string, string]> = [
  ["85e5d1ed-d5f4-4549-8b46-03a45771d569", "lease_broker_fee_other"],
  ["7c3a1be2-6965-4df4-87f1-3d3d297a318c", "lease_no_coop_other"],
  ["615997d0-2101-4bc8-b486-dde57cfc79da", "lease_renewal_other"],
  ["1fd3cc39-888b-441c-96df-1b4e764ada05", "lease_sale_comp_other"],
  ["e4daf38a-7766-4d69-88f7-4abb20ee16d3", "lease_mls_delayed_purpose"],
  ["3cf1d9b7-c6fe-4a3a-a3d4-59e18c9dc006", "lease_make_ready_direct_service_fee"],
  ["26fffea6-98e4-430f-82f8-cccfd4e87e8e", "lease_make_ready_reimbursement_service_fee"],
  ["f93e9ef9-64e1-435f-9fa9-7a246c8b7607", "lease_add_other_document_description"],
  ["124b6f29-f351-41b2-ac59-cb85ea0496b1", "lease_rent_due_other"],
  ["68a9dbe1-6279-4625-b9b4-159ec3f0bb7b", "lease_animal_restrictions"],
];

const MLS_FILE_LISTING_FIELD_ID = "a03de7f8-f01b-4e89-b9ae-3fbc6c3266a4";
const SCHEDULING_COMPANY_FIELD_ID = "72cdf8b6-cbe1-43d1-8c6e-c427bff8741d";

function scopedDefault(
  overrides: Partial<FieldDefault> & Pick<FieldDefault, "id" | "scope" | "field_id">,
): FieldDefault {
  return {
    create_date: "2026-07-22T00:00:00Z",
    update_date: "2026-07-22T00:00:00Z",
    status: "ACTIVE",
    form_id: TXR_1102_FORM_ID,
    form_field_mapping_id: null,
    owner_user_id: overrides.scope === "PRIVATE" ? LEE_USER_ID : null,
    organization_id: overrides.scope === "ORGANIZATION" ? DAVEY_ORG_ID : null,
    default_value: null,
    default_checked: null,
    created_by_user_id: LEE_USER_ID,
    updated_by_user_id: LEE_USER_ID,
    notes: null,
    ...overrides,
  };
}

function leeTxr1102Lookup(): ReturnType<typeof buildScopedDefaultLookup> {
  const rows: FieldDefault[] = [
    ...NA_FIELDS.map(([fieldId], i) =>
      scopedDefault({
        id: `na-${i}`,
        scope: "PRIVATE",
        field_id: fieldId,
        default_value: "NA",
      }),
    ),
    ...TEXT_NUM_FIELDS.map(([fieldId, , value], i) =>
      scopedDefault({
        id: `tn-${i}`,
        scope: "PRIVATE",
        field_id: fieldId,
        default_value: value,
      }),
    ),
    ...CHECKED_FIELDS.map(([fieldId], i) =>
      scopedDefault({
        id: `ck-${i}`,
        scope: "PRIVATE",
        field_id: fieldId,
        default_checked: true,
      }),
    ),
    scopedDefault({
      id: "org-broker-bay",
      scope: "ORGANIZATION",
      field_id: SCHEDULING_COMPANY_FIELD_ID,
      form_id: null,
      default_value: "Broker Bay",
      owner_user_id: null,
      organization_id: DAVEY_ORG_ID,
    }),
  ];
  return buildScopedDefaultLookup(rows);
}

describe("TXR-1102 reviewed Personal form-specific defaults", () => {
  const lookup = leeTxr1102Lookup();

  it("defines exactly 20 Lee form-specific defaults (12 NA + 3 text/num + 5 checked)", () => {
    assert.equal(NA_FIELDS.length, 12);
    assert.equal(TEXT_NUM_FIELDS.length, 3);
    assert.equal(CHECKED_FIELDS.length, 5);
    assert.equal(
      NA_FIELDS.length + TEXT_NUM_FIELDS.length + CHECKED_FIELDS.length,
      20,
    );
  });

  it("initializes all 12 approved narrative fields to NA for Lee on TXR-1102", () => {
    for (const [fieldId] of NA_FIELDS) {
      const resolved = resolveScopedPreferenceDefault({
        lookup,
        fieldId,
        formId: TXR_1102_FORM_ID,
        mappingId: null,
      });
      assert.equal(resolved?.source, "private_default");
      assert.equal(resolved?.value, "NA");
      assert.equal(resolved?.value_json, null);
    }
  });

  it("preserves protection period 30, county Dallas/Tarrant, and late day 2", () => {
    for (const [fieldId, , value] of TEXT_NUM_FIELDS) {
      const resolved = resolveScopedPreferenceDefault({
        lookup,
        fieldId,
        formId: TXR_1102_FORM_ID,
        mappingId: null,
      });
      assert.equal(resolved?.source, "private_default");
      assert.equal(resolved?.value, value);
    }
  });

  it("initializes the five approved checkboxes as checked", () => {
    for (const [fieldId] of CHECKED_FIELDS) {
      const resolved = resolveScopedPreferenceDefault({
        lookup,
        fieldId,
        formId: TXR_1102_FORM_ID,
        mappingId: null,
      });
      assert.equal(resolved?.source, "private_default");
      assert.equal(resolved?.value, "true");
      assert.deepEqual(resolved?.value_json, { checked: true });
    }
  });

  it("leaves MLS file listing without a Lee TXR-1102 checked default", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: MLS_FILE_LISTING_FIELD_ID,
      formId: TXR_1102_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved, null);
  });

  it("keeps all 10 conditional / Other / exclusive-branch fields without Lee defaults", () => {
    assert.equal(CONDITIONAL_BLANK_FIELDS.length, 10);
    for (const [fieldId] of CONDITIONAL_BLANK_FIELDS) {
      const resolved = resolveScopedPreferenceDefault({
        lookup,
        fieldId,
        formId: TXR_1102_FORM_ID,
        mappingId: null,
      });
      assert.equal(resolved, null);
    }
  });

  it("preserves Organization Broker Bay on LEASE_SCHEDULING_COMPANY without a Personal duplicate", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: SCHEDULING_COMPANY_FIELD_ID,
      formId: TXR_1102_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.source, "organization_default");
    assert.equal(resolved?.value, "Broker Bay");

    const personalDup = lookup.privateDefaults.find(
      (row) =>
        row.field_id === SCHEDULING_COMPANY_FIELD_ID &&
        row.form_id === TXR_1102_FORM_ID,
    );
    assert.equal(personalDup, undefined);
  });

  it("does not leak Lee TXR-1102 defaults to Yahoo", () => {
    const yahooLookup = buildScopedDefaultLookup([
      scopedDefault({
        id: "org-broker-bay-yahoo",
        scope: "ORGANIZATION",
        field_id: SCHEDULING_COMPANY_FIELD_ID,
        form_id: null,
        default_value: "Broker Bay",
        owner_user_id: null,
        organization_id: DAVEY_ORG_ID,
      }),
    ]);

    for (const [fieldId] of [
      ...NA_FIELDS,
      ...TEXT_NUM_FIELDS.map(([id, key]) => [id, key] as const),
      ...CHECKED_FIELDS,
    ]) {
      const resolved = resolveScopedPreferenceDefault({
        lookup: yahooLookup,
        fieldId,
        formId: TXR_1102_FORM_ID,
        mappingId: null,
      });
      assert.equal(resolved, null);
    }

    const scheduling = resolveScopedPreferenceDefault({
      lookup: yahooLookup,
      fieldId: SCHEDULING_COMPANY_FIELD_ID,
      formId: TXR_1102_FORM_ID,
      mappingId: null,
    });
    assert.equal(scheduling?.source, "organization_default");
    assert.equal(scheduling?.value, "Broker Bay");
    assert.notEqual(LEE_USER_ID, YAHOO_USER_ID);
  });

  it("does not invent Organization or Global duplicates for the 20 Personal defaults", () => {
    for (const row of lookup.privateDefaults) {
      assert.equal(row.scope, "PRIVATE");
      assert.equal(row.owner_user_id, LEE_USER_ID);
      assert.equal(row.organization_id, null);
      assert.equal(row.form_id, TXR_1102_FORM_ID);
      assert.equal(row.form_field_mapping_id, null);
      assert.equal(row.status, "ACTIVE");
    }
    assert.equal(lookup.organizationDefaults.length, 1);
    assert.equal(lookup.organizationDefaults[0]?.field_id, SCHEDULING_COMPANY_FIELD_ID);
  });
});

describe("TXR-1102 packet snapshot immutability with new defaults present", () => {
  it("ordinary open (ensure_missing) plans no writes for existing instances", () => {
    const [firstNaId] = NA_FIELDS[0];
    const [firstCheckedId] = CHECKED_FIELDS[0];
    const existing = new Map([
      [
        firstNaId,
        {
          id: "inst-na",
          field_id: firstNaId,
          value: "",
          value_json: null,
          source: "empty",
          is_override: false,
        },
      ],
      [
        firstCheckedId,
        {
          id: "inst-check",
          field_id: firstCheckedId,
          value: "false",
          value_json: { checked: false },
          source: "empty",
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

  it("new-instance insert path would apply NA and checked defaults", () => {
    const lookup = leeTxr1102Lookup();
    const [naId] = NA_FIELDS[0];
    const [checkedId] = CHECKED_FIELDS[0];

    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: [naId, checkedId],
      existingByFieldId: new Map(),
      resolveForFieldId: (fieldId) => {
        const resolved = resolveScopedPreferenceDefault({
          lookup,
          fieldId,
          formId: TXR_1102_FORM_ID,
          mappingId: null,
        });
        if (!resolved) {
          return {
            value: "",
            value_json: null,
            source: "empty",
            is_override: false,
          };
        }
        return {
          value: resolved.value,
          value_json: resolved.value_json,
          source:
            resolved.source === "private_default"
              ? "field_default"
              : "field_default",
          is_override: false,
        };
      },
    });

    assert.equal(plan.inserts.length, 2);
    assert.equal(plan.updates.length, 0);
    const byField = new Map(plan.inserts.map((row) => [row.fieldId, row]));
    assert.equal(byField.get(naId)?.resolved.value, "NA");
    assert.equal(byField.get(naId)?.resolved.source, "field_default");
    assert.equal(byField.get(checkedId)?.resolved.value, "true");
    assert.deepEqual(byField.get(checkedId)?.resolved.value_json, {
      checked: true,
    });
  });
});
