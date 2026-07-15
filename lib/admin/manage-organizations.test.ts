import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateOrganizationInput } from "./organization-validation.ts";
import { wouldRemoveFinalActiveAdmin } from "./invite-validation.ts";

describe("validateOrganizationInput", () => {
  it("requires a name", () => {
    const result = validateOrganizationInput({ name: "   " });
    assert.equal(result.ok, false);
  });

  it("normalizes phone and defaults state to TX", () => {
    const result = validateOrganizationInput({
      name: "Test Brokerage",
      phone: "8175550100",
      brokerPhone: "(214) 555-0199",
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.value.state, "TX");
    assert.equal(result.value.phone, "817-555-0100");
    assert.equal(result.value.broker_phone, "214-555-0199");
  });
});

describe("final admin safeguard helpers", () => {
  it("blocks demoting the final active admin", () => {
    assert.equal(
      wouldRemoveFinalActiveAdmin({
        activeAdminCount: 1,
        currentlyActiveAdmin: true,
        nextIsActiveAdmin: false,
      }),
      true,
    );
  });

  it("allows demotion when another admin remains", () => {
    assert.equal(
      wouldRemoveFinalActiveAdmin({
        activeAdminCount: 2,
        currentlyActiveAdmin: true,
        nextIsActiveAdmin: false,
      }),
      false,
    );
  });
});
