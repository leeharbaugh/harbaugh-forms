/**
 * Native Signing Stage 4 invitation delivery.
 *
 * Delivery is deliberately separated from activation:
 * - `signing_delivery_instructions` records the intent to invite one participant.
 * - `signing_work_items` is the durable outbox entry for that intent.
 * - `signing_delivery_attempts` records each provider attempt and its outcome.
 *
 * The email provider is never the authority on Signing state. A failed or
 * unconfigured provider records a FAILED attempt and never undoes activation.
 *
 * Invitation URL shape: `{APP_BASE_URL}/sign/{rawToken}` — a path segment so it
 * matches the `app/sign/[token]` route and is never placed in a query string
 * that could leak through a Referer header. Raw tokens are held in memory only
 * for the sending call: they are never written to instructions, work items,
 * events, or logs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRawParticipantCredentialToken } from "./credentials";
import { SigningError } from "./errors";

export const PARTICIPANT_INVITATION_WORK_TYPE =
  "PARTICIPANT_INVITATION_EMAIL" as const;

export type ParticipantInvitationTarget = {
  signingParticipantId: string;
  credentialId: string;
  fullName: string;
  email: string;
};

export type EnqueuedParticipantInvitation = {
  signingParticipantId: string;
  credentialId: string;
  deliveryInstructionId: string;
  workItemId: string;
};

export function resolveAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function buildParticipantInviteUrl(rawToken: string): string {
  return `${resolveAppBaseUrl()}/sign/${rawToken}`;
}

/**
 * Create invitation instructions and outbox work items for REMOTE_SEND.
 * Contains no raw credential token — only the credential id.
 */
export async function enqueueParticipantInvitations(options: {
  admin: SupabaseClient;
  signingId: string;
  packageRevisionId: string | null;
  initiatedByUserId: string;
  targets: ParticipantInvitationTarget[];
}): Promise<EnqueuedParticipantInvitation[]> {
  const enqueued: EnqueuedParticipantInvitation[] = [];

  for (const target of options.targets) {
    const { data: instruction, error: instructionError } = await options.admin
      .from("signing_delivery_instructions")
      .insert({
        signing_id: options.signingId,
        signing_participant_id: target.signingParticipantId,
        purpose: "INVITATION",
        recipient_email_snapshot: target.email,
        recipient_name_snapshot: target.fullName,
        signing_participant_credential_id: target.credentialId,
        package_revision_id: options.packageRevisionId,
        delivery_state: "QUEUED",
        initiated_by_user_id: options.initiatedByUserId,
      })
      .select("id")
      .single();
    if (instructionError || !instruction) {
      throw new Error(
        instructionError?.message ?? "Failed to record delivery instruction.",
      );
    }

    const { data: workItem, error: workItemError } = await options.admin
      .from("signing_work_items")
      .insert({
        signing_id: options.signingId,
        work_type: PARTICIPANT_INVITATION_WORK_TYPE,
        // Credential-scoped: re-issuing a credential produces a new work item.
        idempotency_key: `invitation:${target.credentialId}`,
        reference_json: {
          deliveryInstructionId: instruction.id as string,
          signingParticipantId: target.signingParticipantId,
          signingParticipantCredentialId: target.credentialId,
        },
        processing_state: "PENDING",
        next_attempt_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (workItemError || !workItem) {
      throw new Error(
        workItemError?.message ?? "Failed to enqueue invitation work item.",
      );
    }

    enqueued.push({
      signingParticipantId: target.signingParticipantId,
      credentialId: target.credentialId,
      deliveryInstructionId: instruction.id as string,
      workItemId: workItem.id as string,
    });
  }

  return enqueued;
}

export type SigningEmailMessage = {
  to: string;
  subject: string;
  textBody: string;
};

export type SigningEmailSendResult =
  | { ok: true; providerReference: string | null }
  | { ok: false; failureDetailSafe: string };

/**
 * Minimal provider-neutral transactional mail boundary.
 * Fails safely (and describably) when the provider is not configured.
 * Message bodies contain invitation URLs and are never logged.
 */
export async function sendSigningEmail(
  message: SigningEmailMessage,
): Promise<SigningEmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.SIGNING_EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    return {
      ok: false,
      failureDetailSafe:
        "Signing email provider is not configured; invitation was not sent.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.textBody,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        failureDetailSafe: `Email provider rejected the message (status ${response.status}).`,
      };
    }

    const payload = (await response.json().catch(() => null)) as
      | { id?: string }
      | null;
    return { ok: true, providerReference: payload?.id ?? null };
  } catch {
    // Never surface provider exception text: it can echo request contents.
    return {
      ok: false,
      failureDetailSafe: "Email provider request failed.",
    };
  }
}

