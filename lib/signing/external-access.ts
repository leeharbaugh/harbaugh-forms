/**
 * Recovery-safe Signing external access gate (credentials / sessions).
 *
 * Complements work suspension (`work-suspension.ts`):
 * - Work suspension blocks finalization, combined package, and email workers.
 * - Access suspension + access epoch block external bearer/session validation
 *   and refuse new credential/session issuance while suspended.
 *
 * Finalization / combined-package workers must NOT block on access suspension
 * alone — evidence generation is independent of link authorization. Invitation
 * and completed-package email handlers MUST check access suspension before
 * sendSigningEmail (park/retry like work suspension).
 *
 * Fail-closed: missing controls row, empty epoch, or env/DB suspension denies.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";

export const SIGNING_ACCESS_SUSPENDED_ENV = "SIGNING_ACCESS_SUSPENDED" as const;

/** Sentinel stamped onto pre-migration credential/session rows. */
export const PRE_RECOVERY_ACCESS_EPOCH_SENTINEL =
  "pre-recovery-access-v0" as const;

export type SigningExternalAccessState = {
  /** True when env OR DB says suspended, or controls row is missing. */
  suspended: boolean;
  /** Current epoch when known; null when missing/uninitialized (deny). */
  currentEpoch: string | null;
};

function envAccessSuspended(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[SIGNING_ACCESS_SUSPENDED_ENV]?.trim() === "true";
}

/**
 * Read global external-access state. Missing controls row → suspended + no epoch.
 */
export async function getSigningExternalAccessState(
  admin: SupabaseClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SigningExternalAccessState> {
  if (envAccessSuspended(env)) {
    // Still load epoch when present so issuance refusals / diagnostics share one path.
    const { data, error } = await admin
      .from("signing_system_controls")
      .select("access_epoch")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const epoch =
      typeof data?.access_epoch === "string" && data.access_epoch.trim()
        ? data.access_epoch.trim()
        : null;
    return { suspended: true, currentEpoch: epoch };
  }

  const { data, error } = await admin
    .from("signing_system_controls")
    .select("access_suspended, access_epoch")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { suspended: true, currentEpoch: null };
  }

  const epoch =
    typeof data.access_epoch === "string" && data.access_epoch.trim()
      ? data.access_epoch.trim()
      : null;
  if (!epoch) {
    return { suspended: true, currentEpoch: null };
  }

  return {
    suspended: Boolean(data.access_suspended),
    currentEpoch: epoch,
  };
}

/**
 * Returns the current epoch when external access is active; otherwise null.
 * Does not throw. Callers that validate bearers should treat null as deny.
 */
export async function assertSigningExternalAccessActive(
  admin: SupabaseClient,
): Promise<string | null> {
  const state = await getSigningExternalAccessState(admin);
  if (state.suspended || !state.currentEpoch) {
    return null;
  }
  return state.currentEpoch;
}

/**
 * Issuance path: require active access and return the epoch to stamp.
 * Throws SigningError when suspended or uninitialized.
 */
export async function requireIssuanceAccessEpoch(
  admin: SupabaseClient,
): Promise<string> {
  const state = await getSigningExternalAccessState(admin);
  if (state.suspended || !state.currentEpoch) {
    throw new SigningError(
      "NOT_READY",
      "Signing external access is suspended; credentials cannot be issued.",
    );
  }
  return state.currentEpoch;
}

/** True when a stored row epoch matches the current controls epoch. */
export function isCredentialEpochCurrent(
  stored: string | null | undefined,
  current: string | null | undefined,
): boolean {
  if (typeof stored !== "string" || !stored.trim()) return false;
  if (typeof current !== "string" || !current.trim()) return false;
  return stored.trim() === current.trim();
}

/**
 * Participant/package-facing message when external Signing access fails.
 * Do not specialize by epoch mismatch, restore, or token state.
 */
export const SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE =
  "Signing access is currently unavailable. Please request a new link from the sender." as const;

/**
 * Recovery epoch bump: atomically set access_suspended=true and replace the
 * current epoch so access cannot stay live across an epoch transition.
 * Resume separately via setSigningAccessSuspended({ suspended: false }) after
 * review; never auto-reissues credentials.
 */
function truncateAccessNote(note: string | null | undefined): string | null {
  if (note == null) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

export async function bumpSigningAccessEpoch(options: {
  admin: SupabaseClient;
  note?: string | null;
}): Promise<string> {
  const newEpoch = randomUUID();
  const now = new Date().toISOString();
  const note = truncateAccessNote(options.note) ?? "access epoch bump";
  const { data, error } = await options.admin
    .from("signing_system_controls")
    .update({
      access_suspended: true,
      access_suspended_at: now,
      access_suspended_by_note: note,
      access_resumed_at: null,
      access_resumed_by_note: null,
      access_epoch: newEpoch,
      access_epoch_bumped_at: now,
      access_epoch_bump_note: note,
    })
    .eq("id", "default")
    .select("access_epoch, access_suspended")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.access_epoch) {
    throw new Error("signing_system_controls default row missing; cannot bump epoch.");
  }
  if (data.access_suspended !== true) {
    throw new Error("access epoch bump must leave access_suspended=true");
  }
  return data.access_epoch as string;
}

/** Suspend or resume external credential/session access. */
export async function setSigningAccessSuspended(options: {
  admin: SupabaseClient;
  suspended: boolean;
  note?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const note = truncateAccessNote(options.note);
  const patch: Record<string, unknown> = {
    access_suspended: options.suspended,
  };
  if (options.suspended) {
    patch.access_suspended_at = now;
    patch.access_suspended_by_note = note;
    patch.access_resumed_at = null;
    patch.access_resumed_by_note = null;
  } else {
    patch.access_resumed_at = now;
    patch.access_resumed_by_note = note;
    patch.access_suspended_at = null;
    patch.access_suspended_by_note = null;
  }

  const { data, error } = await options.admin
    .from("signing_system_controls")
    .update(patch)
    .eq("id", "default")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "signing_system_controls default row missing; cannot set access suspension.",
    );
  }
}
