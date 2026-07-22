import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260722200000_remove_brokerage_legacy_default_columns.sql",
);

const BROKERAGE_SETTINGS_PATH = join(
  process.cwd(),
  "lib",
  "types",
  "brokerage-settings.ts",
);

const FIELD_SOURCE_PATH = join(
  process.cwd(),
  "lib",
  "types",
  "field-source.ts",
);

const LEGACY_DEFAULT_COLUMNS = [
  "default_market_area",
  "default_buyer_rep_compensation_percent",
  "default_protection_period_days",
  "default_county_for_payment",
  "default_employer_relocation",
  "default_special_provisions",
  "default_intermediary_allowed",
] as const;

const PROFILE_COLUMNS = [
  "brokerage_name",
  "brokerage_address",
  "brokerage_office_phone",
  "brokerage_license_number",
  "broker_first_name",
  "broker_last_name",
  "broker_license_number",
  "agent_first_name",
  "agent_last_name",
  "agent_license_number",
] as const;

describe("brokerage legacy default columns removal migration", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("drops exactly the seven approved default_* columns without CASCADE", () => {
    for (const column of LEGACY_DEFAULT_COLUMNS) {
      assert.match(sql, new RegExp(`drop column ${column}`, "i"));
    }
    assert.doesNotMatch(sql, /cascade/i);
  });

  it("drops the protection-period check constraint before the column", () => {
    assert.match(
      sql,
      /drop constraint if exists brokerage_settings_protection_period_non_negative/i,
    );
    const constraintIdx = sql.indexOf(
      "brokerage_settings_protection_period_non_negative",
    );
    const columnIdx = sql.indexOf("drop column default_protection_period_days");
    assert.ok(constraintIdx >= 0 && columnIdx > constraintIdx);
  });

  it("refuses to proceed when catalog fields still reference default_* paths", () => {
    assert.match(
      sql,
      /field\(s\) still use a legacy default_\* source_path/,
    );
  });

  it("preserves genuine brokerage profile columns", () => {
    for (const column of PROFILE_COLUMNS) {
      assert.match(sql, new RegExp(`'${column}'`));
    }
    assert.doesNotMatch(sql, /drop column brokerage_name/i);
    assert.doesNotMatch(sql, /drop column broker_license_number/i);
  });

  it("is rerun-safe when columns are already absent", () => {
    assert.match(sql, /v_cols_remaining = 0/);
    assert.match(sql, /return;/);
  });
});

describe("brokerage source registry preserves profile paths only", () => {
  const fieldSource = readFileSync(FIELD_SOURCE_PATH, "utf8");
  const brokerageTypes = readFileSync(BROKERAGE_SETTINGS_PATH, "utf8");

  it("does not expose legacy default_* paths for settings_brokerage", () => {
    for (const column of LEGACY_DEFAULT_COLUMNS) {
      assert.doesNotMatch(
        fieldSource,
        new RegExp(
          `SETTINGS_BROKERAGE_SOURCE_PATHS = \\[[^\\]]*\"${column}\"`,
          "s",
        ),
      );
    }
    assert.match(fieldSource, /\"brokerage_name\"/);
    assert.match(fieldSource, /\"broker_license_number\"/);
    assert.match(fieldSource, /\"settings_brokerage\"/);
  });

  it("BrokerageSettings type has no default_* properties", () => {
    for (const column of LEGACY_DEFAULT_COLUMNS) {
      assert.doesNotMatch(brokerageTypes, new RegExp(column));
    }
    assert.match(brokerageTypes, /brokerage_name/);
    assert.match(brokerageTypes, /broker_license_number/);
    assert.match(brokerageTypes, /agent_email/);
  });
});
