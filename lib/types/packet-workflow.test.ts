import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPacketCreateFlowCopy,
  workflowRequiresProperty,
  workflowSupportsPropertySelection,
} from "./packet-workflow.ts";

describe("workflowSupportsPropertySelection", () => {
  it("excludes buyer rep packets", () => {
    assert.equal(workflowSupportsPropertySelection("buyer_rep"), false);
  });

  it("includes property-based packet workflows", () => {
    assert.equal(workflowSupportsPropertySelection("listing"), true);
    assert.equal(workflowSupportsPropertySelection("contract_offer"), true);
  });
});

describe("workflowRequiresProperty", () => {
  it("requires property only for listing and contract offer packets", () => {
    assert.equal(workflowRequiresProperty("buyer_rep"), false);
    assert.equal(workflowRequiresProperty("listing"), true);
    assert.equal(workflowRequiresProperty("contract_offer"), true);
  });
});

describe("getPacketCreateFlowCopy listing owner kind", () => {
  it("keeps seller copy for sale listing packets", () => {
    const copy = getPacketCreateFlowCopy("listing", "seller");
    assert.match(copy.contacts.search, /sellers/i);
    assert.match(copy.contacts.required, /seller/i);
  });

  it("uses landlord copy for lease listing packets", () => {
    const copy = getPacketCreateFlowCopy("listing", "landlord");
    assert.equal(copy.contacts.search, "2. Search landlords");
    assert.equal(
      copy.contacts.selected,
      "3. Landlords assigned to this packet",
    );
    assert.equal(
      copy.contacts.required,
      "Add at least one landlord before continuing.",
    );
  });
});
