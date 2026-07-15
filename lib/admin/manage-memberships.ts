import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  MembershipRole,
  OrganizationMember,
  OrganizationMemberStatus,
} from "@/lib/types/organization";
import {
  formatProfileDisplayName,
  type Profile,
} from "@/lib/types/profile";

export type AdminMembershipListItem = OrganizationMember & {
  userEmail: string | null;
  displayName: string;
  agentPhone: string | null;
  agentEmail: string | null;
  trecLicenseNumber: string | null;
};

export async function listOrganizationMemberships(
  organizationId: string,
): Promise<AdminMembershipListItem[]> {
  const admin = createAdminClient();

  const { data: memberships, error } = await admin
    .from("organization_members")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "DELETED")
    .order("create_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const userIds = Array.from(
    new Set((memberships ?? []).map((row) => row.user_id as string)),
  );

  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select(
      "id, email, preferred_name, display_name, first_name, middle_name, last_name, status, app_role, onboarding_status, create_date, update_date, invited_at, activated_at, invited_by_user_id, phone, trec_license_number, brokerage_name, notes, primary_organization_id",
    )
    .in("id", userIds);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const { data: agents, error: agentsError } = await admin
    .from("user_agent_settings")
    .select("user_id, email, phone, trec_license_number, status")
    .in("user_id", userIds)
    .neq("status", "DELETED");

  if (agentsError) {
    throw new Error(agentsError.message);
  }

  const profileById = new Map(
    (profiles ?? []).map((row) => [row.id as string, row as Profile]),
  );
  const agentByUser = new Map(
    (agents ?? []).map((row) => [row.user_id as string, row]),
  );

  return (memberships ?? []).map((row) => {
    const profile = profileById.get(row.user_id as string);
    const agent = agentByUser.get(row.user_id as string);
    return {
      ...(row as OrganizationMember),
      userEmail: profile?.email ?? null,
      displayName: profile
        ? formatProfileDisplayName(profile)
        : (row.user_id as string),
      agentPhone: (agent?.phone as string | null) ?? null,
      agentEmail: (agent?.email as string | null) ?? null,
      trecLicenseNumber: (agent?.trec_license_number as string | null) ?? null,
    };
  });
}

export async function addOrganizationMembership(options: {
  organizationId: string;
  userId: string;
  membershipRole: MembershipRole;
}): Promise<{ ok: true; membership: OrganizationMember } | { ok: false; error: string }> {
  const role = options.membershipRole;
  if (role !== "MEMBER" && role !== "ORG_ADMIN") {
    return { ok: false, error: "Invalid membership role." };
  }

  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, status")
    .eq("id", options.organizationId)
    .neq("status", "DELETED")
    .maybeSingle();

  if (orgError) {
    return { ok: false, error: orgError.message };
  }
  if (!org) {
    return { ok: false, error: "Organization not found." };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", options.userId)
    .maybeSingle();

  if (profileError) {
    return { ok: false, error: profileError.message };
  }
  if (!profile) {
    return { ok: false, error: "User profile not found." };
  }

  const { data: existing, error: existingError } = await admin
    .from("organization_members")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("user_id", options.userId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, error: existingError.message };
  }

  if (existing && existing.status === "ACTIVE") {
    return {
      ok: false,
      error: "This user already has an active membership in this organization.",
    };
  }

  if (existing) {
    const { data, error } = await admin
      .from("organization_members")
      .update({
        status: "ACTIVE",
        membership_role: role,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, membership: data as OrganizationMember };
  }

  const { data, error } = await admin
    .from("organization_members")
    .insert({
      organization_id: options.organizationId,
      user_id: options.userId,
      membership_role: role,
      status: "ACTIVE",
    })
    .select("*")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, membership: data as OrganizationMember };
}

export async function updateOrganizationMembership(options: {
  membershipId: string;
  membershipRole?: MembershipRole;
  status?: Extract<OrganizationMemberStatus, "ACTIVE" | "INACTIVE" | "DELETED">;
}): Promise<{ ok: true; membership: OrganizationMember } | { ok: false; error: string }> {
  if (
    options.membershipRole &&
    options.membershipRole !== "MEMBER" &&
    options.membershipRole !== "ORG_ADMIN"
  ) {
    return { ok: false, error: "Invalid membership role." };
  }

  if (
    options.status &&
    options.status !== "ACTIVE" &&
    options.status !== "INACTIVE" &&
    options.status !== "DELETED"
  ) {
    return { ok: false, error: "Invalid membership status." };
  }

  const patch: Record<string, string> = {};
  if (options.membershipRole) {
    patch.membership_role = options.membershipRole;
  }
  if (options.status) {
    patch.status = options.status;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No membership changes provided." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .update(patch)
    .eq("id", options.membershipId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Membership not found." };
  }

  return { ok: true, membership: data as OrganizationMember };
}
