import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  fieldInstanceSyncWouldWrite,
  planFieldInstanceSyncMutations,
} from "./field-instance-sync.ts";

const REMOVAL_MIGRATION_PATH = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260722180000_remove_contract_details_architecture.sql",
);

const PRIOR_CONVERSION_MIGRATION_PATH = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260721190000_remove_abandoned_contract_details_sources.sql",
);

const FIELD_SOURCE_PATH = join(
  process.cwd(),
  "lib",
  "types",
  "field-source.ts",
);

const FIELD_RESOLVER_PATH = join(process.cwd(), "lib", "field-resolver.ts");
const FIELD_RESOLVER_CATALOG_PATH = join(
  process.cwd(),
  "lib",
  "types",
  "field-resolver-catalog.ts",
);

/** Representative formerly-contract_details field (CONTRACT_PROPERTY_AS_IS). */
const SAMPLE_CONVERTED_FIELD_ID = "71cc5bb4-8b16-4e6d-861a-a925a650da91";

const CONVERTED_CUSTOM_RESOLVER_FIELD_IDS = [
  "14be03f8-b259-4b23-bda3-ebe2c92c238c",
  "45243a76-65e6-4c41-8f46-94a8e4dae74a",
  "63332f49-28a0-475b-8f91-fe3e25469b06",
  "6ecc9d0d-b686-485b-a843-52b6a823a5d3",
  "962653cf-db0a-436a-ae79-4056b5e800ea",
  "bb7c7355-bfa7-47ae-85b6-70234ef2a218",
] as const;

describe("contract_details architecture removal migration", () => {
  const sql = readFileSync(REMOVAL_MIGRATION_PATH, "utf8");

  it("refuses to drop a nonempty table and does not use CASCADE", () => {
    assert.match(sql, /refused: contract_details has % row\(s\)/);
    assert.match(sql, /drop table public\.contract_details;/i);
    assert.doesNotMatch(sql, /drop table public\.contract_details cascade/i);
  });

  it("removes table policies and trigger before dropping the table", () => {
    assert.match(sql, /drop policy if exists "contract_details_select"/i);
    assert.match(sql, /drop policy if exists "contract_details_insert"/i);
    assert.match(sql, /drop policy if exists "contract_details_update"/i);
    assert.match(
      sql,
      /drop trigger if exists contract_details_set_update_date/i,
    );
    assert.match(sql, /shared set_update_date\(\) missing/);
  });

  it("removes contract_details from fields_source_type_check", () => {
    assert.match(sql, /drop constraint if exists fields_source_type_check/i);
    assert.match(sql, /add constraint fields_source_type_check/);
    assert.match(
      sql,
      /array\[\s*'settings_agent'::text,[\s\S]*'packet_instance'::text\s*\]/,
    );
    assert.doesNotMatch(
      sql,
      /array\[[^\]]*'contract_details'::text[^\]]*\]/s,
    );
  });

  it("converts the six table-dependent custom_resolver fields to manual_only", () => {
    for (const id of CONVERTED_CUSTOM_RESOLVER_FIELD_IDS) {
      assert.match(sql, new RegExp(id));
    }
    assert.match(sql, /source_type = 'manual_only'/);
    assert.match(sql, /resolver_key = null/);
  });

  it("is rerun-safe when the table is already absent", () => {
    assert.match(sql, /to_regclass\('public\.contract_details'\) is null/);
    assert.match(sql, /return;/);
  });

  it("preserves unrelated tables including listing_agreement_details", () => {
    assert.match(sql, /listing_agreement_details/);
    assert.match(sql, /property_hoas/);
    assert.doesNotMatch(sql, /drop table public\.listing_agreement_details/i);
  });
});

describe("contract_details source registry removal", () => {
  const fieldSource = readFileSync(FIELD_SOURCE_PATH, "utf8");
  const catalog = readFileSync(FIELD_RESOLVER_CATALOG_PATH, "utf8");

  it("rejects contract_details as a selectable source type", () => {
    assert.doesNotMatch(
      fieldSource,
      /FIELD_SOURCE_TYPES = \[[^\]]*\"contract_details\"/s,
    );
    assert.doesNotMatch(fieldSource, /Contract details/);
    assert.doesNotMatch(fieldSource, /CONTRACT_DETAILS_SOURCE_PATHS/);
    assert.match(fieldSource, /\"manual_only\"/);
  });

  it("removes contract custom resolver keys from registries", () => {
    for (const key of [
      "contract_survey_option_seller_existing",
      "contract_survey_option_buyer_new",
      "contract_survey_option_seller_new",
      "contract_effective_day",
      "contract_effective_month",
      "contract_effective_year",
    ]) {
      assert.doesNotMatch(
        fieldSource,
        new RegExp(`CUSTOM_RESOLVER_KEYS = \\[[^\\]]*\"${key}\"`, "s"),
      );
      assert.doesNotMatch(catalog, new RegExp(`\"${key}\"`));
    }
  });
});

describe("resolver no longer loads contract_details", () => {
  it("does not query or dispatch contract_details", () => {
    const source = readFileSync(FIELD_RESOLVER_PATH, "utf8");
    assert.doesNotMatch(source, /from\("contract_details"\)/);
    assert.doesNotMatch(source, /case "contract_details"/);
    assert.doesNotMatch(source, /contractDetails/);
    assert.doesNotMatch(source, /ContractDetailsRow/);
    assert.doesNotMatch(source, /contract-field-resolution/);
  });
});

describe("catalog preservation and packet safety", () => {
  it("prior conversion migration still targets exactly 64 contract field IDs", () => {
    const prior = readFileSync(PRIOR_CONVERSION_MIGRATION_PATH, "utf8");
    assert.match(prior, /v_expected constant integer := 64/);
    assert.match(prior, /source_type = 'manual_only'/);
  });

  it("ordinary open remains immutable for converted Contract fields", () => {
    const existing = new Map([
      [
        SAMPLE_CONVERTED_FIELD_ID,
        {
          id: "inst-contract",
          field_id: SAMPLE_CONVERTED_FIELD_ID,
          value: "Historical value",
          value_json: null,
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
        throw new Error("must not re-resolve existing instances");
      },
    });

    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.updates.length, 0);
    assert.equal(fieldInstanceSyncWouldWrite(plan), false);
  });

  it("new instances may initialize from scoped defaults, not contract_details", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: [SAMPLE_CONVERTED_FIELD_ID],
      existingByFieldId: new Map(),
      resolveForFieldId: () => ({
        value: "NA",
        value_json: null,
        source: "private_default",
      }),
    });

    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0].resolved.source, "private_default");
    assert.notEqual(plan.inserts[0].resolved.source, "contract_details");
  });
});
