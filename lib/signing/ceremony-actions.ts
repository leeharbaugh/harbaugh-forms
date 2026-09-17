"use server";

import "server-only";

import { cookies, headers } from "next/headers";
import { adoptCeremonyMark } from "@/lib/signing/adopted-marks";
import {
  buildClearedSigningCeremonyCookieAttributes,
  endCeremonyBrowserSession,
  recordMeaningfulCeremonyActivity,
  requireCeremonyBrowserSession,
  SIGNING_CEREMONY_COOKIE_NAME,
  type ValidatedCeremonySession,
} from "@/lib/signing/browser-sessions";
import {
  affirmIdentityFromEntrySession,
  affirmIdentityFromInPersonHandoff,
} from "@/lib/signing/ceremony-affirmation";
import {
  loadCeremonyOverview,
  requireCeremonyWriteContext,
  type CeremonyWriteContext,
} from "@/lib/signing/ceremony-context";
import { declineSigning } from "@/lib/signing/ceremony-decline";
import { finishParticipantSigning } from "@/lib/signing/ceremony-finish";
import { acceptConsent } from "@/lib/signing/consent-disclosure";
import { SIGNING_ENTRY_COOKIE_NAME } from "@/lib/signing/entry-sessions";
import { SigningError } from "@/lib/signing/errors";
import {
  assertNativeSigningEnabled,
  NativeSigningDisabledError,
} from "@/lib/signing/feature-gate";
import {
  buildClearedSigningHandoffCookieAttributes,
  SIGNING_HANDOFF_COOKIE_NAME,
} from "@/lib/signing/in-person-handoff";
import {
  acceptFieldPlacement,
  removeFieldPlacement,
  replaceFieldPlacement,
} from "@/lib/signing/placements";
import { renewPresenceLease } from "@/lib/signing/presence";
import { createAdminClient } from "@/lib/supabase/admin";

export type SigningCeremonyActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; code: string; error: string };

function toActionError(error: unknown): SigningCeremonyActionResult {
  if (error instanceof NativeSigningDisabledError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof SigningError) {
    return { ok: false, code: error.code, error: error.message };
  }
  // Never return a raw Supabase / Error message to a participant, and never log
  // a session, entry, or handoff token.
  if (error instanceof Error && error.message) {
    console.error("[native-signing-ceremony] unexpected error:", error.message);
  } else {
    console.error("[native-signing-ceremony] unexpected error");
  }
  return { ok: false, code: "INTERNAL", error: "Unexpected Signing error." };
}

/**
 * Same-origin requirement for every ceremony write.
 *
 * The ceremony cookie is `SameSite=Lax`, so a cross-site top-level navigation
 * could otherwise reach a mutating action. `Sec-Fetch-Site` is authoritative
 * where the browser sends it; otherwise the `Origin` header must match the
 * request host. A request that supplies neither signal fails closed.
 */
async function requireSameOriginCeremonyRequest(): Promise<void> {
  const headerStore = await headers();
  const fetchSite = headerStore.get("sec-fetch-site");
  if (fetchSite) {
    if (fetchSite !== "same-origin") {
      throw new SigningError(
        "CEREMONY_FORBIDDEN",
        "This request did not come from the signing page.",
      );
    }
    return;
  }

  const origin = headerStore.get("origin");
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!origin || !host) {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "This request did not come from the signing page.",
    );
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "This request did not come from the signing page.",
    );
  }
  if (originHost !== host) {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "This request did not come from the signing page.",
    );
  }
}

async function readCeremonyCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SIGNING_CEREMONY_COOKIE_NAME)?.value;
}

const RETURN_TO_AGENT_PATH = "/sign/return-to-agent" as const;

function inPersonCeremonyExitPayload(session: ValidatedCeremonySession) {
  const inPersonCeremony = session.inPersonHandoffId !== null;
  return {
    inPersonCeremony,
    returnToAgentPath: inPersonCeremony ? RETURN_TO_AGENT_PATH : null,
  };
}

/**
 * Shared ceremony write wrapper: feature gate, same-origin, ceremony session
 * (never the entry session), full revalidation, then the caller's work, then
 * the inactivity clock reset for this meaningful activity.
 */
