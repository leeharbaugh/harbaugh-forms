/**
 * Cancel a Signing under the same lifecycle rules for agents, co-agents,
 * Transaction Coordinators, and originating ORG_ADMIN managers.
 *
 * `signing_cancel` is the authoritative transaction: it writes CANCELLED with
 * the required internal reason and the optional participant-safe message, and
 * queues one cancellation email per invited participant. Emails are sent after
 * commit by the Signing worker; their outcome never changes lifecycle.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import { processNextCancellationNoticeWorkItem } from "./cancellation-notices";
import { newWorkerId } from "./work-items";
import {
  buildResponsibleContextMetadata,
  requireSigningEventActorType,
} from "./event-actor";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import { canRenameSigning } from "./rename";
import { appendSigningEvent } from "./signing-events";
import { isUuid, type SigningActor, type SigningSummary } from "./types";
import { getSigningForActor } from "./operations";

export const CANCELLATION_REASON_MAX_LENGTH = 500;
export const CANCELLATION_PARTICIPANT_MESSAGE_MAX_LENGTH = 1000;

export type CancelSigningInput = {
  signingId: unknown;
  /** Required internal audit-history reason. Never sent to participants. */
  reason?: unknown;
  /** Optional participant-safe text included in cancellation emails. */
  participantMessage?: unknown;
};

export type CancelSigningResult = SigningSummary & {
  /** Cancellation emails queued by this request (0 on a repeat). */
  cancellationNoticesQueued: number;
  alreadyCancelled: boolean;
};

type CancelFunctionResult = {
  already_cancelled: boolean;
  previous_lifecycle_state: string;
  cancelled_at: string | null;
  archived: boolean;
  cancellation_notices: number;
};

/**
 * Best-effort immediate send after the cancellation committed, like the
 * invitation send after activation. Anything left over stays queued for the
 * Signing worker; a failure here never surfaces as a cancellation failure.
 */