function buildInvitationMessage(options: {
  recipientName: string;
  recipientEmail: string;
  signingTitle: string;
  inviteUrl: string;
}): SigningEmailMessage {
  return {
    to: options.recipientEmail,
    subject: `Your documents are ready to sign: ${options.signingTitle}`,
    textBody: [
      `Hello ${options.recipientName},`,
      "",
      `You have documents ready to review and sign for "${options.signingTitle}".`,
      "",
      "Open your personal signing link:",
      options.inviteUrl,
      "",
      "This link is unique to you. Please do not forward it.",
    ].join("\n"),
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

export type ProcessInvitationResult = {
  workItemId: string;
  deliveryInstructionId: string;
  outcome: "ACCEPTED" | "FAILED";
  failureDetailSafe: string | null;
};

/**
 * Process one invitation work item.
 *
 * The work item stores only the credential id (never the raw bearer). Stage 4
 * recovers the same link for retries via server-only credential unwrap so the
 * participant keeps one credential unless it is revoked/replaced.
 *
 * This never mutates Signing lifecycle state: a delivery failure leaves an
 * activated Signing activated.
 */
export async function processParticipantInvitationWorkItem(options: {
  admin: SupabaseClient;
  workItemId: string;
  rawToken?: string;
}): Promise<ProcessInvitationResult> {
  const { data: workItem, error: workItemError } = await options.admin
    .from("signing_work_items")
    .select("*")
    .eq("id", options.workItemId)
    .maybeSingle();
  if (workItemError) throw new Error(workItemError.message);
  if (!workItem) {
    throw new SigningError("NOT_FOUND", "Delivery work item not found.");
  }
  if (workItem.work_type !== PARTICIPANT_INVITATION_WORK_TYPE) {
    throw new SigningError("INVALID_INPUT", "Unsupported delivery work type.");
  }

  const reference = (workItem.reference_json ?? {}) as Record<string, unknown>;
  const deliveryInstructionId = String(reference.deliveryInstructionId ?? "");
  const credentialId = String(
    reference.signingParticipantCredentialId ??
      reference.credentialId ??
      "",
  );
  if (!deliveryInstructionId) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "Delivery work item is missing its delivery instruction.",
    );
  }

  const { data: instruction, error: instructionError } = await options.admin
    .from("signing_delivery_instructions")
    .select("*")
    .eq("id", deliveryInstructionId)
    .eq("signing_id", workItem.signing_id as string)
    .maybeSingle();
  if (instructionError) throw new Error(instructionError.message);
  if (!instruction) {
    throw new SigningError("NOT_FOUND", "Delivery instruction not found.");
  }

  const { data: signing, error: signingError } = await options.admin
    .from("signings")
    .select("title")
    .eq("id", workItem.signing_id as string)
    .maybeSingle();
  if (signingError) throw new Error(signingError.message);

  await options.admin
    .from("signing_work_items")
    .update({
      processing_state: "PROCESSING",
      attempt_count: ((workItem.attempt_count as number | null) ?? 0) + 1,
    })
    .eq("id", options.workItemId);

  const rawToken =
    options.rawToken ??
    (credentialId
      ? await loadRawParticipantCredentialToken({
          admin: options.admin,
          signingId: workItem.signing_id as string,
          credentialId,
        })
      : null);

  const result: SigningEmailSendResult = rawToken
    ? await sendSigningEmail(
        buildInvitationMessage({
          recipientName: instruction.recipient_name_snapshot as string,
          recipientEmail: instruction.recipient_email_snapshot as string,
          signingTitle: (signing?.title as string | undefined) ?? "your Signing",
          inviteUrl: buildParticipantInviteUrl(rawToken),
        }),
      )
    : {
        ok: false,
        failureDetailSafe:
          "Invitation link could not be recovered for retry; re-issue the participant credential.",
      };

  const attemptNumber = await nextAttemptNumber(
    options.admin,
    deliveryInstructionId,
  );

  const { error: attemptError } = await options.admin
    .from("signing_delivery_attempts")
    .insert({
      signing_id: workItem.signing_id as string,
      delivery_instruction_id: deliveryInstructionId,
      attempt_number: attemptNumber,
      outcome: result.ok ? "ACCEPTED" : "FAILED",
      provider_reference: result.ok ? result.providerReference : null,
      failure_detail_safe: result.ok ? null : result.failureDetailSafe,
    });
  if (attemptError) throw new Error(attemptError.message);

  await options.admin
    .from("signing_delivery_instructions")
    .update({ delivery_state: result.ok ? "ACCEPTED" : "FAILED" })
    .eq("id", deliveryInstructionId)
    .eq("signing_id", workItem.signing_id as string);

  await options.admin
    .from("signing_work_items")
    .update({
      processing_state: result.ok ? "SUCCEEDED" : "FAILED",
      completed_at: result.ok ? new Date().toISOString() : null,
      last_error_safe: result.ok ? null : result.failureDetailSafe,
      next_attempt_at: result.ok ? null : new Date(Date.now() + 900_000).toISOString(),
    })
    .eq("id", options.workItemId);

  return {
    workItemId: options.workItemId,
    deliveryInstructionId,
    outcome: result.ok ? "ACCEPTED" : "FAILED",
    failureDetailSafe: result.ok ? null : result.failureDetailSafe,
  };
}

/**
 * Best-effort immediate send for freshly issued invitations.
 * Delivery outcomes are recorded; activation is never rolled back.
 */
export async function deliverEnqueuedParticipantInvitations(options: {
  admin: SupabaseClient;
  enqueued: EnqueuedParticipantInvitation[];
  rawTokensByParticipantId: Map<string, string>;
}): Promise<ProcessInvitationResult[]> {
  const results: ProcessInvitationResult[] = [];

  for (const item of options.enqueued) {
    try {
      results.push(
        await processParticipantInvitationWorkItem({
          admin: options.admin,
          workItemId: item.workItemId,
          rawToken: options.rawTokensByParticipantId.get(
            item.signingParticipantId,
          ),
        }),
      );
    } catch (error) {
      // Delivery bookkeeping problems must not surface as activation failure.
      console.error(
        "[native-signing-stage4] invitation processing failed:",
        error instanceof Error ? error.message : "unknown error",
      );
      results.push({
        workItemId: item.workItemId,
        deliveryInstructionId: item.deliveryInstructionId,
        outcome: "FAILED",
        failureDetailSafe: "Invitation delivery could not be processed.",
      });
    }
  }

  return results;
}
