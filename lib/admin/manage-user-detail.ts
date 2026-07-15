import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneInput } from "@/lib/phone-format";
import {
  deriveDisplayName,
  wouldRemoveFinalActiveAdmin,
} from "@/lib/admin/invite-validation";
import type {
  AppRole,
  OnboardingStatus,
  Profile,
  ProfileStatus,
} from "@/lib/types/profile";
import type { UserAgentSettings } from "@/lib/types/user-agent-settings";
import type { MembershipRole } from "@/lib/types/organization";
import { formatProfileDisplayName } from "@/lib/types/profile";

export type AdminUserDetail = {
  id: string;
  loginEmail: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
  bannedUntil: string | null;
  profile: Profile | null;
  agentSettings: UserAgentSettings | null;
  memberships: Array<{
    id: string;
    organizationId: string;
    organizationName: string;
    membershipRole: MembershipRole;
    status: string;
  }>;
};

export type UpdateAdminProfileInput = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  displayName?: string | null;
  primaryOrganizationId?: string | null;
};

export type UpdateAdminAgentSettingsInput = {
  legalFirstName?: string | null;
  legalMiddleName?: string | null;
  legalLastName?: string | null;
  preferredName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneAlternate?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  trecLicenseNumber?: string | null;
  title?: string | null;
};

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export async function getAdminUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  const admin = createAdminClient();

  const { data: authData, error: authError } =
    await admin.auth.admin.getUserById(userId);
  if (authError) {
    throw new Error(authError.message);
  }
  const authUser = authData.user;
  if (!authUser) {
    return null;
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    throw new Error(profileError.message);
  }

  const { data: agentSettings, error: agentError } = await admin
    .from("user_agent_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (agentError) {
    throw new Error(agentError.message);
  }

  const { data: memberships, error: membersError } = await admin
    .from("organization_members")
    .select("id, organization_id, membership_role, status")
    .eq("user_id", userId)
    .neq("status", "DELETED");
  if (membersError) {
    throw new Error(membersError.message);
  }

  const orgIds = Array.from(
    new Set((memberships ?? []).map((row) => row.organization_id as string)),
  );
  const orgNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs, error: orgsError } = await admin
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    if (orgsError) {
      throw new Error(orgsError.message);
    }
    for (const org of orgs ?? []) {
      orgNameById.set(org.id as string, org.name as string);
    }
  }

  return {
    id: userId,
    loginEmail: authUser.email ?? (profile?.email as string | null) ?? null,
    emailConfirmedAt: authUser.email_confirmed_at ?? null,
    lastSignInAt: authUser.last_sign_in_at ?? null,
    createdAt: authUser.created_at ?? null,
    bannedUntil: (authUser as { banned_until?: string | null }).banned_until ?? null,
    profile: (profile as Profile | null) ?? null,
    agentSettings: (agentSettings as UserAgentSettings | null) ?? null,
    memberships: (memberships ?? []).map((row) => ({
      id: row.id as string,
      organizationId: row.organization_id as string,
      organizationName:
        orgNameById.get(row.organization_id as string) ?? "Unknown organization",
      membershipRole: row.membership_role as MembershipRole,
      status: row.status as string,
    })),
  };
}

export async function updateAdminUserProfile(
  userId: string,
  input: UpdateAdminProfileInput,
): Promise<{ ok: true; profile: Profile } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const firstName = nullableTrim(input.firstName);
  const lastName = nullableTrim(input.lastName);
  if (!firstName || !lastName) {
    return { ok: false, error: "Legal first and last name are required." };
  }

  const preferredName = nullableTrim(input.preferredName);
  const middleName = nullableTrim(input.middleName);
  const displayName = deriveDisplayName({
    displayName: input.displayName,
    preferredName,
    firstName,
    middleName,
    lastName,
  });

  const { data, error } = await admin
    .from("profiles")
    .update({
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      preferred_name: preferredName,
      display_name: displayName,
      primary_organization_id: nullableTrim(input.primaryOrganizationId),
    })
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Profile not found." };
  }

  return { ok: true, profile: data as Profile };
}