async function sendQueuedCancellationNotices(
  admin: SupabaseClient,
  signingId: string,
  count: number,
): Promise<void> {
  try {
    const workerId = newWorkerId("cancel-signing");
    for (let i = 0; i < count; i += 1) {
      const processed = await processNextCancellationNoticeWorkItem({
        admin,
        workerId,
        signingId,
      });
      if (processed.outcome === "NO_WORK" || processed.outcome === "SUSPENDED") break;
    }
  } catch (error) {
    console.error(
      "[native-signing-cancel] cancellation email processing failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

function cleanText(value: unknown, maxLength: number, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new SigningError("INVALID_INPUT", `${label} must be text.`);
  }
  // Keep line breaks; drop other control characters.
  const cleaned = value.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    throw new SigningError(
      "INVALID_INPUT",
      `${label} must be ${maxLength} characters or fewer.`,
    );
  }
  return cleaned;
}

/**
 * Cancel DRAFT or IN_PROGRESS Signings. COMPLETE / DECLINED fail closed; a
 * repeat on an already Cancelled Signing returns it without queuing anything.
 * Attribution records the actual operational actor; responsible context is preserved.
 */
export async function cancelSigningWithActor(
  actor: SigningActor,
  input: CancelSigningInput,
  admin: SupabaseClient,
): Promise<CancelSigningResult> {
  assertNativeSigningEnabled();

  if (!isUuid(input.signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  const bundle = await loadSigningAuthorityBundle(admin, actor, input.signingId);
  if (!bundle) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }

  const { signing, authority } = bundle;
  if (signing.lifecycle_state === "CANCELLED") {
    // Idempotent repeat (double submit, retry): nothing new is queued.
    if (
      !canRenameSigning({
        authority,
        lifecycleState: signing.lifecycle_state,
        originatingOrganizationId: signing.originating_organization_id,
        memberships: actor.memberships,
      })
    ) {
      throw new SigningError("FORBIDDEN", "You cannot cancel this Signing.");
    }
    return {
      ...(await getSigningForActor(actor, signing.id, admin)),
      cancellationNoticesQueued: 0,
      alreadyCancelled: true,
    };
  }
  if (!authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot cancel this Signing.");
  }
  if (
    signing.lifecycle_state !== "DRAFT" &&
    signing.lifecycle_state !== "IN_PROGRESS"
  ) {
    throw new SigningError(
      "CONFLICT",
      "Only Draft or In Progress Signings may be cancelled.",
    );
  }

  const reason = cleanText(input.reason, CANCELLATION_REASON_MAX_LENGTH, "Cancellation reason");
  const participantMessage = cleanText(
    input.participantMessage,
    CANCELLATION_PARTICIPANT_MESSAGE_MAX_LENGTH,
    "Message to participants",
  );
  if (!reason) {
    throw new SigningError("INVALID_INPUT", "A cancellation reason is required.");
  }

  const { data, error } = await admin.rpc("signing_cancel", {
    p_signing_id: signing.id,
    p_actor_user_id: actor.userId,
    p_reason: reason,
    p_participant_message: participantMessage,
  });
  if (error) {
    if (/SIGNING_CANCEL_NOT_FOUND/.test(error.message)) {
      throw new SigningError("NOT_FOUND", "Signing not found.");
    }
    if (/SIGNING_CANCEL_NOT_ALLOWED/.test(error.message)) {
      throw new SigningError(
        "CONFLICT",
        "Only Draft or In Progress Signings may be cancelled.",
      );
    }
    if (/SIGNING_CANCEL_REASON_REQUIRED/.test(error.message)) {
      throw new SigningError("INVALID_INPUT", "A cancellation reason is required.");
    }
    throw new Error(error.message);
  }
  const result = data as CancelFunctionResult;

  if (!result.already_cancelled) {
    const actorType = requireSigningEventActorType(authority);
    const summaryText =
      actorType === "TRANSACTION_COORDINATOR" &&
      signing.original_sender_display_name
        ? `Cancelled by ${actor.displayName}, Transaction Coordinator, on behalf of ${signing.original_sender_display_name}`
        : `Cancelled by ${actor.displayName}`;
    await appendSigningEvent(admin, {
      signingId: signing.id,
      eventType: "SIGNING_CANCELLED",
      actorType,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      visibility: "BUSINESS",
      summary: summaryText,
      detailsJson: {
        cancelledAt: result.cancelled_at,
        reason,
        participantMessage,
        previousLifecycleState: result.previous_lifecycle_state,
        archived: result.archived,
        cancellationEmailsQueued: result.cancellation_notices,
        ...(buildResponsibleContextMetadata({
          responsibleUserId: signing.original_sender_user_id,
          responsibleDisplayName: signing.original_sender_display_name,
        }) ?? {}),
      },
      idempotencyKey: `SIGNING_CANCELLED:${signing.id}`,
    });

    if (result.cancellation_notices > 0) {
      await appendSigningEvent(admin, {
        signingId: signing.id,
        eventType: "PARTICIPANT_CANCELLATION_EMAILS_QUEUED",
        actorType: "SYSTEM",
        actorDisplayName: "Native Signing Delivery",
        visibility: "BUSINESS",
        summary: `Cancellation email queued for ${result.cancellation_notices} invited participant${result.cancellation_notices === 1 ? "" : "s"}`,
        detailsJson: { count: result.cancellation_notices },
        idempotencyKey: `PARTICIPANT_CANCELLATION_EMAILS_QUEUED:${signing.id}`,
      });
      await sendQueuedCancellationNotices(admin, signing.id, result.cancellation_notices);
    }
  }

  const summary = await getSigningForActor(actor, signing.id, admin);
  return {
    ...summary,
    cancellationNoticesQueued: result.already_cancelled ? 0 : result.cancellation_notices,
    alreadyCancelled: result.already_cancelled,
  };
}
