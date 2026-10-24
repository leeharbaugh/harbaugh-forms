/**
 * Participant cancellation emails.
 *
 * `signing_cancel` queues one CANCELLATION delivery instruction and one
 * PARTICIPANT_CANCELLATION_EMAIL work item per invited participant in the
 * same transaction that cancels the Signing. This worker sends them after
 * commit through the shared Signing email boundary and records every attempt.
 * Delivery never changes lifecycle and never issues or restores credentials.
 *
 * The message carries the Signing name, the responsible agent and brokerage,
 * and the optional participant-safe message. It never reads the internal
 * cancellation reason and never contains a link.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendSigningEmail,
  type SigningEmailMessage,
  type SigningEmailSendResult,
} from "./delivery";
import {
  CONSENT_WITHDRAWN_DELIVERY_DETAIL,
  isParticipantConsentWithdrawn,
  recordSuppressedDelivery,
} from "./consent-withdrawal";
import { SigningError } from "./errors";
import { getSigningExternalAccessState } from "./external-access";
import { appendSigningEvent } from "./signing-events";
import {
  claimSigningWorkItem,
  completeWorkItem,
  failWorkItem,
  newWorkerId,
  workerHoldsLease,
  type SigningWorkItemRow,
} from "./work-items";
import { isSigningWorkSuspended } from "./work-suspension";

export const PARTICIPANT_CANCELLATION_WORK_TYPE =
  "PARTICIPANT_CANCELLATION_EMAIL" as const;

/** Attempts before a retryable failure becomes terminal. */
export const CANCELLATION_NOTICE_MAX_ATTEMPTS = 5;
export const CANCELLATION_NOTICE_RETRY_SECONDS = 900;
/** Terminal failures stay FAILED and are not claimed again. */
const TERMINAL_RETRY_SECONDS = 86_400 * 365;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CancellationNoticeContent = {
  recipientName: string;
  recipientEmail: string;
  signingTitle: string;
  senderDisplayName: string | null;
  brokerageName: string | null;
  participantMessage: string | null;
};

/** Text-only cancellation email; factual about the Signing workflow only. */
export function buildCancellationNoticeMessage(
  content: CancellationNoticeContent,
): SigningEmailMessage {
  const sender = content.senderDisplayName?.trim() || null;
  const brokerage = content.brokerageName?.trim() || null;
  const from = sender
    ? brokerage
      ? ` from ${sender} at ${brokerage}`
      : ` from ${sender}`
    : "";
  const message = content.participantMessage?.trim() || null;

  const lines = [
    `Hello ${content.recipientName},`,
    "",
    `The signing request "${content.signingTitle}"${from} has been cancelled.`,
    "",
    "Your previous signing link can no longer be used, and nothing else is needed from you for this signing request.",
  ];
  if (message) {
    lines.push("", `Message from ${sender ?? "the sender"}:`, `"${message}"`);
  }
  lines.push(
    "",
    sender
      ? `If you have questions, please contact ${sender}${brokerage ? ` at ${brokerage}` : ""}.`
      : "If you have questions, please contact the person who sent you this signing request.",
  );

  return {
    to: content.recipientEmail,
    subject: `Signing cancelled: ${content.signingTitle}`,
    textBody: lines.join("\n"),
  };
}

/**
 * The exact message the worker sends for one cancellation instruction.
 * Reads only participant-safe Signing columns.
 */
export async function loadCancellationNoticeMessage(
  admin: SupabaseClient,
  signingId: string,
  deliveryInstructionId: string,
): Promise<SigningEmailMessage | null> {
  const { data: instruction, error } = await admin
    .from("signing_delivery_instructions")
    .select("id, purpose, recipient_email_snapshot, recipient_name_snapshot")
    .eq("id", deliveryInstructionId)
    .eq("signing_id", signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!instruction || instruction.purpose !== "CANCELLATION") return null;
  const signing = await loadNoticeSigning(admin, signingId);
  if (!signing) return null;
  return buildCancellationNoticeMessage({
    recipientName: String(instruction.recipient_name_snapshot ?? "Participant"),
    recipientEmail: String(instruction.recipient_email_snapshot ?? "").trim(),
    signingTitle: signing.title,
    senderDisplayName: signing.senderDisplayName,
    brokerageName: signing.brokerageName,
    participantMessage: signing.participantMessage,
  });
}

