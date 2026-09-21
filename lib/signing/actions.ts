"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import {
  cancelSigningWithActor,
  type CancelSigningInput,
} from "@/lib/signing/cancel";
import {
  createDraftSigningWithActor,
  getSigningForActor,
  listSigningsForActor,
  updateDraftSigningTitleForActor,
  type CreateDraftSigningInput,
  type UpdateDraftSigningTitleInput,
} from "@/lib/signing/operations";
import {
  grantOperatorDelegationWithActor,
  revokeOperatorDelegationWithActor,
  type GrantOperatorDelegationInput,
  type RevokeOperatorDelegationInput,
} from "@/lib/signing/operator-delegations";
import { SigningError } from "@/lib/signing/errors";
import { NativeSigningDisabledError } from "@/lib/signing/feature-gate";
import type { SigningSummary } from "@/lib/signing/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type SigningActionResult =
  | { ok: true; signing: SigningSummary }
  | { ok: false; code: string; error: string };

export type SigningListActionResult =
  | { ok: true; signings: SigningSummary[] }
  | { ok: false; code: string; error: string };

export type DelegationActionResult =
  | { ok: true; delegationId: string }
  | { ok: false; code: string; error: string };

function toActionError(
  error: unknown,
): { ok: false; code: string; error: string } {
  if (error instanceof NativeSigningDisabledError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof SigningError) {
    return { ok: false, code: error.code, error: error.message };
  }
  // Never return raw Supabase / Error.message to the browser.
  if (error instanceof Error && error.message) {
    console.error("[native-signing] unexpected error:", error.message);
  } else {
    console.error("[native-signing] unexpected error");
  }
  return {
    ok: false,
    code: "INTERNAL",
    error: "Unexpected Signing error.",
  };
}

/**
 * Server action: create a Draft Signing for the authenticated eligible User.
 * When responsibleUserId differs from the actor, the actor must hold an active
 * TC delegation; PRIMARY association and original_sender belong to the
 * responsible User; creator provenance records the TC.
 */
export async function createDraftSigningAction(
  input: CreateDraftSigningInput,
): Promise<SigningActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const signing = await createDraftSigningWithActor(actor, input, admin);
    return { ok: true, signing };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Server action: list Signings visible to the authenticated Signing actor.
 */
export async function listSigningsAction(): Promise<SigningListActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const signings = await listSigningsForActor(actor, admin);
    return { ok: true, signings };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Server action: read one Signing through trusted authority.
 */
export async function getSigningAction(
  signingId: unknown,
): Promise<SigningActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const signing = await getSigningForActor(actor, signingId, admin);
    return { ok: true, signing };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Server action: update Draft Signing title only.
 */
export async function updateDraftSigningTitleAction(
  input: UpdateDraftSigningTitleInput,
): Promise<SigningActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const signing = await updateDraftSigningTitleForActor(actor, input, admin);
    return { ok: true, signing };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Server action: cancel a Draft or In Progress Signing.
 */
export async function cancelSigningAction(
  input: CancelSigningInput,
): Promise<SigningActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const signing = await cancelSigningWithActor(actor, input, admin);
    return { ok: true, signing };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Minimal TC delegation grant (responsible User or ORG_ADMIN).
 * Not a full team-management UI — foundation validation surface only.
 */
export async function grantOperatorDelegationAction(
  input: GrantOperatorDelegationInput,
): Promise<DelegationActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const delegation = await grantOperatorDelegationWithActor(
      actor,
      input,
      admin,
    );
    return { ok: true, delegationId: delegation.id };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Minimal TC delegation revoke (responsible User or ORG_ADMIN).
 */
export async function revokeOperatorDelegationAction(
  input: RevokeOperatorDelegationInput,
): Promise<DelegationActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const delegation = await revokeOperatorDelegationWithActor(
      actor,
      input,
      admin,
    );
    return { ok: true, delegationId: delegation.id };
  } catch (error) {
    return toActionError(error);
  }
}
