/**
 * Pure Signing authority evaluation for Stage 2.
 * Distinguishes current management vs historical/read vs none.
 */

import {
  isEligibleInOriginatingBrokerage,
  isOriginatingBrokerageAdministrator,
  type SigningOrganizationMembership,
} from "./eligibility";

export type SigningAssociationSnapshot = {
  id: string;
  agentUserId: string | null;
  associationRole: "PRIMARY" | "CO_AGENT";
  effectiveEndedAt: string | null;
};

export type SigningAuthoritySnapshot = {
  signingId: string;
  originatingOrganizationId: string;
  lifecycleState: string;
  currentPrimaryAgentAssociationId: string | null;
  associations: readonly SigningAssociationSnapshot[];
};

export type SigningAuthorityResult = {
  canRead: boolean;
  canManage: boolean;
  /** Active PRIMARY/CO_AGENT association for this actor, if any. */
  activeAssociation: SigningAssociationSnapshot | null;
  /** Any historical association for this actor (including ended). */
  historicalAssociation: SigningAssociationSnapshot | null;
  isBrokerageAdministrator: boolean;
};

function isActiveAssociation(
  association: SigningAssociationSnapshot,
): boolean {
  return association.effectiveEndedAt == null;
}

export function evaluateSigningAuthority(options: {
  signing: SigningAuthoritySnapshot;
  actorUserId: string;
  memberships: readonly SigningOrganizationMembership[];
}): SigningAuthorityResult {
  const { signing, actorUserId, memberships } = options;

  const actorAssociations = signing.associations.filter(
    (association) => association.agentUserId === actorUserId,
  );
  const activeAssociation =
    actorAssociations.find(isActiveAssociation) ?? null;
  const historicalAssociation = actorAssociations[0] ?? null;

  const isBrokerageAdministrator = isOriginatingBrokerageAdministrator({
    organizationId: signing.originatingOrganizationId,
    memberships,
  });

  const eligibleInBrokerage = isEligibleInOriginatingBrokerage({
    organizationId: signing.originatingOrganizationId,
    memberships,
  });

  const unfinished =
    signing.lifecycleState === "DRAFT" ||
    signing.lifecycleState === "IN_PROGRESS";

  let canManage = false;
  if (unfinished && eligibleInBrokerage) {
    if (isBrokerageAdministrator) {
      canManage = true;
    } else if (
      activeAssociation &&
      (activeAssociation.associationRole === "PRIMARY" ||
        activeAssociation.associationRole === "CO_AGENT")
    ) {
      canManage = true;
    }
  }

  const canRead =
    canManage ||
    isBrokerageAdministrator ||
    historicalAssociation != null;

  return {
    canRead,
    canManage,
    activeAssociation,
    historicalAssociation,
    isBrokerageAdministrator,
  };
}
