/**
 * Native Signing Stage 4 activation.
 *
 * Common activation for both modes: promote Package Revision 1 from the
 * selected Draft source snapshots, issue one participant credential each, and
 * move Draft -> In Progress. Only afterwards does the mode diverge:
 * REMOTE_SEND enqueues invitation delivery; IN_PERSON skips invitation email
 * entirely.
 *
 * Guarantees:
 * - Rendering comes from Draft source snapshots, never live Packet Form content.
 * - Readiness (including source drift) is re-checked inside the operation and
 *   fails closed.
 * - The lifecycle flip is guarded on lifecycle_state = 'DRAFT'.
 * - If promotion succeeds but a later step fails before In Progress, the
 *   revision is abandoned and the Signing remains Draft.
 * - Email failure never undoes activation.
 * - Raw credential tokens never reach events, work items, or idempotency results.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  issueParticipantCredentialsForActivation,
  type IssuedParticipantCredential,
} from "./credentials";
import {
  deliverEnqueuedParticipantInvitations,
  enqueueParticipantInvitations,
  type ParticipantInvitationTarget,
} from "./delivery";
import { loadSigningAuthorityBundle } from "./authority-context";
import {
  buildResponsibleContextMetadata,
  requireSigningEventActorType,
} from "./event-actor";
import { SigningError } from "./errors";
import { appendSigningEvent } from "./signing-events";
import { requireManageableDraftSigning } from "./manage";
import { getSigningForActor } from "./operations";
import {
  abandonPromotedRevisionAfterFailedActivation,
  promotePackageRevisionFromDraftWithActor,
} from "./package-promotion";
import { evaluateSigningReadiness } from "./readiness";
import type { SigningActor } from "./types";

export type SigningActivationMode = "REMOTE_SEND" | "IN_PERSON";

export const ACTIVATION_OPERATION_TYPES: Record<
  SigningActivationMode,
  string
> = {
  REMOTE_SEND: "ACTIVATE_REMOTE_SEND",
  IN_PERSON: "ACTIVATE_IN_PERSON",
};

export type ActivateSigningResult = {
  signingId: string;
  mode: SigningActivationMode;
  packageRevisionId: string;
  revisionNumber: number;
  lifecycleState: "IN_PROGRESS";
  activatedAt: string;
  credentialCount: number;
  invitationsEnqueued: number;
  invitationsAccepted: number;
  invitationsFailed: number;
  /** True when a prior identical request already completed this activation. */
  replayed: boolean;
};

function parseActivationMode(value: unknown): SigningActivationMode {
  if (value === "REMOTE_SEND" || value === "IN_PERSON") {
    return value;
  }
  throw new SigningError("INVALID_INPUT", "Invalid activation mode.");
}

function parseClientRequestId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SigningError("INVALID_INPUT", "A client request id is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length > 200) {
    throw new SigningError("INVALID_INPUT", "Client request id is too long.");
  }
  return trimmed;
}

function activationRequestFingerprint(
  signingId: string,
  mode: SigningActivationMode,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ signingId, mode }), "utf8")
    .digest("hex");
}

type IdempotencyClaim =
  | { kind: "CLAIMED"; recordId: string }
  | { kind: "REPLAY"; result: ActivateSigningResult };

/**
 * Claim the operation, or return a previously succeeded result.
 * A conflicting in-flight or differently-shaped request fails closed.
 */
