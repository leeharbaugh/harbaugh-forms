import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

describe("Copy recipients before Complete", () => {
  it("allows Draft and In Progress management without issuing credentials early", () => {
    const copy = read("lib/signing/copy-recipients.ts");
    assert.match(copy, /lifecycle === "DRAFT" \|\| lifecycle === "IN_PROGRESS"/);
    assert.match(
      copy,
      /Completed-package credentials\/delivery exist only after Complete/,
    );
    assert.match(copy, /ensureCompletedPackageCredential/);
    // Credential issuance remains inside the Complete branch.
    const completeBlock = copy.slice(
      copy.indexOf('if (bundle.signing.lifecycle_state === "COMPLETE")'),
    );
    assert.match(completeBlock, /ensureCompletedPackageCredential/);
  });

  it("fans out ACTIVE copy recipients on Complete without rolling back Complete", () => {
    const delivery = read("lib/signing/completed-package-delivery.ts");
    const finalization = read("lib/signing/finalization-worker.ts");
    assert.match(delivery, /enqueueInitialCopyRecipientFanOut/);
    assert.match(delivery, /signing_copy_recipients/);
    assert.match(finalization, /enqueueInitialCopyRecipientFanOut/);
    assert.match(
      finalization,
      /copy-recipient fan-out failed/,
    );
  });

  it("exposes Copy recipients UI in Draft, In Progress, and Complete", () => {
    const dashboard = read("components/signings/signing-dashboard-page.tsx");
    const panel = read("components/signings/signing-copy-recipients-panel.tsx");
    const completed = read("components/signings/signing-completed-ops-panel.tsx");
    const actions = read("lib/signing/completed-ops-actions.ts");

    assert.match(dashboard, /SigningCopyRecipientsPanel/);
    assert.match(panel, /Copy recipients/);
    assert.match(
      panel,
      /These people will receive a copy after the Signing is complete/,
    );
    assert.match(panel, /not sign/);
    assert.match(panel, /ceremony access/);
    assert.match(completed, /SigningCopyRecipientsPanel/);
    assert.match(actions, /listCopyRecipientsAction/);
    assert.match(actions, /addCopyRecipientAction/);
  });
});
