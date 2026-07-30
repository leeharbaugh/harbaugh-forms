import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateOrganizationInput,
  type OrganizationInput,
} from "@/lib/admin/organization-validation";
import { recordAuditEvent } from "@/lib/audit/record";
import { buildAuditUpdateDiff } from "@/lib/audit/sanitize";
import type {
  Organization,
  OrganizationStatus,
} from "@/lib/types/organization";

export type { OrganizationInput } from "@/lib/admin/organization-validation";
export { validateOrganizationInput } from "@/lib/admin/organization-validation";

export type AdminOrganizationListItem = Organization & {
  memberCount: number;
  activeMemberCount: number;
  activeAgentCount: number;
};

export async function listAdminOrganizations(): Promise<
  AdminOrganizationListItem[]
> {
  const admin = createAdminClient();

  const { data: organizations, error } = await admin
    .from("organizations")
    .select("*")
    .neq("status", "DELETED")
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  const orgIds = (organizations ?? []).map((org) => org.id as string);
  if (orgIds.length === 0) {
    return [];
  }

  const { data: memberships, error: membersError } = await admin
    .from("organization_members")
    .select("organization_id, user_id, status")
    .in("organization_id", orgIds)
    .neq("status", "DELETED");

  if (membersError) {
    throw new Error(membersError.message);
  }

  const activeUserIds = Array.from(
    new Set(
      (memberships ?? [])
        .filter((row) => row.status === "ACTIVE")
        .map((row) => row.user_id as string),
    ),
  );

  const agentUserIds = new Set<string>();
  if (activeUserIds.length > 0) {
    const { data: agents, error: agentError } = await admin
      .from("user_agent_settings")
      .select("user_id")
      .in("user_id", activeUserIds)
      .eq("status", "ACTIVE");
    if (agentError) {
      throw new Error(agentError.message);
    }
    for (const row of agents ?? []) {
      agentUserIds.add(row.user_id as string);
    }
  }

  const countsByOrg = new Map<
    string,
    { memberCount: number; activeMemberCount: number; activeAgentCount: number }
  >();

  for (const orgId of orgIds) {
    countsByOrg.set(orgId, {
      memberCount: 0,
      activeMemberCount: 0,
      activeAgentCount: 0,
    });
  }

  for (const row of memberships ?? []) {
    const orgId = row.organization_id as string;
    const current = countsByOrg.get(orgId);
    if (!current) {
      continue;
    }
    current.memberCount += 1;
    if (row.status === "ACTIVE") {
      current.activeMemberCount += 1;
      if (agentUserIds.has(row.user_id as string)) {
        current.activeAgentCount += 1;
      }
    }
  }

  return (organizations ?? []).map((org) => {
    const counts = countsByOrg.get(org.id as string) ?? {
      memberCount: 0,
      activeMemberCount: 0,
      activeAgentCount: 0,
    };
    return {
      ...(org as Organization),
      ...counts,
    };
  });
}

export async function getAdminOrganization(
  organizationId: string,
): Promise<Organization | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .neq("status", "DELETED")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as Organization | null) ?? null;
}

export async function createOrganization(
  input: OrganizationInput,
  actor?: { userId: string; displayName?: string | null },
): Promise<{ ok: true; organization: Organization } | { ok: false; error: string }> {
  const validated = validateOrganizationInput(input);
  if (!validated.ok) {
    return validated;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .insert({
      ...validated.value,
      status: "ACTIVE",
    })
    .select("*")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  const organization = data as Organization;
  if (actor) {
    await recordAuditEvent({
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      actorRoleSnapshot: "ADMIN",
      organizationId: organization.id,
      eventCategory: "organization",
      action: "organization_created",
      targetEntityType: "organization",
      targetEntityId: organization.id,
      summary: `Created organization "${organization.name}".`,
      metadata: {
        organizationType: organization.organization_type,
      },
    });
  }

  return { ok: true, organization };
}

export async function updateOrganization(
  organizationId: string,
  input: OrganizationInput,
  actor?: { userId: string; displayName?: string | null },
): Promise<{ ok: true; organization: Organization } | { ok: false; error: string }> {
  const validated = validateOrganizationInput(input);
  if (!validated.ok) {
    return validated;
  }

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .neq("status", "DELETED")
    .maybeSingle();

  const { data, error } = await admin
    .from("organizations")
    .update(validated.value)
    .eq("id", organizationId)
    .neq("status", "DELETED")
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Organization not found." };
  }

  const organization = data as Organization;
  if (actor) {
    const diff = buildAuditUpdateDiff(
      (before ?? {}) as Record<string, unknown>,
      organization as unknown as Record<string, unknown>,
    );
    await recordAuditEvent({
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      actorRoleSnapshot: "ADMIN",
      organizationId: organization.id,
      eventCategory: "organization",
      action: "organization_updated",
      targetEntityType: "organization",
      targetEntityId: organization.id,
      summary: `Updated organization "${organization.name}".`,
      metadata: diff,
    });
  }

  return { ok: true, organization };
}

export async function setOrganizationStatus(
  organizationId: string,
  status: Extract<OrganizationStatus, "ACTIVE" | "INACTIVE">,
  actor?: {
    userId: string;
    displayName?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .update({ status })
    .eq("id", organizationId)
    .neq("status", "DELETED")
    .select("id, name")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Organization not found." };
  }

  if (actor) {
    await recordAuditEvent({
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      actorRoleSnapshot: "ADMIN",
      organizationId,
      eventCategory: "organization",
      action:
        status === "ACTIVE"
          ? "organization_reactivated"
          : "organization_deactivated",
      targetEntityType: "organization",
      targetEntityId: organizationId,
      summary:
        status === "ACTIVE"
          ? `Reactivated organization "${data.name}".`
          : `Deactivated organization "${data.name}".`,
    });
  }

  return { ok: true };
}
