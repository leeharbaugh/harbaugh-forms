import "server-only";

import { recordAuditEvent } from "@/lib/audit/record";
import { buildAuditUpdateDiff } from "@/lib/audit/sanitize";
import {
  validateBrokerageOfficeInput,
  type BrokerageOfficeInput,
} from "@/lib/admin/brokerage-office-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export type { BrokerageOfficeInput } from "@/lib/admin/brokerage-office-validation";
export { validateBrokerageOfficeInput } from "@/lib/admin/brokerage-office-validation";

export type BrokerageOfficeStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type BrokerageOffice = {
  id: string;
  create_date: string;
  update_date: string;
  status: BrokerageOfficeStatus;
  organization_id: string;
  office_name: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  office_phone: string | null;
  branch_license_number: string | null;
  is_main_office: boolean;
};

export type OfficeDeactivationBlocker = {
  activeMembershipCount: number;
  memberships: Array<{
    id: string;
    user_id: string;
    membership_role: string;
  }>;
};

function toRow(input: BrokerageOfficeInput) {
  return {
    organization_id: input.organizationId,
    office_name: input.officeName,
    address_line_1: input.addressLine1 ?? null,
    address_line_2: input.addressLine2 ?? null,
    city: input.city ?? null,
    state: input.state ?? "TX",
    zip: input.zip ?? null,
    office_phone: input.officePhone ?? null,
    branch_license_number: input.branchLicenseNumber ?? null,
    is_main_office: Boolean(input.isMainOffice),
  };
}

export async function listBrokerageOffices(options?: {
  organizationId?: string;
  includeInactive?: boolean;
}): Promise<BrokerageOffice[]> {
  const admin = createAdminClient();
  let query = admin
    .from("brokerage_offices")
    .select("*")
    .neq("status", "DELETED")
    .order("is_main_office", { ascending: false })
    .order("office_name");

  if (options?.organizationId) {
    query = query.eq("organization_id", options.organizationId);
  }
  if (!options?.includeInactive) {
    query = query.eq("status", "ACTIVE");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as BrokerageOffice[];
}

export async function listActiveOfficesForAssignment(
  organizationId: string,
): Promise<BrokerageOffice[]> {
  return listBrokerageOffices({
    organizationId,
    includeInactive: false,
  });
}

export async function createBrokerageOffice(options: {
  input: BrokerageOfficeInput;
  actorUserId: string;
  actorDisplayName?: string | null;
}): Promise<{ ok: true; office: BrokerageOffice } | { ok: false; error: string }> {
  const validated = validateBrokerageOfficeInput(options.input);
  if (!validated.ok) {
    return validated;
  }

  const admin = createAdminClient();
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, status, name")
    .eq("id", validated.value.organizationId)
    .neq("status", "DELETED")
    .maybeSingle();

  if (orgError) {
    return { ok: false, error: orgError.message };
  }
  if (!org || org.status !== "ACTIVE") {
    return { ok: false, error: "Organization is missing or inactive." };
  }

  if (validated.value.isMainOffice) {
    const { error: clearError } = await admin
      .from("brokerage_offices")
      .update({ is_main_office: false })
      .eq("organization_id", validated.value.organizationId)
      .eq("status", "ACTIVE")
      .eq("is_main_office", true);
    if (clearError) {
      return { ok: false, error: clearError.message };
    }
  }

  const { data, error } = await admin
    .from("brokerage_offices")
    .insert({ ...toRow(validated.value), status: "ACTIVE" })
    .select("*")
    .single();

  if (error) {
    if (/brokerage_offices_org_name_active_uidx|duplicate/i.test(error.message)) {
      return {
        ok: false,
        error: "An active office with this name already exists for the brokerage.",
      };
    }
    if (/brokerage_offices_one_main_active_uidx/i.test(error.message)) {
      return {
        ok: false,
        error: "Only one active main office is allowed per brokerage.",
      };
    }
    return { ok: false, error: error.message };
  }

  const office = data as BrokerageOffice;
  await recordAuditEvent({
    actorUserId: options.actorUserId,
    actorDisplayName: options.actorDisplayName,
    actorRoleSnapshot: "ADMIN",
    organizationId: office.organization_id,
    brokerageOfficeId: office.id,
    eventCategory: "brokerage",
    action: "brokerage_office_created",
    targetEntityType: "brokerage_office",
    targetEntityId: office.id,
    summary: `Created office "${office.office_name}" for ${org.name}.`,
    metadata: {
      officeName: office.office_name,
      isMainOffice: office.is_main_office,
    },
  });

  return { ok: true, office };
}

export async function updateBrokerageOffice(options: {
  officeId: string;
  input: Omit<BrokerageOfficeInput, "organizationId"> & {
    organizationId?: string;
  };
  actorUserId: string;
  actorDisplayName?: string | null;
}): Promise<{ ok: true; office: BrokerageOffice } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("brokerage_offices")
    .select("*")
    .eq("id", options.officeId)
    .neq("status", "DELETED")
    .maybeSingle();

  if (existingError) {
    return { ok: false, error: existingError.message };
  }
  if (!existing) {
    return { ok: false, error: "Office not found." };
  }

  const validated = validateBrokerageOfficeInput({
    organizationId: existing.organization_id as string,
    officeName: options.input.officeName,
    addressLine1: options.input.addressLine1,
    addressLine2: options.input.addressLine2,
    city: options.input.city,
    state: options.input.state,
    zip: options.input.zip,
    officePhone: options.input.officePhone,
    branchLicenseNumber: options.input.branchLicenseNumber,
    isMainOffice: options.input.isMainOffice,
  });
  if (!validated.ok) {
    return validated;
  }

  if (validated.value.isMainOffice && !existing.is_main_office) {
    const { error: clearError } = await admin
      .from("brokerage_offices")
      .update({ is_main_office: false })
      .eq("organization_id", existing.organization_id)
      .eq("status", "ACTIVE")
      .eq("is_main_office", true)
      .neq("id", options.officeId);
    if (clearError) {
      return { ok: false, error: clearError.message };
    }
  }

  const row = toRow(validated.value);
  const { data, error } = await admin
    .from("brokerage_offices")
    .update(row)
    .eq("id", options.officeId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (/brokerage_offices_org_name_active_uidx|duplicate/i.test(error.message)) {
      return {
        ok: false,
        error: "An active office with this name already exists for the brokerage.",
      };
    }
    if (/brokerage_offices_one_main_active_uidx/i.test(error.message)) {
      return {
        ok: false,
        error: "Only one active main office is allowed per brokerage.",
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Office not found." };
  }

  const office = data as BrokerageOffice;
  const diff = buildAuditUpdateDiff(
    existing as Record<string, unknown>,
    office as unknown as Record<string, unknown>,
  );
  await recordAuditEvent({
    actorUserId: options.actorUserId,
    actorDisplayName: options.actorDisplayName,
    actorRoleSnapshot: "ADMIN",
    organizationId: office.organization_id,
    brokerageOfficeId: office.id,
    eventCategory: "brokerage",
    action: "brokerage_office_updated",
    targetEntityType: "brokerage_office",
    targetEntityId: office.id,
    summary: `Updated office "${office.office_name}".`,
    metadata: diff,
  });

  return { ok: true, office };
}

export async function getOfficeDeactivationBlockers(
  officeId: string,
): Promise<OfficeDeactivationBlocker> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .select("id, user_id, membership_role")
    .eq("brokerage_office_id", officeId)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }

  return {
    activeMembershipCount: (data ?? []).length,
    memberships: (data ?? []) as OfficeDeactivationBlocker["memberships"],
  };
}

