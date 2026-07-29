"use server";

import {
  AdminAuthorizationError,
  requireAppAdmin,
} from "@/lib/admin/require-app-admin";
import {
  inviteAndProvisionUser,
  resendUserInvitation,
  retryProvisionInvitedUser,
} from "@/lib/admin/invite-user";
import type { InviteUserInput } from "@/lib/admin/invite-validation";
import {
  addOrganizationMembership,
  updateOrganizationMembership,
} from "@/lib/admin/manage-memberships";
import {
  createOrganization,
  setOrganizationStatus,
  updateOrganization,
  type OrganizationInput,
} from "@/lib/admin/manage-organizations";
import {
  assertCanChangeAdminAccess,
  updateAdminUserProfile,
  upsertAdminAgentSettings,
  type UpdateAdminAgentSettingsInput,
  type UpdateAdminProfileInput,
} from "@/lib/admin/manage-user-detail";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MembershipRole } from "@/lib/types/organization";
import type { AppRole, ProfileStatus } from "@/lib/types/profile";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

function toErrorMessage(error: unknown): string {
  if (error instanceof AdminAuthorizationError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error.";
}

function revalidateAdminPaths(extra?: string[]) {
  revalidatePath("/admin/users");
  revalidatePath("/admin/organizations");
  for (const path of extra ?? []) {
    revalidatePath(path);
  }
}

async function resolveOrigin(): Promise<string> {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  if (origin) {
    return origin;
  }
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  if (host) {
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function inviteUserAction(input: InviteUserInput) {
  try {
    const admin = await requireAppAdmin();
    const origin = await resolveOrigin();
    const result = await inviteAndProvisionUser({
      invitedByUserId: admin.userId,
      input,
      origin,
    });
    if (result.ok) {
      revalidateAdminPaths();
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function retryProvisionUserAction(options: {
  userId: string;
  input: InviteUserInput;
}) {
  try {
    const admin = await requireAppAdmin();
    const result = await retryProvisionInvitedUser({
      invitedByUserId: admin.userId,
      userId: options.userId,
      input: options.input,
    });
    if (result.ok) {
      revalidateAdminPaths([`/admin/users/${options.userId}`]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function resendInvitationAction(userId: string) {
  try {
    await requireAppAdmin();
    const origin = await resolveOrigin();
    return await resendUserInvitation({ userId, origin });
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function setUserAccountStatusAction(options: {
  userId: string;
  status: Extract<ProfileStatus, "ACTIVE" | "INACTIVE">;
}) {
  try {
    const actor = await requireAppAdmin();
    const nextOnboarding =
      options.status === "ACTIVE" ? ("ACTIVE" as const) : ("DISABLED" as const);

    const guard = await assertCanChangeAdminAccess({
      actorUserId: actor.userId,
      targetUserId: options.userId,
      nextStatus: options.status,
      nextOnboarding,
    });
    if (!guard.ok) {
      return guard;
    }

    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        status: options.status,
        onboarding_status: nextOnboarding,
        ...(options.status === "ACTIVE"
          ? { activated_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", options.userId);

    if (updateError) {
      return { ok: false as const, error: updateError.message };
    }

    if (options.status === "INACTIVE") {
      await admin.auth.admin.updateUserById(options.userId, {
        ban_duration: "876600h",
      });
    } else {
      await admin.auth.admin.updateUserById(options.userId, {
        ban_duration: "none",
      });
    }

    revalidateAdminPaths([`/admin/users/${options.userId}`]);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function setUserAppRoleAction(options: {
  userId: string;
  appRole: AppRole;
}) {
  try {
    const actor = await requireAppAdmin();
    if (options.appRole !== "ADMIN" && options.appRole !== "USER") {
      return { ok: false as const, error: "Invalid application role." };
    }

    const guard = await assertCanChangeAdminAccess({
      actorUserId: actor.userId,
      targetUserId: options.userId,
      nextAppRole: options.appRole,
    });
    if (!guard.ok) {
      return guard;
    }

    const admin = createAdminClient();
    const { data: before } = await admin
      .from("profiles")
      .select("app_role")
      .eq("id", options.userId)
      .maybeSingle();

    const { error: updateError } = await admin
      .from("profiles")
      .update({ app_role: options.appRole })
      .eq("id", options.userId);

    if (updateError) {
      return { ok: false as const, error: updateError.message };
    }

    if (before?.app_role !== options.appRole) {
      const { recordAuditEvent } = await import("@/lib/audit/record");
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorDisplayName: actor.profile.display_name,
        actorRoleSnapshot: "ADMIN",
        eventCategory: "security",
        action:
          options.appRole === "ADMIN"
            ? "global_admin_access_granted"
            : "global_admin_access_removed",
        targetEntityType: "profile",
        targetEntityId: options.userId,
        summary:
          options.appRole === "ADMIN"
            ? "Global Admin access granted."
            : "Global Admin access removed.",
        mandatory: true,
      });
    }

    revalidateAdminPaths([`/admin/users/${options.userId}`]);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function createOrganizationAction(input: OrganizationInput) {
  try {
    const actor = await requireAppAdmin();
    const result = await createOrganization(input, {
      userId: actor.userId,
      displayName: actor.profile.display_name,
    });
    if (result.ok) {
      revalidateAdminPaths([`/admin/organizations/${result.organization.id}`]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function updateOrganizationAction(options: {
  organizationId: string;
  input: OrganizationInput;
}) {
  try {
    const actor = await requireAppAdmin();
    const result = await updateOrganization(
      options.organizationId,
      options.input,
      {
        userId: actor.userId,
        displayName: actor.profile.display_name,
      },
    );
    if (result.ok) {
      revalidateAdminPaths([`/admin/organizations/${options.organizationId}`]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function setOrganizationStatusAction(options: {
  organizationId: string;
  status: "ACTIVE" | "INACTIVE";
  acknowledgeActiveAssignments?: boolean;
}) {
  try {
    const actor = await requireAppAdmin();
    const result = await setOrganizationStatus(
      options.organizationId,
      options.status,
      {
        userId: actor.userId,
        displayName: actor.profile.display_name,
        acknowledgeActiveAssignments: options.acknowledgeActiveAssignments,
      },
    );
    if (result.ok) {
      revalidateAdminPaths([`/admin/organizations/${options.organizationId}`]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function addOrganizationMembershipAction(options: {
  organizationId: string;
  userId: string;
  membershipRole: MembershipRole;
}) {
  try {
    await requireAppAdmin();
    const result = await addOrganizationMembership(options);
    if (result.ok) {
      revalidateAdminPaths([
        `/admin/organizations/${options.organizationId}`,
        `/admin/users/${options.userId}`,
      ]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function updateOrganizationMembershipAction(options: {
  membershipId: string;
  organizationId: string;
  userId?: string;
  membershipRole?: MembershipRole;
  status?: "ACTIVE" | "INACTIVE" | "DELETED";
}) {
  try {
    await requireAppAdmin();
    const result = await updateOrganizationMembership({
      membershipId: options.membershipId,
      membershipRole: options.membershipRole,
      status: options.status,
    });
    if (result.ok) {
      const paths = [`/admin/organizations/${options.organizationId}`];
      if (options.userId) {
        paths.push(`/admin/users/${options.userId}`);
      }
      revalidateAdminPaths(paths);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function updateAdminUserProfileAction(options: {
  userId: string;
  input: UpdateAdminProfileInput;
}) {
  try {
    await requireAppAdmin();
    const result = await updateAdminUserProfile(options.userId, options.input);
    if (result.ok) {
      revalidateAdminPaths([`/admin/users/${options.userId}`]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function upsertAdminAgentSettingsAction(options: {
  userId: string;
  input: UpdateAdminAgentSettingsInput;
}) {
  try {
    await requireAppAdmin();
    const result = await upsertAdminAgentSettings(options.userId, options.input);
    if (result.ok) {
      revalidateAdminPaths([`/admin/users/${options.userId}`]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function createBrokerageOfficeAction(input: {
  organizationId: string;
  officeName: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  officePhone?: string | null;
  branchLicenseNumber?: string | null;
  isMainOffice?: boolean;
}) {
  try {
    const actor = await requireAppAdmin();
    const { createBrokerageOffice } = await import(
      "@/lib/admin/manage-brokerage-offices"
    );
    const result = await createBrokerageOffice({
      input,
      actorUserId: actor.userId,
      actorDisplayName: actor.profile.display_name,
    });
    if (result.ok) {
      revalidateAdminPaths([
        `/admin/organizations/${input.organizationId}`,
        "/admin/brokerages",
      ]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function updateBrokerageOfficeAction(options: {
  officeId: string;
  organizationId: string;
  input: {
    officeName: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    officePhone?: string | null;
    branchLicenseNumber?: string | null;
    isMainOffice?: boolean;
  };
}) {
  try {
    const actor = await requireAppAdmin();
    const { updateBrokerageOffice } = await import(
      "@/lib/admin/manage-brokerage-offices"
    );
    const result = await updateBrokerageOffice({
      officeId: options.officeId,
      input: options.input,
      actorUserId: actor.userId,
      actorDisplayName: actor.profile.display_name,
    });
    if (result.ok) {
      revalidateAdminPaths([
        `/admin/organizations/${options.organizationId}`,
        "/admin/brokerages",
      ]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function setBrokerageOfficeStatusAction(options: {
  officeId: string;
  organizationId: string;
  status: "ACTIVE" | "INACTIVE";
  forceClearAssignments?: boolean;
}) {
  try {
    const actor = await requireAppAdmin();
    const { setBrokerageOfficeStatus } = await import(
      "@/lib/admin/manage-brokerage-offices"
    );
    const result = await setBrokerageOfficeStatus({
      officeId: options.officeId,
      status: options.status,
      actorUserId: actor.userId,
      actorDisplayName: actor.profile.display_name,
      forceClearAssignments: options.forceClearAssignments,
    });
    if (result.ok) {
      revalidateAdminPaths([
        `/admin/organizations/${options.organizationId}`,
        "/admin/brokerages",
      ]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function setAuditLoggingEnabledAction(options: {
  enabled: boolean;
}) {
  try {
    const actor = await requireAppAdmin();
    const { setOrdinaryAuditLoggingEnabled } = await import(
      "@/lib/audit/record"
    );
    const result = await setOrdinaryAuditLoggingEnabled({
      enabled: options.enabled,
      actorUserId: actor.userId,
      actorDisplayName: actor.profile.display_name,
      actorRoleSnapshot: "ADMIN",
    });
    if (result.ok) {
      revalidateAdminPaths(["/admin/audit"]);
    }
    return result;
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function lookupTrecLicensesAction(input: {
  licenseNumber?: string | null;
  fullName?: string | null;
  licenseTypes?: Array<"SALE" | "BRK">;
  limit?: number;
}) {
  try {
    const actor = await requireAppAdmin();
    const { lookupTrecLicenses } = await import("@/lib/trec/lookup");
    const { recordAuditEvent } = await import("@/lib/audit/record");

    await recordAuditEvent({
      actorUserId: actor.userId,
      actorDisplayName: actor.profile.display_name,
      actorRoleSnapshot: "ADMIN",
      eventCategory: "trec",
      action: "trec_lookup_submitted",
      summary: "TREC license lookup submitted.",
      metadata: {
        hasLicenseNumber: Boolean(input.licenseNumber?.trim()),
        hasName: Boolean(input.fullName?.trim()),
        licenseTypes: input.licenseTypes ?? ["SALE", "BRK"],
      },
    });

    const result = await lookupTrecLicenses({
      licenseNumber: input.licenseNumber,
      fullName: input.fullName,
      licenseTypes: input.licenseTypes,
      limit: input.limit,
    });

    if (!result.ok) {
      await recordAuditEvent({
        actorUserId: actor.userId,
        actorDisplayName: actor.profile.display_name,
        actorRoleSnapshot: "ADMIN",
        eventCategory: "trec",
        action: "trec_lookup_failed",
        summary: result.error,
        success: false,
        failureClassification: result.code,
      });
      return result;
    }

    await recordAuditEvent({
      actorUserId: actor.userId,
      actorDisplayName: actor.profile.display_name,
      actorRoleSnapshot: "ADMIN",
      eventCategory: "trec",
      action:
        result.candidates.length === 0
          ? "no_trec_match_found"
          : "trec_lookup_succeeded",
      summary:
        result.candidates.length === 0
          ? "No TREC matches found."
          : `TREC lookup returned ${result.candidates.length} candidate(s).`,
      metadata: {
        candidateCount: result.candidates.length,
        fromCache: result.fromCache,
      },
    });

    return result;
  } catch (error) {
    return {
      ok: false as const,
      error: toErrorMessage(error),
      code: "UPSTREAM" as const,
      lookedUpAt: new Date().toISOString(),
      allowManualEntry: true as const,
    };
  }
}
