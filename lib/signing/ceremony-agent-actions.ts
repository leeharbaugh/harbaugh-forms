"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import {
  buildClearedDeviceHandoffActiveCookieAttributes,
  buildClearedDeviceHandoffLockCookieAttributes,
  buildDeviceHandoffActiveCookieAttributes,
  buildDeviceHandoffLockCookieAttributes,
  DEVICE_HANDOFF_LOCK_COOKIE_NAME,
  releaseDeviceHandoffLockWithActor,
} from "@/lib/signing/device-handoff-lock";
import { createClient } from "@/lib/supabase/server";
import {
  createInPersonHandoffWithActor,
} from "@/lib/signing/in-person-handoff";
import { cookies } from "next/headers";
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

    const cookieStore = await cookies();
    cookieStore.set(
      buildDeviceHandoffLockCookieAttributes({
        rawLockToken: handoff.rawDeviceLockToken,
      }),
    );
    // Readable companion flag for bfcache/pageshow guards only — not authority.
    cookieStore.set(buildDeviceHandoffActiveCookieAttributes());

    return {
      ok: true,
      data: {
        handoffId: handoff.handoffId,
        handoffPath: `/sign/in-person/${handoff.rawHandoffToken}`,
        expiresAt: handoff.expiresAt,
        deviceLockExpiresAt: handoff.deviceLockExpiresAt,
        endedPriorSessions: handoff.endedPriorSessionIds.length,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Release the shared-device workspace lock after in-person ceremony.
 *
 * Requires the issuing agent and password re-verification. Does not finalize
 * the Signing.
 */
export async function unlockDeviceHandoffLockAction(input: {
  password: unknown;
}): Promise<SigningCeremonyAgentActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const cookieStore = await cookies();
    const rawLockToken = cookieStore.get(DEVICE_HANDOFF_LOCK_COOKIE_NAME)?.value;

    const supabase = await createClient();
    const released = await releaseDeviceHandoffLockWithActor({
      admin,
      actor,
      rawLockToken,
      password: input.password,
      signInWithPassword: async (credentials) => {
        const { error } = await supabase.auth.signInWithPassword(credentials);
        return { error: error ? { message: error.message } : null };
      },
    });

    cookieStore.set(buildClearedDeviceHandoffLockCookieAttributes());
    cookieStore.set(buildClearedDeviceHandoffActiveCookieAttributes());

    return {
      ok: true,
      data: {
        signingId: released.signingId,
        releasedAt: released.releasedAt,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}
