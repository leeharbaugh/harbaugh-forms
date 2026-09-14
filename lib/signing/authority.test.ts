import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveOriginatingOrganizationId,
  hasSigningAccountAccess,
  isEligibleInOriginatingBrokerage,
  isOriginatingBrokerageAdministrator,
} from "./eligibility";
import { evaluateSigningAuthority } from "./authority";
import { normalizeSigningTitle, SIGNING_TITLE_MAX_LENGTH } from "./types";

describe("Signing eligibility", () => {
  it("requires active account without forced password", () => {
    assert.equal(
      hasSigningAccountAccess({
        status: "ACTIVE",
        onboarding_status: "ACTIVE",
        must_change_password: false,
      }),
      true,
    );
    assert.equal(
      hasSigningAccountAccess({
        status: "ACTIVE",
        onboarding_status: "ACTIVE",
        must_change_password: true,
      }),
      false,
    );
    assert.equal(
      hasSigningAccountAccess({
        status: "INACTIVE",
        onboarding_status: "ACTIVE",
        must_change_password: false,
      }),
      false,
    );
  });

  it("derives originating organization from primary membership", () => {
    const memberships = [
      {
        organizationId: "org-a",
        membershipRole: "MEMBER" as const,
        membershipStatus: "ACTIVE",
        organizationStatus: "ACTIVE",
      },
      {
        organizationId: "org-b",
        membershipRole: "ORG_ADMIN" as const,
        membershipStatus: "ACTIVE",
        organizationStatus: "ACTIVE",
      },
    ];
    assert.equal(
      deriveOriginatingOrganizationId({
        primaryOrganizationId: "org-b",
        memberships,
      }),
      "org-b",
    );
  });

  it("uses the sole active membership when primary is unset", () => {
    assert.equal(
      deriveOriginatingOrganizationId({
        primaryOrganizationId: null,
        memberships: [
          {
            organizationId: "org-only",
            membershipRole: "MEMBER",
            membershipStatus: "ACTIVE",
            organizationStatus: "ACTIVE",
          },
        ],
      }),
      "org-only",
    );
  });

  it("fails closed when multiple active memberships lack a valid primary", () => {
    assert.throws(
      () =>
        deriveOriginatingOrganizationId({
          primaryOrganizationId: null,
          memberships: [
            {
              organizationId: "org-a",
              membershipRole: "MEMBER",
              membershipStatus: "ACTIVE",
              organizationStatus: "ACTIVE",
            },
            {
              organizationId: "org-b",
              membershipRole: "MEMBER",
              membershipStatus: "ACTIVE",
              organizationStatus: "ACTIVE",
            },
          ],
        }),
      /AMBIGUOUS_ORGANIZATION/,
    );
  });

  it("ignores primary when it is not among active memberships and fails if ambiguous", () => {
    assert.throws(
      () =>
        deriveOriginatingOrganizationId({
          primaryOrganizationId: "org-stale",
          memberships: [
            {
              organizationId: "org-a",
              membershipRole: "MEMBER",
              membershipStatus: "ACTIVE",
              organizationStatus: "ACTIVE",
            },
            {
              organizationId: "org-b",
              membershipRole: "MEMBER",
              membershipStatus: "ACTIVE",
              organizationStatus: "ACTIVE",
            },
          ],
        }),
      /AMBIGUOUS_ORGANIZATION/,
    );
  });

  it("rejects inactive organization membership for brokerage eligibility", () => {
    assert.equal(
      isEligibleInOriginatingBrokerage({
        organizationId: "org-a",
        memberships: [
          {
            organizationId: "org-a",
            membershipRole: "MEMBER",
            membershipStatus: "ACTIVE",
            organizationStatus: "INACTIVE",
          },
        ],
      }),
      false,
    );
  });

  it("detects brokerage administrators only for the originating org", () => {
    assert.equal(
      isOriginatingBrokerageAdministrator({
        organizationId: "org-a",
        memberships: [
          {
            organizationId: "org-a",
            membershipRole: "ORG_ADMIN",
            membershipStatus: "ACTIVE",
            organizationStatus: "ACTIVE",
          },
        ],
      }),
      true,
    );
    assert.equal(
      isOriginatingBrokerageAdministrator({
        organizationId: "org-a",
        memberships: [
          {
            organizationId: "org-b",
            membershipRole: "ORG_ADMIN",
            membershipStatus: "ACTIVE",
            organizationStatus: "ACTIVE",
          },
        ],
      }),
      false,
    );
  });
});

