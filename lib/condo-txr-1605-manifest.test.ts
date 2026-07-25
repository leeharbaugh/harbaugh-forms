import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const manifest = JSON.parse(
  fs.readFileSync("data/condo-txr-1605/manifest.json", "utf8"),
);

describe("condo TXR-1605 manifest", () => {
  it("has stable form identity and PDF checksums", () => {
    assert.equal(manifest.form.stableIdentity.form_code, "TXR-1605");
    assert.equal(
      manifest.form.stableIdentity.version_label,
      "TXR-1605-05-04-2026",
    );
    assert.equal(manifest.form.pdf.bytes, 194382);
    assert.equal(manifest.form.pdf.md5, "c6a7892e8373d65c96726b1e571662b8");
    assert.ok(fs.existsSync(manifest.form.pdf.localPath));
  });

  it("matches expected field/mapping counts after approved corrections", () => {
    assert.equal(manifest.newFields.length, 13);
    assert.equal(manifest.mappings.length, manifest.expectedCounts.mappings);
    assert.equal(manifest.expectedCounts.mappings, 158);
    assert.equal(manifest.expectedCounts.new, 13);
    assert.equal(manifest.expectedCounts.reuse, 145);
    assert.equal(manifest.expectedCounts.checkbox, 47);
    assert.equal(manifest.expectedCounts.date, 2);
  });

  it("uses packet_property.unit for condo unit and manual_only for building/project", () => {
    const unit = manifest.newFields.find(
      (f: { field_key: string }) => f.field_key === "contract_condo_unit_number",
    );
    assert.equal(unit.source_type, "packet_property");
    assert.equal(unit.source_path, "unit");
    for (const key of [
      "contract_condo_building",
      "contract_condo_project_name",
      "contract_condo_parking_assigned",
    ]) {
      const f = manifest.newFields.find(
        (row: { field_key: string }) => row.field_key === key,
      );
      assert.equal(f.source_type, "manual_only");
      assert.equal(f.source_path, null);
      assert.equal(f.resolver_key, null);
    }
  });

  it("maps single contract_effective_date and not day/month/year parts", () => {
    const keys = manifest.mappings.map((m: { field_key: string }) => m.field_key);
    assert.ok(keys.includes("contract_effective_date"));
    assert.ok(!keys.includes("contract_effective_day"));
    assert.ok(!keys.includes("contract_effective_month"));
    assert.ok(!keys.includes("contract_effective_year"));
    assert.ok(!keys.includes("property_legal_description"));
    assert.ok(!keys.includes("PROPERTY_STATE"));
  });

  it("excludes signature-like field keys", () => {
    const keys = manifest.mappings.map((m: { field_key: string }) =>
      m.field_key.toLowerCase(),
    );
    for (const k of keys) {
      assert.equal(/signature|initial/.test(k), false);
    }
  });

  it("has placements on pages 1-10 only", () => {
    for (const m of manifest.mappings) {
      assert.ok(m.page_number >= 1 && m.page_number <= 10);
      assert.ok(m.width > 0 && m.height > 0);
    }
  });
});