async function withCeremonyWriteContext<T>(
  run: (options: {
    admin: ReturnType<typeof createAdminClient>;
    session: ValidatedCeremonySession;
    context: CeremonyWriteContext;
  }) => Promise<T>,
): Promise<SigningCeremonyActionResult> {
  try {
    assertNativeSigningEnabled();
    await requireSameOriginCeremonyRequest();

    const admin = createAdminClient();
    const session = await requireCeremonyBrowserSession(
      admin,
      await readCeremonyCookie(),
    );
    const context = await requireCeremonyWriteContext({ admin, session });

    const data = await run({ admin, session, context });

    await recordMeaningfulCeremonyActivity({
      admin,
      signingId: session.signingId,
      sessionId: session.sessionId,
    });

    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * "I am [Name]".
 *
 * Accepts the remote entry session or the in-person handoff, mints the ceremony
 * cookie, and returns where the participant should resume.
 */
export async function affirmIdentityAction(): Promise<SigningCeremonyActionResult> {
  try {
    assertNativeSigningEnabled();
    await requireSameOriginCeremonyRequest();

    const cookieStore = await cookies();
    const entryToken = cookieStore.get(SIGNING_ENTRY_COOKIE_NAME)?.value;
    const handoffToken = cookieStore.get(SIGNING_HANDOFF_COOKIE_NAME)?.value;
    if (!entryToken && !handoffToken) {
      throw new SigningError(
        "CEREMONY_FORBIDDEN",
        "This signing link is no longer available. Please ask the sending agent for a new one.",
      );
    }

    const admin = createAdminClient();
    const result = handoffToken
      ? await affirmIdentityFromInPersonHandoff({
          admin,
          rawHandoffToken: handoffToken,
        })
      : await affirmIdentityFromEntrySession({
          admin,
          rawEntrySessionToken: entryToken,
        });

    cookieStore.set(result.cookie);
    if (result.clearHandoffCookie) {
      cookieStore.set(buildClearedSigningHandoffCookieAttributes());
    }

    return {
      ok: true,
      data: {
        nextStep: result.nextStep,
        signingTitle: result.session.signingTitle,
        displayedName: result.session.participantFullName,
        supersededPriorSession: result.supersededSessionIds.length > 0,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

/** Ceremony read model + resume routing after affirmation or timeout. */
export async function getCeremonyOverviewAction(): Promise<SigningCeremonyActionResult> {
  try {
    assertNativeSigningEnabled();

    const admin = createAdminClient();
    const session = await requireCeremonyBrowserSession(
      admin,
      await readCeremonyCookie(),
    );
    const overview = await loadCeremonyOverview({ admin, session });
    return { ok: true, data: overview };
  } catch (error) {
    return toActionError(error);
  }
}

export async function acceptConsentAction(input: {
  disclosureVersionId: unknown;
}): Promise<SigningCeremonyActionResult> {
  return withCeremonyWriteContext(({ admin, context }) =>
    acceptConsent({
      admin,
      context,
      disclosureVersionId: input.disclosureVersionId,
    }),
  );
}

export async function adoptCeremonyMarkAction(input: {
  markKind: unknown;
  representationType: unknown;
  typedText?: unknown;
  drawnPath?: unknown;
}): Promise<SigningCeremonyActionResult> {
  return withCeremonyWriteContext(({ admin, context }) =>
    adoptCeremonyMark({
      admin,
      context,
      markKind: input.markKind,
      representationType: input.representationType,
      typedText: input.typedText,
      drawnPath: input.drawnPath,
    }),
  );
}

export async function placeCeremonyFieldAction(input: {
  signingFieldId: unknown;
  clientRequestId: unknown;
}): Promise<SigningCeremonyActionResult> {
  return withCeremonyWriteContext(({ admin, context }) =>
    acceptFieldPlacement({
      admin,
      context,
      signingFieldId: input.signingFieldId,
      clientRequestId: input.clientRequestId,
    }),
  );
}

export async function removeCeremonyPlacementAction(input: {
  signingFieldId: unknown;
  clientRequestId: unknown;
}): Promise<SigningCeremonyActionResult> {
  return withCeremonyWriteContext(({ admin, context }) =>
    removeFieldPlacement({
      admin,
      context,
      signingFieldId: input.signingFieldId,
      clientRequestId: input.clientRequestId,
    }),
  );
}

export async function replaceCeremonyPlacementAction(input: {
  signingFieldId: unknown;
  clientRequestId: unknown;
}): Promise<SigningCeremonyActionResult> {
  return withCeremonyWriteContext(({ admin, context }) =>
    replaceFieldPlacement({
      admin,
      context,
      signingFieldId: input.signingFieldId,
      clientRequestId: input.clientRequestId,
    }),
  );
}

/**
 * Document / page review is deliberate participant interaction, so it resets
 * the inactivity clock. It records no durable Signing history.
 */
export async function noteCeremonyReviewActivityAction(): Promise<SigningCeremonyActionResult> {
  return withCeremonyWriteContext(async () => ({ recorded: true }));
}

export async function finishCeremonyAction(): Promise<SigningCeremonyActionResult> {
  try {
    assertNativeSigningEnabled();
    await requireSameOriginCeremonyRequest();

    const admin = createAdminClient();
    const session = await requireCeremonyBrowserSession(
      admin,
      await readCeremonyCookie(),
    );
    const result = await finishParticipantSigning({ admin, session });

    const cookieStore = await cookies();
    cookieStore.set(buildClearedSigningCeremonyCookieAttributes());
    cookieStore.set(buildClearedSigningHandoffCookieAttributes());

    return {
      ok: true,
      data: { ...result, ...inPersonCeremonyExitPayload(session) },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function exitCeremonyAction(): Promise<SigningCeremonyActionResult> {
  try {
    assertNativeSigningEnabled();
    await requireSameOriginCeremonyRequest();

    const admin = createAdminClient();
    const session = await requireCeremonyBrowserSession(
      admin,
      await readCeremonyCookie(),
    );

    await endCeremonyBrowserSession({
      admin,
      signingId: session.signingId,
      sessionId: session.sessionId,
      reason: "PARTICIPANT_EXIT",
      status: "ENDED",
    });

    const cookieStore = await cookies();
    cookieStore.set(buildClearedSigningCeremonyCookieAttributes());
    cookieStore.set(buildClearedSigningHandoffCookieAttributes());

    return {
      ok: true,
      data: inPersonCeremonyExitPayload(session),
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function declineCeremonyAction(input: {
  confirmed: unknown;
  reason?: unknown;
}): Promise<SigningCeremonyActionResult> {
  try {
    assertNativeSigningEnabled();
    await requireSameOriginCeremonyRequest();

    const admin = createAdminClient();
    const session = await requireCeremonyBrowserSession(
      admin,
      await readCeremonyCookie(),
    );
    const result = await declineSigning({
      admin,
      session,
      confirmed: input.confirmed,
      reason: input.reason,
    });

    const cookieStore = await cookies();
    cookieStore.set(buildClearedSigningCeremonyCookieAttributes());
    cookieStore.set(buildClearedSigningHandoffCookieAttributes());

    return {
      ok: true,
      data: { ...result, ...inPersonCeremonyExitPayload(session) },
    };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Presence heartbeat.
 *
 * Renews the presence lease only. It deliberately does not call
 * `recordMeaningfulCeremonyActivity`, so an abandoned tab still times out after
 * 60 minutes without meaningful participant activity.
 */
export async function ceremonyHeartbeatAction(): Promise<SigningCeremonyActionResult> {
  try {
    assertNativeSigningEnabled();
    await requireSameOriginCeremonyRequest();

    const admin = createAdminClient();
    const session = await requireCeremonyBrowserSession(
      admin,
      await readCeremonyCookie(),
    );
    const lease = await renewPresenceLease({
      admin,
      signingId: session.signingId,
      signingBrowserSessionId: session.sessionId,
    });

    return {
      ok: true,
      data: {
        presence: lease !== null,
        presenceExpiresAt: lease?.expiresAt ?? null,
        // Unchanged by a heartbeat, and returned so the client can warn.
        inactivityExpiresAt: session.inactivityExpiresAt,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}
