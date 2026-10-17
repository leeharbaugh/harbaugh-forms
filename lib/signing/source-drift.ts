/**
 * Native Signing Stage 4 Draft source drift.
 *
 * Live Packet Form edits never silently update a captured Draft source
 * snapshot. Instead the live content fingerprint is compared to the selected
 * snapshot, and the agent resolves any difference explicitly:
 *
 * - Keep Current acknowledges one specific live fingerprint and keeps the
 *   selected snapshot; the Signing still promotes the snapshot bytes.
 * - Update to Latest captures a NEW snapshot row and selects it. It creates no
 *   document versions and no package revisions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import type { SigningDocumentRow } from "./draft-documents";
import {
  captureAndSelectDraftSourceSnapshot,
  computeLiveContentFingerprintForPacketForm,
  loadDraftSourceSnapshotById,
  type DraftSourceSnapshotRow,
} from "./draft-source-snapshots";
import {
  buildResponsibleContextMetadata,
  requireSigningEventActorType,
} from "./event-actor";
import { appendSigningEvent } from "./signing-events";
import { SigningError } from "./errors";
import { requireManageableDraftSigning } from "./manage";
import { resolveSigningPacketOwnerUserId } from "./operations";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export type DocumentSourceStatus =
  | "CURRENT"
  | "SOURCE_CHANGED"
  | "SOURCE_UNAVAILABLE";

export type DocumentSourceStatusReason =
  | "MATCHES_SNAPSHOT"
  | "ACKNOWLEDGED_LIVE_CHANGE"
  | "LIVE_CHANGED"
  | "NO_SELECTED_SNAPSHOT"
  | "SNAPSHOT_MISSING"
  | "NO_SOURCE_PACKET_FORM"
  | "LIVE_UNAVAILABLE";

export type DocumentSourceStatusResult = {
  signingDocumentId: string;
  status: DocumentSourceStatus;
  snapshot: DraftSourceSnapshotRow | null;
  snapshotFingerprint: string | null;
  liveFingerprint: string | null;
  acknowledgedFingerprint: string | null;
  reason: DocumentSourceStatusReason;
};

/**
 * Pure comparison at the heart of drift resolution, extracted so the
 * acknowledgement rule is testable without Storage or a database.
 *
 * Keep Current acknowledges one exact live fingerprint. If the live source then
 * changes again (Y acknowledged, live now Z), the acknowledgement no longer
 * applies and drift is raised again.
 */
export function compareDraftSourceFingerprints(input: {
  snapshotFingerprint: string;
  liveFingerprint: string;
  acknowledgedFingerprint: string | null;
}): { status: DocumentSourceStatus; reason: DocumentSourceStatusReason } {
  if (input.liveFingerprint === input.snapshotFingerprint) {
    return { status: "CURRENT", reason: "MATCHES_SNAPSHOT" };
  }
  if (
    input.acknowledgedFingerprint !== null &&
    input.liveFingerprint === input.acknowledgedFingerprint
  ) {
    return { status: "CURRENT", reason: "ACKNOWLEDGED_LIVE_CHANGE" };
  }
  return { status: "SOURCE_CHANGED", reason: "LIVE_CHANGED" };
}

export async function getDocumentSourceStatus(
  admin: SupabaseClient,
  document: SigningDocumentRow,
  ownerUserId: string,
): Promise<DocumentSourceStatusResult> {
  const base = {
    signingDocumentId: document.id,
    acknowledgedFingerprint:
      document.acknowledged_live_content_fingerprint ?? null,
  };

  if (!document.selected_draft_source_snapshot_id) {
    return {
      ...base,
      status: "SOURCE_UNAVAILABLE",
      snapshot: null,
      snapshotFingerprint: null,
      liveFingerprint: null,
      reason: "NO_SELECTED_SNAPSHOT",
    };
  }

  const snapshot = await loadDraftSourceSnapshotById(
    admin,
    document.signing_id,
    document.selected_draft_source_snapshot_id,
  );
  if (!snapshot) {
    return {
      ...base,
      status: "SOURCE_UNAVAILABLE",
      snapshot: null,
      snapshotFingerprint: null,
      liveFingerprint: null,
      reason: "SNAPSHOT_MISSING",
    };
  }
  if (document.source_packet_form_id == null) {
    // Ad hoc Signing PDFs have no live Packet Form to drift against.
    return {
      ...base,
      status: "CURRENT",
      snapshot,
      snapshotFingerprint: snapshot.content_fingerprint,
      liveFingerprint: snapshot.content_fingerprint,
      reason: "MATCHES_SNAPSHOT",
    };
  }

  const liveFingerprint = await computeLiveContentFingerprintForPacketForm(
    admin,
    document.source_packet_form_id,
    ownerUserId,
  );
  if (!liveFingerprint) {
    return {
      ...base,
      status: "SOURCE_UNAVAILABLE",
      snapshot,
      snapshotFingerprint: snapshot.content_fingerprint,
      liveFingerprint: null,
      reason: "LIVE_UNAVAILABLE",
    };
  }

  // Keep Current stays valid only while the live source still matches the exact
  // fingerprint the agent acknowledged. Any further edit re-raises drift.
  const compared = compareDraftSourceFingerprints({
    snapshotFingerprint: snapshot.content_fingerprint,
    liveFingerprint,
    acknowledgedFingerprint:
      document.acknowledged_live_content_fingerprint ?? null,
  });

  return {
    ...base,
    status: compared.status,
    snapshot,
    snapshotFingerprint: snapshot.content_fingerprint,
    liveFingerprint,
    reason: compared.reason,
  };
}

