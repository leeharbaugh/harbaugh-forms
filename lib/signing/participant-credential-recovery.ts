/**
 * Trusted-server participant invitation credential recovery for In Progress.
 * Managers may resend (same link), replace (new link), or revoke access.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import {
  issueParticipantCredentialsForActivation,
  loadRawParticipantCredentialToken,
  type IssuedParticipantCredential,
} from "./credentials";
import {
  deliverEnqueuedParticipantInvitations,
  enqueueParticipantInvitations,
  type EnqueuedParticipantInvitation,
} from "./delivery";
import { SigningError } from "./errors";
import { requireSigningEventActorType } from "./event-actor";
import { assertNativeSigningEnabled } from "./feature-gate";
import { revokeSigningEntrySessionsForCredential } from "./entry-sessions";
import { appendSigningEvent } from "./signing-events";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

async function requireInProgressManageableParticipant(options: {
  actor: SigningActor;
  signingId: unknown;
  participantId: unknown;
  admin: SupabaseClient;
}): Promise<{
  signingId: string;
  participantId: string;
  email: string;
  fullName: string;
  packageRevisionId: string | null;
  activationMode: string | null;
  actorType: ReturnType<typeof requireSigningEventActorType>;
}> {
  assertNativeSigningEnabled();
  if (!isUuid(options.signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }
  if (!isUuid(options.participantId)) {
    throw new SigningError("INVALID_INPUT", "Invalid participant id.");
  }

  const bundle = await loadSigningAuthorityBundle(
    options.admin,
    options.actor,
    options.signingId,
  );
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!bundle.authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }
  if (bundle.signing.lifecycle_state !== "IN_PROGRESS") {
    throw new SigningError(
      "CONFLICT",
      "Participant invitation links may only be managed while the Signing is In Progress.",
    );
  }

  const { data: activation, error: activationError } = await options.admin
    .from("signings")
    .select("activation_mode")
    .eq("id", bundle.signing.id)
    .maybeSingle();
  if (activationError) throw new Error(activationError.message);
  const activationMode =
    (activation?.activation_mode as string | null | undefined) ?? null;

  if (activationMode === "IN_PERSON") {
    throw new SigningError(
      "CONFLICT",
      "This Signing uses in-person handoff rather than emailed signing links.",
    );
  }

  const { data: participant, error } = await options.admin
    .from("signing_participants")
    .select("id, full_name, email, participant_status")
    .eq("signing_id", bundle.signing.id)
    .eq("id", options.participantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!participant) {
    throw new SigningError("NOT_FOUND", "Participant not found on this Signing.");
  }
  if (participant.participant_status === "REMOVED") {
    throw new SigningError(
      "CONFLICT",
      "Cannot manage invitation links for a removed participant.",
    );
  }
  if (participant.participant_status === "FINISHED") {
    throw new SigningError(
      "CONFLICT",
      "This participant has already finished signing.",
    );
  }
  if (participant.participant_status === "DECLINED") {
    throw new SigningError(
      "CONFLICT",
      "This participant declined and no longer receives signing links.",
    );
  }

  const email = String(participant.email ?? "").trim();
  if (!email) {
    throw new SigningError(
      "NOT_READY",
      "This participant needs a valid email address before a signing link can be sent.",
    );
  }

  return {
    signingId: bundle.signing.id,
    participantId: participant.id as string,
    email,
    fullName: participant.full_name as string,
    packageRevisionId: bundle.signing.current_package_revision_id,
    activationMode,
    actorType: requireSigningEventActorType(bundle.authority),
  };
}

async function loadCurrentCredentialId(options: {
  admin: SupabaseClient;
  signingId: string;
  participantId: string;
}): Promise<string | null> {
  const { data, error } = await options.admin
    .from("signing_participant_credentials")
    .select("id")
    .eq("signing_id", options.signingId)
    .eq("signing_participant_id", options.participantId)
    .eq("is_current", true)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

/**
 * Resend the current invitation link (same credential) via a new delivery work item.
 */
