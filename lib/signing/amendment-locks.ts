/**
 * Native Signing Stage 5 amendment-lock read primitive.
 *
 * `signing_amendment_locks` exists so ceremony writes can fail closed while an
 * agent holds an exclusive pre-signature amendment lock. Acquiring, renewing,
 * and releasing a lock — and the agent amendment UI that would do so — remain a
 * later stage, so this module deliberately exposes reads only.
 *
 * The counterpart predicate a future acquisition must consult before taking a
 * lock is `hasActivePresenceForSigning` in `presence.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";

export type ActiveAmendmentLock = {
  lockId: string;
  signingId: string;
  heldByAgentAssociationId: string;
  expectedPackageRevisionId: string;
  acquiredAt: string;
  expiresAt: string;
};

/** The unreleased, unexpired lock for this Signing, if any. Server time wins. */
export async function getActiveAmendmentLock(
  admin: SupabaseClient,
  signingId: string,
): Promise<ActiveAmendmentLock | null> {
  const { data, error } = await admin
    .from("signing_amendment_locks")
    .select(
      "id, signing_id, held_by_agent_association_id, expected_package_revision_id, acquired_at, expires_at",
    )
    .eq("signing_id", signingId)
    .is("released_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    lockId: data.id as string,
    signingId: data.signing_id as string,
    heldByAgentAssociationId: data.held_by_agent_association_id as string,
    expectedPackageRevisionId: data.expected_package_revision_id as string,
    acquiredAt: data.acquired_at as string,
    expiresAt: data.expires_at as string,
  };
}

export async function hasActiveAmendmentLock(
  admin: SupabaseClient,
  signingId: string,
): Promise<boolean> {
  return (await getActiveAmendmentLock(admin, signingId)) !== null;
}

/** Ceremony writes fail closed while the agent holds the package. */
export async function assertNoActiveAmendmentLock(
  admin: SupabaseClient,
  signingId: string,
): Promise<void> {
  if (await hasActiveAmendmentLock(admin, signingId)) {
    throw new SigningError(
      "AMENDMENT_LOCKED",
      "The sending agent is updating this Signing. Please wait a moment and try again.",
    );
  }
}