export async function upsertAdminAgentSettings(
  userId: string,
  input: UpdateAdminAgentSettingsInput,
): Promise<
  { ok: true; agentSettings: UserAgentSettings } | { ok: false; error: string }
> {
  const admin = createAdminClient();
  const phone = nullableTrim(input.phone);
  const phoneAlternate = nullableTrim(input.phoneAlternate);

  const row = {
    user_id: userId,
    status: "ACTIVE" as const,
    legal_first_name: nullableTrim(input.legalFirstName),
    legal_middle_name: nullableTrim(input.legalMiddleName),
    legal_last_name: nullableTrim(input.legalLastName),
    preferred_name: nullableTrim(input.preferredName),
    display_name: nullableTrim(input.displayName),
    email: nullableTrim(input.email)?.toLowerCase() ?? null,
    phone: phone ? formatPhoneInput(phone) : null,
    phone_alternate: phoneAlternate ? formatPhoneInput(phoneAlternate) : null,
    address_line_1: nullableTrim(input.addressLine1),
    address_line_2: nullableTrim(input.addressLine2),
    city: nullableTrim(input.city),
    state: (nullableTrim(input.state)?.toUpperCase() || "TX").slice(0, 2),
    zip: nullableTrim(input.zip),
    trec_license_number: nullableTrim(input.trecLicenseNumber),
    title: nullableTrim(input.title),
  };

  const { data, error } = await admin
    .from("user_agent_settings")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, agentSettings: data as UserAgentSettings };
}

export async function listDirectoryUsersForMembershipPicker(): Promise<
  Array<{ id: string; label: string; email: string | null }>
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, email, preferred_name, display_name, first_name, middle_name, last_name, status",
    )
    .neq("status", "DELETED")
    .order("last_name", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const profile = row as Profile;
    return {
      id: profile.id,
      email: profile.email,
      label: `${formatProfileDisplayName(profile)}${
        profile.email ? ` (${profile.email})` : ""
      }`,
    };
  });
}

export async function assertCanChangeAdminAccess(options: {
  actorUserId: string;
  targetUserId: string;
  nextStatus?: Extract<ProfileStatus, "ACTIVE" | "INACTIVE">;
  nextAppRole?: AppRole;
  nextOnboarding?: OnboardingStatus;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    options.targetUserId === options.actorUserId &&
    options.nextStatus === "INACTIVE"
  ) {
    return { ok: false, error: "You cannot deactivate your own admin account." };
  }

  if (
    options.targetUserId === options.actorUserId &&
    options.nextAppRole &&
    options.nextAppRole !== "ADMIN"
  ) {
    return { ok: false, error: "You cannot demote your own admin role." };
  }

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, status, app_role, onboarding_status")
    .eq("id", options.targetUserId)
    .maybeSingle();

  if (targetError || !target) {
    return { ok: false, error: targetError?.message ?? "Profile not found." };
  }

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "ACTIVE")
    .eq("app_role", "ADMIN")
    .eq("onboarding_status", "ACTIVE");

  if (countError) {
    return { ok: false, error: countError.message };
  }

  const currentlyActiveAdmin =
    target.status === "ACTIVE" &&
    target.app_role === "ADMIN" &&
    target.onboarding_status === "ACTIVE";

  const nextStatus = options.nextStatus ?? (target.status as ProfileStatus);
  const nextRole = options.nextAppRole ?? (target.app_role as AppRole);
  const nextOnboarding =
    options.nextOnboarding ??
    (target.onboarding_status as OnboardingStatus);

  const nextIsActiveAdmin =
    nextStatus === "ACTIVE" &&
    nextRole === "ADMIN" &&
    nextOnboarding === "ACTIVE";

  if (
    wouldRemoveFinalActiveAdmin({
      activeAdminCount: count ?? 0,
      currentlyActiveAdmin,
      nextIsActiveAdmin,
    })
  ) {
    return {
      ok: false,
      error: "Cannot change the final active application administrator.",
    };
  }

  return { ok: true };
}
