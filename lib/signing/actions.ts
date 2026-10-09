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
  createSigningFromPacketWithActor,
  type CreateSigningFromPacketResult,
} from "@/lib/signing/packet-to-signing";
import {
  getPacketSigningEligibility,
  type PacketSigningEligibility,
} from "@/lib/signing/packet-signing-eligibility";
import {
  grantOperatorDelegationWithActor,
  revokeOperatorDelegationWithActor,
  type GrantOperatorDelegationInput,
  type RevokeOperatorDelegationInput,
} from "@/lib/signing/operator-delegations";
import { renameSigningForActor } from "@/lib/signing/rename";
import { SigningError } from "@/lib/signing/errors";
import { NativeSigningDisabledError } from "@/lib/signing/feature-gate";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import type { SigningSummary } from "@/lib/signing/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SigningActionResult =
  | { ok: true; signing: SigningSummary }
  | { ok: false; code: string; error: string };

export type SigningListActionResult =
  | { ok: true; signings: SigningSummary[] }
  | { ok: false; code: string; error: string };

export type CreateSigningFromPacketActionResult =
  | { ok: true; data: CreateSigningFromPacketResult }
  | { ok: false; code: string; error: string };

export type PacketSigningEligibilityActionResult =
  | { ok: true; data: PacketSigningEligibility }
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
 * Server action: create a Draft Signing from a Packet (documents + parties).
 */
export async function createSigningFromPacketAction(input: {
  packetId: unknown;
  title?: unknown;
  confirmDuplicate?: unknown;
}): Promise<CreateSigningFromPacketActionResult> {
  try {
    if (!isNativeSigningEnabled()) {
      throw new NativeSigningDisabledError();
    }
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const data = await createSigningFromPacketWithActor(actor, input, admin);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Server action: may the signed-in User create a Signing from this Packet?
 * The Packet is read through the caller's own session (RLS), so nothing is
 * revealed about a Packet the caller cannot view. The create action applies
 * the same rules itself; this only explains them.
 */
export async function getPacketSigningEligibilityAction(input: {
  packetId: unknown;
}): Promise<PacketSigningEligibilityActionResult> {
  try {
    if (!isNativeSigningEnabled()) {
      throw new NativeSigningDisabledError();
    }
    const actor = await requireSigningActor();
    const raw = input.packetId;
    const packetId =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw)
          ? Number(raw)
          : NaN;
    if (!Number.isInteger(packetId) || packetId <= 0) {
      throw new SigningError("INVALID_PACKET", "Invalid Packet.");
    }
    const supabase = await createClient();
    const { data: packet, error } = await supabase
      .from("packets")
      .select("owner_user_id, status")
      .eq("id", packetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, data: getPacketSigningEligibility({ packet, actor }) };
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
 * Server action: rename a Signing in any lifecycle state (operational
 * metadata only; documents, participants and evidence are untouched).
 */
export async function renameSigningAction(input: {
  signingId: unknown;
  title: unknown;
}): Promise<SigningActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const signing = await renameSigningForActor(actor, input, admin);
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
