import type { AppRole, OnboardingStatus, ProfileStatus } from "@/lib/types/profile";
import type { MembershipRole } from "@/lib/types/organization";

export type InviteMembershipInput = {
  organizationId: string;
  membershipRole: MembershipRole;
  brokerageOfficeId?: string | null;
};

export type LicenseVerificationInput = {
  source: "trec" | "manual";
  licenseType?: string | null;
  reportedFullName?: string | null;
  licenseStatus?: string | null;
  expirationDate?: string | null;
  relatedLicenseNumber?: string | null;
  relatedLicenseName?: string | null;
  lookupAt?: string | null;
  manualOverrideReason?: string | null;
  acknowledgedInactiveLicense?: boolean;
  acknowledgedSponsorshipMismatch?: boolean;
  sponsorshipMismatchDetails?: string | null;
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
  primaryBrokerageOfficeId?: string | null;
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
  licenseVerification?: LicenseVerificationInput | null;
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
  primaryBrokerageOfficeId: string | null;
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
  licenseVerification: LicenseVerificationInput | null;
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

  const primaryBrokerageOfficeId =
    input.primaryBrokerageOfficeId?.trim() || null;

  const additional = input.additionalMemberships ?? [];
  const membershipMap = new Map<
    string,
    { membershipRole: MembershipRole; brokerageOfficeId: string | null }
  >();
  membershipMap.set(primaryOrganizationId, {
    membershipRole: "MEMBER",
    brokerageOfficeId: primaryBrokerageOfficeId,
  });

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
    membershipMap.set(orgId, {
      membershipRole: membership.membershipRole,
      brokerageOfficeId:
        orgId === primaryOrganizationId
          ? primaryBrokerageOfficeId
          : membership.brokerageOfficeId?.trim() || null,
    });
  }

  const licenseVerification = input.licenseVerification ?? null;
  if (licenseVerification) {
    if (
      licenseVerification.source !== "trec" &&
      licenseVerification.source !== "manual"
    ) {
      return { ok: false, error: "Invalid license verification source." };
    }
    if (
      licenseVerification.source === "manual" &&
      !(licenseVerification.manualOverrideReason?.trim())
    ) {
      return {
        ok: false,
        error: "A reason is required for manual license entry or override.",
      };
    }
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
      primaryBrokerageOfficeId,
      memberships: [...membershipMap.entries()].map(
        ([organizationId, membership]) => ({
          organizationId,
          membershipRole: membership.membershipRole,
          brokerageOfficeId: membership.brokerageOfficeId,
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
      licenseVerification,
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
