/**
 * Native Signing Stage 4 derived readiness.
 *
 * Ready is DERIVED, never stored: there is no Ready lifecycle state and no
 * lifecycle write happens here. A Draft is ready when everything activation
 * requires is already true, including that every included document's Draft
 * source snapshot is selected and not drifted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SigningDocumentRow } from "./draft-documents";
import { loadSigningAuthorityBundle } from "./authority-context";
import { assertNativeSigningEnabled } from "./feature-gate";
import {
  collectDraftPromotionBlockers,
  loadDraftBundle,
  type DraftPromotionBlocker,
} from "./package-promotion";
import {
  getDocumentSourceStatus,
  type DocumentSourceStatus,
} from "./source-drift";
import { SigningError } from "./errors";
import { isUuid, type SigningActor } from "./types";
import { resolveSigningPacketOwnerUserId } from "./operations";

export type SigningReadinessBlocker = DraftPromotionBlocker;

export type SigningReadinessDocument = {
  signingDocumentId: string;
  displayName: string;
  displayOrder: number;
  sourceStatus: DocumentSourceStatus;
  selectedDraftSourceSnapshotId: string | null;
};

export type SigningReadinessResult = {
  ready: boolean;
  blockers: SigningReadinessBlocker[];
  documents: SigningReadinessDocument[];
};

/**
 * Evaluate readiness for one Signing. Read-only: never writes lifecycle state.
 * Valid participant email is required for remote Send (enforced at activation),
 * not for general Draft readiness / Begin In-Person.
 */
export async function evaluateSigningReadiness(
  admin: SupabaseClient,
  signingIdRaw: unknown,
  actor: SigningActor,
): Promise<SigningReadinessResult> {
  assertNativeSigningEnabled();

  if (!isUuid(signingIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  const authorityBundle = await loadSigningAuthorityBundle(
    admin,
    actor,
    signingIdRaw,
  );
  if (!authorityBundle || !authorityBundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  const { signing, authority } = authorityBundle;

  const blockers: SigningReadinessBlocker[] = [];

  if (!authority.canManage) {
    blockers.push({
      code: "CANNOT_MANAGE",
      message: "You cannot manage this Signing.",
    });
  }
  if (signing.lifecycle_state !== "DRAFT") {
    blockers.push({
      code: "NOT_DRAFT",
      message: "Only Draft Signings can be prepared for activation.",
    });
  }

  const bundle = await loadDraftBundle(admin, signing.id);
  blockers.push(...collectDraftPromotionBlockers(bundle));

  for (const participant of bundle.participants) {
    const fullName = String(participant.full_name ?? "").trim();
    if (!fullName) {
      blockers.push({
        code: "PARTICIPANT_MISSING_CONTACT_DETAILS",
        message: "Every participant needs a full name.",
        participantId: participant.id as string,
      });
    }

    const capacityMode =
      (participant.signing_capacity_mode as string | undefined) ?? "PERSONAL";
    if (capacityMode === "REPRESENTATIVE") {
      const represented = String(
        participant.represented_party_name ?? "",
      ).trim();
      const wording = String(participant.capacity_wording ?? "").trim();
      const label = participant.capacity_label;
      if (!represented || !wording || !label) {
        blockers.push({
          code: "REPRESENTATIVE_CAPACITY_INCOMPLETE",
          message:
            "Representative participants need representing party, capacity, and exact execution wording.",
          participantId: participant.id as string,
        });
      }
    }
  }

  const documents: SigningReadinessDocument[] = [];
  const packetOwnerUserId = resolveSigningPacketOwnerUserId(signing);
  for (const row of bundle.documents) {
    const document = row as unknown as SigningDocumentRow;
    const status = await getDocumentSourceStatus(
      admin,
      document,
      packetOwnerUserId,
    );

    if (!document.selected_draft_source_snapshot_id) {
      blockers.push({
        code: "DOCUMENT_MISSING_DRAFT_SNAPSHOT",
        message:
          "Every included document must have a captured Draft source snapshot.",
        documentId: document.id,
      });
    } else if (status.status === "SOURCE_CHANGED") {
      blockers.push({
        code: "DOCUMENT_SOURCE_CHANGED",
        message:
          "This document's source changed. Choose Keep Current or Update to Latest.",
        documentId: document.id,
      });
    } else if (status.status === "SOURCE_UNAVAILABLE") {
      blockers.push({
        code: "DOCUMENT_SOURCE_UNAVAILABLE",
        message:
          "This document's source could not be verified. Resolve it before activation.",
        documentId: document.id,
      });
    }

    documents.push({
      signingDocumentId: document.id,
      displayName:
        document.display_name ?? document.logical_label ?? "Document",
      displayOrder: document.display_order,
      sourceStatus: status.status,
      selectedDraftSourceSnapshotId:
        document.selected_draft_source_snapshot_id ?? null,
    });
  }

  return {
    ready: blockers.length === 0,
    blockers,
    documents,
  };
}
