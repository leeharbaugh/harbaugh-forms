"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import { activateSigningWithActor } from "@/lib/signing/activation";
import { loadSigningDashboardForActor } from "@/lib/signing/dashboard";
import { SigningError } from "@/lib/signing/errors";
import { NativeSigningDisabledError } from "@/lib/signing/feature-gate";
import {
  keepCurrentDraftSourceWithActor,
  updateDraftSourceToLatestWithActor,
} from "@/lib/signing/source-drift";
import { createAdminClient } from "@/lib/supabase/admin";

export type SigningStage4ActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; code: string; error: string };

function toActionError(error: unknown): SigningStage4ActionResult {
  if (error instanceof NativeSigningDisabledError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof SigningError) {
    return { ok: false, code: error.code, error: error.message };
  }
  // Never return raw Supabase / Error.message to the browser.
  if (error instanceof Error && error.message) {
    console.error("[native-signing-stage4] unexpected error:", error.message);
  } else {
    console.error("[native-signing-stage4] unexpected error");
  }
  return { ok: false, code: "INTERNAL", error: "Unexpected Signing error." };
}

async function withAuthorizedAdmin<T>(
  run: (
    actor: Awaited<ReturnType<typeof requireSigningActor>>,
    admin: ReturnType<typeof createAdminClient>,
  ) => Promise<T>,
): Promise<SigningStage4ActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const data = await run(actor, admin);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getSigningDashboardAction(input: {
  signingId: unknown;
}): Promise<SigningStage4ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    loadSigningDashboardForActor(actor, input.signingId, admin),
  );
}

/** Keep Current: acknowledge the live change; keep the selected snapshot. */
export async function keepCurrentDraftSourceAction(input: {
  signingId: unknown;
  signingDocumentId: unknown;
}): Promise<SigningStage4ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    keepCurrentDraftSourceWithActor(actor, input, admin),
  );
}

/** Update to Latest: capture a new snapshot; no versions or revisions created. */
export async function updateDraftSourceToLatestAction(input: {
  signingId: unknown;
  signingDocumentId: unknown;
}): Promise<SigningStage4ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    updateDraftSourceToLatestWithActor(actor, input, admin),
  );
}

/**
 * Send / Begin In-Person Signing.
 *
 * The only browser-facing path that may promote a package revision, and it goes
 * through activateSigningWithActor so readiness, drift, idempotency, credential
 * issuance, and the guarded lifecycle flip all apply.
 * `promotePackageRevisionFromDraftWithActor` remains internal by design.
 */
export async function activateSigningAction(input: {
  signingId: unknown;
  mode: unknown;
  clientRequestId: unknown;
}): Promise<SigningStage4ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    activateSigningWithActor(actor, input, admin),
  );
}