async function requireDraftDocument(
  admin: SupabaseClient,
  signingId: string,
  signingDocumentIdRaw: unknown,
): Promise<SigningDocumentRow> {
  if (!isUuid(signingDocumentIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing document id.");
  }
  const { data, error } = await admin
    .from("signing_documents")
    .select("*")
    .eq("id", signingDocumentIdRaw)
    .eq("signing_id", signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new SigningError("NOT_FOUND", "Signing document not found.");
  }
  const document = data as SigningDocumentRow;
  if (!document.included_in_draft) {
    throw new SigningError(
      "CONFLICT",
      "This document is not included in the Draft.",
    );
  }
  return document;
}

/**
 * Keep Current: acknowledge one specific live fingerprint without changing the
 * selected snapshot. Promotion continues to render the snapshot bytes.
 */
export async function keepCurrentDraftSourceWithActor(
  actor: SigningActor,
  input: { signingId: unknown; signingDocumentId: unknown },
  admin: SupabaseClient,
): Promise<DocumentSourceStatusResult> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  const document = await requireDraftDocument(
    admin,
    signing.id,
    input.signingDocumentId,
  );

  const packetOwnerUserId = resolveSigningPacketOwnerUserId(signing);
  const status = await getDocumentSourceStatus(
    admin,
    document,
    packetOwnerUserId,
  );
  if (status.status !== "SOURCE_CHANGED" || !status.liveFingerprint) {
    throw new SigningError(
      "CONFLICT",
      "This document's source has not changed since its Draft snapshot.",
    );
  }

  const { data: updated, error } = await admin
    .from("signing_documents")
    .update({ acknowledged_live_content_fingerprint: status.liveFingerprint })
    .eq("id", document.id)
    .eq("signing_id", signing.id)
    .eq(
      "selected_draft_source_snapshot_id",
      document.selected_draft_source_snapshot_id as string,
    )
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) {
    throw new SigningError(
      "CONFLICT",
      "This document's Draft source changed while acknowledging. Try again.",
    );
  }

  const authorityBundle = await loadSigningAuthorityBundle(
    admin,
    actor,
    signing.id,
  );
  const actorType = requireSigningEventActorType(authorityBundle?.authority);
  const responsibleMeta = buildResponsibleContextMetadata({
    responsibleUserId: signing.original_sender_user_id,
    responsibleDisplayName: signing.original_sender_display_name,
  });

  await appendSigningEvent(admin, {
    signingId: signing.id,
    eventType: "DRAFT_SOURCE_KEPT_CURRENT",
    actorType,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    visibility: "BUSINESS",
    summary: "Draft source change acknowledged; existing snapshot kept",
    detailsJson: responsibleMeta,
  });

  return getDocumentSourceStatus(
    admin,
    updated as SigningDocumentRow,
    packetOwnerUserId,
  );
}

/**
 * Update to Latest: capture a NEW Draft source snapshot and select it.
 * Creates no document versions and no package revisions.
 */
export async function updateDraftSourceToLatestWithActor(
  actor: SigningActor,
  input: { signingId: unknown; signingDocumentId: unknown },
  admin: SupabaseClient,
): Promise<DocumentSourceStatusResult> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  const document = await requireDraftDocument(
    admin,
    signing.id,
    input.signingDocumentId,
  );
  if (document.source_packet_form_id == null) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "This document has no source Packet Form to refresh from.",
    );
  }

  await captureAndSelectDraftSourceSnapshot({
    admin,
    signingId: signing.id,
    signingDocumentId: document.id,
    packetFormId: document.source_packet_form_id,
    expectedOwnerUserId: resolveSigningPacketOwnerUserId(signing),
  });

  const authorityBundle = await loadSigningAuthorityBundle(
    admin,
    actor,
    signing.id,
  );
  const actorType = requireSigningEventActorType(authorityBundle?.authority);
  const responsibleMeta = buildResponsibleContextMetadata({
    responsibleUserId: signing.original_sender_user_id,
    responsibleDisplayName: signing.original_sender_display_name,
  });

  await appendSigningEvent(admin, {
    signingId: signing.id,
    eventType: "DRAFT_SOURCE_UPDATED_TO_LATEST",
    actorType,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    visibility: "BUSINESS",
    summary: "Draft source snapshot recaptured from latest Packet Form content",
    detailsJson: responsibleMeta,
  });

  const { data: refreshed, error } = await admin
    .from("signing_documents")
    .select("*")
    .eq("id", document.id)
    .eq("signing_id", signing.id)
    .single();
  if (error || !refreshed) {
    throw new Error(error?.message ?? "Failed to reload Signing document.");
  }

  return getDocumentSourceStatus(
    admin,
    refreshed as SigningDocumentRow,
    resolveSigningPacketOwnerUserId(signing),
  );
}
