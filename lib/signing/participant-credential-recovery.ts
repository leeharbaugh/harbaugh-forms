/**
 * Trusted-server participant credential replacement after recovery (epoch bump).
 * No polished UI — managers/ops call this deliberately. Reuses invitation enqueue.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import {
  issueParticipantCredentialsForActivation,
  type IssuedParticipantCredential,
} from "./credentials";
import {
  enqueueParticipantInvitations,
  type EnqueuedParticipantInvitation,
} from "./delivery";
import { SigningError } from "./errors";
import { requireSigningEventActorType } from "./event-actor";
import { assertNativeSigningEnabled } from "./feature-gate";
import { appendSigningEvent } from "./signing-events";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

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

  // Prefer recovery/manager reason on superseded prior rows.
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
  }

  return { issued, enqueued };
}
