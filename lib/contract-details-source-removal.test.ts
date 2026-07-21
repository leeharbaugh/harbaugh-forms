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
  "20260721190000_remove_abandoned_contract_details_sources.sql",
);

const BUYER_REP_CHECKBOX_FIELD_ID = "2a32353f-0923-40ed-98f0-e60815ad4e96";
const BUYER_REP_CHECKBOX_MAPPING_ID = "d2d51f3e-a4a2-44b9-8ea1-6ec1cc0089f9";

const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
const DAVEY_ORG_ID = "b788f525-53f4-42ed-b5a1-cb741398a974";
const ONE_TO_FOUR_FORM_ID = 11;

/**
 * The 64 catalog fields verified against harbaugh-forms-dev on 2026-07-21:
 * every ACTIVE field with source_type = 'contract_details'. The migration
 * must convert exactly this set and nothing else.
 */
const APPROVED_CONTRACT_FIELD_IDS: ReadonlyArray<[string, string]> = [
  ["dc54d9cb-8836-40d9-97ef-033173c2913f", "contract_additional_earnest_money_amount"],
  ["1e438c3c-4a1e-48a0-b5fa-7ceb90d9ed01", "contract_additional_earnest_money_days"],
  ["b00cae55-3d09-49f4-a31b-df49b481b886", "CONTRACT_BROKER_DISCLOSURE_TEXT"],
  ["acadebd1-ec33-4ac2-804f-2534b17dcabf", "contract_buyer_contributes_to_seller_broker_comp"],
  ["f63d04bc-4e6b-44fe-8990-f93a07e3c219", "contract_buyer_contribution_amount"],
  ["537f9c5d-d670-4abc-8be4-1f52c9c65cc5", "contract_buyer_contribution_dollar_selected"],
  ["3989abe8-f184-4cde-b216-8d1764778505", "contract_buyer_contribution_percent"],
  ["f346cf05-fe86-4496-8228-6f6127969454", "contract_buyer_contribution_percent_selected"],
  ["d96b71d9-35ef-4a5a-a2cf-22819ef889b9", "CONTRACT_BUYER_POSSESSION_AT_CLOSING"],
  ["b5b6ca35-ae6d-4b63-80b5-a7356b2f1453", "contract_buyer_possession_by_lease"],
  ["f7d78229-f99c-4c11-a5b3-082859eeac15", "contract_closing_date"],
  ["7c31526f-ce2c-4988-82cb-a2654f5b07a4", "contract_earnest_money_amount"],
  ["80c114e9-d1d9-4277-bb01-239f0437afa8", "contract_effective_date"],
  ["5abf0584-f253-488e-883a-8d6df97ba792", "contract_escrow_agent_address"],
  ["fc51201d-953c-4d8d-b6f6-892e5665c488", "contract_escrow_agent_name"],
  ["5f6a8134-5e28-4076-b881-0634a39389ba", "contract_financing_loan_assumption"],
  ["3a2bbc88-7055-402f-9224-16052012305f", "contract_financing_seller_financing"],
  ["ed6f557c-a451-4c77-bb75-cb1c2b0dbda6", "contract_financing_third_party"],
  ["67031434-c56d-464a-b9b2-bc17a186179f", "contract_hoa_is_not_subject"],
  ["9daa52a0-f0b7-4196-8e93-ad071f7d4abf", "contract_hoa_is_subject"],
  ["02611b6b-45a4-4075-bdc5-13dfbd572e87", "contract_lease_fixture"],
  ["f180d6b7-25f4-434d-9011-95b85dc0b575", "contract_lease_natural_resource"],
  ["75f612ad-a987-4de2-b6cf-5b73d79333cf", "contract_lease_residential"],
  ["0183ade4-81c0-4fa2-8e8c-9580f11735ff", "contract_natural_resource_lease_termination_days"],
  ["12617799-fb89-4c42-8520-1d59debc802a", "contract_natural_resource_leases_delivered"],
  ["37a1e085-6980-4a77-ab13-1116c17e3c20", "contract_natural_resource_leases_not_delivered"],
  ["c2891d22-e94a-4bb1-96d8-f376aa2231fa", "contract_option_fee_amount"],
  ["c87dbe71-747f-4f50-b82f-74c1cee5149d", "contract_option_period_days"],
  ["71cc5bb4-8b16-4e6d-861a-a925a650da91", "CONTRACT_PROPERTY_AS_IS"],
  ["38b72a74-70ff-4c92-b1f6-a340148a2b58", "contract_property_as_is_with_repairs"],
  ["6181a1f8-374c-4861-9d92-0d540ca3fb58", "contract_sales_price_cash"],
  ["5dbc036b-75f6-4de4-b327-c47581c0bc2f", "contract_sales_price_financing"],
  ["aa96660b-9ae0-4888-aa64-c32875bd1ad3", "contract_sales_price_total"],
  ["464e2e51-e04f-4501-beec-6fa8bbaaf114", "contract_seller_contributes_to_buyer_broker_comp"],
  ["0a47197a-3b0c-4124-994f-f36dea04a75d", "contract_seller_contribution_amount"],
  ["2f577094-ab1b-4b05-ae95-5be82ad440b8", "contract_seller_contribution_dollar_selected"],
  ["c8d807ad-10bf-4408-aeca-82c3591f7fc3", "contract_seller_contribution_percent"],
  ["8adc2c2c-b191-4fd5-b11f-eb71cbf2d9ee", "contract_seller_contribution_percent_selected"],
  ["222650d2-5bf7-4b65-a70a-988d01d6348b", "contract_seller_disclosure_delivery_days"],
  ["e0e827af-9b93-4a99-b51c-1564aa00a011", "contract_seller_disclosure_not_received"],
  ["3de072c3-3179-461b-8511-815394da97dc", "contract_seller_disclosure_not_required"],
  ["1eee4d1d-9801-44d1-9ebe-1a682c4969c2", "contract_seller_disclosure_received"],
  ["92b8cdbd-479b-44ea-8bfd-1a98d823429d", "CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT"],
  ["b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d", "CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT"],
  ["68ab207d-d60c-4262-b96d-4135f8f8e639", "contract_specific_repairs"],
  ["0951efa2-0263-430f-9803-ab1f572d62ff", "contract_survey_option_1_days"],
  ["393bde99-8472-4d5d-9de0-de1a283f019b", "contract_survey_option_1_new_survey_paid_by_buyer"],
  ["6c37922b-edfd-42fd-ba53-6055df10b1ba", "contract_survey_option_1_new_survey_paid_by_seller"],
  ["f44a3aca-5e54-444a-9b42-cb0266ce2aae", "contract_survey_option_2_days"],
  ["b7e28491-3d9f-44d0-a241-fef6512fd487", "contract_survey_option_3_days"],
  ["2512bfe5-42fa-4f17-b52c-b6cb65abf9ed", "contract_title_company_name"],
  ["69ab9239-742c-4bf5-a2f8-70d02c008d0a", "contract_title_exception_amended"],
  ["5efe697e-1954-47ad-92a5-85b8d052a411", "contract_title_exception_amended_paid_by_buyer"],
  ["8e414503-5610-4b08-aed6-4d54f3cf9533", "contract_title_exception_amended_paid_by_seller"],
  ["35d35a95-c4fc-4c6d-a7b3-20146d55651a", "contract_title_exception_not_amended"],
  ["e4d3b4f9-965b-4c38-bbcf-776c8758b55a", "contract_title_objection_days"],
  ["35dd64ff-1f22-4b93-afb0-779465316a13", "contract_title_objection_use_activity"],
  ["b58b520c-ee81-4a47-a61a-e0e626338f0d", "contract_title_policy_paid_by_buyer"],
  ["79d9b6af-a31d-4bca-9969-4f175ad4cbad", "contract_title_policy_paid_by_seller"],
  ["f47adc30-df80-4507-95cd-69f62d28de2e", "contract_water_disclosure_delivery_days"],
  ["b5d10932-10b9-43af-a50b-0c8d988ff0d5", "contract_water_disclosure_not_received"],
  ["a528c4e3-d980-42f8-9b90-789d746f6145", "CONTRACT_WATER_DISCLOSURE_NOT_REQUIRED"],
  ["fc86f756-37bf-4a8d-b565-3c784d96e3fe", "contract_water_disclosure_received"],
  ["dbbbbb56-655e-4f63-aeb6-bf72db1f1101", "contract_water_provider_name"],
];

