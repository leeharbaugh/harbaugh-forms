/**
 * Recovery-safe Signing work suspension gate.
 *
 * When suspended, workers must not claim or process finalization, combined
 * package, invitation, or completed-package delivery work.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const SIGNING_WORK_SUSPENDED_ENV = "SIGNING_WORK_SUSPENDED" as const;

/**
 * True when DB control `work_suspended` is set OR env SIGNING_WORK_SUSPENDED===true.
 */
export async function isSigningWorkSuspended(
  admin: SupabaseClient,
): Promise<boolean> {
  if (process.env[SIGNING_WORK_SUSPENDED_ENV]?.trim() === "true") {
    return true;
  }

  const { data, error } = await admin
    .from("signing_system_controls")
    .select("work_suspended")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.work_suspended);
}

/** System/service-role control for recovery-safe mode. */
export async function setSigningWorkSuspended(options: {
  admin: SupabaseClient;
  suspended: boolean;
  reason?: string | null;
  note?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    work_suspended: options.suspended,
  };
  if (options.suspended) {
    patch.suspension_reason = options.reason ?? null;
    patch.suspended_at = now;
    patch.suspended_by_note = options.note ?? null;
    patch.resumed_at = null;
    patch.resumed_by_note = null;
  } else {
    patch.resumed_at = now;
    patch.resumed_by_note = options.note ?? null;
    patch.suspension_reason = null;
    patch.suspended_at = null;
    patch.suspended_by_note = null;
  }

  const { error } = await options.admin
    .from("signing_system_controls")
    .update(patch)
    .eq("id", "default");
  if (error) throw new Error(error.message);
}
