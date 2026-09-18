/**
 * Persistent Transaction Coordinator delegation grant/revoke.
 * Trusted-server mutations only; browsers cannot self-grant.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNativeSigningEnabled } from "./feature-gate";
import { SigningError } from "./errors";
import {
  hasSigningAccountAccess,
  isActiveSigningOrganizationMembership,
  isOriginatingBrokerageAdministrator,
  type SigningOrganizationMembership,
} from "./eligibility";
import { isUuid, type SigningActor } from "./types";
import { formatProfileDisplayName } from "@/lib/types/profile";
import type { Profile } from "@/lib/types/profile";

export type SigningOperatorDelegationRow = {
  id: string;
  create_date: string;
  update_date: string;
  organization_id: string;
  responsible_user_id: string;
  delegate_user_id: string;
  operator_role: "TRANSACTION_COORDINATOR";
  status: string;
  granted_by_user_id: string | null;
  effective_started_at: string;
  effective_ended_at: string | null;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
  revoke_reason: string | null;
};

export type GrantOperatorDelegationInput = {
  organizationId: unknown;
  responsibleUserId: unknown;
  delegateUserId: unknown;
};

export type RevokeOperatorDelegationInput = {
  delegationId: unknown;
  reason?: unknown;
};

function assertCanGrantDelegation(options: {
  actor: SigningActor;
  organizationId: string;
  responsibleUserId: string;
  delegateUserId: string;
}): void {
  const { actor, organizationId, responsibleUserId, delegateUserId } = options;

  if (delegateUserId === responsibleUserId) {
    throw new SigningError(
      "INVALID_INPUT",
      "A User cannot be their own Transaction Coordinator.",
    );
  }
  if (actor.userId === delegateUserId) {
    throw new SigningError(
      "FORBIDDEN",
      "A Transaction Coordinator cannot grant their own delegation.",
    );
  }

  const isResponsible = actor.userId === responsibleUserId;
  const isOrgAdmin = isOriginatingBrokerageAdministrator({
    organizationId,
    memberships: actor.memberships,
  });

  if (!isResponsible && !isOrgAdmin) {
    throw new SigningError(
      "FORBIDDEN",
      "Only the responsible User or an organization administrator may grant Transaction Coordinator authority.",
    );
  }

  // App/Global Admin alone never creates a business TC delegation.
  if (
    !isResponsible &&
    !isOrgAdmin &&
    actor.profile.app_role === "ADMIN"
  ) {
    throw new SigningError(
      "FORBIDDEN",
      "Application administrators cannot grant business Transaction Coordinator delegations.",
    );
  }
}

async function loadEligibleOrgMemberProfile(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<{ profile: Profile; membership: SigningOrganizationMembership }> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) {
    throw new SigningError("NOT_FOUND", "User not found.");
  }
  const typed = profile as Profile;
  if (!hasSigningAccountAccess(typed)) {
    throw new SigningError(
      "INELIGIBLE_ACCOUNT",
      "That User is not eligible for Native Signing.",
    );
  }

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("organization_id, membership_role, status, organizations(status)")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership) {
    throw new SigningError(
      "INELIGIBLE_ORGANIZATION",
      "That User is not an active member of the organization.",
    );
  }

  const org = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations;
  if (!org || org.status !== "ACTIVE") {
    throw new SigningError(
      "INELIGIBLE_ORGANIZATION",
      "The organization is not active.",
    );
  }

  const mapped: SigningOrganizationMembership = {
    organizationId: membership.organization_id as string,
    membershipRole: membership.membership_role as "MEMBER" | "ORG_ADMIN",
    membershipStatus: membership.status as string,
    organizationStatus: org.status as string,
  };
  if (!isActiveSigningOrganizationMembership(mapped)) {
    throw new SigningError(
      "INELIGIBLE_ORGANIZATION",
      "That User is not eligible in the organization.",
    );
  }

  return { profile: typed, membership: mapped };
}

/**
 * Grant an ACTIVE TRANSACTION_COORDINATOR delegation.
 * Supports many-to-many: one TC → many responsible Users and vice versa.
 */
