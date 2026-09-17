/**
 * Native Signing Stage 5 Finish Signing.
 *
 * Finish is the participant's declaration that they are done. It is idempotent,
 * releases presence, and ends the ceremony browser session.
 *
 * The last participant finishing does **not** complete the Signing. Lifecycle
 * `COMPLETE` belongs to verified finalization, which is a later stage; all this
 * does is move `finalization_condition` to READY and enqueue a FINALIZE_SIGNING
 * work item for that future worker to pick up.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  endCeremonyBrowserSession,
  type ValidatedCeremonySession,
} from "./browser-sessions";
import { requireCeremonyWriteContext } from "./ceremony-context";
import { appendCeremonyEvent } from "./ceremony-events";
import { SigningError } from "./errors";
import { countOutstandingRequiredFields } from "./placements";

export const FINALIZE_SIGNING_WORK_TYPE = "FINALIZE_SIGNING" as const;

export type FinishSigningResult = {
  finishedAt: string;
  allParticipantsFinished: boolean;
  finalizationCondition: string;
  finalizationEnqueued: boolean;
  /** True when this participant had already finished. */
  replayed: boolean;
};

async function loadFinalizationCondition(
  admin: SupabaseClient,
  signingId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("signings")
    .select("finalization_condition")
    .eq("id", signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.finalization_condition as string | null) ?? "NOT_STARTED";
}

export async function finishParticipantSigning(options: {
  admin: SupabaseClient;
  session: ValidatedCeremonySession;
}): Promise<FinishSigningResult> {
  const { admin, session } = options;

  if (session.participantStatus === "FINISHED") {
    const { data: participant, error } = await admin
      .from("signing_participants")
      .select("finished_at")
      .eq("id", session.signingParticipantId)
      .eq("signing_id", session.signingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      finishedAt:
        (participant?.finished_at as string | null) ?? new Date().toISOString(),
      allParticipantsFinished: false,
      finalizationCondition: await loadFinalizationCondition(
        admin,
        session.signingId,
      ),
      finalizationEnqueued: false,
      replayed: true,
    };
  }

  const context = await requireCeremonyWriteContext({ admin, session });

  const outstanding = await countOutstandingRequiredFields({ admin, context });
  if (outstanding > 0) {
    throw new SigningError(
      "NOT_READY",
      outstanding === 1
        ? "One required field still needs your signature or initials."
        : `${outstanding} required fields still need your signature or initials.`,
    );
  }

  const finishedAt = new Date().toISOString();
  const { data: finished, error: finishError } = await admin
    .from("signing_participants")
    .update({ participant_status: "FINISHED", finished_at: finishedAt })
    .eq("id", session.signingParticipantId)
    .eq("signing_id", session.signingId)
    .in("participant_status", ["PENDING", "STARTED"])
    .select("finished_at")
    .maybeSingle();
  if (finishError) throw new Error(finishError.message);
  if (!finished) {
    // Another request finished first; converge on its result.
    return {
      finishedAt,
      allParticipantsFinished: false,
      finalizationCondition: await loadFinalizationCondition(
        admin,
        session.signingId,
      ),
      finalizationEnqueued: false,
      replayed: true,
    };
  }

  await appendCeremonyEvent({
    admin,
    signingId: session.signingId,
    eventType: "PARTICIPANT_FINISHED",
    signingParticipantId: session.signingParticipantId,
    actorDisplayName: context.displayedName,
    packageRevisionId: context.packageRevisionId,
    summary: "Participant finished signing",
    detailsJson: { browserSessionId: session.sessionId },
    idempotencyKey: `PARTICIPANT_FINISHED:${session.signingParticipantId}`,
  });

  // Presence ends with the ceremony: an ended session must not keep blocking a
  // permitted amendment lock.
  await endCeremonyBrowserSession({
    admin,
    signingId: session.signingId,
    sessionId: session.sessionId,
    reason: "PARTICIPANT_FINISHED",
    status: "ENDED",
  });

  const { data: remaining, error: remainingError } = await admin
    .from("signing_participants")
    .select("id, participant_status")
    .eq("signing_id", session.signingId)
    .not("participant_status", "in", '("REMOVED","FINISHED")');
  if (remainingError) throw new Error(remainingError.message);

  const allParticipantsFinished = (remaining ?? []).length === 0;
  let finalizationEnqueued = false;

  if (allParticipantsFinished) {
    // READY means "ready for finalization", not complete. Lifecycle stays
    // IN_PROGRESS until a later stage verifies finalization.
    const { error: conditionError } = await admin
      .from("signings")
      .update({ finalization_condition: "READY" })
      .eq("id", session.signingId)
      .eq("lifecycle_state", "IN_PROGRESS")
      .eq("finalization_condition", "NOT_STARTED");
    if (conditionError) throw new Error(conditionError.message);

    const { error: workItemError } = await admin
      .from("signing_work_items")
      .insert({
        signing_id: session.signingId,
        work_type: FINALIZE_SIGNING_WORK_TYPE,
        idempotency_key: `${FINALIZE_SIGNING_WORK_TYPE}:${context.packageRevisionId}`,
        reference_json: {
          signingId: session.signingId,
          packageRevisionId: context.packageRevisionId,
        },
        processing_state: "PENDING",
      });
    if (workItemError) {
      // Already enqueued by a concurrent Finish.
      if (!/duplicate key/i.test(workItemError.message)) {
        throw new Error(workItemError.message);
      }
    } else {
      finalizationEnqueued = true;
    }
  }

  return {
    finishedAt: (finished.finished_at as string | null) ?? finishedAt,
    allParticipantsFinished,
    finalizationCondition: await loadFinalizationCondition(
      admin,
      session.signingId,
    ),
    finalizationEnqueued,
    replayed: false,
  };
}
