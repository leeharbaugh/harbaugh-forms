/**
 * Pure eligibility helpers for Native Signing Stage 2.
 * Mirror database has_application_access / is_active_organization_member
 * without trusting browser-supplied flags.
 */

import type { OnboardingStatus, ProfileStatus } from "../types/profile";
import type { MembershipRole } from "../types/organization";

export type SigningProfileEligibility = {
  status: ProfileStatus;
  onboarding_status: OnboardingStatus;
  must_change_password?: boolean | null;
};

export type SigningOrganizationMembership = {
  organizationId: string;
  membershipRole: MembershipRole;
  membershipStatus: string;
  organizationStatus: string;
};

export function hasSigningAccountAccess(
  profile: SigningProfileEligibility,
): boolean {
  return (
    profile.status === "ACTIVE" &&
    (profile.onboarding_status === "ACTIVE" ||
      profile.onboarding_status === "INVITED") &&
    profile.must_change_password !== true
  );
}

export function isActiveSigningOrganizationMembership(
  membership: SigningOrganizationMembership,
): boolean {
  return (
    membership.membershipStatus === "ACTIVE" &&
    membership.organizationStatus === "ACTIVE"
  );
}

export function isEligibleInOriginatingBrokerage(options: {
  organizationId: string;
  memberships: readonly SigningOrganizationMembership[];
}): boolean {
  return options.memberships.some(
    (membership) =>
      membership.organizationId === options.organizationId &&
      isActiveSigningOrganizationMembership(membership),
  );
}

export function isOriginatingBrokerageAdministrator(options: {
  organizationId: string;
  memberships: readonly SigningOrganizationMembership[];
}): boolean {
  return options.memberships.some(
    (membership) =>
      membership.organizationId === options.organizationId &&
      isActiveSigningOrganizationMembership(membership) &&
      membership.membershipRole === "ORG_ADMIN",
  );
}

/**
 * Derive the originating brokerage for a new Signing from the authenticated
 * actor's current memberships. Never accepts a browser-supplied organization id.
 */
export function deriveOriginatingOrganizationId(options: {
  primaryOrganizationId: string | null;
  memberships: readonly SigningOrganizationMembership[];
}): string {
  const active = options.memberships.filter(isActiveSigningOrganizationMembership);
  if (active.length === 0) {
    throw new Error("NO_ACTIVE_ORGANIZATION");
  }

  if (
    options.primaryOrganizationId &&
    active.some((m) => m.organizationId === options.primaryOrganizationId)
  ) {
    return options.primaryOrganizationId;
  }

  if (active.length === 1) {
    return active[0].organizationId;
  }

  throw new Error("AMBIGUOUS_ORGANIZATION");
}
