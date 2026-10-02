import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  NATIVE_SIGNING_REPRESENTATIVE_NOTICE,
  NATIVE_SIGNING_TYPED_ONLY_NOTICE,
} from "./capacity-notices";
import { mapDeliveryStateToLabel } from "./completed-ops";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("production scaffolding wiring", () => {
  it("POST and Cron workers fail closed when feature is OFF", () => {
    const dispatch = read("lib/signing/signing-worker-dispatch.ts");
    const postRoute = read("app/api/internal/signing-worker/route.ts");
    const cronRoute = read("app/api/internal/cron/signing-worker/route.ts");
    assert.match(dispatch, /FEATURE_DISABLED/);
    assert.match(dispatch, /isNativeSigningEnabled/);
    assert.match(postRoute, /FEATURE_DISABLED/);
    assert.match(cronRoute, /verifyCronAuthorization/);
    assert.match(cronRoute, /SIGNING_CRON_WORKER_BATCH_LIMIT/);
    assert.match(cronRoute, /Method Not Allowed/);
    assert.doesNotMatch(cronRoute, /x-signing-worker-secret/);
  });

  it("rejects DRAWN mark adoption server-side", () => {
    const adopted = read("lib/signing/adopted-marks.ts");
    assert.match(adopted, /DRAWN_MARK_UNSUPPORTED/);
    assert.match(adopted, /Drawn signatures and initials are not available yet/);
  });

  it("does not surface general representative or typed-adoption banners on manager pages", () => {
    const dashboard = read("components/signings/signing-dashboard-page.tsx");
    const list = read("components/signings/signings-list-page.tsx");
    assert.doesNotMatch(dashboard, /NATIVE_SIGNING_REPRESENTATIVE_NOTICE/);
    assert.doesNotMatch(dashboard, /NATIVE_SIGNING_TYPED_ONLY_NOTICE/);
    assert.doesNotMatch(list, /NATIVE_SIGNING_REPRESENTATIVE_NOTICE/);
    assert.doesNotMatch(list, /NATIVE_SIGNING_TYPED_ONLY_NOTICE/);
    assert.match(NATIVE_SIGNING_REPRESENTATIVE_NOTICE, /Representative signing/);
    assert.match(NATIVE_SIGNING_TYPED_ONLY_NOTICE, /typed/);
    assert.doesNotMatch(dashboard, /NATIVE_SIGNING_PERSONAL_CAPACITY_NOTICE/);
  });

  it("wires completed ops UI through authorized actors only", () => {
    const panel = read("components/signings/signing-completed-ops-panel.tsx");
    const copyPanel = read(
      "components/signings/signing-copy-recipients-panel.tsx",
    );
    const actions = read("lib/signing/completed-ops-actions.ts");
    assert.match(panel, /Resend Package/);
    assert.match(panel, /Replace Link/);
    assert.match(panel, /Revoke Link/);
    assert.match(panel, /SigningCopyRecipientsPanel/);
    assert.match(copyPanel, /Add Copy Recipient/);
    assert.match(panel, /Provider Accepted/);
    assert.doesNotMatch(panel, /rawToken|bearer|token_wrapped/);
    assert.match(actions, /canManageCompletedSigningOperations|resendCompletedPackageWithActor/);
    assert.match(actions, /replaceCompletedPackageCredentialWithActor/);
    assert.match(actions, /revokeCompletedPackageCredentialWithActor/);
    assert.match(actions, /requestFinalizationRetryWithActor/);
  });

  it("maps delivery states without claiming inbox delivery", () => {
    assert.equal(mapDeliveryStateToLabel("ACCEPTED"), "Provider Accepted");
    assert.equal(mapDeliveryStateToLabel("FAILED"), "Failed");
    assert.equal(mapDeliveryStateToLabel("PENDING"), "Pending");
  });

  it("keeps completed-ops authority COMPLETE-only for managers", () => {
    // Detailed authority matrix covered in completed-ops.test.ts /
    // completion-delivery.test.ts; this only asserts lifecycle gating exists.
    const authority = read("lib/signing/completed-package-authority.ts");
    assert.match(authority, /lifecycleState !== "COMPLETE"/);
    assert.match(authority, /isBrokerageAdministrator/);
    assert.match(authority, /activeOperatorAssociation/);
  });

  it("exchange routes never log tokens and set no-referrer", () => {
    for (const relative of [
      "app/api/sign/entry-exchange/route.ts",
      "app/api/sign/completed-package-exchange/route.ts",
    ]) {
      const source = read(relative);
      assert.match(source, /Referrer-Policy.: .no-referrer|no-referrer/);
      assert.doesNotMatch(source, /console\.(log|info|debug)\([^)]*token/i);
      assert.doesNotMatch(source, /console\.(log|info)\([^)]*request\.url/i);
    }
  });

  it("has no analytics middleware capturing bearer paths", () => {
    assert.equal(
      readFileSync(join(process.cwd(), "package.json"), "utf8").includes(
        "@vercel/analytics",
      ),
      false,
    );
  });
});
