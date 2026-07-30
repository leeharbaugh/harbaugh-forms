import type { AppRole, OnboardingStatus, ProfileStatus } from "@/lib/types/profile";
import type { MembershipRole } from "@/lib/types/organization";
import {
  deriveDisplayName,
  normalizeEmail,
  type InviteMembershipInput,
} from "@/lib/admin/invite-validation";
import { validateNewPassword } from "@/lib/auth/password-policy";

export type ManualCreateUserInput = {
  loginEmail: string;
  temporaryPassword: string;
  confirmTemporaryPassword?: string;
  appRole?: AppRole;
  accountStatus?: ProfileStatus;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  preferredName?: string | null;
  displayName?: string | null;
  primaryOrganizationId: string;
  membershipRole?: MembershipRole;
  isTestUser?: boolean;
};

export type NormalizedManualCreateInput = {
  loginEmail: string;
  temporaryPassword: string;
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
  isTestUser: boolean;
  mustChangePassword: true;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ManualCreateValidationResult =
  | { ok: true; value: NormalizedManualCreateInput }
  | { ok: false; error: string };

export function validateManualCreateUserInput(
  input: ManualCreateUserInput,
): ManualCreateValidationResult {
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
  if (appRole !== "USER" && appRole !== "ADMIN") {
    return { ok: false, error: "Invalid application role." };
  }

  const accountStatus: ProfileStatus = input.accountStatus ?? "ACTIVE";
  if (accountStatus !== "ACTIVE" && accountStatus !== "INACTIVE") {
    return { ok: false, error: "Invalid account status." };
  }

  const membershipRole: MembershipRole = input.membershipRole ?? "MEMBER";
  if (membershipRole !== "MEMBER" && membershipRole !== "ORG_ADMIN") {
    return { ok: false, error: "Invalid organization membership role." };
  }

  const password = input.temporaryPassword ?? "";
  const confirm =
    input.confirmTemporaryPassword === undefined
      ? password
      : input.confirmTemporaryPassword;
  const policy = validateNewPassword({
    password,
    confirmPassword: confirm,
  });
  if (!policy.ok) {
    return policy;
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

  return {
    ok: true,
    value: {
      loginEmail,
      temporaryPassword: password,
      appRole,
      accountStatus,
      onboardingStatus: accountStatus === "ACTIVE" ? "ACTIVE" : "DISABLED",
      firstName,
      middleName,
      lastName,
      preferredName,
      displayName,
      primaryOrganizationId,
      memberships: [
        { organizationId: primaryOrganizationId, membershipRole },
      ],
      isTestUser: Boolean(input.isTestUser),
      mustChangePassword: true,
    },
  };
}
