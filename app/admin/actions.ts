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
    const { error: updateError } = await admin
      .from("profiles")
      .update({ app_role: options.appRole })
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

export async function createOrganizationAction(input: OrganizationInput) {
  try {
    await requireAppAdmin();
    const result = await createOrganization(input);
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
    await requireAppAdmin();
    const result = await updateOrganization(
      options.organizationId,
      options.input,
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
    await requireAppAdmin();
    const result = await setOrganizationStatus(
      options.organizationId,
      options.status,
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
