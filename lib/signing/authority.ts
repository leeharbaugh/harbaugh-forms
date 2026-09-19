/**
 * Pure Signing authority evaluation.
 * Distinguishes current management vs historical/read vs none.
 * Agents (PRIMARY/CO_AGENT), Transaction Coordinators, and ORG_ADMIN
 * are separate authority paths — TC is never injected into agent predicates.
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

export type SigningOperatorAssociationSnapshot = {
  id: string;
  operatorUserId: string;
  operatorRole: "TRANSACTION_COORDINATOR";
  status: string;
  effectiveEndedAt: string | null;
  signingOperatorDelegationId: string | null;
};

/**
 * Persistent delegation snapshot used to revalidate TC manage authority.
 * Manage requires a currently ACTIVE, unended, unrevoked grant.
 */
export type SigningOperatorDelegationSnapshot = {
  id: string;
  organizationId: string;
  responsibleUserId: string;
  delegateUserId: string;
  operatorRole: "TRANSACTION_COORDINATOR";
  status: string;
  revokedAt: string | null;
  effectiveEndedAt: string | null;
};

export type SigningAuthoritySnapshot = {
  signingId: string;
  originatingOrganizationId: string;
  lifecycleState: string;
  currentPrimaryAgentAssociationId: string | null;
  /** Immutable responsible sender User id when known. */
  originalSenderUserId: string | null;
  associations: readonly SigningAssociationSnapshot[];
  operatorAssociations?: readonly SigningOperatorAssociationSnapshot[];
  /**
   * Delegations for this actor (or relevant to associations on this Signing).
   * Caller supplies rows needed to revalidate active TC manage authority.
   */
  operatorDelegations?: readonly SigningOperatorDelegationSnapshot[];
};

export type SigningAuthorityResult = {
  canRead: boolean;
  canManage: boolean;
  /** Active PRIMARY/CO_AGENT association for this actor, if any. */
  activeAssociation: SigningAssociationSnapshot | null;
  /** Any historical agent association for this actor (including ended). */
  historicalAssociation: SigningAssociationSnapshot | null;
  /** Active TC operator association when manage is currently valid. */
  activeOperatorAssociation: SigningOperatorAssociationSnapshot | null;
  /** Any historical operator association (including ended / post-revoke). */
  historicalOperatorAssociation: SigningOperatorAssociationSnapshot | null;
  isBrokerageAdministrator: boolean;
  /** True when manage is granted through an active TC path. */
  isTransactionCoordinator: boolean;
};

function isActiveAssociation(
  association: SigningAssociationSnapshot,
): boolean {
  return association.effectiveEndedAt == null;
}

function isActiveOperatorAssociation(
  association: SigningOperatorAssociationSnapshot,
): boolean {
  return (
    association.status === "ACTIVE" && association.effectiveEndedAt == null
  );
}

function isCurrentlyValidDelegation(
  delegation: SigningOperatorDelegationSnapshot,
  options: {
    organizationId: string;
    delegateUserId: string;
    responsibleUserId: string | null;
  },
): boolean {
  if (delegation.operatorRole !== "TRANSACTION_COORDINATOR") return false;
  if (delegation.status !== "ACTIVE") return false;
  if (delegation.revokedAt != null) return false;
  if (delegation.effectiveEndedAt != null) return false;
  if (delegation.organizationId !== options.organizationId) return false;
  if (delegation.delegateUserId !== options.delegateUserId) return false;
  if (
    options.responsibleUserId &&
    delegation.responsibleUserId !== options.responsibleUserId
  ) {
    return false;
  }
  return true;
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

  const operatorAssociations = signing.operatorAssociations ?? [];
  const actorOperatorAssociations = operatorAssociations.filter(
    (association) => association.operatorUserId === actorUserId,
  );
  const historicalOperatorAssociation = actorOperatorAssociations[0] ?? null;

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

  const responsibleUserId =
    signing.originalSenderUserId ??
    signing.associations.find(
      (row) =>
        row.id === signing.currentPrimaryAgentAssociationId ||
        (row.associationRole === "PRIMARY" && row.effectiveEndedAt == null),
    )?.agentUserId ??
    null;

  const delegations = signing.operatorDelegations ?? [];

  let activeOperatorAssociation: SigningOperatorAssociationSnapshot | null =
    null;
  for (const association of actorOperatorAssociations) {
    if (!isActiveOperatorAssociation(association)) continue;
    if (!association.signingOperatorDelegationId) continue;
    const delegation = delegations.find(
      (row) => row.id === association.signingOperatorDelegationId,
    );
    if (
      delegation &&
      isCurrentlyValidDelegation(delegation, {
        organizationId: signing.originatingOrganizationId,
        delegateUserId: actorUserId,
        responsibleUserId,
      })
    ) {
      activeOperatorAssociation = association;
      break;
    }
  }

  let canManage = false;
  let isTransactionCoordinator = false;
  if (unfinished && eligibleInBrokerage) {
    if (isBrokerageAdministrator) {
      canManage = true;
    }
    if (
      activeAssociation &&
      (activeAssociation.associationRole === "PRIMARY" ||
        activeAssociation.associationRole === "CO_AGENT")
    ) {
      canManage = true;
    }
    if (activeOperatorAssociation) {
      canManage = true;
      isTransactionCoordinator = true;
    }
  }

  // Historical read: former agents and former/revoked TCs who genuinely
  // operated this Signing retain read. Historical read never restores manage.
  const canRead =
    canManage ||
    isBrokerageAdministrator ||
    historicalAssociation != null ||
    historicalOperatorAssociation != null;

  return {
    canRead,
    canManage,
    activeAssociation,
    historicalAssociation,
    activeOperatorAssociation,
    historicalOperatorAssociation,
    isBrokerageAdministrator,
    isTransactionCoordinator,
  };
}

/**
 * Whether an active manager may request Retry Finalization once Stage 6 exists.
 * Does not authorize artifact mutation, forced Complete, or worker resume.
 * Recoverable finalization failure remains an unfinished (IN_PROGRESS) Signing;
 * completed Signings are not re-managed through this helper.
 */
export function canRequestRetryFinalization(
  authority: SigningAuthorityResult,
  lifecycleState: string,
): boolean {
  return authority.canManage && lifecycleState === "IN_PROGRESS";
}

/**
 * Whether an active manager (or historical reader with prior operator/agent
 * association) may read **completed-package** business artifacts via trusted
 * server mediation after lifecycle Complete.
 *
 * Cancelled / Declined Signings may retain prepared or abandoned finalization
 * attempts; those must not be treated as a completed package through this
 * helper. Never implies direct Storage access.
 */
export function canReadCompletedSigningArtifacts(
  authority: SigningAuthorityResult,
  lifecycleState: string,
): boolean {
  if (lifecycleState !== "COMPLETE") {
    return false;
  }
  return authority.canRead;
}