describe("Signing authority evaluation", () => {
  const baseSigning = {
    signingId: "sig-1",
    originatingOrganizationId: "org-a",
    lifecycleState: "DRAFT",
    currentPrimaryAgentAssociationId: "assoc-1",
    associations: [
      {
        id: "assoc-1",
        agentUserId: "agent-1",
        associationRole: "PRIMARY" as const,
        effectiveEndedAt: null,
      },
    ],
  };

  const member = [
    {
      organizationId: "org-a",
      membershipRole: "MEMBER" as const,
      membershipStatus: "ACTIVE",
      organizationStatus: "ACTIVE",
    },
  ];

  it("grants current primary agent management when eligible", () => {
    const result = evaluateSigningAuthority({
      signing: baseSigning,
      actorUserId: "agent-1",
      memberships: member,
    });
    assert.equal(result.canManage, true);
    assert.equal(result.canRead, true);
  });

  it("retains historical read after association ends but removes management", () => {
    const result = evaluateSigningAuthority({
      signing: {
        ...baseSigning,
        associations: [
          {
            id: "assoc-1",
            agentUserId: "agent-1",
            associationRole: "PRIMARY",
            effectiveEndedAt: "2026-09-01T00:00:00Z",
          },
        ],
      },
      actorUserId: "agent-1",
      memberships: member,
    });
    assert.equal(result.canManage, false);
    assert.equal(result.canRead, true);
  });

  it("removes management when former primary loses brokerage eligibility", () => {
    const result = evaluateSigningAuthority({
      signing: baseSigning,
      actorUserId: "agent-1",
      memberships: [],
    });
    assert.equal(result.canManage, false);
    assert.equal(result.canRead, true);
  });

  it("denies unrelated users who only possess the Signing UUID conceptually", () => {
    const result = evaluateSigningAuthority({
      signing: baseSigning,
      actorUserId: "stranger",
      memberships: [
        {
          organizationId: "other-org",
          membershipRole: "MEMBER",
          membershipStatus: "ACTIVE",
          organizationStatus: "ACTIVE",
        },
      ],
    });
    assert.equal(result.canManage, false);
    assert.equal(result.canRead, false);
  });

  it("grants brokerage administrators management for unfinished Signings", () => {
    const result = evaluateSigningAuthority({
      signing: baseSigning,
      actorUserId: "broker-admin",
      memberships: [
        {
          organizationId: "org-a",
          membershipRole: "ORG_ADMIN",
          membershipStatus: "ACTIVE",
          organizationStatus: "ACTIVE",
        },
      ],
    });
    assert.equal(result.canManage, true);
    assert.equal(result.canRead, true);
    assert.equal(result.isBrokerageAdministrator, true);
  });

  it("grants active co-agents the same management authority", () => {
    const result = evaluateSigningAuthority({
      signing: {
        ...baseSigning,
        associations: [
          ...baseSigning.associations,
          {
            id: "assoc-2",
            agentUserId: "co-1",
            associationRole: "CO_AGENT",
            effectiveEndedAt: null,
          },
        ],
      },
      actorUserId: "co-1",
      memberships: member,
    });
    assert.equal(result.canManage, true);
    assert.equal(result.canRead, true);
  });
});

describe("Signing title normalization", () => {
  it("trims and bounds Draft titles", () => {
    assert.equal(normalizeSigningTitle("  Hello  "), "Hello");
    assert.throws(() => normalizeSigningTitle("   "), /TITLE_REQUIRED/);
    assert.throws(
      () => normalizeSigningTitle("x".repeat(SIGNING_TITLE_MAX_LENGTH + 1)),
      /TITLE_TOO_LONG/,
    );
  });
});
