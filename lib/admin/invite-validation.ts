import type { AppRole, OnboardingStatus, ProfileStatus } from "@/lib/types/profile";
import type { MembershipRole } from "@/lib/types/organization";

export type InviteMembershipInput = {
  organizationId: string;
  membershipRole: MembershipRole;
};

export type InviteUserInput = {
  loginEmail: string;
  appRole?: AppRole;
  accountStatus?: ProfileStatus;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  preferredName?: string | null;
  displayName?: string | null;
  primaryOrganizationId: string;
  additionalMemberships?: InviteMembershipInput[];
  agentEmail?: string | null;
  agentPhone?: string | null;
  trecLicenseNumber?: string | null;
  title?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type InviteValidationResult =
  | { ok: true; value: NormalizedInviteInput }
  | { ok: false; error: string };

export type NormalizedInviteInput = {
  loginEmail: string;
  appRole: AppRole;
  accountStatus: ProfileStatus;
  onboardingStatus: OnboardingStatus;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  displayName: string;
  primaryOrganizationId: string;
  memberships: InviteMembershipInput[];
  agentEmail: string | null;
  agentPhone: string | null;
  trecLicenseNumber: string | null;
  title: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function deriveDisplayName(options: {
  displayName?: string | null;
  preferredName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const explicit = options.displayName?.trim();
  if (explicit) {
    return explicit;
  }

  const preferred = options.preferredName?.trim();
  if (preferred) {
    return preferred;
  }

  const legal = [options.firstName, options.middleName, options.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (legal) {
    return legal;
  }

  return options.email?.trim() || "User";
}

export function validateInviteUserInput(
  input: InviteUserInput,
): InviteValidationResult {
  const loginEmail = normalizeEmail(input.loginEmail);
  if (!loginEmail || !EMAIL_RE.test(loginEmail)) {
    return { ok: false, error: "A valid login email is required." };
  }

  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  if (!firstName || !lastName) {
    return { ok: false, error: "Legal first and last name are required." };
  }

  const primaryOrganizationId = input.primaryOrganizationId?.trim() ?? "";
  if (!primaryOrganizationId) {
    return { ok: false, error: "A primary organization is required." };
  }

  const appRole: AppRole = input.appRole ?? "USER";
  if (appRole !== "USER") {
    return {
      ok: false,
      error: "Beta invitations may only create USER accounts.",
    };
  }

  const accountStatus: ProfileStatus = input.accountStatus ?? "ACTIVE";
  if (accountStatus !== "ACTIVE" && accountStatus !== "INACTIVE") {
    return { ok: false, error: "Invalid account status." };
  }

  const additional = input.additionalMemberships ?? [];
  const membershipMap = new Map<string, MembershipRole>();
  membershipMap.set(primaryOrganizationId, "MEMBER");

  for (const membership of additional) {
    const orgId = membership.organizationId?.trim();
    if (!orgId) {
      return { ok: false, error: "Organization membership is incomplete." };
    }
    if (
      membership.membershipRole !== "MEMBER" &&
      membership.membershipRole !== "ORG_ADMIN"
    ) {
      return { ok: false, error: "Invalid organization membership role." };
    }
    membershipMap.set(orgId, membership.membershipRole);
  }

  // Primary defaults to MEMBER unless an additional entry overrides it.
  if (!membershipMap.has(primaryOrganizationId)) {
    membershipMap.set(primaryOrganizationId, "MEMBER");
  }

  const middleName = input.middleName?.trim() || null;
  const preferredName = input.preferredName?.trim() || null;
  const displayName = deriveDisplayName({
    displayName: input.displayName,
    preferredName,
    firstName,
    middleName,
    lastName,
    email: loginEmail,
  });

  const agentEmailRaw = input.agentEmail?.trim() || null;
  const agentEmail = agentEmailRaw ? normalizeEmail(agentEmailRaw) : null;
  if (agentEmail && !EMAIL_RE.test(agentEmail)) {
    return { ok: false, error: "Agent/business email is invalid." };
  }

  return {
    ok: true,
    value: {
      loginEmail,
      appRole,
      accountStatus,
      onboardingStatus: accountStatus === "ACTIVE" ? "INVITED" : "DISABLED",
      firstName,
      middleName,
      lastName,
      preferredName,
      displayName,
      primaryOrganizationId,
      memberships: [...membershipMap.entries()].map(
        ([organizationId, membershipRole]) => ({
          organizationId,
          membershipRole,
        }),
      ),
      agentEmail,
      agentPhone: input.agentPhone?.trim() || null,
      trecLicenseNumber: input.trecLicenseNumber?.trim() || null,
      title: input.title?.trim() || null,
      addressLine1: input.addressLine1?.trim() || null,
      addressLine2: input.addressLine2?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim()?.toUpperCase() || "TX",
      zip: input.zip?.trim() || null,
    },
  };
}

export function wouldRemoveFinalActiveAdmin(options: {
  activeAdminCount: number;
  currentlyActiveAdmin: boolean;
  nextIsActiveAdmin: boolean;
}): boolean {
  if (!options.currentlyActiveAdmin || options.nextIsActiveAdmin) {
    return false;
  }
  return options.activeAdminCount <= 1;
}

export function isUsableApplicationAccount(profile: {
  status: ProfileStatus;
  onboarding_status: OnboardingStatus;
}): boolean {
  return (
    profile.status === "ACTIVE" &&
    (profile.onboarding_status === "ACTIVE" ||
      profile.onboarding_status === "INVITED")
  );
}
