/**
 * Native Signing Stage 5 participant ceremony events.
 *
 * Thin wrapper over the append-only `signing_events` insert used by
 * `activation.ts`, so every ceremony act is attributed to both the Signing
 * participant and the package revision it acted on. `sequence_number`,
 * `create_date`, and append-only enforcement remain server-side.
 *
 * Ordinary navigation and heartbeat are operational state, not durable Signing
 * history, and must not be recorded here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CeremonyEventType =
  | "IDENTITY_AFFIRMED"
  | "CONSENT_ACCEPTED"
  | "SIGNATURE_ADOPTED"
  | "INITIALS_ADOPTED"
  | "PACKAGE_FROZEN"
  | "FIELD_PLACEMENT_ACCEPTED"
  | "FIELD_PLACEMENT_REMOVED"
  | "FIELD_PLACEMENT_REPLACED"
  | "PARTICIPANT_FINISHED"
  | "PARTICIPANT_DECLINED"
  | "SIGNING_DECLINED";

export async function appendCeremonyEvent(options: {
  admin: SupabaseClient;
  signingId: string;
  eventType: CeremonyEventType;
  signingParticipantId: string;
  actorDisplayName: string;
  packageRevisionId?: string | null;
  signingDocumentVersionId?: string | null;
  signingFieldId?: string | null;
  signingFieldPlacementId?: string | null;
  summary: string;
  detailsJson?: Record<string, unknown> | null;
  /** Makes a replayed ceremony action append one event, not two. */
  idempotencyKey?: string | null;
}): Promise<void> {
  const { error } = await options.admin.from("signing_events").insert({
    signing_id: options.signingId,
    package_revision_id: options.packageRevisionId ?? null,
    signing_document_version_id: options.signingDocumentVersionId ?? null,
    signing_field_id: options.signingFieldId ?? null,
    signing_field_placement_id: options.signingFieldPlacementId ?? null,
    event_type: options.eventType,
    actor_type: "PARTICIPANT",
    actor_participant_id: options.signingParticipantId,
    actor_display_name: options.actorDisplayName,
    visibility: "BUSINESS",
    summary: options.summary,
    details_json: options.detailsJson ?? null,
    idempotency_key: options.idempotencyKey ?? null,
  });
  if (error) {
    // A duplicate idempotency key means the event is already recorded.
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      return;
    }
    throw new Error(error.message);
  }
}
