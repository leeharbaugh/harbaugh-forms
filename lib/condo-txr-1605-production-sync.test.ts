import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIRM_TOKEN,
  defaultNaturalKey,
  looksLikeSignatureFieldKey,
  mappingNaturalKey,
  parseSyncArgs,
  planDefaultOperation,
  planFieldOperation,
  planMappingOperation,
  planStorageOperation,
} from "./condo-txr-1605-production-sync.ts";

describe("condo TXR-1605 production sync planning", () => {
  it("plans field insert/reuse/conflict correctly", () => {
    const base = {
      field_key: "contract_price",
      field_name: "Price",
      field_label: "Price",
      field_data_type: "text",
      field_widget_type: "text",
      source_type: "manual_only",
      source_path: null,
      resolver_key: null,
      required: false,
    };
    assert.equal(
      planFieldOperation({
        fieldKey: base.field_key,
        devField: base,
        prodField: null,
        otherProdActiveMappingCount: 0,
        txr1605Created: true,
      }).operation,
      "INSERT",
    );
    assert.equal(
      planFieldOperation({
        fieldKey: base.field_key,
        devField: base,
        prodField: base,
        otherProdActiveMappingCount: 3,
        txr1605Created: false,
      }).operation,
      "REUSE",
    );
    const conflict = planFieldOperation({
      fieldKey: base.field_key,
      devField: { ...base, source_type: "packet_property" },
      prodField: base,
      otherProdActiveMappingCount: 2,
      txr1605Created: false,
    });
    assert.equal(conflict.operation, "CONFLICT");
    const update = planFieldOperation({
      fieldKey: base.field_key,
      devField: { ...base, source_type: "packet_property" },
      prodField: base,
      otherProdActiveMappingCount: 0,
      txr1605Created: false,
    });
    assert.equal(update.operation, "UPDATE_METADATA");
  });

  it("plans mapping insert/update/no-change", () => {
    const dev = {
      field_key: "a",
      page_number: 1,
      occurrence_index: 0,
      x: 10,
      y: 20,
      width: 30,
      height: 14,
    };
    assert.equal(
      planMappingOperation({ dev, prod: null }).operation,
      "INSERT",
    );
    assert.equal(
      planMappingOperation({ dev, prod: { ...dev } }).operation,
      "NO_CHANGE",
    );
    assert.equal(
      planMappingOperation({
        dev,
        prod: { ...dev, x: 99 },
      }).operation,
      "UPDATE",
    );
  });

  it("plans defaults and storage", () => {
    assert.equal(
      planDefaultOperation({
        dev: {
          field_key: "x",
          scope: "ORGANIZATION",
          organization_id: "o",
          default_value: "NA",
        },
        prod: null,
      }).operation,
      "INSERT",
    );
    assert.equal(
      planDefaultOperation({
        dev: null,
        prod: {
          field_key: "x",
          scope: "ORGANIZATION",
          organization_id: "o",
          default_value: "NA",
        },
      }).operation,
      "SOFT_DELETE",
    );
    assert.equal(
      planStorageOperation({
        source: {
          bytes: 10,
          md5: "a",
          sha256: "b",
          path: "global/forms/24/x.pdf",
        },
        target: {
          bytes: 10,
          md5: "a",
          sha256: "b",
          path: "global/forms/20/x.pdf",
        },
        targetFormPath: "global/forms/20/x.pdf",
      }).operation,
      "REUSE",
    );
  });

  it("builds natural keys and parses args", () => {
    assert.equal(
      mappingNaturalKey({
        field_key: "Foo",
        page_number: 2,
        occurrence_index: null,
      }),
      "foo|2|0",
    );
    assert.equal(
      defaultNaturalKey({
        scope: "PRIVATE",
        owner_user_id: "u1",
        field_key: "Bar",
        form_field_mapping_id: null,
      }),
      "PRIVATE|user:u1|bar|map:none",
    );
    const dry = parseSyncArgs(["--dry-run"]);
    assert.equal(dry.apply, false);
    assert.equal(dry.dryRun, true);
    const apply = parseSyncArgs([
      "--apply",
      "--confirm",
      CONFIRM_TOKEN,
    ]);
    assert.equal(apply.apply, true);
    assert.equal(apply.confirm, CONFIRM_TOKEN);
    assert.equal(looksLikeSignatureFieldKey("buyer_signature"), true);
    assert.equal(
      looksLikeSignatureFieldKey("contract_condo_parking_assigned"),
      false,
    );
  });
});
