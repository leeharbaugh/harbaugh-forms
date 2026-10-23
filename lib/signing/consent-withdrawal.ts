/**
 * Participant electronic-consent withdrawal.
 *
 * An authorized manager records that a participant withdrew electronic
 * consent (participants ask the sender; there is no participant-facing
 * control). Recording sets `signing_participants.consent_withdrawn_at` once and
 * appends an attributable CONSENT_WITHDRAWN event. Afterwards:
 * - consent no longer authorizes signing actions (`checkConsentSatisfied`),
 *   and the same Signing cannot be re-consented;
 * - every automated email to that participant is suppressed immediately
 *   before it would be sent, and recorded as SUPPRESSED.
 *
 * Withdrawal is not Decline: lifecycle, signatures, placements, documents,
 * events and the recorded acceptance are untouched, and existing
 * completed-document links keep working.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SigningAuthorityResult } from "./authority";
import { loadSigningAuthorityBundle, type SigningAuthorityBundle } from "./authority-context";
import { canManageCompletedSigningOperations } from "./completed-package-authority";
import { SigningError } from "./errors";
import { requireSigningEventActorType } from "./event-actor";
import { assertNativeSigningEnabled } from "./feature-gate";
import { appendSigningEvent } from "./signing-events";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export const CONSENT_WITHDRAWN_EVENT_TYPE = "CONSENT_WITHDRAWN" as const;
export const DELIVERY_SUPPRESSED_EVENT_TYPE = "DELIVERY_SUPPRESSED_CONSENT_WITHDRAWN" as const;

export const CONSENT_WITHDRAWN_DELIVERY_DETAIL =
  "The participant withdrew electronic consent; this email was not sent.";

/** Shown to a manager attempting an electronic action for a withdrawn participant. */
export const CONSENT_WITHDRAWN_MANAGER_MESSAGE =
  "This participant withdrew electronic consent for this Signing. No signing links or emails are sent to them.";

/**
 * The same people who manage the Signing: active managers while In Progress,
 * and the completed-operations managers after Complete. Draft, Declined and
 * Cancelled Signings have nothing left that relies on consent.
 */
export function canRecordConsentWithdrawal(
  authority: SigningAuthorityResult,
  lifecycleState: string,
): boolean {
  if (lifecycleState === "IN_PROGRESS") return authority.canManage;
  return canManageCompletedSigningOperations(authority, lifecycleState);
}

export async function isParticipantConsentWithdrawn(
  admin: SupabaseClient,
  signingId: string,
  signingParticipantId: string | null | undefined,
): Promise<boolean> {
  if (!signingParticipantId) return false;
  const { data, error } = await admin
    .from("signing_participants")
    .select("consent_withdrawn_at")
    .eq("id", signingParticipantId)
    .eq("signing_id", signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.consent_withdrawn_at);
}

export async function assertParticipantConsentNotWithdrawn(
  admin: SupabaseClient,
  signingId: string,
  signingParticipantId: string | null | undefined,
): Promise<void> {
  if (await isParticipantConsentWithdrawn(admin, signingId, signingParticipantId)) {
    throw new SigningError("CONFLICT", CONSENT_WITHDRAWN_MANAGER_MESSAGE);
  }
}

export type RecordConsentWithdrawalResult = {
  signingParticipantId: string;
  consentWithdrawnAt: string;
  /** True when the withdrawal had already been recorded. */
  replayed: boolean;
};

