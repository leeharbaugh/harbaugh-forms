import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FORBIDDEN_RESOLVER_KEYS,
  FORBIDDEN_SOURCE_TYPES,
  PAGE2_LEFT_MAX_RIGHT,
  PAGE2_RIGHT_MIN_LEFT,
  TXR_1957_DEFAULTS,
  TXR_1957_EXPECTED_COUNTS,
  TXR_1957_FIELDS,
  TXR_1957_FORM_CODE,
  TXR_1957_FORM_FAMILY_KEY,
  TXR_1957_FORM_ID,
  TXR_1957_FORM_NAME,
  TXR_1957_NEW_FIELDS,
  TXR_1957_PAGE_COUNT,
  TXR_1957_PAGE_HEIGHT,
  TXR_1957_PAGE_WIDTH,
  TXR_1957_PLACEMENTS,
  TXR_1957_REUSE_FIELDS,
  TXR_1957_STORAGE_PATH,
  TXR_1957_VERSION_LABEL,
  fieldByKey,
  isSignatureLikeKey,
  placementBottom,
  placementRight,
} from "./txr-1957-inventory.ts";

const LIVE_SOURCE_TYPES = new Set([
  "settings_agent",
  "settings_brokerage",
  "packet_contact",
  "packet_property",
  "buyer_rep_details",
  "representation_agreement",
  "custom_resolver",
  "manual_only",
  "packet_instance",
]);

function isPacketContactPath(path: string): boolean {
  return /^(buyer|seller|tenant|landlord)_[12]\.[a-z_]+$/.test(path);
}

