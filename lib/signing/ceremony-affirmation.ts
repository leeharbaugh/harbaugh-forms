/**
 * Native Signing Stage 5 identity affirmation ("I am [Name]").
 *
 * This is the boundary between Stage 4 access plumbing and the ceremony:
 * validate the pre-ceremony entry (remote entry session or supervised in-person
 * handoff), create the ceremony browser session that becomes authority, begin
 * presence, record the affirmation, and retire the pre-ceremony credential so
 * it cannot be replayed.
 *
 * Presence starts here and nowhere earlier: an abandoned pre-affirmation tab
 * must never block an agent from acquiring a permitted amendment lock.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoActiveAmendmentLock } from "./amendment-locks";
import {
  buildSigningCeremonyCookieAttributes,
  createCeremonyBrowserSession,
  resolveCeremonyBrowserSession,
  type CeremonySessionProvenance,
  type SigningCeremonyCookieAttributes,
  type ValidatedCeremonySession,
} from "./browser-sessions";
import {
  loadCeremonyOverview,
  requireCeremonyWriteContext,
  type CeremonyStep,
} from "./ceremony-context";
import { appendCeremonyEvent } from "./ceremony-events";
import { validateSigningEntrySession } from "./entry-sessions";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import {
  consumeInPersonHandoff,
  validateInPersonHandoff,
} from "./in-person-handoff";
import { acquirePresenceLease } from "./presence";

export type CeremonyAffirmationResult = {
  sessionId: string;
  session: ValidatedCeremonySession;
  cookie: SigningCeremonyCookieAttributes;
  /** In-person entry: the handoff cookie must not outlive its single use. */
  clearHandoffCookie: boolean;
  nextStep: CeremonyStep;
  supersededSessionIds: string[];
};

function forbidden(): never {
  throw new SigningError(
    "CEREMONY_FORBIDDEN",
    "This signing link is no longer available. Please ask the sending agent for a new one.",
  );
}

async function affirmIdentity(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  provenance: CeremonySessionProvenance;
  entrySessionIdToTerminate?: string | null;
  clearHandoffCookie: boolean;
  entryMode: "REMOTE" | "IN_PERSON";
}): Promise<CeremonyAffirmationResult> {
  const { admin } = options;

  const { data: participant, error: participantError } = await admin
    .from("signing_participants")
    .select("id, participant_status, identity_confirmed_at")
    .eq("id", options.signingParticipantId)
    .eq("signing_id", options.signingId)
    .maybeSingle();
  if (participantError) throw new Error(participantError.message);
  if (!participant || participant.participant_status === "REMOVED") forbidden();
  if (participant.participant_status === "DECLINED") {
    throw new SigningError(
      "DECLINED",
      "This Signing was declined and can no longer be signed.",
    );
  }

  const alreadyFinished = participant.participant_status === "FINISHED";

  // Fail closed while the agent holds the package: granting presence would let
  // a participant contend with a lock that is already held.
  await assertNoActiveAmendmentLock(admin, options.signingId);

  const created = await createCeremonyBrowserSession({
    admin,
    signingId: options.signingId,
    signingParticipantId: options.signingParticipantId,
    provenance: options.provenance,
    entrySessionIdToTerminate: options.entrySessionIdToTerminate ?? null,
  });

  // A finished participant may re-enter to review what they signed, but must
  // not hold presence and keep blocking amendments.
  if (!alreadyFinished) {
    await acquirePresenceLease({
      admin,
      signingId: options.signingId,
      signingParticipantId: options.signingParticipantId,
      signingBrowserSessionId: created.sessionId,
    });
  }

  const identityConfirmedAt =
    (participant.identity_confirmed_at as string | null) ??
    new Date().toISOString();
  const participantUpdate: Record<string, unknown> = {
    identity_confirmed_at: identityConfirmedAt,
  };
  if (participant.participant_status === "PENDING") {
    participantUpdate.participant_status = "STARTED";
  }
  const { error: updateError } = await admin
    .from("signing_participants")
    .update(participantUpdate)
    .eq("id", options.signingParticipantId)
    .eq("signing_id", options.signingId)
    .neq("participant_status", "REMOVED");
  if (updateError) throw new Error(updateError.message);

  if (options.provenance.kind === "IN_PERSON_HANDOFF") {
    await consumeInPersonHandoff({
      admin,
      signingId: options.signingId,
      handoffId: options.provenance.handoffId,
    });
  }

  const resolved = await resolveCeremonyBrowserSession(
    admin,
    created.rawSessionToken,
  );
  if (!resolved.ok) {
    throw new SigningError(resolved.code, resolved.message);
  }
  const session = resolved.session;

  // Recorded after the session exists so the event can cite the actionable
  // revision and the frozen displayed name.
  const context = alreadyFinished
    ? null
    : await requireCeremonyWriteContext({ admin, session });
  await appendCeremonyEvent({
    admin,
    signingId: options.signingId,
    eventType: "IDENTITY_AFFIRMED",
    signingParticipantId: options.signingParticipantId,
    actorDisplayName: context?.displayedName ?? session.participantFullName,
    packageRevisionId: context?.packageRevisionId ?? null,
    summary: "Participant affirmed their identity",
    detailsJson: {
      entryMode: options.entryMode,
      browserSessionId: session.sessionId,
      supersededSessionIds: created.supersededSessionIds,
    },
  });

  const overview = await loadCeremonyOverview({ admin, session });

  return {
    sessionId: session.sessionId,
    session,
    cookie: buildSigningCeremonyCookieAttributes({
      rawSessionToken: created.rawSessionToken,
    }),
    clearHandoffCookie: options.clearHandoffCookie,
    nextStep: overview.nextStep,
    supersededSessionIds: created.supersededSessionIds,
  };
}

/** Remote participant: affirm from the Stage 4 `hf_signing_entry` session. */
export async function affirmIdentityFromEntrySession(options: {
  admin: SupabaseClient;
  rawEntrySessionToken: unknown;
}): Promise<CeremonyAffirmationResult> {
  assertNativeSigningEnabled();

  const entry = await validateSigningEntrySession(
    options.admin,
    options.rawEntrySessionToken,
  );
  if (!entry) forbidden();

  return affirmIdentity({
    admin: options.admin,
    signingId: entry.signingId,
    signingParticipantId: entry.signingParticipantId,
    provenance: { kind: "CREDENTIAL", credentialId: entry.credentialId },
    entrySessionIdToTerminate: entry.sessionId,
    clearHandoffCookie: false,
    entryMode: "REMOTE",
  });
}

/** In-person participant: affirm from the supervised handoff cookie. */
export async function affirmIdentityFromInPersonHandoff(options: {
  admin: SupabaseClient;
  rawHandoffToken: unknown;
}): Promise<CeremonyAffirmationResult> {
  assertNativeSigningEnabled();

  const handoff = await validateInPersonHandoff(
    options.admin,
    options.rawHandoffToken,
  );
  if (!handoff) forbidden();

  return affirmIdentity({
    admin: options.admin,
    signingId: handoff.signingId,
    signingParticipantId: handoff.signingParticipantId,
    provenance: {
      kind: "IN_PERSON_HANDOFF",
      handoffId: handoff.handoffId,
    },
    entrySessionIdToTerminate: null,
    clearHandoffCookie: true,
    entryMode: "IN_PERSON",
  });
}
