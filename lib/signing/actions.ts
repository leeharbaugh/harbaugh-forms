"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import {
  createDraftSigningWithActor,
  getSigningForActor,
  updateDraftSigningTitleForActor,
  type CreateDraftSigningInput,
  type UpdateDraftSigningTitleInput,
} from "@/lib/signing/operations";
import { SigningError } from "@/lib/signing/errors";
import { NativeSigningDisabledError } from "@/lib/signing/feature-gate";
import type { SigningSummary } from "@/lib/signing/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type SigningActionResult =
  | { ok: true; signing: SigningSummary }
  | { ok: false; code: string; error: string };

function toActionError(error: unknown): SigningActionResult {
  if (error instanceof NativeSigningDisabledError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof SigningError) {
    return { ok: false, code: error.code, error: error.message };
  }
  return {
    ok: false,
    code: "INTERNAL",
    error: error instanceof Error ? error.message : "Unexpected Signing error.",
  };
}

/**
 * Server action: create a Draft Signing for the authenticated eligible agent.
 * Identity, organization, and primary-agent association are derived server-side.
 * createAdminClient is called only after requireSigningActor succeeds.
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