/** Core of the manager action, on an already-loaded authority bundle. */
export async function recordConsentWithdrawal(options: {
  admin: SupabaseClient;
  actor: SigningActor;
  bundle: SigningAuthorityBundle;
  signingParticipantId: unknown;
}): Promise<RecordConsentWithdrawalResult> {
  const { admin, actor, bundle } = options;
  if (!isUuid(options.signingParticipantId)) {
    throw new SigningError("INVALID_INPUT", "Invalid participant id.");
  }
  const participantId = options.signingParticipantId;
  const lifecycleState = bundle.signing.lifecycle_state;
  if (lifecycleState !== "IN_PROGRESS" && lifecycleState !== "COMPLETE") {
    throw new SigningError(
      "CONFLICT",
      "Consent withdrawal can be recorded only while a Signing is In Progress or after it is Complete.",
    );
  }
  if (!canRecordConsentWithdrawal(bundle.authority, lifecycleState)) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }

  const loadParticipant = async () => {
    const { data, error } = await admin
      .from("signing_participants")
      .select(
        "id, participant_status, consent_accepted_at, consent_disclosure_version_id, consent_content_sha256, consent_withdrawn_at",
      )
      .eq("id", participantId)
      .eq("signing_id", bundle.signing.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  };

  const participant = await loadParticipant();
  if (!participant || participant.participant_status === "REMOVED") {
    throw new SigningError("NOT_FOUND", "Participant not found on this Signing.");
  }
  if (!participant.consent_accepted_at) {
    throw new SigningError(
      "CONFLICT",
      "This participant has not accepted electronic consent, so there is nothing to withdraw.",
    );
  }

  let withdrawnAt = (participant.consent_withdrawn_at as string | null) ?? null;
  let replayed = withdrawnAt !== null;
  if (!withdrawnAt) {
    const { data: updated, error } = await admin
      .from("signing_participants")
      .update({ consent_withdrawn_at: new Date().toISOString() })
      .eq("id", participantId)
      .eq("signing_id", bundle.signing.id)
      .is("consent_withdrawn_at", null)
      .select("consent_withdrawn_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (updated?.consent_withdrawn_at) {
      withdrawnAt = updated.consent_withdrawn_at as string;
    } else {
      // A concurrent request recorded it first.
      withdrawnAt = ((await loadParticipant())?.consent_withdrawn_at as string | null) ?? null;
      if (!withdrawnAt) {
        throw new SigningError("CONFLICT", "Consent withdrawal could not be recorded. Try again.");
      }
      replayed = true;
    }
  }

  // Appended on every call under one idempotency key, so a retry after a
  // failed append still records the event exactly once.
  await appendSigningEvent(admin, {
    signingId: bundle.signing.id,
    eventType: CONSENT_WITHDRAWN_EVENT_TYPE,
    actorType: requireSigningEventActorType(bundle.authority),
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    summary: "Participant electronic-consent withdrawal recorded",
    detailsJson: {
      signingParticipantId: participantId,
      consentWithdrawnAt: withdrawnAt,
      acceptedDisclosureVersionId: participant.consent_disclosure_version_id ?? null,
      acceptedContentSha256: participant.consent_content_sha256 ?? null,
      lifecycleState,
    },
    idempotencyKey: `${CONSENT_WITHDRAWN_EVENT_TYPE}:${participantId}`,
  });

  return { signingParticipantId: participantId, consentWithdrawnAt: withdrawnAt, replayed };
}

export async function recordConsentWithdrawalWithActor(
  actor: SigningActor,
  input: { signingId: unknown; participantId: unknown },
  admin: SupabaseClient,
): Promise<RecordConsentWithdrawalResult> {
  assertNativeSigningEnabled();
  if (!isUuid(input.signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }
  const bundle = await loadSigningAuthorityBundle(admin, actor, input.signingId);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  return recordConsentWithdrawal({
    admin,
    actor,
    bundle,
    signingParticipantId: input.participantId,
  });
}

/**
 * Record a queued email that was deliberately not sent because the
 * participant withdrew consent: one SUPPRESSED attempt, a SUPPRESSED
 * instruction and a system event. The caller settles its work item.
 */
export async function recordSuppressedDelivery(options: {
  admin: SupabaseClient;
  signingId: string;
  deliveryInstructionId: string;
  signingParticipantId: string;
  purpose: string;
}): Promise<void> {
  const { admin, signingId, deliveryInstructionId } = options;
  const { data: last, error: lastError } = await admin
    .from("signing_delivery_attempts")
    .select("attempt_number")
    .eq("delivery_instruction_id", deliveryInstructionId)
    .order("attempt_number", { ascending: false })
    .limit(1);
  if (lastError) throw new Error(lastError.message);
  const attemptNumber = ((last?.[0]?.attempt_number as number | undefined) ?? 0) + 1;

  const { error: attemptError } = await admin.from("signing_delivery_attempts").insert({
    signing_id: signingId,
    delivery_instruction_id: deliveryInstructionId,
    attempt_number: attemptNumber,
    outcome: "SUPPRESSED",
    failure_detail_safe: CONSENT_WITHDRAWN_DELIVERY_DETAIL,
  });
  if (attemptError) throw new Error(attemptError.message);

  const { error: instructionError } = await admin
    .from("signing_delivery_instructions")
    .update({ delivery_state: "SUPPRESSED" })
    .eq("id", deliveryInstructionId)
    .eq("signing_id", signingId);
  if (instructionError) throw new Error(instructionError.message);

  await appendSigningEvent(admin, {
    signingId,
    eventType: DELIVERY_SUPPRESSED_EVENT_TYPE,
    actorType: "SYSTEM",
    actorDisplayName: "Native Signing Delivery",
    summary: "Email not sent: the participant withdrew electronic consent",
    detailsJson: {
      deliveryInstructionId,
      signingParticipantId: options.signingParticipantId,
      purpose: options.purpose,
    },
    idempotencyKey: `${DELIVERY_SUPPRESSED_EVENT_TYPE}:${deliveryInstructionId}`,
  });
}
