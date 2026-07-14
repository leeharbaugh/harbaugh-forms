import "server-only";

import type { Profile } from "@/lib/types/profile";
import { createClient } from "@/lib/supabase/server";

export class AdminAuthorizationError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "INACTIVE";

  constructor(
    code: "UNAUTHENTICATED" | "FORBIDDEN" | "INACTIVE",
    message: string,
  ) {
    super(message);
    this.name = "AdminAuthorizationError";
    this.code = code;
  }
}

export type AppAdminContext = {
  userId: string;
  email: string | null;
  profile: Profile;
};

/**
 * Server-only guard: current session must be an active application ADMIN.
 * Never trusts a browser-supplied role.
 */
export async function requireAppAdmin(): Promise<AppAdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AdminAuthorizationError(
      "UNAUTHENTICATED",
      "You must be signed in to perform this action.",
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    throw new AdminAuthorizationError(
      "FORBIDDEN",
      "No application profile found for this account.",
    );
  }

  const typed = profile as Profile;

  if (typed.status !== "ACTIVE" || typed.onboarding_status === "DISABLED") {
    throw new AdminAuthorizationError(
      "INACTIVE",
      "This account is inactive.",
    );
  }

  if (typed.app_role !== "ADMIN" || typed.onboarding_status !== "ACTIVE") {
    throw new AdminAuthorizationError(
      "FORBIDDEN",
      "Application administrator access is required.",
    );
  }

  return {
    userId: user.id,
    email: user.email ?? typed.email,
    profile: typed,
  };
}
