import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole, OnboardingStatus, ProfileStatus } from "@/lib/types/profile";
import type { MembershipRole } from "@/lib/types/organization";
import { formatProfileDisplayName } from "@/lib/types/profile";

export type AdminUserListItem = {
  id: string;
  loginEmail: string | null;
  displayName: string;
  preferredName: string | null;
  appRole: AppRole | null;
  profileStatus: ProfileStatus | null;
  onboardingStatus: OnboardingStatus | null;
  primaryOrganizationId: string | null;
  primaryOrganizationName: string | null;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    membershipRole: MembershipRole;
    status: string;
  }>;
  invitedAt: string | null;
  activatedAt: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  agentSettingsComplete: boolean;
  agentPhone: string | null;
  agentEmail: string | null;
  trecLicenseNumber: string | null;
  emailConfirmedAt: string | null;
};

function isAgentSettingsComplete(row: {
  legal_first_name: string | null;
  legal_last_name: string | null;
  email: string | null;
  phone: string | null;
  trec_license_number: string | null;
} | null): boolean {
  if (!row) {
    return false;
  }
  return Boolean(
    row.legal_first_name?.trim() &&
      row.legal_last_name?.trim() &&
      row.email?.trim() &&
      row.phone?.trim() &&
      row.trec_license_number?.trim(),
  );
}

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  const admin = createAdminClient();

  const authUsers: Array<{
    id: string;
    email?: string;
    created_at?: string;
    last_sign_in_at?: string;
    email_confirmed_at?: string;
  }> = [];

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw new Error(error.message);
    }
    authUsers.push(...data.users);
    if (data.users.length < 200) {
      break;
    }
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select(
      "id, email, app_role, status, onboarding_status, preferred_name, display_name, first_name, middle_name, last_name, primary_organization_id, invited_at, activated_at, create_date",
    );
  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const { data: organizations, error: orgsError } = await admin
    .from("organizations")
    .select("id, name")
    .neq("status", "DELETED");
  if (orgsError) {
    throw new Error(orgsError.message);
  }

  const orgNameById = new Map(
    (organizations ?? []).map((org) => [org.id as string, org.name as string]),
  );

  const { data: memberships, error: membersError } = await admin
    .from("organization_members")
    .select("user_id, organization_id, membership_role, status")
    .eq("status", "ACTIVE");
  if (membersError) {
    throw new Error(membersError.message);
  }

  const membershipsByUser = new Map<
    string,
    AdminUserListItem["memberships"]
  >();
  for (const row of memberships ?? []) {
    const userId = row.user_id as string;
    const list = membershipsByUser.get(userId) ?? [];
    list.push({
      organizationId: row.organization_id as string,
      organizationName:
        orgNameById.get(row.organization_id as string) ?? "Unknown organization",
      membershipRole: row.membership_role as MembershipRole,
      status: row.status as string,
    });
    membershipsByUser.set(userId, list);
  }

  const { data: agentSettings, error: agentError } = await admin
    .from("user_agent_settings")
    .select(
      "user_id, legal_first_name, legal_last_name, email, phone, trec_license_number, status",
    )
    .eq("status", "ACTIVE");
  if (agentError) {
    throw new Error(agentError.message);
  }

  const agentByUser = new Map(
    (agentSettings ?? []).map((row) => [row.user_id as string, row]),
  );

  const profileById = new Map(
    (profiles ?? []).map((row) => [row.id as string, row]),
  );

  const items: AdminUserListItem[] = authUsers.map((user) => {
    const profile = profileById.get(user.id);
    const displayName = profile
      ? formatProfileDisplayName({
          first_name: (profile.first_name as string | null) ?? null,
          middle_name: (profile.middle_name as string | null) ?? null,
          last_name: (profile.last_name as string | null) ?? null,
          preferred_name: (profile.preferred_name as string | null) ?? null,
          display_name: (profile.display_name as string | null) ?? null,
          email: (profile.email as string | null) ?? user.email ?? null,
        })
      : user.email ?? user.id;

    const primaryOrganizationId =
      (profile?.primary_organization_id as string | null) ?? null;

    return {
      id: user.id,
      loginEmail: user.email ?? (profile?.email as string | null) ?? null,
      displayName,
      preferredName: (profile?.preferred_name as string | null) ?? null,
      appRole: (profile?.app_role as AppRole | null) ?? null,
      profileStatus: (profile?.status as ProfileStatus | null) ?? null,
      onboardingStatus:
        (profile?.onboarding_status as OnboardingStatus | null) ?? null,
      primaryOrganizationId,
      primaryOrganizationName: primaryOrganizationId
        ? (orgNameById.get(primaryOrganizationId) ?? null)
        : null,
      memberships: membershipsByUser.get(user.id) ?? [],
      invitedAt: (profile?.invited_at as string | null) ?? null,
      activatedAt: (profile?.activated_at as string | null) ?? null,
      createdAt: user.created_at ?? (profile?.create_date as string | null) ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      agentSettingsComplete: isAgentSettingsComplete(
        agentByUser.get(user.id) ?? null,
      ),
      agentPhone: (agentByUser.get(user.id)?.phone as string | null) ?? null,
      agentEmail: (agentByUser.get(user.id)?.email as string | null) ?? null,
      trecLicenseNumber:
        (agentByUser.get(user.id)?.trec_license_number as string | null) ?? null,
      emailConfirmedAt: user.email_confirmed_at ?? null,
    };
  });

  items.sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });

  return items;
}
