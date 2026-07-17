import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextUniqueGlobalFormIdentity } from "./global-form-identity.ts";

describe("nextUniqueGlobalFormIdentity", () => {
  it("keeps source identity when free", () => {
    const result = nextUniqueGlobalFormIdentity(
      {
        form_name: "CondoListingAddendum",
        form_code: "TXR-1401",
        version_label: "TXR-1401-01-05-2026",
      },
      [],
    );
    assert.equal(result.form_code, "TXR-1401");
    assert.equal(result.form_name, "CondoListingAddendum");
  });

  it("appends Copy / Copy N when code+version collide", () => {
    const source = {
      form_name: "CondoListingAddendum",
      form_code: "TXR-1401",
      version_label: "v1",
    };
    const first = nextUniqueGlobalFormIdentity(source, [
      { form_code: "TXR-1401", version_label: "v1" },
    ]);
    assert.equal(first.form_name, "CondoListingAddendum - Copy");
    assert.equal(first.form_code, "TXR-1401-COPY");

    const second = nextUniqueGlobalFormIdentity(source, [
      { form_code: "TXR-1401", version_label: "v1" },
      { form_code: "TXR-1401-COPY", version_label: "v1" },
    ]);
    assert.equal(second.form_name, "CondoListingAddendum - Copy 2");
    assert.equal(second.form_code, "TXR-1401-COPY2");
  });
});
