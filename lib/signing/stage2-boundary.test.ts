import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

describe("Native Signing Stage 2 server boundary contracts", () => {
  const root = process.cwd();
  const actions = readFileSync(join(root, "lib/signing/actions.ts"), "utf8");
  const operations = readFileSync(
    join(root, "lib/signing/operations.ts"),
    "utf8",
  );
  const actor = readFileSync(join(root, "lib/signing/actor.ts"), "utf8");

  it("gates actions behind requireSigningActor before privileged work", () => {
    assert.match(actions, /requireSigningActor/);
    assert.match(actions, /createDraftSigningWithActor/);
    assert.match(actions, /getSigningForActor/);
    assert.match(actions, /updateDraftSigningTitleForActor/);
    assert.match(actions, /"use server"/);
    assert.match(actions, /server-only/);
  });

  it("enforces the feature gate in actor and operations", () => {
    assert.match(actor, /assertNativeSigningEnabled/);
    assert.match(operations, /assertNativeSigningEnabled/);
  });

  it("does not invent Stage 3 surfaces", () => {
    for (const source of [actions, operations, actor]) {
      assert.doesNotMatch(source, /\/sign\//);
      assert.doesNotMatch(source, /signing_participant_credentials/);
      assert.doesNotMatch(source, /signing_browser_sessions/);
      assert.doesNotMatch(source, /Resend/);
    }
  });

  it("derives sender and organization rather than accepting client spoof fields", () => {
    assert.match(operations, /originating_organization_id: actor\.originatingOrganizationId/);
    assert.match(operations, /original_sender_user_id: actor\.userId/);
    assert.match(operations, /association_role: "PRIMARY"/);
    assert.match(operations, /agent_user_id: actor\.userId/);
    assert.doesNotMatch(operations, /input\.userId|input\.organizationId|input\.primaryAgent/);
  });

  it("rejects cross-owner packets against the session actor", () => {
    assert.match(operations, /packet\.owner_user_id !== actor\.userId/);
  });

  it("creates the admin client only after requireSigningActor", () => {
    const createIdx = actions.indexOf("createDraftSigningAction");
    const requireIdx = actions.indexOf("requireSigningActor", createIdx);
    const adminIdx = actions.indexOf("createAdminClient", requireIdx);
    assert.ok(requireIdx > createIdx);
    assert.ok(adminIdx > requireIdx);
  });
});