export async function setBrokerageOfficeStatus(options: {
  officeId: string;
  status: Extract<BrokerageOfficeStatus, "ACTIVE" | "INACTIVE">;
  actorUserId: string;
  actorDisplayName?: string | null;
  /** Required when deactivating an office that still has active assignments. */
  forceClearAssignments?: boolean;
}): Promise<
  | { ok: true; office: BrokerageOffice }
  | {
      ok: false;
      error: string;
      blockers?: OfficeDeactivationBlocker;
    }
> {
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("brokerage_offices")
    .select("*")
    .eq("id", options.officeId)
    .neq("status", "DELETED")
    .maybeSingle();

  if (existingError) {
    return { ok: false, error: existingError.message };
  }
  if (!existing) {
    return { ok: false, error: "Office not found." };
  }

  if (options.status === "INACTIVE") {
    const blockers = await getOfficeDeactivationBlockers(options.officeId);
    if (blockers.activeMembershipCount > 0 && !options.forceClearAssignments) {
      return {
        ok: false,
        error: `Cannot deactivate office while ${blockers.activeMembershipCount} active member(s) remain assigned. Reassign or confirm force-clear.`,
        blockers,
      };
    }
    if (blockers.activeMembershipCount > 0 && options.forceClearAssignments) {
      const { error: clearError } = await admin
        .from("organization_members")
        .update({ brokerage_office_id: null })
        .eq("brokerage_office_id", options.officeId)
        .eq("status", "ACTIVE");
      if (clearError) {
        return { ok: false, error: clearError.message };
      }
      await recordAuditEvent({
        actorUserId: options.actorUserId,
        actorDisplayName: options.actorDisplayName,
        actorRoleSnapshot: "ADMIN",
        organizationId: existing.organization_id as string,
        brokerageOfficeId: options.officeId,
        eventCategory: "brokerage",
        action: "agent_office_assignment_changed",
        targetEntityType: "brokerage_office",
        targetEntityId: options.officeId,
        summary:
          "Cleared active membership office assignments before office deactivation.",
        metadata: {
          clearedCount: blockers.activeMembershipCount,
        },
      });
    }
  }

  const { data, error } = await admin
    .from("brokerage_offices")
    .update({ status: options.status })
    .eq("id", options.officeId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Office not found." };
  }

  const office = data as BrokerageOffice;
  await recordAuditEvent({
    actorUserId: options.actorUserId,
    actorDisplayName: options.actorDisplayName,
    actorRoleSnapshot: "ADMIN",
    organizationId: office.organization_id,
    brokerageOfficeId: office.id,
    eventCategory: "brokerage",
    action:
      options.status === "ACTIVE"
        ? "brokerage_office_reactivated"
        : "brokerage_office_deactivated",
    targetEntityType: "brokerage_office",
    targetEntityId: office.id,
    summary:
      options.status === "ACTIVE"
        ? `Reactivated office "${office.office_name}".`
        : `Deactivated office "${office.office_name}".`,
  });

  return { ok: true, office };
}

export async function getOrganizationDeactivationBlockers(
  organizationId: string,
): Promise<{
  activeMembershipCount: number;
  invitedProfileCount: number;
  activeOfficeCount: number;
}> {
  const admin = createAdminClient();
  const [{ count: memberCount }, { count: invitedCount }, { count: officeCount }] =
    await Promise.all([
      admin
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "ACTIVE"),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("primary_organization_id", organizationId)
        .eq("onboarding_status", "INVITED"),
      admin
        .from("brokerage_offices")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "ACTIVE"),
    ]);

  return {
    activeMembershipCount: memberCount ?? 0,
    invitedProfileCount: invitedCount ?? 0,
    activeOfficeCount: officeCount ?? 0,
  };
}
