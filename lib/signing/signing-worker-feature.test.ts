import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { processSigningWorkBatch } from "./signing-worker-dispatch";

describe("signing worker feature gate", () => {
  it("returns FEATURE_DISABLED without claiming work when feature is OFF", async () => {
    const result = await processSigningWorkBatch({
      admin: {} as never,
      secretOk: true,
      env: {},
    });
    assert.equal(result.status, "FEATURE_DISABLED");
    assert.deepEqual(result.processed, []);
  });

  it("returns DENIED when secret is not ok", async () => {
    const result = await processSigningWorkBatch({
      admin: {} as never,
      secretOk: false,
      env: { NATIVE_SIGNING_ENABLED: "true" },
    });
    assert.equal(result.status, "DENIED");
  });
});