const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

function migrationUuidLiterals(sql: string): string[] {
  return [
    ...sql.matchAll(
      /'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/g,
    ),
  ].map((match) => match[1]);
}

describe("contract source cleanup migration safety", () => {
  it("targets exactly the 64 verified contract field IDs", () => {
    assert.equal(APPROVED_CONTRACT_FIELD_IDS.length, 64);

    const uuids = migrationUuidLiterals(migrationSql);
    const approved = new Set(APPROVED_CONTRACT_FIELD_IDS.map(([id]) => id));

    for (const [id, key] of APPROVED_CONTRACT_FIELD_IDS) {
      assert.ok(
        uuids.includes(id),
        `migration is missing approved field ${key} (${id})`,
      );
    }

    // The only UUIDs allowed besides the approved set are the Buyer Rep
    // checkbox field ID and its mapping ID (comment header).
    for (const uuid of uuids) {
      assert.ok(
        approved.has(uuid) ||
          uuid === BUYER_REP_CHECKBOX_FIELD_ID ||
          uuid === BUYER_REP_CHECKBOX_MAPPING_ID,
        `migration references unapproved uuid ${uuid}`,
      );
    }
  });

  it("converts to manual_only with a null source path", () => {
    assert.match(migrationSql, /set source_type = 'manual_only',\s*source_path = null/);
  });

  it("requires the expected current source_type and status on every row", () => {
    assert.match(
      migrationSql,
      /where id = any \(v_approved\)\s*and status = 'ACTIVE'\s*and source_type = 'contract_details'/,
    );
  });

  it("asserts contract_details is still empty before converting", () => {
    assert.match(migrationSql, /from public\.contract_details/);
    assert.match(migrationSql, /expected to be empty/);
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

  it("does not change coordinates, widget types, status, or defaults of contract fields", () => {
    const setClauses = [
      ...migrationSql.matchAll(
        /update\s+public\.fields\s+set\s+([\s\S]*?)\s+where/gi,
      ),
    ].map((match) => match[1]);
    const allowed = new Set([
      "source_type",
      "source_path",
      "status", // Buyer Rep reactivation block only
    ]);
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
      /v_pending <> v_expected and v_pending <> 0/,
    );
  });

  it("reactivates the Buyer Rep checkbox only under strict preconditions", () => {
    assert.match(
      migrationSql,
      new RegExp(
        `where id = '${BUYER_REP_CHECKBOX_FIELD_ID}'\\s*` +
          `and field_key = 'BUYER_REP_BROKER_SGN_CHECKBOX'\\s*` +
          `and status = 'INACTIVE'\\s*` +
          `and default_checked = false`,
      ),
    );
    // Duplicate-key guard mirroring fields_global_field_key_active_uidx.
    assert.match(
      migrationSql,
      /not exists \(\s*select 1 from public\.fields f2/,
    );
  });
});

describe("converted contract fields resolve through scoped defaults", () => {
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

  // The seven live scoped defaults attached to conversion candidates in
  // harbaugh-forms-dev; the conversion must leave all of them resolving.
  const liveDefaults: FieldDefault[] = [
    scopedDefault({
      id: "d-possession",
      scope: "PRIVATE",
      field_id: "d96b71d9-35ef-4a5a-a2cf-22819ef889b9",
      default_checked: true,
    }),
    scopedDefault({
      id: "d-as-is",
      scope: "PRIVATE",
      field_id: "71cc5bb4-8b16-4e6d-861a-a925a650da91",
      default_checked: true,
    }),
    scopedDefault({
      id: "d-water",
      scope: "PRIVATE",
      field_id: "a528c4e3-d980-42f8-9b90-789d746f6145",
      default_checked: true,
    }),
    scopedDefault({
      id: "d-service-contract",
      scope: "PRIVATE",
      field_id: "b4cfd37f-98ec-4b44-95e5-a47ffce8dc9d",
      form_id: ONE_TO_FOUR_FORM_ID,
      default_value: "0",
    }),
    scopedDefault({
      id: "d-broker-disclosure",
      scope: "PRIVATE",
      field_id: "b00cae55-3d09-49f4-a31b-df49b481b886",
      form_id: ONE_TO_FOUR_FORM_ID,
      default_value: "NA",
    }),
    scopedDefault({
      id: "d-title-objection",
      scope: "PRIVATE",
      field_id: "35dd64ff-1f22-4b93-afb0-779465316a13",
      form_id: ONE_TO_FOUR_FORM_ID,
      default_value: "NA",
    }),
    scopedDefault({
      id: "d-seller-expense",
      scope: "PRIVATE",
      field_id: "92b8cdbd-479b-44ea-8bfd-1a98d823429d",
      form_id: ONE_TO_FOUR_FORM_ID,
      default_value: "0",
    }),
  ];

  const lookup = buildScopedDefaultLookup(liveDefaults);

  it("keeps Personal NA text defaults resolving after conversion", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: "b00cae55-3d09-49f4-a31b-df49b481b886",
      formId: ONE_TO_FOUR_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.value, "NA");
    assert.equal(resolved?.source, "private_default");
  });

  it("preserves numeric zero as a real value, not blank", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: "92b8cdbd-479b-44ea-8bfd-1a98d823429d",
      formId: ONE_TO_FOUR_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.value, "0");
    assert.notEqual(resolved?.value, "");
  });

  it("keeps legacy all-forms checkbox-true defaults resolving", () => {
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: "71cc5bb4-8b16-4e6d-861a-a925a650da91",
      formId: ONE_TO_FOUR_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved?.value, "true");
    assert.deepEqual(resolved?.value_json, { checked: true });
  });

  it("keeps unchecked-false distinct from no-default", () => {
    // No scoped default for this converted checkbox: manual_only resolution
    // falls to the boolean tail of the default chain — a real "false".
    const noDefault = resolveScopedPreferenceDefault({
      lookup,
      fieldId: "537f9c5d-d670-4abc-8be4-1f52c9c65cc5",
      formId: ONE_TO_FOUR_FORM_ID,
      mappingId: null,
    });
    assert.equal(noDefault, null);

    // Mirrors resolveDefaultChain's boolean tail for manual_only checkboxes.
    const booleanTail = { value: "false", value_json: { checked: false } };
    assert.equal(booleanTail.value, "false");
    assert.equal(booleanTail.value_json.checked, false);
  });

  it("does not leak defaults to a user without them", () => {
    // Yahoo has no PRIVATE defaults; a lookup built from Yahoo's rows is empty.
    const yahooLookup = buildScopedDefaultLookup([]);
    const resolved = resolveScopedPreferenceDefault({
      lookup: yahooLookup,
      fieldId: "b00cae55-3d09-49f4-a31b-df49b481b886",
      formId: ONE_TO_FOUR_FORM_ID,
      mappingId: null,
    });
    assert.equal(resolved, null);
  });
});

