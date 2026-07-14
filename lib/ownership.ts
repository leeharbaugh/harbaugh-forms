import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the authenticated user id for ownership columns.
 * Triggers also enforce owner assignment; this keeps client inserts explicit.
 */
export async function getAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user.id;
}

export async function requireAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string> {
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    throw new Error("You must be signed in to save this record.");
  }
  return userId;
}