async function claimActivationIdempotency(options: {
  admin: SupabaseClient;
  signingId: string;
  operationType: string;
  actorUserId: string;
  clientRequestId: string;
  requestFingerprint: string;
}): Promise<IdempotencyClaim> {
  const { data: inserted, error: insertError } = await options.admin
    .from("signing_operation_idempotency")
    .insert({
      signing_id: options.signingId,
      operation_type: options.operationType,
      actor_user_id: options.actorUserId,
      client_request_id: options.clientRequestId,
      request_fingerprint: options.requestFingerprint,
      processing_state: "IN_PROGRESS",
    })
    .select("id")
    .maybeSingle();

  if (!insertError && inserted) {
    return { kind: "CLAIMED", recordId: inserted.id as string };
  }

  const { data: existing, error: existingError } = await options.admin
    .from("signing_operation_idempotency")
    .select("*")
    .eq("signing_id", options.signingId)
    .eq("operation_type", options.operationType)
    .eq("client_request_id", options.clientRequestId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) {
    throw new Error(
      insertError?.message ?? "Failed to claim activation operation.",
    );
  }

  if (existing.request_fingerprint !== options.requestFingerprint) {
    throw new SigningError(
      "IDEMPOTENCY_CONFLICT",
      "This request id was already used for a different activation request.",
    );
  }

  if (existing.processing_state === "SUCCEEDED") {
    return {
      kind: "REPLAY",
      result: {
        ...(existing.result_json as ActivateSigningResult),
        replayed: true,
      },
    };
  }

  if (existing.processing_state === "IN_PROGRESS") {
    // Recover from a crash after Draft→In Progress but before SUCCEEDED:
    // if the Signing is already activated for this mode, treat as replay.
    const { data: signingRow, error: signingLookupError } = await options.admin
      .from("signings")
      .select(
        "lifecycle_state, activation_mode, activated_at, current_package_revision_id",
      )
      .eq("id", options.signingId)
      .maybeSingle();
    if (signingLookupError) throw new Error(signingLookupError.message);
    const expectedMode =
      options.operationType === "ACTIVATE_REMOTE_SEND"
        ? "REMOTE_SEND"
        : "IN_PERSON";
    if (
      signingRow?.lifecycle_state === "IN_PROGRESS" &&
      signingRow.activation_mode === expectedMode &&
      signingRow.current_package_revision_id
    ) {
      const { count } = await options.admin
        .from("signing_participant_credentials")
        .select("id", { count: "exact", head: true })
        .eq("signing_id", options.signingId)
        .eq("is_current", true)
        .is("revoked_at", null);

      const recovered: ActivateSigningResult = {
        signingId: options.signingId,
        mode: expectedMode,
        packageRevisionId: signingRow.current_package_revision_id as string,
        revisionNumber: 1,
        lifecycleState: "IN_PROGRESS",
        activatedAt:
          (signingRow.activated_at as string | null) ??
          new Date().toISOString(),
        credentialCount: count ?? 0,
        invitationsEnqueued: 0,
        invitationsAccepted: 0,
        invitationsFailed: 0,
        replayed: true,
      };

      await options.admin
        .from("signing_operation_idempotency")
        .update({
          processing_state: "SUCCEEDED",
          result_json: recovered,
          error_code: null,
          error_message: null,
        })
        .eq("id", existing.id as string);
      return { kind: "REPLAY", result: recovered };
    }
    throw new SigningError(
      "IDEMPOTENCY_CONFLICT",
      "This activation is already being processed.",
    );
  }

  // FAILED: allow a retry to re-claim the same request id.
  const { data: reclaimed, error: reclaimError } = await options.admin
    .from("signing_operation_idempotency")
    .update({
      processing_state: "IN_PROGRESS",
      error_code: null,
      error_message: null,
    })
    .eq("id", existing.id as string)
    .eq("processing_state", "FAILED")
    .select("id")
    .maybeSingle();
  if (reclaimError) throw new Error(reclaimError.message);
  if (!reclaimed) {
    throw new SigningError(
      "IDEMPOTENCY_CONFLICT",
      "This activation is already being processed.",
    );
  }
  return { kind: "CLAIMED", recordId: reclaimed.id as string };
}

async function markIdempotencyFailed(
  admin: SupabaseClient,
  recordId: string,
  error: unknown,
): Promise<void> {
  const code = error instanceof SigningError ? error.code : "ACTIVATION_FAILED";
  const message =
    error instanceof SigningError
      ? error.message
      : "Activation failed. No changes were kept.";
  await admin
    .from("signing_operation_idempotency")
    .update({
      processing_state: "FAILED",
      error_code: code,
      error_message: message,
    })
    .eq("id", recordId);
}

