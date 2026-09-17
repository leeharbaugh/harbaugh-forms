/**
 * Native Signing amendment-lock primitives.
 *
 * Exclusive pre-signature locks may be held by an agent association or a TC
 * operator association. Ceremony writes fail closed while a lock is active.
 * Global package freeze after first accepted participant mark still applies
 * equally to agents, co-agents, TCs, and ORG_ADMIN (enforced elsewhere).
 *
 * The counterpart predicate acquisition must consult before taking a lock is
 * `hasActivePresenceForSigning` in `presence.ts` (participant presence blocks
 * amendment). That check is applied by future amendment UI callers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import { isUuid, type SigningActor } from "./types";

export type ActiveAmendmentLock = {
  lockId: string;
  signingId: string;
  heldByAgentAssociationId: string | null;
  heldByOperatorAssociationId: string | null;
  heldByUserId: string | null;
  expectedPackageRevisionId: string;
  acquiredAt: string;
  expiresAt: string;
};

export const AMENDMENT_LOCK_TTL_MINUTES = 15;

/** The unreleased, unexpired lock for this Signing, if any. Server time wins. */
export async function getActiveAmendmentLock(
  admin: SupabaseClient,
  signingId: string,
): Promise<ActiveAmendmentLock | null> {
  const { data, error } = await admin
    .from("signing_amendment_locks")
    .select(
      "id, signing_id, held_by_agent_association_id, held_by_operator_association_id, held_by_user_id, expected_package_revision_id, acquired_at, expires_at",
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
    heldByAgentAssociationId:
      (data.held_by_agent_association_id as string | null) ?? null,
    heldByOperatorAssociationId:
      (data.held_by_operator_association_id as string | null) ?? null,
    heldByUserId: (data.held_by_user_id as string | null) ?? null,
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

/** Ceremony writes fail closed while a manager holds the package. */
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

/**
 * Acquire an exclusive pre-signature amendment lock.
 * Holder is the authenticated manager's agent or TC operator association.
 */
export async function acquireAmendmentLockWithActor(
  actor: SigningActor,
  input: { signingId: unknown; ttlMinutes?: number },
  admin: SupabaseClient,
): Promise<ActiveAmendmentLock> {
  assertNativeSigningEnabled();
  if (!isUuid(input.signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  const bundle = await loadSigningAuthorityBundle(admin, actor, input.signingId);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!bundle.authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }

  const { signing, authority } = bundle;
  if (
    signing.lifecycle_state !== "DRAFT" &&
    signing.lifecycle_state !== "IN_PROGRESS"
  ) {
    throw new SigningError(
      "CONFLICT",
      "Amendment locks are only available before completion or cancellation.",
    );
  }
  if (!signing.current_package_revision_id && signing.lifecycle_state === "IN_PROGRESS") {
    throw new SigningError(
      "CONFLICT",
      "Signing has no current package revision to lock.",
    );
  }

  // After first accepted participant mark the package is frozen — no amendment
  // lock bypass for any manager role. Freeze enforcement lives with placements;
  // here we refuse when frozen_package_revision_id is already set.
  if (signing.frozen_package_revision_id) {
    throw new SigningError(
      "CONFLICT",
      "This Signing package is frozen after the first accepted participant mark.",
    );
  }

  const existing = await getActiveAmendmentLock(admin, signing.id);
  if (existing) {
    if (existing.heldByUserId === actor.userId) {
      return existing;
    }
    throw new SigningError(
      "AMENDMENT_LOCKED",
      "Another manager already holds the amendment lock for this Signing.",
    );
  }

  const ttlMinutes = input.ttlMinutes ?? AMENDMENT_LOCK_TTL_MINUTES;
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) {
    throw new SigningError(
      "INVALID_INPUT",
      "Amendment lock lifetime must be between 1 and 60 minutes.",
    );
  }

  const expectedPackageRevisionId =
    signing.current_package_revision_id ??
    // Draft may not yet have a promoted revision; use a stable sentinel UUID
    // only when still Draft with no revision — prefer requiring a revision.
    null;
  if (!expectedPackageRevisionId) {
    throw new SigningError(
      "CONFLICT",
      "Promote or activate a package revision before acquiring an amendment lock.",
    );
  }

  const agentAssociationId = authority.activeAssociation?.id ?? null;
  const operatorAssociationId =
    authority.activeOperatorAssociation?.id ?? null;

  // Exactly one holder association (XOR). Prefer agent association when both.
  let heldByAgentAssociationId: string | null = null;
  let heldByOperatorAssociationId: string | null = null;
  if (agentAssociationId) {
    heldByAgentAssociationId = agentAssociationId;
  } else if (operatorAssociationId) {
    heldByOperatorAssociationId = operatorAssociationId;
  } else {
    throw new SigningError(
      "FORBIDDEN",
      "Amendment locks require an active agent or Transaction Coordinator association on this Signing.",
    );
  }

  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const { data, error } = await admin
    .from("signing_amendment_locks")
    .insert({
      signing_id: signing.id,
      held_by_agent_association_id: heldByAgentAssociationId,
      held_by_operator_association_id: heldByOperatorAssociationId,
      held_by_user_id: actor.userId,
      expected_package_revision_id: expectedPackageRevisionId,
      expires_at: expiresAt,
    })
    .select(
      "id, signing_id, held_by_agent_association_id, held_by_operator_association_id, held_by_user_id, expected_package_revision_id, acquired_at, expires_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to acquire amendment lock.");
  }

  return {
    lockId: data.id as string,
    signingId: data.signing_id as string,
    heldByAgentAssociationId:
      (data.held_by_agent_association_id as string | null) ?? null,
    heldByOperatorAssociationId:
      (data.held_by_operator_association_id as string | null) ?? null,
    heldByUserId: (data.held_by_user_id as string | null) ?? null,
    expectedPackageRevisionId: data.expected_package_revision_id as string,
    acquiredAt: data.acquired_at as string,
    expiresAt: (data.expires_at as string | null) ?? expiresAt,
  };
}

export async function releaseAmendmentLockWithActor(
  actor: SigningActor,
  input: { signingId: unknown },
  admin: SupabaseClient,
): Promise<void> {
  assertNativeSigningEnabled();
  if (!isUuid(input.signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  const bundle = await loadSigningAuthorityBundle(admin, actor, input.signingId);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!bundle.authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }

  const active = await getActiveAmendmentLock(admin, bundle.signing.id);
  if (!active) return;
  if (active.heldByUserId && active.heldByUserId !== actor.userId) {
    throw new SigningError(
      "FORBIDDEN",
      "Only the lock holder may release this amendment lock.",
    );
  }

  const { error } = await admin
    .from("signing_amendment_locks")
    .update({
      released_at: new Date().toISOString(),
      release_reason: "RELEASED_BY_HOLDER",
    })
    .eq("id", active.lockId)
    .is("released_at", null);
  if (error) throw new Error(error.message);
}
