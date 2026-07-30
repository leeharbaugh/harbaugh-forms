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
import { createManualConfirmedUser } from "@/lib/admin/create-manual-user";
import type { ManualCreateUserInput } from "@/lib/admin/manual-create-validation";
import {
  buildTestUserDeletionSummary,
  permanentlyDeleteTestUser,
} from "@/lib/admin/delete-test-user";
import {
  buildPublicDeletionFailure,
  internalDeletionErrorMessage,
  toPublicDeletionFailureResult,
} from "@/lib/admin/test-user-deletion-failure";
import { assertAdminActionRateLimit } from "@/lib/admin/rate-limit";
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

export async function createManualUserAction(input: ManualCreateUserInput) {
  try {
    const admin = await requireAppAdmin();
    const rate = assertAdminActionRateLimit({
      actorUserId: admin.userId,
      action: "create_manual_user",
      maxPerWindow: 10,
    });
    if (!rate.ok) {
      return { ok: false as const, error: rate.error };
    }

    const result = await createManualConfirmedUser({
      createdByUserId: admin.userId,
      createdByDisplayName: admin.profile.display_name,
      input,
    });
    if (result.ok) {
      revalidateAdminPaths([`/admin/users/${result.userId}`]);
    }
    // Temporary password is returned once here for the calling Global Admin.
    // Callers must not persist it; audit/logging paths never include it.
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
    const actor = await requireAppAdmin();
    const origin = await resolveOrigin();
    return await resendUserInvitation({
      userId,
      origin,
      actorUserId: actor.userId,
    });
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function setUserTestFlagAction(options: {
  userId: string;
  isTestUser: boolean;
}) {
  try {
    const actor = await requireAppAdmin();
    if (options.userId === actor.userId && options.isTestUser) {
      return {
        ok: false as const,
        error:
          "You cannot mark your own Global Admin account as a test user for streamlined deletion.",
      };
    }

    const admin = createAdminClient();
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, app_role, status, onboarding_status, is_test_user")
      .eq("id", options.userId)
      .maybeSingle();
    if (targetError || !target) {
      return {
        ok: false as const,
        error: targetError?.message ?? "Profile not found.",
      };
    }

    if (options.isTestUser) {
      const currentlyActiveAdmin =
        target.status === "ACTIVE" &&
        target.app_role === "ADMIN" &&
        target.onboarding_status === "ACTIVE";
      if (currentlyActiveAdmin) {
        const { count, error: countError } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("status", "ACTIVE")
          .eq("app_role", "ADMIN")
          .eq("onboarding_status", "ACTIVE");
        if (countError) {
          return { ok: false as const, error: countError.message };
        }
        if ((count ?? 0) <= 1) {
          return {
            ok: false as const,
            error:
              "Cannot mark the final active Global Admin as a test user.",
          };
        }
      }
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ is_test_user: options.isTestUser })
      .eq("id", options.userId);
    if (updateError) {
      return { ok: false as const, error: updateError.message };
    }

    revalidateAdminPaths([`/admin/users/${options.userId}`]);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function previewTestUserDeletionAction(userId: string) {
  try {
    await requireAppAdmin();
    const summary = await buildTestUserDeletionSummary(userId);
    return { ok: true as const, summary };
  } catch (error) {
    const deletionFailure = toPublicDeletionFailureResult(error);
    if (deletionFailure) {
      console.error("Test-user deletion preview failed", {
        reference: deletionFailure.failure.reference,
        dependencyKey: deletionFailure.failure.dependencyKey,
        stage: deletionFailure.failure.stage,
        internalMessage: internalDeletionErrorMessage(error),
      });
      return { ok: false as const, ...deletionFailure };
    }
    if (error instanceof AdminAuthorizationError) {
      return { ok: false as const, error: error.message };
    }
    const failure = buildPublicDeletionFailure({
      context: {
        dependencyKey: "dependency_summary",
        dependencyLabel: "Deletion dependency summary",
        stage: "dependency_summary",
      },
      error,
    });
    console.error("Test-user deletion preview failed", {
      reference: failure.reference,
      internalMessage: internalDeletionErrorMessage(error),
    });
    return { ok: false as const, error: failure.explanation, failure };
  }
}

export async function permanentlyDeleteTestUserAction(options: {
  userId: string;
  confirmationEmail: string;
}) {
  try {
    const actor = await requireAppAdmin();
    const rate = assertAdminActionRateLimit({
      actorUserId: actor.userId,
      action: "delete_test_user",
      maxPerWindow: 6,
      minIntervalMs: 2_000,
    });
    if (!rate.ok) {
      return { ok: false as const, error: rate.error };
    }

    const result = await permanentlyDeleteTestUser({
      actorUserId: actor.userId,
      actorDisplayName: actor.profile.display_name,
      targetUserId: options.userId,
      confirmationEmail: options.confirmationEmail,
    });
    if (result.ok) {
      revalidateAdminPaths();
    }
    return result;
  } catch (error) {
    const deletionFailure = toPublicDeletionFailureResult(error);
    if (deletionFailure) {
      console.error("Test-user deletion action failed", {
        reference: deletionFailure.failure.reference,
        dependencyKey: deletionFailure.failure.dependencyKey,
        stage: deletionFailure.failure.stage,
        internalMessage: internalDeletionErrorMessage(error),
      });
      return { ok: false as const, ...deletionFailure };
    }
    if (error instanceof AdminAuthorizationError) {
      return { ok: false as const, error: error.message };
    }
    const failure = buildPublicDeletionFailure({
      context: {
        dependencyKey: "deletion_workflow",
        dependencyLabel: "Test-user deletion workflow",
        stage: "application_cleanup",
      },
      error,
    });
    console.error("Test-user deletion action failed", {
      reference: failure.reference,
      internalMessage: internalDeletionErrorMessage(error),
    });
    return { ok: false as const, error: failure.explanation, failure };
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
}) {
  try {
    const actor = await requireAppAdmin();
    const result = await setOrganizationStatus(
      options.organizationId,
      options.status,
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
