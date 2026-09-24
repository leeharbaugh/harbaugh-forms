"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import { SigningError } from "@/lib/signing/errors";
import { NativeSigningDisabledError } from "@/lib/signing/feature-gate";
import { loadSigningPreviewForActor } from "@/lib/signing/preview";
import { createAdminClient } from "@/lib/supabase/admin";

export type SigningPreviewActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; code: string; error: string };

function toActionError(error: unknown): SigningPreviewActionResult {
  if (error instanceof NativeSigningDisabledError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof SigningError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof Error && error.message) {
    console.error("[native-signing-preview] unexpected error:", error.message);
  } else {
    console.error("[native-signing-preview] unexpected error");
  }
  return { ok: false, code: "INTERNAL", error: "Unexpected Signing error." };
}

/**
 * Manager Draft Signing preview model (documents + draft field overlays).
 * Does not create revisions, versions, credentials, or delivery work.
 */
export async function getSigningPreviewAction(input: {
  signingId: unknown;
}): Promise<SigningPreviewActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const data = await loadSigningPreviewForActor(actor, input.signingId, admin);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}
