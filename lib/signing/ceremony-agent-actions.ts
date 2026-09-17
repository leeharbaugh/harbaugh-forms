"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import {
  createInPersonHandoffWithActor,
  SIGNING_HANDOFF_TTL_MINUTES,
} from "@/lib/signing/in-person-handoff";
import { SigningError } from "@/lib/signing/errors";
import { NativeSigningDisabledError } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";

export type SigningCeremonyAgentActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; code: string; error: string };

function toActionError(error: unknown): SigningCeremonyAgentActionResult {
  if (error instanceof NativeSigningDisabledError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof SigningError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof Error && error.message) {
    console.error(
      "[native-signing-ceremony] unexpected agent error:",
      error.message,
    );
  } else {
    console.error("[native-signing-ceremony] unexpected agent error");
  }
  return { ok: false, code: "INTERNAL", error: "Unexpected Signing error." };
}

/**
 * Begin a supervised in-person handoff for one participant.
 *
 * Returns a relative `/sign/in-person/{token}` path for the agent to open on
 * the shared device. The raw token exists only in this response: it is never
 * logged, never emailed here, and is consumed at identity affirmation.
 */
export async function startInPersonHandoffAction(input: {
  signingId: unknown;
  signingParticipantId: unknown;
}): Promise<SigningCeremonyAgentActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const handoff = await createInPersonHandoffWithActor(
      actor,
      {
        signingId: input.signingId,
        signingParticipantId: input.signingParticipantId,
      },
      admin,
    );
    return {
      ok: true,
      data: {
        handoffId: handoff.handoffId,
        handoffPath: `/sign/in-person/${handoff.rawHandoffToken}`,
        expiresAt: handoff.expiresAt,
        ttlMinutes: SIGNING_HANDOFF_TTL_MINUTES,
        endedPriorSessions: handoff.endedPriorSessionIds.length,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}
