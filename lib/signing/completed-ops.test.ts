import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canManageCompletedSigningOperations,
} from "./completed-package-authority";
import type { SigningAuthorityResult } from "./authority";
import { mapDeliveryStateToLabel } from "./completed-ops";

function baseAuthority(
  overrides: Partial<SigningAuthorityResult> = {},
): SigningAuthorityResult {
  return {
    canRead: true,
    canManage: false,
    activeAssociation: null,
    historicalAssociation: null,
    activeOperatorAssociation: null,
    historicalOperatorAssociation: null,
    isBrokerageAdministrator: false,
    isTransactionCoordinator: false,
    ...overrides,
  };
}

describe("completed ops authority surface", () => {
  it("allows PRIMARY, CO_AGENT, active TC, and ORG_ADMIN on COMPLETE", () => {
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({
          activeAssociation: {
            id: "1",
            associationRole: "PRIMARY",
            agentUserId: "u",
            effectiveEndedAt: null,
          },
        }),
        "COMPLETE",
      ),
      true,
    );
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({
          activeAssociation: {
            id: "1",
            associationRole: "CO_AGENT",
            agentUserId: "u",
            effectiveEndedAt: null,
          },
        }),
        "COMPLETE",
      ),
      true,
    );
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({
          activeOperatorAssociation: {
            id: "op",
            operatorUserId: "tc",
            operatorRole: "TRANSACTION_COORDINATOR",
            status: "ACTIVE",
            effectiveEndedAt: null,
            signingOperatorDelegationId: "d1",
          },
          isTransactionCoordinator: true,
        }),
        "COMPLETE",
      ),
      true,
    );
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({ isBrokerageAdministrator: true }),
        "COMPLETE",
      ),
      true,
    );
  });

  it("denies revoked TC and non-managers", () => {
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({
          historicalOperatorAssociation: {
            id: "old",
            operatorUserId: "tc",
            operatorRole: "TRANSACTION_COORDINATOR",
            status: "ENDED",
            effectiveEndedAt: "2026-01-01T00:00:00Z",
            signingOperatorDelegationId: "d1",
          },
          isTransactionCoordinator: true,
        }),
        "COMPLETE",
      ),
      false,
    );
    assert.equal(
      canManageCompletedSigningOperations(baseAuthority(), "COMPLETE"),
      false,
    );
  });

  it("never returns raw bearer fields from ops actions/UI", () => {
    const actions = readFileSync(
      join(process.cwd(), "lib/signing/completed-ops-actions.ts"),
      "utf8",
    );
    const panel = readFileSync(
      join(process.cwd(), "components/signings/signing-completed-ops-panel.tsx"),
      "utf8",
    );
    assert.doesNotMatch(actions, /rawToken|token_wrapped|token_hash/);
    assert.doesNotMatch(panel, /rawToken|token_wrapped|hf_signing/);
    assert.equal(mapDeliveryStateToLabel("ACCEPTED"), "Provider Accepted");
  });
});
