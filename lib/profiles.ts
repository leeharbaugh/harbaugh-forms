import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types/profile";

export async function ensureUserProfile(
  supabase: SupabaseClient,
): Promise<Profile | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing) {
    const typed = existing as Profile;

    // Activate invited profiles without overwriting admin-provisioned fields.
    if (
      typed.status === "ACTIVE" &&
      typed.onboarding_status === "INVITED"
    ) {
      const { data: activated, error: activateError } = await supabase.rpc(
        "activate_invited_profile",
      );

      if (activateError) {
        throw new Error(activateError.message);
      }

      if (activated) {
        return activated as Profile;
      }
    }

    return typed;
  }

  const metadata = user.user_metadata ?? {};
  const insertPayload = {
    id: user.id,
    email: user.email ?? null,
    first_name:
      typeof metadata.first_name === "string" ? metadata.first_name : null,
    middle_name:
      typeof metadata.middle_name === "string" ? metadata.middle_name : null,
    last_name:
      typeof metadata.last_name === "string" ? metadata.last_name : null,
    preferred_name:
      typeof metadata.preferred_name === "string"
        ? metadata.preferred_name
        : null,
    display_name:
      typeof metadata.display_name === "string" ? metadata.display_name : null,
    app_role: "USER" as const,
    onboarding_status: "ACTIVE" as const,
    activated_at: new Date().toISOString(),
  };

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: retry, error: retryError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (retryError) {
        throw new Error(retryError.message);
      }

      return (retry as Profile | null) ?? null;
    }

    throw new Error(insertError.message);
  }

  return created as Profile;
}