async function loadNoticeSigning(admin: SupabaseClient, signingId: string) {
  const { data: signing, error } = await admin
    .from("signings")
    .select(
      "id, title, lifecycle_state, original_sender_display_name, originating_organization_id, cancellation_participant_message",
    )
    .eq("id", signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!signing) return null;

  let brokerageName: string | null = null;
  const orgId = signing.originating_organization_id as string | null;
  if (orgId) {
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    brokerageName = (org?.name as string | null) ?? null;
  }

  return {
    title: (signing.title as string | null) ?? "your Signing",
    lifecycleState: signing.lifecycle_state as string,
    senderDisplayName:
      (signing.original_sender_display_name as string | null) ?? null,
    brokerageName,
    participantMessage:
      (signing.cancellation_participant_message as string | null) ?? null,
  };
}

async function nextAttemptNumber(
  admin: SupabaseClient,
  deliveryInstructionId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("signing_delivery_attempts")
    .select("attempt_number")
    .eq("delivery_instruction_id", deliveryInstructionId)
    .order("attempt_number", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data?.[0]?.attempt_number as number | undefined) ?? 0) + 1;
}

export type ProcessCancellationNoticeResult = {
  workItemId: string;
  deliveryInstructionId: string;
  outcome: "ACCEPTED" | "FAILED" | "TERMINAL_FAILURE" | "SUSPENDED" | "SKIPPED" | "SUPPRESSED";
  failureDetailSafe: string | null;
};

