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
    return existing as Profile;
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
    app_role: "USER" as const,
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