async function revokeIssuedCredentials(
  admin: SupabaseClient,
  signingId: string,
  issued: Map<string, IssuedParticipantCredential>,
): Promise<void> {
  for (const credential of issued.values()) {
    await admin
      .from("signing_participant_credentials")
      .update({
        is_current: false,
        revoked_at: new Date().toISOString(),
        revoked_reason: "ACTIVATION_FAILED",
      })
      .eq("id", credential.credentialId)
      .eq("signing_id", signingId);
  }
}

/**
 * Activate a Draft Signing. This is the only browser-reachable path that may
 * promote a package revision.
 */
export async function activateSigningWithActor(
  actor: SigningActor,
  input: { signingId: unknown; mode: unknown; clientRequestId: unknown },
  admin: SupabaseClient,
): Promise<ActivateSigningResult> {
  const mode = parseActivationMode(input.mode);
  const clientRequestId = parseClientRequestId(input.clientRequestId);
  const operationType = ACTIVATION_OPERATION_TYPES[mode];

  // Authorize before any privileged activation bookkeeping. The Draft check is
  // deliberately deferred until after the idempotency lookup so that replaying
  // a completed request still returns its recorded result.
  const summary = await getSigningForActor(actor, input.signingId, admin);
  if (!summary.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }

  const claim = await claimActivationIdempotency({
    admin,
    signingId: summary.id,
    operationType,
    actorUserId: actor.userId,
    clientRequestId,
    requestFingerprint: activationRequestFingerprint(summary.id, mode),
  });
  if (claim.kind === "REPLAY") {
    return claim.result;
  }

  let previousPointer: string | null = null;
  let packageRevisionId: string | null = null;
  let issued = new Map<string, IssuedParticipantCredential>();
  let lifecycleAdvanced = false;

  try {
    const { signing } = await requireManageableDraftSigning(
      actor,
      summary.id,
      admin,
    );
    previousPointer = signing.current_package_revision_id;

    // Re-run readiness inside the operation: source drift fails closed here.
    const readiness = await evaluateSigningReadiness(admin, signing.id, actor);
    if (!readiness.ready) {
      // Source drift is reported specifically, whatever else is unfinished, so
      // the agent is told to resolve preparation state rather than retry.
      const drift = readiness.blockers.find(
        (blocker) => blocker.code === "DOCUMENT_SOURCE_CHANGED",
      );
      if (drift) {
        throw new SigningError("SOURCE_CHANGED", drift.message);
      }
      const [first] = readiness.blockers;
      throw new SigningError(
        "NOT_READY",
        first?.message ?? "This Signing is not ready to activate.",
      );
    }

    if (mode === "REMOTE_SEND") {
      const { data: emailRows, error: emailError } = await admin
        .from("signing_participants")
        .select("id, email")
        .eq("signing_id", signing.id)
        .neq("participant_status", "REMOVED");
      if (emailError) throw new Error(emailError.message);
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const row of emailRows ?? []) {
        const email = String(row.email ?? "").trim();
        if (!emailRe.test(email)) {
          throw new SigningError(
            "NOT_READY",
            "Every participant needs a valid email address before Send.",
          );
        }
      }
    }

    const promoted = await promotePackageRevisionFromDraftWithActor(
      actor,
      { signingId: signing.id, promotionReason: "INITIAL" },
      admin,
    );
    packageRevisionId = promoted.packageRevisionId;

    const { data: participants, error: participantError } = await admin
      .from("signing_participants")
      .select("id, full_name, email, display_order")
      .eq("signing_id", signing.id)
      .neq("participant_status", "REMOVED")
      .order("display_order", { ascending: true });
    if (participantError) throw new Error(participantError.message);
    if (!participants || participants.length === 0) {
      throw new SigningError(
        "NOT_READY",
        "At least one participant is required to activate this Signing.",
      );
    }

    issued = await issueParticipantCredentialsForActivation({
      admin,
      signingId: signing.id,
      participantIds: participants.map((row) => row.id as string),
      issuedByUserId: actor.userId,
    });

    // Recorded before the lifecycle flip so a failed flip rolls the event back
    // with the abandoned revision; summary carries the mode, never a token.
    const authorityBundle = await loadSigningAuthorityBundle(
      admin,
      actor,
      signing.id,
    );
    const actorType = requireSigningEventActorType(
      authorityBundle?.authority,
    );
    const responsibleMeta = buildResponsibleContextMetadata({
      responsibleUserId: signing.original_sender_user_id,
      responsibleDisplayName: signing.original_sender_display_name,
    });
    await appendSigningEvent(admin, {
      signingId: signing.id,
      packageRevisionId: promoted.packageRevisionId,
      eventType: "SIGNING_ACTIVATED",
      actorType,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      visibility: "BUSINESS",
      summary:
        mode === "REMOTE_SEND"
          ? "Signing activated and sent for remote signing"
          : "Signing activated for in-person signing",
      detailsJson: responsibleMeta,
    });

    const activatedAt = new Date().toISOString();
    const { data: activatedRows, error: activateError } = await admin
      .from("signings")
      .update({
        lifecycle_state: "IN_PROGRESS",
        activation_mode: mode,
        activated_at: activatedAt,
        activated_by_user_id: actor.userId,
      })
      .eq("id", signing.id)
      .eq("lifecycle_state", "DRAFT")
      .eq("current_package_revision_id", promoted.packageRevisionId)
      .select("id, activated_at")
      .maybeSingle();
    if (activateError) throw new Error(activateError.message);
    if (!activatedRows) {
      throw new SigningError(
        "CONFLICT",
        "This Signing changed during activation. Try again.",
      );
    }
    lifecycleAdvanced = true;

    // Past this point the Signing is activated. Delivery problems are recorded
    // as delivery failures and never reverse activation.
    let invitationsEnqueued = 0;
    let invitationsAccepted = 0;
    let invitationsFailed = 0;

    if (mode === "REMOTE_SEND") {
      try {
        const targets: ParticipantInvitationTarget[] = participants.flatMap(
          (row) => {
            const credential = issued.get(row.id as string);
            if (!credential) return [];
            return [
              {
                signingParticipantId: row.id as string,
                credentialId: credential.credentialId,
                fullName: row.full_name as string,
                email: row.email as string,
              },
            ];
          },
        );

        const enqueued = await enqueueParticipantInvitations({
          admin,
          signingId: signing.id,
          packageRevisionId: promoted.packageRevisionId,
          initiatedByUserId: actor.userId,
          targets,
        });
        invitationsEnqueued = enqueued.length;

        const rawTokensByParticipantId = new Map(
          [...issued.entries()].map(([participantId, credential]) => [
            participantId,
            credential.rawToken,
          ]),
        );
        const outcomes = await deliverEnqueuedParticipantInvitations({
          admin,
          enqueued,
          rawTokensByParticipantId,
        });
        invitationsAccepted = outcomes.filter(
          (row) => row.outcome === "ACCEPTED",
        ).length;
        invitationsFailed = outcomes.filter(
          (row) => row.outcome === "FAILED",
        ).length;
      } catch (error) {
        console.error(
          "[native-signing-stage4] invitation enqueue failed after activation:",
          error instanceof Error ? error.message : "unknown error",
        );
      }
    }

    const result: ActivateSigningResult = {
      signingId: signing.id,
      mode,
      packageRevisionId: promoted.packageRevisionId,
      revisionNumber: promoted.revisionNumber,
      lifecycleState: "IN_PROGRESS",
      activatedAt:
        (activatedRows.activated_at as string | null) ?? activatedAt,
      credentialCount: issued.size,
      invitationsEnqueued,
      invitationsAccepted,
      invitationsFailed,
      replayed: false,
    };

    await admin
      .from("signing_operation_idempotency")
      .update({
        processing_state: "SUCCEEDED",
        result_json: result,
        error_code: null,
        error_message: null,
      })
      .eq("id", claim.recordId);

    return result;
  } catch (error) {
    if (!lifecycleAdvanced) {
      if (issued.size > 0) {
        await revokeIssuedCredentials(admin, summary.id, issued);
      }
      if (packageRevisionId) {
        await abandonPromotedRevisionAfterFailedActivation({
          admin,
          signingId: summary.id,
          packageRevisionId,
          previousPackageRevisionId: previousPointer,
        });
      }
    }
    await markIdempotencyFailed(admin, claim.recordId, error);
    throw error;
  }
}
