/**
 * Native Signing completed-package delivery.
 *
 * Delivery is independent of Complete: fan-out after finalization must never
 * fail or roll back lifecycle. Work suspension blocks processing/send.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import { canManageCompletedSigningOperations } from "./completed-package-authority";
import {
  ensureCompletedPackageCredential,
  loadRawCompletedPackageToken,
  replaceCompletedPackageCredential,
  revokeCompletedPackageCredential,
  type IssuedCompletedPackageCredential,
} from "./completed-package-credentials";
import { revokeCompletedPackageSessionsForCredential } from "./completed-package-sessions";
import {
  buildCompletedPackageMessage,
  buildCompletedPackageUrl,
  sendSigningEmail,
  type SigningEmailSendResult,
} from "./delivery";
import { requireSigningEventActorType } from "./event-actor";
import { SigningError } from "./errors";
import { appendSigningEvent } from "./signing-events";
import type { SigningActor } from "./types";
import { isUuid } from "./types";
import {
  claimSigningWorkItem,
  completeWorkItem,
  failWorkItem,
  newWorkerId,
  workerHoldsLease,
} from "./work-items";
import { getSigningExternalAccessState } from "./external-access";
import { isSigningWorkSuspended } from "./work-suspension";

export const DELIVER_COMPLETED_PACKAGE_WORK_TYPE =
  "DELIVER_COMPLETED_PACKAGE" as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EnqueuedCompletedPackageDelivery = {
  deliveryInstructionId: string;
  workItemId: string;
  credentialId: string;
};

function isValidDeliveryEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && EMAIL_RE.test(trimmed);
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

async function requireCompletedManageableSigning(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
) {
  if (!isUuid(signingIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }
  const bundle = await loadSigningAuthorityBundle(admin, actor, signingIdRaw);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (
    !canManageCompletedSigningOperations(
      bundle.authority,
      bundle.signing.lifecycle_state,
    )
  ) {
    throw new SigningError(
      "FORBIDDEN",
      "You cannot manage completed-package operations for this Signing.",
    );
  }
  return bundle;
}

/**
 * Enqueue one COMPLETED_PACKAGE delivery for an existing credential.
 */
