/**
 * Native Signing Stage 5 Decline.
 *
 * Declining is a whole-Signing act: one participant's decline moves the Signing
 * to DECLINED so no other participant keeps signing a package that will not
 * complete. It requires explicit confirmation, releases every presence lease,
 * and ends every ceremony browser session in the Signing.
 *
 * Already-accepted marks and events are preserved as history; nothing is
 * deleted or rewritten.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  endActiveCeremonySessionsForSigning,
  type ValidatedCeremonySession,
} from "./browser-sessions";
import { requireCeremonyWriteContext } from "./ceremony-context";
import { appendCeremonyEvent } from "./ceremony-events";
import { SigningError } from "./errors";
import { releasePresenceLeasesForSigning } from "./presence";

const MAX_DECLINE_REASON_LENGTH = 1000;

export type DeclineSigningResult = {
  declinedAt: string;
  lifecycleState: string;
  /** True when this participant had already declined. */
  replayed: boolean;
  inPersonCeremony: boolean;
};

function parseDeclineReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new SigningError("INVALID_INPUT", "Invalid decline reason.");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_DECLINE_REASON_LENGTH) {
    throw new SigningError("INVALID_INPUT", "That reason is too long.");
  }
  return trimmed;
}

export async function declineSigning(options: {
  admin: SupabaseClient;
  session: ValidatedCeremonySession;
  reason?: unknown;
  /** Must be exactly true: declining is never a single accidental click. */
  confirmed: unknown;
}): Promise<DeclineSigningResult> {
  const { admin, session } = options;

  if (options.confirmed !== true) {
    throw new SigningError(
      "INVALID_INPUT",
      "Declining requires explicit confirmation.",
    );
  }
  const reason = parseDeclineReason(options.reason);

  if (session.participantStatus === "DECLINED") {
    const { data: participant, error } = await admin
      .from("signing_participants")
      .select("declined_at")
      .eq("id", session.signingParticipantId)
      .eq("signing_id", session.signingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      declinedAt:
        (participant?.declined_at as string | null) ?? new Date().toISOString(),
      lifecycleState: "DECLINED",
      replayed: true,
      inPersonCeremony: session.inPersonHandoffId !== null,
    };
  }

  const context = await requireCeremonyWriteContext({ admin, session });

  const declinedAt = new Date().toISOString();
  const { data: declined, error: declineError } = await admin
    .from("signing_participants")
    .update({
      participant_status: "DECLINED",
      declined_at: declinedAt,
      decline_reason: reason,
    })
    .eq("id", session.signingParticipantId)
    .eq("signing_id", session.signingId)
    .in("participant_status", ["PENDING", "STARTED"])
    .select("declined_at")
    .maybeSingle();
  if (declineError) throw new Error(declineError.message);
  if (!declined) {
    throw new SigningError(
      "CONFLICT",
      "This Signing changed while you were declining. Reload this page.",
    );
  }

  await appendCeremonyEvent({
    admin,
    signingId: session.signingId,
    eventType: "PARTICIPANT_DECLINED",
    signingParticipantId: session.signingParticipantId,
    actorDisplayName: context.displayedName,
    packageRevisionId: context.packageRevisionId,
    summary: "Participant declined to sign",
    detailsJson: {
      hasReason: reason !== null,
      browserSessionId: session.sessionId,
    },
    idempotencyKey: `PARTICIPANT_DECLINED:${session.signingParticipantId}`,
  });

  const { error: lifecycleError } = await admin
    .from("signings")
    .update({ lifecycle_state: "DECLINED" })
    .eq("id", session.signingId)
    .eq("lifecycle_state", "IN_PROGRESS");
  if (lifecycleError) throw new Error(lifecycleError.message);

  await appendCeremonyEvent({
    admin,
    signingId: session.signingId,
    eventType: "SIGNING_DECLINED",
    signingParticipantId: session.signingParticipantId,
    actorDisplayName: context.displayedName,
    packageRevisionId: context.packageRevisionId,
    summary: "Signing declined",
    detailsJson: { declinedByParticipantId: session.signingParticipantId },
    idempotencyKey: `SIGNING_DECLINED:${session.signingId}`,
  });

  // No participant may keep a lease or a usable ceremony session on a declined
  // Signing; session validation would reject them anyway once lifecycle moved.
  await releasePresenceLeasesForSigning({
    admin,
    signingId: session.signingId,
    reason: "SIGNING_DECLINED",
  });
  await endActiveCeremonySessionsForSigning({
    admin,
    signingId: session.signingId,
    reason: "SIGNING_DECLINED",
    status: "ENDED",
  });

  return {
    declinedAt: (declined.declined_at as string | null) ?? declinedAt,
    lifecycleState: "DECLINED",
    replayed: false,
    inPersonCeremony: session.inPersonHandoffId !== null,
  };
}