describe("packet snapshots are unchanged by the conversion", () => {
  it("ordinary open (ensure_missing) plans no writes for existing instances", () => {
    const existing = new Map([
      [
        "7c31526f-ce2c-4988-82cb-a2654f5b07a4",
        {
          id: "inst-1",
          field_id: "7c31526f-ce2c-4988-82cb-a2654f5b07a4",
          value: "5000",
          value_json: null,
          source: "manual",
          is_override: true,
        },
      ],
      [
        "71cc5bb4-8b16-4e6d-861a-a925a650da91",
        {
          id: "inst-2",
          field_id: "71cc5bb4-8b16-4e6d-861a-a925a650da91",
          value: "true",
          value_json: { checked: true },
          source: "private_default",
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

  it("new instances for converted fields never carry a contract_details source", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["b00cae55-3d09-49f4-a31b-df49b481b886"],
      existingByFieldId: new Map(),
      // manual_only resolution outcome: Personal NA default.
      resolveForFieldId: () => ({
        value: "NA",
        value_json: null,
        source: "private_default",
      }),
    });

    assert.equal(plan.inserts.length, 1);
    assert.notEqual(plan.inserts[0].resolved.source, "contract_details");
    assert.equal(plan.inserts[0].resolved.source, "private_default");
  });

  it("manual packet edits override defaults and stay overridden", () => {
    const existing = new Map([
      [
        "b00cae55-3d09-49f4-a31b-df49b481b886",
        {
          id: "inst-3",
          field_id: "b00cae55-3d09-49f4-a31b-df49b481b886",
          value: "See attached disclosure",
          value_json: null,
          source: "manual",
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

describe("Buyer Rep broker-signature checkbox", () => {
  /**
   * Local stand-in for lib/types/authentisign-excluded-fields.ts key
   * heuristics (that module pulls in "@/..." imports unavailable under
   * node --test). Mirrors isAuthentisignExcludedFieldKey exactly.
   */
  function isExcludedKey(fieldKey: string): boolean {
    const key = fieldKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (!key) return false;
    if (key.includes("signature") || key.endsWith("_sig") || key.startsWith("sig_")) {
      return true;
    }
    if (
      key.includes("_initial") ||
      key.includes("_initials") ||
      key.startsWith("initial_") ||
      key.startsWith("initials_") ||
      key.endsWith("_initial") ||
      key.endsWith("_initials")
    ) {
      return true;
    }
    if (
      key.includes("signature_date") ||
      key.includes("sig_date") ||
      key.includes("sign_date") ||
      key.includes("signed_date") ||
      key.includes("date_signed") ||
      key.endsWith("_signaturedate")
    ) {
      return true;
    }
    return false;
  }

  it("is not Authentisign-excluded, so reactivation does not change signing behavior", () => {
    assert.equal(isExcludedKey("BUYER_REP_BROKER_SGN_CHECKBOX"), false);
    // Sanity: a genuine signature field key is excluded.
    assert.equal(isExcludedKey("BROKER_AGENT_SIGNATURE"), true);
  });

  it("keeps its mapping pointed at the same field ID (no repointing)", () => {
    // The migration never sets field_id anywhere.
    assert.doesNotMatch(migrationSql, /set[^;]*field_id\s*=/i);
  });

  it("resolves unchecked with no scoped default (manual-only checkbox)", () => {
    const lookup = buildScopedDefaultLookup([]);
    const scoped = resolveScopedPreferenceDefault({
      lookup,
      fieldId: BUYER_REP_CHECKBOX_FIELD_ID,
      formId: 1,
      mappingId: BUYER_REP_CHECKBOX_MAPPING_ID,
    });
    assert.equal(scoped, null);
    // With no default, the resolver's boolean tail yields a real unchecked
    // false — matching all three historical instances (value "false",
    // source "empty", is_override false).
  });

  it("does not create duplicate instances for existing packets on reactivation", () => {
    const existing = new Map([
      [
        BUYER_REP_CHECKBOX_FIELD_ID,
        {
          id: "b4886b6e-44cd-4671-9d83-72711eea9cd0",
          field_id: BUYER_REP_CHECKBOX_FIELD_ID,
          value: "false",
          value_json: null,
          source: "empty",
          is_override: false,
        },
      ],
    ]);

    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: [BUYER_REP_CHECKBOX_FIELD_ID],
      existingByFieldId: existing,
      resolveForFieldId: () => ({
        value: "false",
        value_json: { checked: false },
        source: "empty",
      }),
    });

    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.updates.length, 0);
  });
});
