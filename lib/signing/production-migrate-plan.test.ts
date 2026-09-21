import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planNativeSigningProductionMigrate } from "./production-migrate-plan";
import {
  NATIVE_SIGNING_DEV_PROJECT_REF,
  NATIVE_SIGNING_PROD_PROJECT_REF,
} from "./production-refs";

describe("production migrate helper plan", () => {
  it("defaults to dry-run and refuses wrong/dev refs", () => {
    const missing = planNativeSigningProductionMigrate({
      productionFlag: false,
      projectRef: null,
      confirmationFlag: false,
      executeFlag: false,
    });
    assert.equal(missing.mode, "dry-run");
    assert.ok(missing.refusals.some((r) => /Missing --production/.test(r)));

    const wrong = planNativeSigningProductionMigrate({
      productionFlag: true,
      projectRef: NATIVE_SIGNING_DEV_PROJECT_REF,
      confirmationFlag: true,
      executeFlag: false,
    });
    assert.ok(wrong.refusals.some((r) => /development project ref/.test(r)));
    assert.equal(wrong.dryRunAccepted, false);
  });

  it("accepts a dry-run production plan with confirmation and prod ref", () => {
    const plan = planNativeSigningProductionMigrate({
      productionFlag: true,
      projectRef: NATIVE_SIGNING_PROD_PROJECT_REF,
      confirmationFlag: true,
      executeFlag: false,
    });
    assert.equal(plan.dryRunAccepted, true);
    assert.ok(plan.steps.some((s) => /work_suspended=true/.test(s)));
    assert.ok(plan.steps.some((s) => /bump access_epoch/.test(s)));
    assert.ok(plan.steps.some((s) => /Do NOT set NATIVE_SIGNING_ENABLED/.test(s)));
    assert.ok(plan.steps.some((s) => /Do NOT resume/.test(s)));
  });

  it("never executes mutations in scaffolding", () => {
    const plan = planNativeSigningProductionMigrate({
      productionFlag: true,
      projectRef: NATIVE_SIGNING_PROD_PROJECT_REF,
      confirmationFlag: true,
      executeFlag: true,
    });
    assert.equal(plan.mode, "execute");
    assert.ok(
      plan.refusals.some((r) => /not implemented in scaffolding/.test(r)),
    );
    assert.equal(plan.dryRunAccepted, false);
  });
});