describe("TXR-1957 / T-47.1 inventory", () => {
  it("identifies the production T-47.1 form", () => {
    assert.equal(TXR_1957_FORM_ID, 53);
    assert.equal(TXR_1957_FORM_CODE, "TXR-1957");
    assert.equal(TXR_1957_VERSION_LABEL, "TXR-1957-11-1-2024");
    assert.equal(TXR_1957_FORM_FAMILY_KEY, "TXR-1957");
    assert.equal(TXR_1957_FORM_NAME, "T-47 In Lieu of Affidavit");
    assert.equal(TXR_1957_STORAGE_PATH, "global/forms/53/T-47-not-affidavit.pdf");
    assert.equal(TXR_1957_PAGE_COUNT, 2);
  });

  it("has the expected active field and mapping counts", () => {
    assert.equal(TXR_1957_PLACEMENTS.length, TXR_1957_EXPECTED_COUNTS.placements);
    assert.equal(TXR_1957_NEW_FIELDS.length, TXR_1957_EXPECTED_COUNTS.newFields);
    assert.equal(
      TXR_1957_FIELDS.filter((f) => f.reuse).length,
      TXR_1957_EXPECTED_COUNTS.reuseFields,
    );
    assert.equal(
      TXR_1957_PLACEMENTS.filter((p) => p.page_number === 1).length,
      TXR_1957_EXPECTED_COUNTS.page1,
    );
    assert.equal(
      TXR_1957_PLACEMENTS.filter((p) => p.page_number === 2).length,
      TXR_1957_EXPECTED_COUNTS.page2,
    );
    const keys = TXR_1957_PLACEMENTS.map((p) => p.field_key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("does not create signature or initials fields", () => {
    for (const field of TXR_1957_FIELDS) {
      assert.equal(isSignatureLikeKey(field.field_key), false, field.field_key);
      assert.notEqual(field.field_widget_type, "signature");
      assert.notEqual(field.field_widget_type, "initials");
    }
    for (const p of TXR_1957_PLACEMENTS) {
      assert.match(p.mapping_name, /^(?!.*(?:Signed|signature|initial))/i);
    }
    assert.equal(TXR_1957_EXPECTED_COUNTS.signatures, 0);
  });

  it("uses only live source types and valid paths/resolvers", () => {
    for (const field of TXR_1957_FIELDS) {
      assert.equal(FORBIDDEN_SOURCE_TYPES.includes(field.source_type as never), false);
      assert.ok(LIVE_SOURCE_TYPES.has(field.source_type), field.field_key);
      if (field.source_type === "manual_only") {
        assert.equal(field.source_path, null, field.field_key);
        assert.equal(field.resolver_key, null, field.field_key);
      }
      if (field.resolver_key) {
        assert.equal(FORBIDDEN_RESOLVER_KEYS.includes(field.resolver_key as never), false);
      }
      if (field.source_type === "packet_contact") {
        assert.ok(field.source_path);
        assert.equal(isPacketContactPath(field.source_path!), true, field.source_path);
        assert.equal(field.resolver_key, null);
      }
      if (field.source_type === "packet_property") {
        assert.ok(field.source_path);
        assert.ok(["county", "legal_description"].includes(field.source_path!), field.source_path);
        assert.equal(field.resolver_key, null);
      }
    }
  });

  it("reuses the canonical Global property and seller-name fields", () => {
    assert.equal(
      fieldByKey("property_legal_description").reuse_field_id,
      TXR_1957_REUSE_FIELDS.property_legal_description,
    );
    assert.equal(fieldByKey("property_county").source_path, "county");
    assert.equal(fieldByKey("seller_name_1").source_path, "seller_1.full_name");
    assert.equal(fieldByKey("seller_name_2").source_path, "seller_2.full_name");
  });

  it("keeps page-1 declarant, GF, dates, and addresses manual where no exact source exists", () => {
    assert.equal(fieldByKey("txr_1957_declarant").source_type, "manual_only");
    assert.equal(fieldByKey("txr_1957_gf_number").source_type, "manual_only");
    assert.equal(fieldByKey("txr_1957_declaration_date").source_type, "manual_only");
    assert.equal(fieldByKey("txr_1957_survey_date").source_type, "manual_only");
    assert.equal(fieldByKey("txr_1957_declarant_1_address").source_type, "manual_only");
    assert.equal(fieldByKey("txr_1957_declarant_2_address").source_type, "manual_only");
    assert.equal(fieldByKey("txr_1957_declarant_1_dob").source_path, "seller_1.date_of_birth");
    assert.equal(fieldByKey("txr_1957_declarant_2_dob").source_path, "seller_2.date_of_birth");
  });

  it("places every mapping on the correct page and inside page bounds", () => {
    for (const p of TXR_1957_PLACEMENTS) {
      assert.ok(p.page_number >= 1 && p.page_number <= TXR_1957_PAGE_COUNT);
      assert.ok(p.x >= 0, p.field_key);
      assert.ok(p.y >= 0, p.field_key);
      assert.ok(placementRight(p) <= TXR_1957_PAGE_WIDTH + 0.5, p.field_key);
      assert.ok(placementBottom(p) <= TXR_1957_PAGE_HEIGHT + 0.5, p.field_key);
      assert.ok(p.width > 0 && p.height > 0, p.field_key);
      const field = fieldByKey(p.field_key);
      assert.ok(field);
    }
  });

  it("keeps declarant 1 in the left column and declarant 2 in the right column", () => {
    const left = TXR_1957_PLACEMENTS.filter((p) => p.column === "left");
    const right = TXR_1957_PLACEMENTS.filter((p) => p.column === "right");
    assert.equal(left.length, 8);
    assert.equal(right.length, 8);
    for (const p of left) {
      assert.ok(placementRight(p) <= PAGE2_LEFT_MAX_RIGHT, `${p.field_key} crosses center`);
      assert.match(p.field_key, /(_1_|seller_name_1)/);
    }
    for (const p of right) {
      assert.ok(p.x >= PAGE2_RIGHT_MIN_LEFT, `${p.field_key} crosses center`);
      assert.match(p.field_key, /(_2_|seller_name_2)/);
    }
  });

  it("configures multiline wrapping on the exceptions and address blanks", () => {
    const multiline = TXR_1957_PLACEMENTS.filter((p) => p.is_multiline);
    assert.equal(multiline.length, TXR_1957_EXPECTED_COUNTS.multiline);
    const keys = multiline.map((p) => p.field_key).sort();
    assert.deepEqual(keys, [
      "txr_1957_declarant_1_address",
      "txr_1957_declarant_2_address",
      "txr_1957_survey_changes_exceptions",
    ]);
    for (const p of multiline) {
      assert.equal(p.mask_background, true);
      assert.ok(p.height > 14, p.field_key);
    }
  });

  it("scopes Personal defaults only to the approved exception and execution-state fields", () => {
    assert.equal(TXR_1957_DEFAULTS.length, TXR_1957_EXPECTED_COUNTS.defaults);
    const byKey = Object.fromEntries(TXR_1957_DEFAULTS.map((d) => [d.field_key, d.default_value]));
    assert.equal(byKey.txr_1957_survey_changes_exceptions, "None");
    assert.equal(byKey.txr_1957_declarant_1_execution_state, "Texas");
    assert.equal(byKey.txr_1957_declarant_2_execution_state, "Texas");
    const defaulted = new Set(TXR_1957_DEFAULTS.map((d) => d.field_key));
    for (const key of [
      "txr_1957_declaration_date",
      "txr_1957_gf_number",
      "txr_1957_declarant",
      "txr_1957_survey_date",
      "txr_1957_declarant_1_dob",
      "txr_1957_declarant_1_address",
      "txr_1957_declarant_1_execution_county",
      "txr_1957_declarant_1_execution_day",
    ]) {
      assert.equal(defaulted.has(key), false, key);
    }
  });

  it("does not place fields over the printed County/Texas or signature lines", () => {
    const county = TXR_1957_PLACEMENTS.find((p) => p.field_key === "property_county")!;
    assert.ok(placementRight(county) <= 268, "county must stop before ', Texas'");
    const signatures = TXR_1957_PLACEMENTS.filter((p) => p.page_number === 2 && p.y >= 360);
    assert.equal(signatures.length, 0);
  });
});
