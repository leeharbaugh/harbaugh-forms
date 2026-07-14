import "server-only";

import {
  type InviteUserInput,
  type NormalizedInviteInput,
  normalizeEmail,
  validateInviteUserInput,
} from "@/lib/admin/invite-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProvisionResult =
  | {
      ok: true;
      userId: string;
      email: string;
      invitationSent: boolean;
      provisioned: true;
    }
  | {
      ok: false;
      error: string;
      userId?: string;
      email?: string;
      invitationSent?: boolean;
      needsProvisioning?: boolean;
    };

function invitationRedirectTo(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/confirm?next=${encodeURIComponent("/auth/update-password")}`;
}

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

export async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  // listUsers is paginated; for beta, scan a reasonable number of pages.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw new Error(error.message);
    }
    const match = data.users.find(
      (user) => normalizeEmail(user.email ?? "") === normalized,
    );
    if (match) {
      return match.id;
    }
    if (data.users.length < 200) {
      break;
    }
  }
  return null;
}

export async function provisionInvitedUserRecords(options: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  invitedByUserId: string;
  invite: NormalizedInviteInput;
}): Promise<string | null> {
  const { admin, userId, invitedByUserId, invite } = options;
  const nowIso = new Date().toISOString();

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: invite.loginEmail,
      app_role: invite.appRole,
      status: invite.accountStatus,
      onboarding_status: invite.onboardingStatus,
      invited_at: nowIso,
      invited_by_user_id: invitedByUserId,
      activated_at: null,
      first_name: invite.firstName,
      middle_name: invite.middleName,
      last_name: invite.lastName,
      preferred_name: invite.preferredName,
      display_name: invite.displayName,
      phone: invite.agentPhone,
      trec_license_number: invite.trecLicenseNumber,
      primary_organization_id: invite.primaryOrganizationId,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return `Auth invitation succeeded but profile provisioning failed: ${profileError.message}`;
  }

  for (const membership of invite.memberships) {
    const { data: existingMembership, error: membershipLookupError } = await admin
      .from("organization_members")
      .select("id, status")
      .eq("organization_id", membership.organizationId)
      .eq("user_id", userId)
      .neq("status", "DELETED")
      .maybeSingle();

    if (membershipLookupError) {
      return `Auth invitation succeeded but membership lookup failed: ${membershipLookupError.message}`;
    }

    if (existingMembership) {
      const { error: membershipUpdateError } = await admin
        .from("organization_members")
        .update({
          status: "ACTIVE",
          membership_role: membership.membershipRole,
        })
        .eq("id", existingMembership.id);

      if (membershipUpdateError) {
        return `Auth invitation succeeded but membership update failed: ${membershipUpdateError.message}`;
      }
    } else {
      const { error: membershipInsertError } = await admin
        .from("organization_members")
        .insert({
          organization_id: membership.organizationId,
          user_id: userId,
          membership_role: membership.membershipRole,
          status: "ACTIVE",
        });

      if (membershipInsertError) {
        return `Auth invitation succeeded but membership create failed: ${membershipInsertError.message}`;
      }
    }
  }

  const { error: agentError } = await admin.from("user_agent_settings").upsert(
    {
      user_id: userId,
      status: "ACTIVE",
      legal_first_name: invite.firstName,
      legal_middle_name: invite.middleName,
      legal_last_name: invite.lastName,
      preferred_name: invite.preferredName,
      display_name: invite.displayName,
      email: invite.agentEmail ?? invite.loginEmail,
      phone: invite.agentPhone,
      trec_license_number: invite.trecLicenseNumber,
      title: invite.title,
      address_line_1: invite.addressLine1,
      address_line_2: invite.addressLine2,
      city: invite.city,
      state: invite.state,
      zip: invite.zip,
    },
    { onConflict: "user_id" },
  );

  if (agentError) {
    return `Auth invitation succeeded but agent settings provisioning failed: ${agentError.message}`;
  }

  return null;
}

export async function inviteAndProvisionUser(options: {
  invitedByUserId: string;
  input: InviteUserInput;
  origin: string;
}): Promise<ProvisionResult> {
  const validated = validateInviteUserInput(options.input);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const invite = validated.value;
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
    invite.memberships.map((m) => m.organizationId),
  );
  if (orgError) {
    return { ok: false, error: orgError };
  }

  const existingId = await findAuthUserIdByEmail(admin, invite.loginEmail);
  if (existingId) {
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, onboarding_status")
      .eq("id", existingId)
      .maybeSingle();

    if (existingProfile) {
      return {
        ok: false,
        error: "An account with this login email already exists.",
        userId: existingId,
        email: invite.loginEmail,
      };
    }

    // Auth user exists without profile — complete provisioning without re-invite.
    const provisionError = await provisionInvitedUserRecords({
      admin,
      userId: existingId,
      invitedByUserId: options.invitedByUserId,
      invite,
    });
    if (provisionError) {
      return {
        ok: false,
        error: provisionError,
        userId: existingId,
        email: invite.loginEmail,
        invitationSent: false,
        needsProvisioning: true,
      };
    }

    return {
      ok: true,
      userId: existingId,
      email: invite.loginEmail,
      invitationSent: false,
      provisioned: true,
    };
  }

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(invite.loginEmail, {
      redirectTo: invitationRedirectTo(options.origin),
      data: {
        first_name: invite.firstName,
        middle_name: invite.middleName,
        last_name: invite.lastName,
        preferred_name: invite.preferredName,
        display_name: invite.displayName,
      },
    });

  if (inviteError || !invited.user) {
    return {
      ok: false,
      error: inviteError?.message ?? "Invitation failed.",
      email: invite.loginEmail,
    };
  }

  const userId = invited.user.id;
  const provisionError = await provisionInvitedUserRecords({
    admin,
    userId,
    invitedByUserId: options.invitedByUserId,
    invite,
  });

  if (provisionError) {
    return {
      ok: false,
      error: provisionError,
      userId,
      email: invite.loginEmail,
      invitationSent: true,
      needsProvisioning: true,
    };
  }

  return {
    ok: true,
    userId,
    email: invite.loginEmail,
    invitationSent: true,
    provisioned: true,
  };
}

export async function retryProvisionInvitedUser(options: {
  invitedByUserId: string;
  userId: string;
  input: InviteUserInput;
}): Promise<ProvisionResult> {
  const validated = validateInviteUserInput(options.input);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

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
    validated.value.memberships.map((m) => m.organizationId),
  );
  if (orgError) {
    return { ok: false, error: orgError };
  }

  const provisionError = await provisionInvitedUserRecords({
    admin,
    userId: options.userId,
    invitedByUserId: options.invitedByUserId,
    invite: validated.value,
  });

  if (provisionError) {
    return {
      ok: false,
      error: provisionError,
      userId: options.userId,
      email: validated.value.loginEmail,
      needsProvisioning: true,
    };
  }

  return {
    ok: true,
    userId: options.userId,
    email: validated.value.loginEmail,
    invitationSent: false,
    provisioned: true,
  };
}

export async function resendUserInvitation(options: {
  userId: string;
  origin: string;
}): Promise<{ ok: true; alreadyConfirmed: boolean } | { ok: false; error: string }> {
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

  const { data: userData, error: getError } =
    await admin.auth.admin.getUserById(options.userId);
  if (getError || !userData.user?.email) {
    return { ok: false, error: getError?.message ?? "Auth user not found." };
  }

  const email = userData.user.email;
  const alreadyConfirmed = Boolean(userData.user.email_confirmed_at);
  if (alreadyConfirmed) {
    return {
      ok: false,
      error:
        "This account has already confirmed email access. Use password reset instead of resending an invitation.",
    };
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: invitationRedirectTo(options.origin),
    },
  );

  if (inviteError) {
    return { ok: false, error: inviteError.message };
  }

  return { ok: true, alreadyConfirmed: false };
}
