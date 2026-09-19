/**
 * Native Signing Stage 5 participant ceremony events.
 *
 * Thin wrapper over the central Signing event append boundary so every ceremony
 * act is attributed to both the Signing participant and the package revision
 * it acted on. Sequence assignment and append-only enforcement remain
 * server-side; Stage 6 adds protected event-chain integrity when configured.
 *
 * Ordinary navigation and heartbeat are operational state, not durable Signing
 * history, and must not be recorded here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendSigningEvent } from "./signing-events";

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
  await appendSigningEvent(options.admin, {
    signingId: options.signingId,
    eventType: options.eventType,
    actorType: "PARTICIPANT",
    actorParticipantId: options.signingParticipantId,
    actorDisplayName: options.actorDisplayName,
    visibility: "BUSINESS",
    packageRevisionId: options.packageRevisionId ?? null,
    signingDocumentVersionId: options.signingDocumentVersionId ?? null,
    signingFieldId: options.signingFieldId ?? null,
    signingFieldPlacementId: options.signingFieldPlacementId ?? null,
    summary: options.summary,
    detailsJson: options.detailsJson ?? null,
    idempotencyKey: options.idempotencyKey ?? null,
  });
}