/** Claim-aware handler for one PARTICIPANT_CANCELLATION_EMAIL work item. */
export async function processCancellationNoticeWorkItem(options: {
  admin: SupabaseClient;
  workItemId: string;
  workerId: string;
  /** Test seam for the provider; defaults to the shared Signing email boundary. */
  send?: (message: SigningEmailMessage) => Promise<SigningEmailSendResult>;
}): Promise<ProcessCancellationNoticeResult> {
  const { admin, workItemId, workerId } = options;
  const suspended = async (detail: string): Promise<ProcessCancellationNoticeResult> => {
    await failWorkItem({ admin, workItemId, workerId, errorSafe: detail, retryDelaySeconds: 300 });
    return { workItemId, deliveryInstructionId: "", outcome: "SUSPENDED", failureDetailSafe: detail };
  };

  if (await isSigningWorkSuspended(admin)) {
    return suspended("Signing work is suspended.");
  }
  if ((await getSigningExternalAccessState(admin)).suspended) {
    return suspended("Signing external access is suspended.");
  }

  const { data: workItem, error: workItemError } = await admin
    .from("signing_work_items")
    .select("*")
    .eq("id", workItemId)
    .maybeSingle();
  if (workItemError) throw new Error(workItemError.message);
  if (!workItem) {
    throw new SigningError("NOT_FOUND", "Delivery work item not found.");
  }
  if (workItem.work_type !== PARTICIPANT_CANCELLATION_WORK_TYPE) {
    throw new SigningError("INVALID_INPUT", "Unsupported delivery work type.");
  }
  const signingId = workItem.signing_id as string;
  const reference = (workItem.reference_json ?? {}) as Record<string, unknown>;
  const deliveryInstructionId = String(reference.deliveryInstructionId ?? "");

  const { data: instruction, error: instructionError } = await admin
    .from("signing_delivery_instructions")
    .select("id, purpose, signing_participant_id, recipient_email_snapshot, recipient_name_snapshot, delivery_state")
    .eq("id", deliveryInstructionId)
    .eq("signing_id", signingId)
    .maybeSingle();
  if (instructionError) throw new Error(instructionError.message);
  if (!instruction || instruction.purpose !== "CANCELLATION") {
    throw new SigningError("NOT_FOUND", "Cancellation delivery instruction not found.");
  }

  if (!workerHoldsLease(workItem as unknown as SigningWorkItemRow, workerId)) {
    throw new SigningError("CONFLICT", "Cancellation work item lease was lost.");
  }

  // A participant gets one cancellation email: an accepted instruction is never sent again.
  if (instruction.delivery_state === "ACCEPTED") {
    await completeWorkItem({ admin, workItemId, workerId });
    return { workItemId, deliveryInstructionId, outcome: "SKIPPED", failureDetailSafe: null };
  }

  const participantId = (instruction.signing_participant_id as string | null) ?? null;
  if (await isParticipantConsentWithdrawn(admin, signingId, participantId)) {
    await recordSuppressedDelivery({
      admin,
      signingId,
      deliveryInstructionId,
      signingParticipantId: participantId as string,
      purpose: "CANCELLATION",
    });
    await completeWorkItem({ admin, workItemId, workerId });
    return {
      workItemId,
      deliveryInstructionId,
      outcome: "SUPPRESSED",
      failureDetailSafe: CONSENT_WITHDRAWN_DELIVERY_DETAIL,
    };
  }

  const signing = await loadNoticeSigning(admin, signingId);
  const recipientEmail = String(instruction.recipient_email_snapshot ?? "").trim();
  const recipientName = String(instruction.recipient_name_snapshot ?? "Participant");
  const attemptNumber = await nextAttemptNumber(admin, deliveryInstructionId);

  let result: SigningEmailSendResult;
  if (!signing || signing.lifecycleState !== "CANCELLED") {
    result = {
      ok: false,
      retryable: false,
      failureDetailSafe: "Signing is not cancelled; cancellation email was not sent.",
    };
  } else if (!EMAIL_RE.test(recipientEmail)) {
    result = {
      ok: false,
      retryable: false,
      failureDetailSafe: "Participant email is missing or invalid; cancellation email was not sent.",
    };
  } else {
    if (await isSigningWorkSuspended(admin)) {
      return suspended("Signing work is suspended.");
    }
    if ((await getSigningExternalAccessState(admin)).suspended) {
      return suspended("Signing external access is suspended.");
    }
    const message = buildCancellationNoticeMessage({
      recipientName,
      recipientEmail,
      signingTitle: signing.title,
      senderDisplayName: signing.senderDisplayName,
      brokerageName: signing.brokerageName,
      participantMessage: signing.participantMessage,
    });
    result = options.send
      ? await options.send(message)
      : await sendSigningEmail(message, {
          sandboxInspection: {
            purpose: "CANCELLATION",
            signingId,
            deliveryInstructionId,
            attemptNumber,
            recipientName,
          },
        });
  }

  const { error: attemptError } = await admin
    .from("signing_delivery_attempts")
    .insert({
      signing_id: signingId,
      delivery_instruction_id: deliveryInstructionId,
      attempt_number: attemptNumber,
      outcome: result.ok ? "ACCEPTED" : "FAILED",
      provider_reference: result.ok ? result.providerReference : null,
      failure_detail_safe: result.ok ? null : result.failureDetailSafe,
    });
  if (attemptError) throw new Error(attemptError.message);

  await admin
    .from("signing_delivery_instructions")
    .update({ delivery_state: result.ok ? "ACCEPTED" : "FAILED" })
    .eq("id", deliveryInstructionId)
    .eq("signing_id", signingId);

  if (result.ok) {
    await appendSigningEvent(admin, {
      signingId,
      eventType: "PARTICIPANT_CANCELLATION_EMAIL_SENT",
      actorType: "SYSTEM",
      actorDisplayName: "Native Signing Delivery",
      summary: "Cancellation email accepted for delivery",
      detailsJson: { deliveryInstructionId, signingParticipantId: participantId, attemptNumber },
      idempotencyKey: `PARTICIPANT_CANCELLATION_EMAIL_SENT:${deliveryInstructionId}`,
    });
    await completeWorkItem({ admin, workItemId, workerId });
    return { workItemId, deliveryInstructionId, outcome: "ACCEPTED", failureDetailSafe: null };
  }

  const terminal =
    result.retryable === false || attemptNumber >= CANCELLATION_NOTICE_MAX_ATTEMPTS;
  await failWorkItem({
    admin,
    workItemId,
    workerId,
    errorSafe: result.failureDetailSafe,
    retryDelaySeconds: terminal ? TERMINAL_RETRY_SECONDS : CANCELLATION_NOTICE_RETRY_SECONDS,
  });
  if (terminal) {
    await appendSigningEvent(admin, {
      signingId,
      eventType: "PARTICIPANT_CANCELLATION_EMAIL_FAILED",
      actorType: "SYSTEM",
      actorDisplayName: "Native Signing Delivery",
      summary: "Cancellation email could not be delivered",
      detailsJson: {
        deliveryInstructionId,
        signingParticipantId: participantId,
        attemptNumber,
        failureDetailSafe: result.failureDetailSafe,
      },
      idempotencyKey: `PARTICIPANT_CANCELLATION_EMAIL_FAILED:${deliveryInstructionId}`,
    });
  }
  return {
    workItemId,
    deliveryInstructionId,
    outcome: terminal ? "TERMINAL_FAILURE" : "FAILED",
    failureDetailSafe: result.failureDetailSafe,
  };
}

export async function processNextCancellationNoticeWorkItem(options: {
  admin: SupabaseClient;
  workerId?: string;
  signingId?: string;
  send?: (message: SigningEmailMessage) => Promise<SigningEmailSendResult>;
}): Promise<ProcessCancellationNoticeResult | { outcome: "NO_WORK" }> {
  const workerId = options.workerId ?? newWorkerId("cancellation-notice");
  const claimed = await claimSigningWorkItem({
    admin: options.admin,
    workType: PARTICIPANT_CANCELLATION_WORK_TYPE,
    workerId,
    signingId: options.signingId,
  });
  if (!claimed) return { outcome: "NO_WORK" };
  return processCancellationNoticeWorkItem({
    admin: options.admin,
    workItemId: claimed.id,
    workerId,
    send: options.send,
  });
}
