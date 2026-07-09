import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
