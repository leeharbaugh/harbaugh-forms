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
import { evaluateSigningAuthority } from "./authority";
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
import { isUuid, type SigningActor, type SigningRow } from "./types";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Evaluate readiness for one Signing. Read-only: never writes lifecycle state.
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

  const { data: signingRow, error: signingError } = await admin
    .from("signings")
    .select("*")
    .eq("id", signingIdRaw)
    .maybeSingle();
  if (signingError) throw new Error(signingError.message);
  if (!signingRow) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  const signing = signingRow as SigningRow;

  const { data: associations, error: associationError } = await admin
    .from("signing_agent_associations")
    .select("*")
    .eq("signing_id", signing.id);
  if (associationError) throw new Error(associationError.message);

  const authority = evaluateSigningAuthority({
    signing: {
      signingId: signing.id,
      originatingOrganizationId: signing.originating_organization_id,
      lifecycleState: signing.lifecycle_state,
      currentPrimaryAgentAssociationId:
        signing.current_primary_agent_association_id,
      associations: (associations ?? []).map((row) => ({
        id: row.id as string,
        agentUserId: row.agent_user_id as string | null,
        associationRole: row.association_role as "PRIMARY" | "CO_AGENT",
        effectiveEndedAt: row.effective_ended_at as string | null,
      })),
    },
    actorUserId: actor.userId,
    memberships: actor.memberships,
  });

  if (!authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }

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
    const email = String(participant.email ?? "").trim();
    if (!fullName || !EMAIL_RE.test(email)) {
      blockers.push({
        code: "PARTICIPANT_MISSING_CONTACT_DETAILS",
        message: "Every participant needs a full name and a valid email address.",
        participantId: participant.id as string,
      });
    }
  }

  const documents: SigningReadinessDocument[] = [];
  for (const row of bundle.documents) {
    const document = row as unknown as SigningDocumentRow;
    const status = await getDocumentSourceStatus(admin, document, actor.userId);

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
