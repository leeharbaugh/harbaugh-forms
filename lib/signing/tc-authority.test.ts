import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  canReadCompletedSigningArtifacts,
  canRequestRetryFinalization,
  evaluateSigningAuthority,
  type SigningAuthorityResult,
} from "./authority";
import { resolveSigningEventActorType } from "./event-actor";
import {
  NATIVE_SIGNING_TC_AUTHORITY_MIGRATIONS,
  NATIVE_SIGNING_TC_AUTHORITY_TABLES,
} from "./stage1-schema";
import {
  managementAuthorityAllowsCeremonyWrites,
  TC_CEREMONY_PROHIBITIONS,
} from "./tc-ceremony-boundary";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

function baseAuthority(
  overrides: Partial<SigningAuthorityResult> = {},
): SigningAuthorityResult {
  return {
    canRead: true,
    canManage: true,
    activeAssociation: null,
    historicalAssociation: null,
    activeOperatorAssociation: null,
    historicalOperatorAssociation: null,
    isBrokerageAdministrator: false,
    isTransactionCoordinator: false,
    ...overrides,
  };
}

describe("TC operator authority foundation", () => {
  const migration = read(
    `supabase/migrations/${NATIVE_SIGNING_TC_AUTHORITY_MIGRATIONS[0]}.sql`,
  );
  const operations = read("lib/signing/operations.ts");
  const authority = read("lib/signing/authority.ts");
  const activation = read("lib/signing/activation.ts");
  const handoff = read("lib/signing/in-person-handoff.ts");
  const promotion = read("lib/signing/package-promotion.ts");
  const sourceDrift = read("lib/signing/source-drift.ts");
  const placements = read("lib/signing/placements.ts");
  const marks = read("lib/signing/adopted-marks.ts");
  const finish = read("lib/signing/ceremony-finish.ts");
  const affirmation = read("lib/signing/ceremony-affirmation.ts");
  const cancel = read("lib/signing/cancel.ts");
  const delegations = read("lib/signing/operator-delegations.ts");

  it("declares TC tables and migration identifiers", () => {
    assert.deepEqual(NATIVE_SIGNING_TC_AUTHORITY_TABLES, [
      "signing_operator_delegations",
      "signing_operator_associations",
    ]);
    for (const table of NATIVE_SIGNING_TC_AUTHORITY_TABLES) {
      assert.match(
        migration,
        new RegExp(`create table if not exists public\\.${table}\\b`),
      );
    }
  });

  it("keeps signing_agent_associations agent-only (PRIMARY/CO_AGENT)", () => {
    assert.doesNotMatch(
      migration,
      /alter table public\.signing_agent_associations/i,
    );
    assert.doesNotMatch(
      migration,
      /association_role.*TRANSACTION_COORDINATOR/,
    );
    assert.match(
      migration,
      /Signing-scoped Transaction Coordinator operators\. Distinct from signing_agent_associations/,
    );
  });

  it("adds TRANSACTION_COORDINATOR to event actor vocabulary", () => {
    assert.match(migration, /TRANSACTION_COORDINATOR/);
    assert.match(migration, /signing_events_actor_type_check/);
  });

  it("adds created_by_user_id creator provenance on signings", () => {
    assert.match(migration, /created_by_user_id/);
    assert.match(operations, /created_by_user_id: actor\.userId/);
    assert.match(operations, /responsibleUserId/);
  });

  it("denies browser self-service on delegation/operator tables", () => {
    assert.match(migration, /_deny_authenticated/);
    assert.match(migration, /force row level security/);
    assert.match(migration, /revoke all on table public\.%I from (public|anon|authenticated)/);
    assert.match(migration, /'signing_operator_delegations'/);
    assert.match(migration, /'signing_operator_associations'/);
  });

  it("separates creator from responsible agent on TC create", () => {
    assert.match(operations, /creatingAsTc/);
    assert.match(operations, /findActiveOperatorDelegation/);
    assert.match(operations, /signing_operator_associations/);
    assert.match(operations, /TRANSACTION_COORDINATOR/);
    assert.match(operations, /created_by_user_id: actor\.userId/);
    assert.match(operations, /original_sender_user_id: responsibleUserId/);
  });

  it("does not hardcode PRIMARY_AGENT on meaningful Stage 2–5 event paths", () => {
    for (const [label, source] of [
      ["activation", activation],
      ["handoff", handoff],
      ["promotion", promotion],
      ["source-drift", sourceDrift],
      ["operations", operations],
    ] as const) {
      assert.doesNotMatch(
        source,
        /actor_type:\s*"PRIMARY_AGENT"/,
        `${label} must not hardcode PRIMARY_AGENT`,
      );
      assert.match(source, /resolveSigningEventActorType|TRANSACTION_COORDINATOR/);
    }
  });

  it("resolves event actor types honestly", () => {
    assert.equal(
      resolveSigningEventActorType(
        baseAuthority({
          activeAssociation: {
            id: "a1",
            agentUserId: "u1",
            associationRole: "PRIMARY",
            effectiveEndedAt: null,
          },
        }),
      ),
      "PRIMARY_AGENT",
    );
    assert.equal(
      resolveSigningEventActorType(
        baseAuthority({
          activeAssociation: {
            id: "a2",
            agentUserId: "u2",
            associationRole: "CO_AGENT",
            effectiveEndedAt: null,
          },
        }),
      ),
      "CO_AGENT",
    );
    assert.equal(
      resolveSigningEventActorType(
        baseAuthority({
          activeOperatorAssociation: {
            id: "o1",
            operatorUserId: "tc",
            operatorRole: "TRANSACTION_COORDINATOR",
            status: "ACTIVE",
            effectiveEndedAt: null,
            signingOperatorDelegationId: "d1",
          },
          isTransactionCoordinator: true,
        }),
      ),
      "TRANSACTION_COORDINATOR",
    );
    assert.equal(
      resolveSigningEventActorType(
        baseAuthority({ isBrokerageAdministrator: true }),
      ),
      "BROKERAGE_ADMINISTRATOR",
    );
  });

  it("documents TC ceremony prohibitions and blocks management-as-ceremony", () => {
    assert.ok(TC_CEREMONY_PROHIBITIONS.length >= 10);
    assert.equal(
      managementAuthorityAllowsCeremonyWrites(
        baseAuthority({ isTransactionCoordinator: true, canManage: true }),
      ),
      false,
    );
    // Ceremony modules require ceremony session — not workspace manage.
    assert.match(placements, /requireActiveCeremonySession|ceremony/);
    assert.match(marks, /requireActiveCeremonySession|ceremony/);
    assert.match(finish, /requireActiveCeremonySession|ceremony/);
    assert.match(affirmation, /affirm|I am/);
    assert.doesNotMatch(placements, /requireManageableDraftSigning/);
    assert.doesNotMatch(finish, /requireManageableSigning/);
  });

  it("implements Cancel with TC on-behalf attribution", () => {
    assert.match(cancel, /SIGNING_CANCELLED/);
    assert.match(cancel, /Transaction Coordinator, on behalf of/);
    assert.match(cancel, /resolveSigningEventActorType/);
  });

  it("implements grant/revoke gates for responsible User and ORG_ADMIN", () => {
    assert.match(delegations, /cannot grant their own delegation/);
    assert.match(delegations, /ordinary|organization administrator|ORG_ADMIN/i);
    assert.match(delegations, /Application administrators cannot grant/);
    assert.match(delegations, /DELEGATION_REVOKED/);
  });

  it("prepares Retry Finalization and completed-artifact authority helpers", () => {
    assert.match(authority, /canRequestRetryFinalization/);
    assert.match(authority, /canReadCompletedSigningArtifacts/);
    const managed = baseAuthority({ canManage: true });
    assert.equal(canRequestRetryFinalization(managed, "IN_PROGRESS"), true);
    assert.equal(canRequestRetryFinalization(managed, "DRAFT"), false);
    assert.equal(
      canReadCompletedSigningArtifacts(
        baseAuthority({ canRead: true, canManage: false }),
        "COMPLETE",
      ),
      true,
    );
    assert.equal(
      canReadCompletedSigningArtifacts(managed, "DRAFT"),
      false,
    );
  });

  it("evaluates TC manage through operator path, not agent association", () => {
    const result = evaluateSigningAuthority({
      signing: {
        signingId: "s1",
        originatingOrganizationId: "org-a",
        lifecycleState: "IN_PROGRESS",
        currentPrimaryAgentAssociationId: "a1",
        originalSenderUserId: "agent-1",
        associations: [
          {
            id: "a1",
            agentUserId: "agent-1",
            associationRole: "PRIMARY",
            effectiveEndedAt: null,
          },
        ],
        operatorAssociations: [
          {
            id: "o1",
            operatorUserId: "tc-1",
            operatorRole: "TRANSACTION_COORDINATOR",
            status: "ACTIVE",
            effectiveEndedAt: null,
            signingOperatorDelegationId: "d1",
          },
        ],
        operatorDelegations: [
          {
            id: "d1",
            organizationId: "org-a",
            responsibleUserId: "agent-1",
            delegateUserId: "tc-1",
            operatorRole: "TRANSACTION_COORDINATOR",
            status: "ACTIVE",
            revokedAt: null,
            effectiveEndedAt: null,
          },
        ],
      },
      actorUserId: "tc-1",
      memberships: [
        {
          organizationId: "org-a",
          membershipRole: "MEMBER",
          membershipStatus: "ACTIVE",
          organizationStatus: "ACTIVE",
        },
      ],
    });
    assert.equal(result.canManage, true);
    assert.equal(result.activeAssociation, null);
    assert.equal(result.isTransactionCoordinator, true);
  });
});