export async function enqueueCompletedPackageDelivery(options: {
  admin: SupabaseClient;
  signingId: string;
  credentialId: string;
  signingParticipantId?: string | null;
  signingCopyRecipientId?: string | null;
  recipientEmail: string;
  recipientName: string;
  packageRevisionId?: string | null;
  initiatedByUserId?: string | null;
  deliveryChannel?: "LINK" | "ATTACHMENT" | "LINK_AND_ATTACHMENT";
  idempotencySuffix?: string;
}): Promise<EnqueuedCompletedPackageDelivery> {
  const participantId = options.signingParticipantId ?? null;
  const copyRecipientId = options.signingCopyRecipientId ?? null;
  if ((participantId == null) === (copyRecipientId == null)) {
    throw new SigningError(
      "INVALID_INPUT",
      "Completed-package delivery requires exactly one recipient.",
    );
  }

  const { data: instruction, error: instructionError } = await options.admin
    .from("signing_delivery_instructions")
    .insert({
      signing_id: options.signingId,
      signing_participant_id: participantId,
      signing_copy_recipient_id: copyRecipientId,
      purpose: "COMPLETED_PACKAGE",
      recipient_email_snapshot: options.recipientEmail,
      recipient_name_snapshot: options.recipientName,
      completed_package_credential_id: options.credentialId,
      package_revision_id: options.packageRevisionId ?? null,
      delivery_channel: options.deliveryChannel ?? "LINK",
      delivery_state: "QUEUED",
      initiated_by_user_id: options.initiatedByUserId ?? null,
    })
    .select("id")
    .single();
  if (instructionError || !instruction) {
    throw new Error(
      instructionError?.message ?? "Failed to record delivery instruction.",
    );
  }

  const suffix = options.idempotencySuffix ?? instruction.id;
  const { data: workItem, error: workItemError } = await options.admin
    .from("signing_work_items")
    .insert({
      signing_id: options.signingId,
      work_type: DELIVER_COMPLETED_PACKAGE_WORK_TYPE,
      idempotency_key: `completed-package:${options.credentialId}:${suffix}`,
      reference_json: {
        deliveryInstructionId: instruction.id as string,
        completedPackageCredentialId: options.credentialId,
        signingParticipantId: participantId,
        signingCopyRecipientId: copyRecipientId,
      },
      processing_state: "PENDING",
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (workItemError || !workItem) {
    throw new Error(
      workItemError?.message ?? "Failed to enqueue completed-package work item.",
    );
  }

  return {
    deliveryInstructionId: instruction.id as string,
    workItemId: workItem.id as string,
    credentialId: options.credentialId,
  };
}

/**
 * After Complete: issue credentials and enqueue delivery for each finished
 * participant using frozen revision email snapshots. Never throws for blank
 * emails — records FAILED instruction/attempt instead when possible.
 */
export async function enqueueInitialCompletedPackageFanOut(
  admin: SupabaseClient,
  signingId: string,
): Promise<{ enqueued: number; failed: number }> {
  const { data: signing, error: signingError } = await admin
    .from("signings")
    .select("id, lifecycle_state, frozen_package_revision_id, title")
    .eq("id", signingId)
    .maybeSingle();
  if (signingError) throw new Error(signingError.message);
  if (!signing || signing.lifecycle_state !== "COMPLETE") {
    return { enqueued: 0, failed: 0 };
  }

  const frozenRevisionId = signing.frozen_package_revision_id as string | null;
  if (!frozenRevisionId) {
    return { enqueued: 0, failed: 0 };
  }

  const { data: participants, error: participantsError } = await admin
    .from("signing_participants")
    .select("id, full_name, email, participant_status")
    .eq("signing_id", signingId)
    .eq("participant_status", "FINISHED");
  if (participantsError) throw new Error(participantsError.message);

  const { data: frozenRows, error: frozenError } = await admin
    .from("signing_package_revision_participants")
    .select("signing_participant_id, frozen_email, frozen_full_name")
    .eq("signing_id", signingId)
    .eq("package_revision_id", frozenRevisionId);
  if (frozenError) throw new Error(frozenError.message);

  const frozenByParticipant = new Map(
    (frozenRows ?? []).map((row) => [
      row.signing_participant_id as string,
      {
        email: (row.frozen_email as string | null) ?? "",
        name: (row.frozen_full_name as string | null) ?? "",
      },
    ]),
  );

  let enqueued = 0;
  let failed = 0;

  for (const participant of participants ?? []) {
    const participantId = participant.id as string;
    const frozen = frozenByParticipant.get(participantId);
    const email = (frozen?.email ?? (participant.email as string) ?? "").trim();
    const name =
      (frozen?.name ?? (participant.full_name as string) ?? "Participant").trim() ||
      "Participant";

    try {
      const ensured = await ensureCompletedPackageCredential({
        admin,
        signingId,
        target: { signingParticipantId: participantId },
      });

      if (!isValidDeliveryEmail(email)) {
        const { data: instruction } = await admin
          .from("signing_delivery_instructions")
          .insert({
            signing_id: signingId,
            signing_participant_id: participantId,
            purpose: "COMPLETED_PACKAGE",
            recipient_email_snapshot: email || "(missing)",
            recipient_name_snapshot: name,
            completed_package_credential_id: ensured.credentialId,
            package_revision_id: frozenRevisionId,
            delivery_channel: "LINK",
            delivery_state: "FAILED",
          })
          .select("id")
          .single();
        if (instruction) {
          await admin.from("signing_delivery_attempts").insert({
            signing_id: signingId,
            delivery_instruction_id: instruction.id as string,
            attempt_number: 1,
            outcome: "FAILED",
            failure_detail_safe:
              "Frozen participant email is missing or invalid; completed package was not sent.",
          });
        }
        failed += 1;
        continue;
      }

      await enqueueCompletedPackageDelivery({
        admin,
        signingId,
        credentialId: ensured.credentialId,
        signingParticipantId: participantId,
        recipientEmail: email.toLowerCase(),
        recipientName: name,
        packageRevisionId: frozenRevisionId,
        idempotencySuffix: `initial:${ensured.credentialId}`,
      });
      enqueued += 1;
    } catch (error) {
      console.error(
        "[native-signing-completion-delivery] fan-out participant failed:",
        error instanceof Error ? error.message : "unknown error",
      );
      failed += 1;
    }
  }

  return { enqueued, failed };
}

export type ProcessCompletedPackageDeliveryResult = {
  workItemId: string;
  deliveryInstructionId: string;
  outcome: "ACCEPTED" | "FAILED" | "SUSPENDED" | "SKIPPED";
  failureDetailSafe: string | null;
};

/**
 * Claim-aware handler for one DELIVER_COMPLETED_PACKAGE work item.
 */
export async function processCompletedPackageDeliveryWorkItem(options: {
  admin: SupabaseClient;
  workItemId: string;
  workerId: string;
  rawToken?: string;
}): Promise<ProcessCompletedPackageDeliveryResult> {
  if (await isSigningWorkSuspended(options.admin)) {
    await failWorkItem({
      admin: options.admin,
      workItemId: options.workItemId,
      workerId: options.workerId,
      errorSafe: "Signing work is suspended.",
      retryDelaySeconds: 300,
    });
    return {
      workItemId: options.workItemId,
      deliveryInstructionId: "",
      outcome: "SUSPENDED",
      failureDetailSafe: "Signing work is suspended.",
    };
  }
  // Access suspension parks completed-package email (not finalization).
  const accessState = await getSigningExternalAccessState(options.admin);
  if (accessState.suspended) {
    await failWorkItem({
      admin: options.admin,
      workItemId: options.workItemId,
      workerId: options.workerId,
      errorSafe: "Signing external access is suspended.",
      retryDelaySeconds: 300,
    });
    return {
      workItemId: options.workItemId,
      deliveryInstructionId: "",
      outcome: "SUSPENDED",
      failureDetailSafe: "Signing external access is suspended.",
    };
  }

  const { data: workItem, error: workItemError } = await options.admin
    .from("signing_work_items")
    .select("*")
    .eq("id", options.workItemId)
    .maybeSingle();
  if (workItemError) throw new Error(workItemError.message);
  if (!workItem) {
    throw new SigningError("NOT_FOUND", "Delivery work item not found.");
  }
  if (workItem.work_type !== DELIVER_COMPLETED_PACKAGE_WORK_TYPE) {
    throw new SigningError("INVALID_INPUT", "Unsupported delivery work type.");
  }

  const reference = (workItem.reference_json ?? {}) as Record<string, unknown>;
  const deliveryInstructionId = String(reference.deliveryInstructionId ?? "");
  const credentialId = String(
    reference.completedPackageCredentialId ?? reference.credentialId ?? "",
  );
  if (!deliveryInstructionId || !credentialId) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "Completed-package work item is missing instruction or credential.",
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
    .select(
      "id, title, lifecycle_state, original_sender_display_name, originating_organization_id",
    )
    .eq("id", workItem.signing_id as string)
    .maybeSingle();
  if (signingError) throw new Error(signingError.message);

  if (!signing || signing.lifecycle_state !== "COMPLETE") {
    await failWorkItem({
      admin: options.admin,
      workItemId: options.workItemId,
      workerId: options.workerId,
      errorSafe: "Signing is not Complete; completed package not sent.",
      retryDelaySeconds: 3600,
    });
    return {
      workItemId: options.workItemId,
      deliveryInstructionId,
      outcome: "SKIPPED",
      failureDetailSafe: "Signing is not Complete.",
    };
  }

  let brokerageName: string | null = null;
  const orgId = signing.originating_organization_id as string | null;
  if (orgId) {
    const { data: org } = await options.admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    brokerageName = (org?.name as string | null) ?? null;
  }

  if (
    !workerHoldsLease(
      {
        id: workItem.id as string,
        signing_id: workItem.signing_id as string,
        work_type: workItem.work_type as string,
        idempotency_key: workItem.idempotency_key as string,
        reference_json:
          (workItem.reference_json as Record<string, unknown>) ?? {},
        processing_state: workItem.processing_state as
          | "PENDING"
          | "PROCESSING"
          | "SUCCEEDED"
          | "FAILED",
        attempt_count: Number(workItem.attempt_count ?? 0),
        next_attempt_at: (workItem.next_attempt_at as string | null) ?? null,
        last_error_safe: (workItem.last_error_safe as string | null) ?? null,
        completed_at: (workItem.completed_at as string | null) ?? null,
        claimed_by: (workItem.claimed_by as string | null) ?? null,
        claimed_until: (workItem.claimed_until as string | null) ?? null,
        processing_started_at:
          (workItem.processing_started_at as string | null) ?? null,
      },
      options.workerId,
    )
  ) {
    throw new SigningError(
      "CONFLICT",
      "Completed-package work item lease was lost.",
    );
  }

  // Block delivery to soft-removed copy recipients even if credential row lags.
  const copyRecipientId = instruction.signing_copy_recipient_id as
    | string
    | null;
  if (copyRecipientId) {
    const { data: copyRecipient, error: copyError } = await options.admin
      .from("signing_copy_recipients")
      .select("id, status")
      .eq("id", copyRecipientId)
      .eq("signing_id", workItem.signing_id as string)
      .maybeSingle();
    if (copyError) throw new Error(copyError.message);
    if (!copyRecipient || copyRecipient.status !== "ACTIVE") {
      await failWorkItem({
        admin: options.admin,
        workItemId: options.workItemId,
        workerId: options.workerId,
        errorSafe: "Copy recipient is no longer active; delivery cancelled.",
        retryDelaySeconds: 86_400 * 365,
      });
      return {
        workItemId: options.workItemId,
        deliveryInstructionId,
        outcome: "SKIPPED",
        failureDetailSafe: "Copy recipient is no longer active.",
      };
    }
  }

  const recipientEmail = String(
    instruction.recipient_email_snapshot ?? "",
  ).trim();
  let result: SigningEmailSendResult;

  if (!isValidDeliveryEmail(recipientEmail)) {
    result = {
      ok: false,
      failureDetailSafe:
        "Recipient email is missing or invalid; completed package was not sent.",
    };
  } else {
    // Recheck suspension immediately before external email side effect.
    if (await isSigningWorkSuspended(options.admin)) {
      await failWorkItem({
        admin: options.admin,
        workItemId: options.workItemId,
        workerId: options.workerId,
        errorSafe: "Signing work is suspended.",
        retryDelaySeconds: 300,
      });
      return {
        workItemId: options.workItemId,
        deliveryInstructionId,
        outcome: "SUSPENDED",
        failureDetailSafe: "Signing work is suspended.",
      };
    }
    const accessBeforeSend = await getSigningExternalAccessState(options.admin);
    if (accessBeforeSend.suspended) {
      await failWorkItem({
        admin: options.admin,
        workItemId: options.workItemId,
        workerId: options.workerId,
        errorSafe: "Signing external access is suspended.",
        retryDelaySeconds: 300,
      });
      return {
        workItemId: options.workItemId,
        deliveryInstructionId,
        outcome: "SUSPENDED",
        failureDetailSafe: "Signing external access is suspended.",
      };
    }

    const rawToken =
      options.rawToken ??
      (await loadRawCompletedPackageToken({
        admin: options.admin,
        signingId: workItem.signing_id as string,
        credentialId,
      }));

    result = rawToken
      ? await sendSigningEmail(
          buildCompletedPackageMessage({
            recipientName: String(
              instruction.recipient_name_snapshot ?? "Recipient",
            ),
            recipientEmail,
            signingTitle:
              (signing.title as string | undefined) ?? "your Signing",
            packageUrl: buildCompletedPackageUrl(rawToken),
            senderDisplayName:
              (signing.original_sender_display_name as string | null) ?? null,
            brokerageName,
          }),
        )
      : {
          ok: false,
          failureDetailSafe:
            "Completed-package link could not be recovered; use Replace Link.",
        };
  }

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

  if (result.ok) {
    await appendSigningEvent(options.admin, {
      signingId: workItem.signing_id as string,
      eventType: "COMPLETED_PACKAGE_SENT",
      actorType: "SYSTEM",
      actorDisplayName: "Native Signing Delivery",
      summary: "Completed package delivered",
      detailsJson: {
        deliveryInstructionId,
        completedPackageCredentialId: credentialId,
        signingParticipantId: instruction.signing_participant_id ?? null,
        signingCopyRecipientId: instruction.signing_copy_recipient_id ?? null,
      },
      idempotencyKey: `COMPLETED_PACKAGE_SENT:${deliveryInstructionId}:${attemptNumber}`,
    });
    await completeWorkItem({
      admin: options.admin,
      workItemId: options.workItemId,
      workerId: options.workerId,
    });
  } else {
    await failWorkItem({
      admin: options.admin,
      workItemId: options.workItemId,
      workerId: options.workerId,
      errorSafe: result.failureDetailSafe.slice(0, 500),
      retryDelaySeconds: 900,
    });
  }

  return {
    workItemId: options.workItemId,
    deliveryInstructionId,
    outcome: result.ok ? "ACCEPTED" : "FAILED",
    failureDetailSafe: result.ok ? null : result.failureDetailSafe,
  };
}

export async function processNextCompletedPackageDeliveryWorkItem(options: {
  admin: SupabaseClient;
  workerId?: string;
  signingId?: string;
}): Promise<ProcessCompletedPackageDeliveryResult | { outcome: "NO_WORK" }> {
  if (await isSigningWorkSuspended(options.admin)) {
    return {
      workItemId: "",
      deliveryInstructionId: "",
      outcome: "SUSPENDED",
      failureDetailSafe: "Signing work is suspended.",
    };
  }
  const accessState = await getSigningExternalAccessState(options.admin);
  if (accessState.suspended) {
    return {
      workItemId: "",
      deliveryInstructionId: "",
      outcome: "SUSPENDED",
      failureDetailSafe: "Signing external access is suspended.",
    };
  }

  const workerId = options.workerId ?? newWorkerId("completed-package");
  const claimed = await claimSigningWorkItem({
    admin: options.admin,
    workType: DELIVER_COMPLETED_PACKAGE_WORK_TYPE,
    workerId,
    signingId: options.signingId,
  });
  if (!claimed) return { outcome: "NO_WORK" };

  return processCompletedPackageDeliveryWorkItem({
    admin: options.admin,
    workItemId: claimed.id,
    workerId,
  });
}

export async function resendCompletedPackageWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    credentialId: unknown;
  },
  admin: SupabaseClient,
): Promise<EnqueuedCompletedPackageDelivery> {
  const bundle = await requireCompletedManageableSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.credentialId)) {
    throw new SigningError("INVALID_INPUT", "Invalid credential id.");
  }

  const { data: credential, error } = await admin
    .from("signing_completed_package_credentials")
    .select(
      "id, signing_participant_id, signing_copy_recipient_id, is_current, revoked_at",
    )
    .eq("id", input.credentialId)
    .eq("signing_id", bundle.signing.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!credential || credential.revoked_at || credential.is_current !== true) {
    throw new SigningError("NOT_FOUND", "Completed-package credential not found.");
  }

  let recipientEmail = "";
  let recipientName = "Recipient";

  if (credential.signing_participant_id) {
    const frozenRevisionId = bundle.signing.frozen_package_revision_id;
    if (frozenRevisionId) {
      const { data: frozen } = await admin
        .from("signing_package_revision_participants")
        .select("frozen_email, frozen_full_name")
        .eq("signing_id", bundle.signing.id)
        .eq("package_revision_id", frozenRevisionId)
        .eq("signing_participant_id", credential.signing_participant_id)
        .maybeSingle();
      if (frozen) {
        recipientEmail = String(frozen.frozen_email ?? "").trim();
        recipientName = String(frozen.frozen_full_name ?? "Participant");
      }
    }
    if (!recipientEmail) {
      const { data: participant } = await admin
        .from("signing_participants")
        .select("email, full_name")
        .eq("id", credential.signing_participant_id as string)
        .eq("signing_id", bundle.signing.id)
        .maybeSingle();
      recipientEmail = String(participant?.email ?? "").trim();
      recipientName = String(participant?.full_name ?? "Participant");
    }
  } else if (credential.signing_copy_recipient_id) {
    const { data: copy } = await admin
      .from("signing_copy_recipients")
      .select("email, display_name, status")
      .eq("id", credential.signing_copy_recipient_id as string)
      .eq("signing_id", bundle.signing.id)
      .maybeSingle();
    if (!copy || copy.status !== "ACTIVE") {
      throw new SigningError(
        "VALIDATION_FAILED",
        "Copy recipient is no longer active.",
      );
    }
    recipientEmail = String(copy.email ?? "").trim();
    recipientName = String(copy.display_name ?? "Recipient");
  }

  if (!isValidDeliveryEmail(recipientEmail)) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "Recipient email is missing or invalid.",
    );
  }

  // Same-link resend requires a recoverable wrapped bearer. Do not invent a
  // new credential here — managers must use Replace Link explicitly.
  const recoverable = await loadRawCompletedPackageToken({
    admin,
    signingId: bundle.signing.id,
    credentialId: credential.id as string,
  });
  if (!recoverable) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "The current completed-package link cannot be recovered for resend. Use Replace Link to issue a new credential.",
    );
  }

  const enqueued = await enqueueCompletedPackageDelivery({
    admin,
    signingId: bundle.signing.id,
    credentialId: credential.id as string,
    signingParticipantId:
      (credential.signing_participant_id as string | null) ?? null,
    signingCopyRecipientId:
      (credential.signing_copy_recipient_id as string | null) ?? null,
    recipientEmail: recipientEmail.toLowerCase(),
    recipientName,
    packageRevisionId: bundle.signing.frozen_package_revision_id,
    initiatedByUserId: actor.userId,
  });

  await appendSigningEvent(admin, {
    signingId: bundle.signing.id,
    eventType: "COMPLETED_PACKAGE_RESEND_REQUESTED",
    actorType: requireSigningEventActorType(bundle.authority),
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    summary: "Completed-package resend requested",
    detailsJson: {
      deliveryInstructionId: enqueued.deliveryInstructionId,
      completedPackageCredentialId: credential.id,
      signingParticipantId: credential.signing_participant_id ?? null,
      signingCopyRecipientId: credential.signing_copy_recipient_id ?? null,
    },
  });

  return enqueued;
}

export async function replaceCompletedPackageCredentialWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    credentialId: unknown;
    resend?: boolean;
  },
  admin: SupabaseClient,
): Promise<{
  issued: IssuedCompletedPackageCredential;
  delivery?: EnqueuedCompletedPackageDelivery;
}> {
  const bundle = await requireCompletedManageableSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.credentialId)) {
    throw new SigningError("INVALID_INPUT", "Invalid credential id.");
  }

  await revokeCompletedPackageSessionsForCredential({
    admin,
    signingId: bundle.signing.id,
    credentialId: input.credentialId,
  });

  const issued = await replaceCompletedPackageCredential({
    admin,
    signingId: bundle.signing.id,
    credentialId: input.credentialId,
    replacedByUserId: actor.userId,
    reason: "REPLACED_BY_MANAGER",
  });

  await appendSigningEvent(admin, {
    signingId: bundle.signing.id,
    eventType: "COMPLETED_PACKAGE_CREDENTIAL_REPLACED",
    actorType: requireSigningEventActorType(bundle.authority),
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    summary: "Completed-package credential replaced",
    detailsJson: {
      priorCredentialId: input.credentialId,
      newCredentialId: issued.credentialId,
    },
  });

  let delivery: EnqueuedCompletedPackageDelivery | undefined;
  if (input.resend !== false) {
    delivery = await resendCompletedPackageWithActor(
      actor,
      { signingId: bundle.signing.id, credentialId: issued.credentialId },
      admin,
    );
  }

  return { issued, delivery };
}

export async function revokeCompletedPackageCredentialWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    credentialId: unknown;
    reason?: unknown;
  },
  admin: SupabaseClient,
): Promise<void> {
  const bundle = await requireCompletedManageableSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.credentialId)) {
    throw new SigningError("INVALID_INPUT", "Invalid credential id.");
  }

  const reason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim().slice(0, 200)
      : "REVOKED_BY_MANAGER";

  await revokeCompletedPackageSessionsForCredential({
    admin,
    signingId: bundle.signing.id,
    credentialId: input.credentialId,
  });

  await revokeCompletedPackageCredential({
    admin,
    signingId: bundle.signing.id,
    credentialId: input.credentialId,
    revokedByUserId: actor.userId,
    reason,
  });

  await appendSigningEvent(admin, {
    signingId: bundle.signing.id,
    eventType: "COMPLETED_PACKAGE_CREDENTIAL_REVOKED",
    actorType: requireSigningEventActorType(bundle.authority),
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    summary: "Completed-package credential revoked",
    detailsJson: { credentialId: input.credentialId, reason },
  });
}
