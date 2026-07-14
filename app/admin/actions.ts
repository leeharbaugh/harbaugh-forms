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
import {
  wouldRemoveFinalActiveAdmin,
  type InviteUserInput,
} from "@/lib/admin/invite-validation";
import { createAdminClient } from "@/lib/supabase/admin";
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
      revalidatePath("/admin/users");
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
      revalidatePath("/admin/users");
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
    const result = await resendUserInvitation({ userId, origin });
    return result;
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
    if (options.userId === actor.userId && options.status === "INACTIVE") {
      return {
        ok: false as const,
        error: "You cannot deactivate your own admin account.",
      };
    }

    const admin = createAdminClient();
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, status, app_role, onboarding_status")
      .eq("id", options.userId)
      .maybeSingle();

    if (targetError || !target) {
      return {
        ok: false as const,
        error: targetError?.message ?? "Profile not found.",
      };
    }

    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE")
      .eq("app_role", "ADMIN")
      .eq("onboarding_status", "ACTIVE");

    if (countError) {
      return { ok: false as const, error: countError.message };
    }

    const currentlyActiveAdmin =
      target.status === "ACTIVE" &&
      target.app_role === "ADMIN" &&
      target.onboarding_status === "ACTIVE";
    const nextOnboarding =
      options.status === "ACTIVE" ? "ACTIVE" : "DISABLED";
    const nextWouldBeActiveAdmin =
      options.status === "ACTIVE" &&
      target.app_role === "ADMIN" &&
      nextOnboarding === "ACTIVE";

    if (
      wouldRemoveFinalActiveAdmin({
        activeAdminCount: count ?? 0,
        currentlyActiveAdmin,
        nextIsActiveAdmin: nextWouldBeActiveAdmin,
      })
    ) {
      return {
        ok: false as const,
        error: "Cannot disable the final active application administrator.",
      };
    }

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

    revalidatePath("/admin/users");
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

    if (options.userId === actor.userId && options.appRole !== "ADMIN") {
      return {
        ok: false as const,
        error: "You cannot demote your own admin role.",
      };
    }

    const admin = createAdminClient();
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, status, app_role, onboarding_status")
      .eq("id", options.userId)
      .maybeSingle();

    if (targetError || !target) {
      return {
        ok: false as const,
        error: targetError?.message ?? "Profile not found.",
      };
    }

    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE")
      .eq("app_role", "ADMIN")
      .eq("onboarding_status", "ACTIVE");

    if (countError) {
      return { ok: false as const, error: countError.message };
    }

    const currentlyActiveAdmin =
      target.status === "ACTIVE" &&
      target.app_role === "ADMIN" &&
      target.onboarding_status === "ACTIVE";
    const nextIsActiveAdmin =
      target.status === "ACTIVE" &&
      options.appRole === "ADMIN" &&
      target.onboarding_status === "ACTIVE";

    if (
      wouldRemoveFinalActiveAdmin({
        activeAdminCount: count ?? 0,
        currentlyActiveAdmin,
        nextIsActiveAdmin,
      })
    ) {
      return {
        ok: false as const,
        error: "Cannot demote the final active application administrator.",
      };
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ app_role: options.appRole })
      .eq("id", options.userId);

    if (updateError) {
      return { ok: false as const, error: updateError.message };
    }

    revalidatePath("/admin/users");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}

export async function createOrganizationAction(input: {
  name: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  brokerageLicenseNumber?: string | null;
  brokerFirstName?: string | null;
  brokerMiddleName?: string | null;
  brokerLastName?: string | null;
  brokerLicenseNumber?: string | null;
  brokerPhone?: string | null;
  brokerEmail?: string | null;
}) {
  try {
    await requireAppAdmin();
    const name = input.name?.trim();
    if (!name) {
      return { ok: false as const, error: "Organization name is required." };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .insert({
        name,
        legal_name: input.legalName?.trim() || null,
        organization_type: "BROKERAGE",
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        address_line_1: input.addressLine1?.trim() || null,
        address_line_2: input.addressLine2?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim()?.toUpperCase() || "TX",
        zip: input.zip?.trim() || null,
        brokerage_license_number: input.brokerageLicenseNumber?.trim() || null,
        broker_first_name: input.brokerFirstName?.trim() || null,
        broker_middle_name: input.brokerMiddleName?.trim() || null,
        broker_last_name: input.brokerLastName?.trim() || null,
        broker_license_number: input.brokerLicenseNumber?.trim() || null,
        broker_phone: input.brokerPhone?.trim() || null,
        broker_email: input.brokerEmail?.trim() || null,
        status: "ACTIVE",
      })
      .select("id, name")
      .single();

    if (error) {
      return { ok: false as const, error: error.message };
    }

    revalidatePath("/admin/users");
    revalidatePath("/admin/users/invite");
    return { ok: true as const, organization: data };
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error) };
  }
}
