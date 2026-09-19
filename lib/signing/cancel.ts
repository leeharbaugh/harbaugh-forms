/**
 * Cancel a Signing under the same lifecycle rules for agents, co-agents,
 * Transaction Coordinators, and originating ORG_ADMIN managers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import {
  buildResponsibleContextMetadata,
  requireSigningEventActorType,
} from "./event-actor";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import { isUuid, type SigningActor, type SigningSummary } from "./types";
import { getSigningForActor } from "./operations";

export type CancelSigningInput = {
  signingId: unknown;
  reason?: unknown;
};

/**
 * Cancel DRAFT or IN_PROGRESS Signings. COMPLETE / already CANCELLED fail closed.
 * Attribution records the actual operational actor; responsible context is preserved.
 */
export async function cancelSigningWithActor(
  actor: SigningActor,
  input: CancelSigningInput,
  admin: SupabaseClient,
): Promise<SigningSummary> {
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
  if (!bundle.authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot cancel this Signing.");
  }

  const { signing, authority } = bundle;
  if (
    signing.lifecycle_state !== "DRAFT" &&
    signing.lifecycle_state !== "IN_PROGRESS"
  ) {
    throw new SigningError(
      "CONFLICT",
      "Only Draft or In Progress Signings may be cancelled.",
    );
  }

  const reason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim().slice(0, 500)
      : null;

  const actorType = requireSigningEventActorType(authority);
  const responsibleMeta = buildResponsibleContextMetadata({
    responsibleUserId: signing.original_sender_user_id,
    responsibleDisplayName: signing.original_sender_display_name,
  });

  const summaryText =
    actorType === "TRANSACTION_COORDINATOR" &&
    signing.original_sender_display_name
      ? `Cancelled by ${actor.displayName}, Transaction Coordinator, on behalf of ${signing.original_sender_display_name}`
      : `Cancelled by ${actor.displayName}`;

  const cancelledAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("signings")
    .update({
      lifecycle_state: "CANCELLED",
    })
    .eq("id", signing.id)
    .in("lifecycle_state", ["DRAFT", "IN_PROGRESS"])
    .select("*")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) {
    throw new SigningError(
      "CONFLICT",
      "Signing could not be cancelled (state changed).",
    );
  }

  const { error: eventError } = await admin.from("signing_events").insert({
    signing_id: signing.id,
    event_type: "SIGNING_CANCELLED",
    actor_type: actorType,
    actor_user_id: actor.userId,
    actor_display_name: actor.displayName,
    visibility: "BUSINESS",
    summary: summaryText,
    details_json: {
      cancelledAt,
      ...(reason ? { reason } : {}),
      ...(responsibleMeta ?? {}),
    },
  });
  if (eventError) throw new Error(eventError.message);

  return getSigningForActor(actor, signing.id, admin);
}
