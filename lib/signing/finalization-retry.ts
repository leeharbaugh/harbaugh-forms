/**
 * Authorized finalization retry request (Stage 6).
 *
 * Does not mutate artifacts or force Complete. Re-enables FINALIZE_SIGNING work.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { canRequestRetryFinalization } from "./authority";
import { loadSigningAuthorityBundle } from "./authority-context";
import { FINALIZE_SIGNING_WORK_TYPE } from "./ceremony-finish";
import {
  buildResponsibleContextMetadata,
  requireSigningEventActorType,
} from "./event-actor";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import { appendSigningEvent } from "./signing-events";
import type { SigningActor } from "./types";
import { requeueFailedWorkItem } from "./work-items";
import { isUuid } from "./types";

export type RetryFinalizationResult = {
  signingId: string;
  finalizationCondition: string;
  requeued: boolean;
};

export async function requestFinalizationRetryWithActor(
  actor: SigningActor,
  input: { signingId: unknown },
  admin: SupabaseClient,
): Promise<RetryFinalizationResult> {
  assertNativeSigningEnabled();

  if (!isUuid(input.signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }
  const signingId = input.signingId as string;

  const bundle = await loadSigningAuthorityBundle(admin, actor, signingId);
  if (!bundle) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }

  const signing = bundle.signing;
  if (
    !canRequestRetryFinalization(
      bundle.authority,
      signing.lifecycle_state,
    )
  ) {
    throw new SigningError(
      "FORBIDDEN",
      "You are not authorized to retry finalization for this Signing.",
    );
  }

  if (signing.lifecycle_state !== "IN_PROGRESS") {
    throw new SigningError(
      "CONFLICT",
      "Finalization retry is only available while the Signing is in progress.",
    );
  }
  if (signing.finalization_condition !== "FAILED") {
    throw new SigningError(
      "CONFLICT",
      "Finalization retry is only available after a recoverable finalization failure.",
    );
  }

  const frozenRevisionId = signing.frozen_package_revision_id as string | null;
  if (!frozenRevisionId) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "This Signing has no frozen package revision to finalize.",
    );
  }

  const actorType = requireSigningEventActorType(bundle.authority);
  const responsibleMeta =
    actorType === "TRANSACTION_COORDINATOR"
      ? buildResponsibleContextMetadata({
          responsibleUserId: signing.original_sender_user_id ?? null,
          responsibleDisplayName: signing.original_sender_display_name ?? null,
        })
      : undefined;

  await appendSigningEvent(admin, {
    signingId,
    eventType: "FINALIZATION_RETRY_REQUESTED",
    actorType,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    packageRevisionId: frozenRevisionId,
    summary: "Finalization retry requested",
    detailsJson: {
      ...(responsibleMeta ?? {}),
    },
    idempotencyKey: `FINALIZATION_RETRY_REQUESTED:${frozenRevisionId}:${randomUUID()}`,
  });

  // Prefer a stable idempotency key matching Finish enqueue.
  await requeueFailedWorkItem({
    admin,
    signingId,
    workType: FINALIZE_SIGNING_WORK_TYPE,
    idempotencyKey: `${FINALIZE_SIGNING_WORK_TYPE}:${frozenRevisionId}`,
  });

  // Ensure a work item exists if the original was lost.
  const { error: upsertError } = await admin.from("signing_work_items").upsert(
    {
      signing_id: signingId,
      work_type: FINALIZE_SIGNING_WORK_TYPE,
      idempotency_key: `${FINALIZE_SIGNING_WORK_TYPE}:${frozenRevisionId}`,
      reference_json: {
        signingId,
        packageRevisionId: frozenRevisionId,
      },
      processing_state: "PENDING",
      next_attempt_at: new Date().toISOString(),
      claimed_by: null,
      claimed_until: null,
      completed_at: null,
      last_error_safe: null,
    },
    { onConflict: "signing_id,work_type,idempotency_key" },
  );
  if (upsertError) throw new Error(upsertError.message);

  const { error: conditionError } = await admin
    .from("signings")
    .update({
      finalization_condition: "READY",
      finalization_last_error_safe: null,
    })
    .eq("id", signingId)
    .eq("lifecycle_state", "IN_PROGRESS")
    .eq("finalization_condition", "FAILED");
  if (conditionError) throw new Error(conditionError.message);

  const { kickSigningWorkProcessing } = await import("./signing-worker-kick");
  kickSigningWorkProcessing({ admin, signingId });

  return {
    signingId,
    finalizationCondition: "READY",
    requeued: true,
  };
}