export async function resendParticipantInvitationWithActor(
  actor: SigningActor,
  input: { signingId: unknown; participantId: unknown },
  admin: SupabaseClient,
): Promise<{ deliveryInstructionId: string; workItemId: string }> {
  const ctx = await requireInProgressManageableParticipant({
    actor,
    signingId: input.signingId,
    participantId: input.participantId,
    admin,
  });

  const credentialId = await loadCurrentCredentialId({
    admin,
    signingId: ctx.signingId,
    participantId: ctx.participantId,
  });
  if (!credentialId) {
    throw new SigningError(
      "CONFLICT",
      "No active signing link exists for this participant. Use Replace signing link.",
    );
  }

  const rawToken = await loadRawParticipantCredentialToken({
    admin,
    signingId: ctx.signingId,
    credentialId,
  });
  if (!rawToken) {
    throw new SigningError(
      "CONFLICT",
      "The current signing link cannot be recovered. Use Replace signing link.",
    );
  }

  const resendKey = `invitation-resend:${credentialId}:${Date.now()}`;
  const { data: instruction, error: instructionError } = await admin
    .from("signing_delivery_instructions")
    .insert({
      signing_id: ctx.signingId,
      signing_participant_id: ctx.participantId,
      purpose: "INVITATION",
      recipient_email_snapshot: ctx.email,
      recipient_name_snapshot: ctx.fullName,
      signing_participant_credential_id: credentialId,
      package_revision_id: ctx.packageRevisionId,
      delivery_state: "QUEUED",
      initiated_by_user_id: actor.userId,
    })
    .select("id")
    .single();
  if (instructionError || !instruction) {
    throw new Error(
      instructionError?.message ?? "Failed to record delivery instruction.",
    );
  }

  const { data: workItem, error: workItemError } = await admin
    .from("signing_work_items")
    .insert({
      signing_id: ctx.signingId,
      work_type: "PARTICIPANT_INVITATION_EMAIL",
      idempotency_key: resendKey,
      reference_json: {
        deliveryInstructionId: instruction.id as string,
        signingParticipantId: ctx.participantId,
        signingParticipantCredentialId: credentialId,
      },
      processing_state: "PENDING",
    })
    .select("id")
    .single();
  if (workItemError || !workItem) {
    throw new Error(workItemError?.message ?? "Failed to enqueue invitation.");
  }

  await appendSigningEvent(admin, {
    signingId: ctx.signingId,
    eventType: "PARTICIPANT_INVITATION_RESEND_REQUESTED",
    actorType: ctx.actorType,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    summary: "Participant invitation resend requested",
    detailsJson: {
      signingParticipantId: ctx.participantId,
      credentialId,
    },
  });

  await deliverEnqueuedParticipantInvitations({
    admin,
    enqueued: [
      {
        signingParticipantId: ctx.participantId,
        credentialId,
        deliveryInstructionId: instruction.id as string,
        workItemId: workItem.id as string,
      },
    ],
    rawTokensByParticipantId: new Map([[ctx.participantId, rawToken]]),
  });

  return {
    deliveryInstructionId: instruction.id as string,
    workItemId: workItem.id as string,
  };
}

/**
 * Replace current participant invitation credentials and optionally enqueue
 * invitation email. New credentials stamp the current access epoch.
 * Does not reopen Finish or mutate ceremony evidence.
 */
export async function replaceParticipantCredentialsWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    participantIds: unknown;
    enqueueInvitation?: boolean;
  },
  admin: SupabaseClient,
): Promise<{
  issued: Map<string, IssuedParticipantCredential>;
  enqueued: EnqueuedParticipantInvitation[];
}> {
  assertNativeSigningEnabled();

  if (!isUuid(input.signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  const bundle = await loadSigningAuthorityBundle(
    admin,
    actor,
    input.signingId,
  );
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!bundle.authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }
  if (bundle.signing.lifecycle_state !== "IN_PROGRESS") {
    throw new SigningError(
      "CONFLICT",
      "Participant credentials may only be replaced while the Signing is In Progress.",
    );
  }

  if (!Array.isArray(input.participantIds) || input.participantIds.length === 0) {
    throw new SigningError("INVALID_INPUT", "participantIds required.");
  }
  const participantIds: string[] = [];
  for (const id of input.participantIds) {
    if (!isUuid(id)) {
      throw new SigningError("INVALID_INPUT", "Invalid participant id.");
    }
    participantIds.push(id);
  }

  const { data: participants, error: participantError } = await admin
    .from("signing_participants")
    .select("id, full_name, email, participant_status")
    .eq("signing_id", bundle.signing.id)
    .in("id", participantIds);
  if (participantError) throw new Error(participantError.message);
  if (!participants || participants.length !== participantIds.length) {
    throw new SigningError("NOT_FOUND", "Participant not found on this Signing.");
  }

  for (const participant of participants) {
    if (participant.participant_status === "REMOVED") {
      throw new SigningError(
        "CONFLICT",
        "Cannot replace credentials for a removed participant.",
      );
    }
    if (participant.participant_status === "FINISHED") {
      throw new SigningError(
        "CONFLICT",
        "Cannot replace ceremony credentials for a finished participant.",
      );
    }
  }

  const issued = await issueParticipantCredentialsForActivation({
    admin,
    signingId: bundle.signing.id,
    participantIds,
    issuedByUserId: actor.userId,
  });

  for (const [participantId, cred] of issued) {
    await admin
      .from("signing_participant_credentials")
      .update({ revoked_reason: "REPLACED_BY_MANAGER" })
      .eq("signing_id", bundle.signing.id)
      .eq("signing_participant_id", participantId)
      .eq("is_current", false)
      .eq("replaced_by_credential_id", cred.credentialId);
  }

  for (const participantId of participantIds) {
    const cred = issued.get(participantId);
    if (!cred) continue;
    await appendSigningEvent(admin, {
      signingId: bundle.signing.id,
      eventType: "PARTICIPANT_CREDENTIAL_REPLACED",
      actorType: requireSigningEventActorType(bundle.authority),
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      summary: "Participant invitation credential replaced",
      detailsJson: {
        signingParticipantId: participantId,
        newCredentialId: cred.credentialId,
      },
    });
  }

  let enqueued: EnqueuedParticipantInvitation[] = [];
  if (input.enqueueInvitation !== false) {
    const targets = participants.map((p) => {
      const cred = issued.get(p.id as string);
      if (!cred) {
        throw new Error(`Missing issued credential for ${p.id}`);
      }
      return {
        signingParticipantId: p.id as string,
        credentialId: cred.credentialId,
        email: p.email as string,
        fullName: p.full_name as string,
      };
    });
    enqueued = await enqueueParticipantInvitations({
      admin,
      signingId: bundle.signing.id,
      packageRevisionId: bundle.signing.current_package_revision_id,
      initiatedByUserId: actor.userId,
      targets,
    });

    const rawTokens = new Map<string, string>();
    for (const [participantId, cred] of issued) {
      rawTokens.set(participantId, cred.rawToken);
    }
    await deliverEnqueuedParticipantInvitations({
      admin,
      enqueued,
      rawTokensByParticipantId: rawTokens,
    });
  }

  return { issued, enqueued };
}

/**
 * Revoke the current invitation credential and entry sessions without issuing a replacement.
 */
export async function revokeParticipantCredentialWithActor(
  actor: SigningActor,
  input: { signingId: unknown; participantId: unknown },
  admin: SupabaseClient,
): Promise<{ credentialId: string }> {
  const ctx = await requireInProgressManageableParticipant({
    actor,
    signingId: input.signingId,
    participantId: input.participantId,
    admin,
  });

  const credentialId = await loadCurrentCredentialId({
    admin,
    signingId: ctx.signingId,
    participantId: ctx.participantId,
  });
  if (!credentialId) {
    throw new SigningError(
      "CONFLICT",
      "No active signing link exists for this participant.",
    );
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("signing_participant_credentials")
    .update({
      is_current: false,
      revoked_at: now,
      revoked_reason: "REVOKED_BY_MANAGER",
    })
    .eq("id", credentialId)
    .eq("signing_id", ctx.signingId)
    .eq("is_current", true);
  if (error) throw new Error(error.message);

  await revokeSigningEntrySessionsForCredential({
    admin,
    signingId: ctx.signingId,
    credentialId,
    reason: "CREDENTIAL_REVOKED_BY_MANAGER",
  });

  await appendSigningEvent(admin, {
    signingId: ctx.signingId,
    eventType: "PARTICIPANT_CREDENTIAL_REVOKED",
    actorType: ctx.actorType,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    summary: "Participant invitation credential revoked",
    detailsJson: {
      signingParticipantId: ctx.participantId,
      credentialId,
    },
  });

  return { credentialId };
}