export async function grantOperatorDelegationWithActor(
  actor: SigningActor,
  input: GrantOperatorDelegationInput,
  admin: SupabaseClient,
): Promise<SigningOperatorDelegationRow> {
  assertNativeSigningEnabled();

  if (!isUuid(input.organizationId)) {
    throw new SigningError("INVALID_INPUT", "Invalid organization id.");
  }
  if (!isUuid(input.responsibleUserId)) {
    throw new SigningError("INVALID_INPUT", "Invalid responsible User id.");
  }
  if (!isUuid(input.delegateUserId)) {
    throw new SigningError("INVALID_INPUT", "Invalid delegate User id.");
  }

  const organizationId = input.organizationId;
  const responsibleUserId = input.responsibleUserId;
  const delegateUserId = input.delegateUserId;

  assertCanGrantDelegation({
    actor,
    organizationId,
    responsibleUserId,
    delegateUserId,
  });

  // Grantor must themselves be eligible in the organization.
  if (
    !actor.memberships.some(
      (m) =>
        m.organizationId === organizationId &&
        isActiveSigningOrganizationMembership(m),
    )
  ) {
    throw new SigningError(
      "INELIGIBLE_ORGANIZATION",
      "You are not an active member of that organization.",
    );
  }

  await loadEligibleOrgMemberProfile(admin, responsibleUserId, organizationId);
  const delegate = await loadEligibleOrgMemberProfile(
    admin,
    delegateUserId,
    organizationId,
  );

  const { data: existing, error: existingError } = await admin
    .from("signing_operator_delegations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("responsible_user_id", responsibleUserId)
    .eq("delegate_user_id", delegateUserId)
    .eq("operator_role", "TRANSACTION_COORDINATOR")
    .eq("status", "ACTIVE")
    .is("revoked_at", null)
    .is("effective_ended_at", null)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    throw new SigningError(
      "CONFLICT",
      "An active Transaction Coordinator delegation already exists.",
    );
  }

  const { data: inserted, error: insertError } = await admin
    .from("signing_operator_delegations")
    .insert({
      organization_id: organizationId,
      responsible_user_id: responsibleUserId,
      delegate_user_id: delegateUserId,
      operator_role: "TRANSACTION_COORDINATOR",
      status: "ACTIVE",
      granted_by_user_id: actor.userId,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(
      insertError?.message ?? "Failed to grant Transaction Coordinator delegation.",
    );
  }

  // Display name of delegate is not persisted on the delegation row; callers
  // that need a snapshot use Signing operator associations at create time.
  void formatProfileDisplayName(delegate.profile);

  return inserted as SigningOperatorDelegationRow;
}

/**
 * Revoke a delegation. Takes effect on the next authoritative action.
 * Ends active Signing operator associations that reference this grant so
 * manage fails immediately while historical association rows remain for read.
 */
export async function revokeOperatorDelegationWithActor(
  actor: SigningActor,
  input: RevokeOperatorDelegationInput,
  admin: SupabaseClient,
): Promise<SigningOperatorDelegationRow> {
  assertNativeSigningEnabled();

  if (!isUuid(input.delegationId)) {
    throw new SigningError("INVALID_INPUT", "Invalid delegation id.");
  }

  const { data: delegation, error } = await admin
    .from("signing_operator_delegations")
    .select("*")
    .eq("id", input.delegationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!delegation) {
    throw new SigningError("NOT_FOUND", "Delegation not found.");
  }

  const row = delegation as SigningOperatorDelegationRow;
  if (row.status !== "ACTIVE" || row.revoked_at != null) {
    throw new SigningError("CONFLICT", "Delegation is already inactive.");
  }

  assertCanGrantDelegation({
    actor,
    organizationId: row.organization_id,
    responsibleUserId: row.responsible_user_id,
    // Revoke uses the same grantor gate; pass the existing delegate so
    // self-revoke-as-delegate is rejected (TC cannot revoke via self-grant path).
    delegateUserId: row.delegate_user_id,
  });

  // Delegate cannot revoke their own grant.
  if (actor.userId === row.delegate_user_id) {
    throw new SigningError(
      "FORBIDDEN",
      "A Transaction Coordinator cannot revoke their own delegation.",
    );
  }

  const reason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim().slice(0, 500)
      : "REVOKED";

  const revokedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("signing_operator_delegations")
    .update({
      status: "REVOKED",
      revoked_at: revokedAt,
      revoked_by_user_id: actor.userId,
      revoke_reason: reason,
      // Prefer server-side end timestamp via revoked_at; avoid client clock
      // skew vs effective_started_at violating sod_effective_range.
    })
    .eq("id", row.id)
    .eq("status", "ACTIVE")
    .is("revoked_at", null)
    .select("*")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) {
    throw new SigningError("CONFLICT", "Delegation could not be revoked.");
  }

  // End active operator associations tied to this delegation (historical retain).
  // Do not set effective_ended_at from the client clock: skew vs server
  // effective_started_at can violate soa_effective_range. Status ENDED alone
  // removes manage authority; partial unique index is status=ACTIVE only.
  const { data: endedAssociations, error: endAssocError } = await admin
    .from("signing_operator_associations")
    .update({
      status: "ENDED",
      end_reason: "DELEGATION_REVOKED",
      ended_by_user_id: actor.userId,
    })
    .eq("signing_operator_delegation_id", row.id)
    .eq("status", "ACTIVE")
    .is("effective_ended_at", null)
    .select("id");
  if (endAssocError) throw new Error(endAssocError.message);

  // Release open amendment locks held by ended operator associations so a
  // revoked TC cannot leave the package locked until TTL expiry.
  const endedIds = (endedAssociations ?? [])
    .map((assoc) => assoc.id as string)
    .filter(Boolean);
  if (endedIds.length > 0) {
    const { error: releaseLockError } = await admin
      .from("signing_amendment_locks")
      .update({
        released_at: revokedAt,
        release_reason: "DELEGATION_REVOKED",
      })
      .in("held_by_operator_association_id", endedIds)
      .is("released_at", null);
    if (releaseLockError) throw new Error(releaseLockError.message);
  }

  return updated as SigningOperatorDelegationRow;
}

/**
 * Find an ACTIVE delegation for TC → responsible User in an organization.
 */
export async function findActiveOperatorDelegation(
  admin: SupabaseClient,
  options: {
    organizationId: string;
    responsibleUserId: string;
    delegateUserId: string;
  },
): Promise<SigningOperatorDelegationRow | null> {
  const { data, error } = await admin
    .from("signing_operator_delegations")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("responsible_user_id", options.responsibleUserId)
    .eq("delegate_user_id", options.delegateUserId)
    .eq("operator_role", "TRANSACTION_COORDINATOR")
    .eq("status", "ACTIVE")
    .is("revoked_at", null)
    .is("effective_ended_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SigningOperatorDelegationRow | null) ?? null;
}
