import "server-only";

import {
  findAuthUserIdByEmail,
  provisionInvitedUserRecords,
} from "@/lib/admin/invite-user";
import {
  validateManualCreateUserInput,
  type ManualCreateUserInput,
  type NormalizedManualCreateInput,
} from "@/lib/admin/manual-create-validation";
import type { NormalizedInviteInput } from "@/lib/admin/invite-validation";
import { recordAuditEvent } from "@/lib/audit/record";
import { createAdminClient } from "@/lib/supabase/admin";

export type ManualCreateResult =
  | {
      ok: true;
      userId: string;
      email: string;
      temporaryPassword: string;
      mustChangePassword: true;
      isTestUser: boolean;
      invitationSent: false;
    }
  | {
      ok: false;
      error: string;
      userId?: string;
      email?: string;
      cleanup?: Array<{ step: string; status: string; detail?: string }>;
    };

async function assertOrganizationsActive(
  admin: ReturnType<typeof createAdminClient>,
  organizationIds: string[],
): Promise<string | null> {
  const unique = [...new Set(organizationIds)];
  const { data, error } = await admin
    .from("organizations")
    .select("id, status")
    .in("id", unique);

  if (error) {
    return error.message;
  }

  const found = new Map((data ?? []).map((row) => [row.id as string, row.status]));
  for (const id of unique) {
    if (found.get(id) !== "ACTIVE") {
      return "One or more selected organizations are missing or inactive.";
    }
  }
  return null;
}

function toInviteShape(
  value: NormalizedManualCreateInput,
): NormalizedInviteInput {
  return {
    loginEmail: value.loginEmail,
    appRole: value.appRole,
    accountStatus: value.accountStatus,
    onboardingStatus: value.onboardingStatus,
    firstName: value.firstName,
    middleName: value.middleName,
    lastName: value.lastName,
    preferredName: value.preferredName,
    displayName: value.displayName,
    primaryOrganizationId: value.primaryOrganizationId,
    memberships: value.memberships,
    agentEmail: null,
    agentPhone: null,
    trecLicenseNumber: null,
    title: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: "TX",
    zip: null,
  };
}

async function compensateOrphanAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  reason: string,
): Promise<Array<{ step: string; status: string; detail?: string }>> {
  const cleanup: Array<{ step: string; status: string; detail?: string }> = [];

  await admin.from("organization_members").delete().eq("user_id", userId);
  cleanup.push({ step: "organization_members", status: "deleted" });

  await admin.from("user_agent_settings").delete().eq("user_id", userId);
  cleanup.push({ step: "user_agent_settings", status: "deleted" });

  await admin.from("user_preferences").delete().eq("user_id", userId);
  cleanup.push({ step: "user_preferences", status: "deleted" });

  await admin.from("profiles").delete().eq("id", userId);
  cleanup.push({ step: "profile", status: "deleted" });

  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error && !/not found|user not found/i.test(error.message)) {
    cleanup.push({
      step: "auth_user",
      status: "failed",
      detail: error.message,
    });
  } else {
    cleanup.push({
      step: "auth_user",
      status: "deleted",
      detail: reason,
    });
  }

  return cleanup;
}

/**
 * Create a confirmed Auth user without sending invitation email, then
 * provision application records. Temporary password is returned once to the
 * calling Global Admin and must never be logged or audited.
 */
export async function createManualConfirmedUser(options: {
  createdByUserId: string;
  createdByDisplayName?: string | null;
  input: ManualCreateUserInput;
}): Promise<ManualCreateResult> {
  const validated = validateManualCreateUserInput(options.input);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const value = validated.value;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Server admin credentials are not configured.",
    };
  }

  const orgError = await assertOrganizationsActive(
    admin,
    value.memberships.map((m) => m.organizationId),
  );
  if (orgError) {
    return { ok: false, error: orgError };
  }

  const existingId = await findAuthUserIdByEmail(admin, value.loginEmail);
  if (existingId) {
    return {
      ok: false,
      error: "An account with this login email already exists.",
      userId: existingId,
      email: value.loginEmail,
    };
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: value.loginEmail,
      password: value.temporaryPassword,
      email_confirm: true,
      user_metadata: {
        first_name: value.firstName,
        last_name: value.lastName,
      },
    });

  if (createError || !created.user) {
    return {
      ok: false,
      error: createError?.message ?? "Failed to create Auth user.",
      email: value.loginEmail,
    };
  }

  const userId = created.user.id;
  const inviteShape = toInviteShape(value);

  const provisionError = await provisionInvitedUserRecords({
    admin,
    userId,
    invitedByUserId: options.createdByUserId,
    invite: inviteShape,
  });

  if (provisionError) {
    const cleanup = await compensateOrphanAuthUser(
      admin,
      userId,
      "Compensated after provisioning failure",
    );
    return {
      ok: false,
      error: provisionError,
      userId,
      email: value.loginEmail,
      cleanup,
    };
  }

  const nowIso = new Date().toISOString();
  const { error: flagError } = await admin
    .from("profiles")
    .update({
      is_test_user: value.isTestUser,
      must_change_password: true,
      onboarding_status: value.onboardingStatus,
      activated_at: value.onboardingStatus === "ACTIVE" ? nowIso : null,
      app_role: value.appRole,
    })
    .eq("id", userId);

  if (flagError) {
    const cleanup = await compensateOrphanAuthUser(
      admin,
      userId,
      "Compensated after profile flag update failure",
    );
    return {
      ok: false,
      error: `Auth user created but profile flags failed: ${flagError.message}`,
      userId,
      email: value.loginEmail,
      cleanup,
    };
  }

  // Audit without temporary password or other secrets.
  await recordAuditEvent({
    actorUserId: options.createdByUserId,
    actorDisplayName: options.createdByDisplayName ?? null,
    actorRoleSnapshot: "ADMIN",
    organizationId: value.primaryOrganizationId,
    eventCategory: "user",
    action: "user_manually_created",
    targetEntityType: "profile",
    targetEntityId: userId,
    summary: `Manually created confirmed user ${value.displayName} (${value.loginEmail}).`,
    metadata: {
      isTestUser: value.isTestUser,
      mustChangePassword: true,
      appRole: value.appRole,
      emailConfirmed: true,
      invitationSent: false,
    },
    mandatory: value.appRole === "ADMIN",
  });

  return {
    ok: true,
    userId,
    email: value.loginEmail,
    temporaryPassword: value.temporaryPassword,
    mustChangePassword: true,
    isTestUser: value.isTestUser,
    invitationSent: false,
  };
}
