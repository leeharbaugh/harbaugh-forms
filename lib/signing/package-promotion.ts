import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import { ensurePreparedDocumentVersion } from "./document-versions";
import {
  buildResponsibleContextMetadata,
  requireSigningEventActorType,
} from "./event-actor";
import { SigningError } from "./errors";
import {
  assertTrustedIntegrity,
  verifyPreparedDocumentVersionIntegrity,
} from "./integrity";
import { requireManageableDraftSigning } from "./manage";
import { appendSigningEvent } from "./signing-events";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export type PromotePackageRevisionResult = {
  packageRevisionId: string;
  revisionNumber: number;
  documentVersionIds: string[];
  reusedVersionIds: string[];
  createdVersionIds: string[];
};

export type DraftBundle = {
  documents: Array<Record<string, unknown>>;
  participants: Array<Record<string, unknown>>;
  fields: Array<Record<string, unknown>>;
};

/** One reason a Draft cannot be promoted (and therefore is not Ready). */
export type DraftPromotionBlocker = {
  code: string;
  message: string;
  documentId?: string;
  participantId?: string;
};

export async function loadDraftBundle(
  admin: SupabaseClient,
  signingId: string,
): Promise<DraftBundle> {
  const [documents, participants, fields] = await Promise.all([
    admin
      .from("signing_documents")
      .select("*")
      .eq("signing_id", signingId)
      .eq("included_in_draft", true)
      .order("display_order", { ascending: true }),
    admin
      .from("signing_participants")
      .select("*")
      .eq("signing_id", signingId)
      .neq("participant_status", "REMOVED")
      .order("display_order", { ascending: true }),
    admin
      .from("signing_draft_fields")
      .select("*")
      .eq("signing_id", signingId),
  ]);

  if (documents.error) throw new Error(documents.error.message);
  if (participants.error) throw new Error(participants.error.message);
  if (fields.error) throw new Error(fields.error.message);

  return {
    documents: documents.data ?? [],
    participants: participants.data ?? [],
    fields: fields.data ?? [],
  };
}

function draftBundleFingerprint(bundle: DraftBundle): string {
  const docs = bundle.documents.map((row) => ({
    id: row.id,
    order: row.display_order,
    name: row.display_name,
    filename: row.filename,
    label: row.logical_label,
    source: row.source_packet_form_id,
  }));
  const participants = bundle.participants.map((row) => ({
    id: row.id,
    order: row.display_order,
    name: row.full_name,
    email: row.email,
    role: row.optional_role,
    user: row.linked_user_id,
    contact: row.linked_contact_id,
  }));
  const fields = [...bundle.fields]
    .map((row) => ({
      id: row.id,
      doc: row.signing_document_id,
      participant: row.signing_participant_id,
      type: row.field_type,
      required: row.is_required,
      page: row.page_number,
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      linked: row.linked_signature_draft_field_id,
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify({ docs, participants, fields });
}

/**
 * Single source of truth for Draft promotion validity.
 * Derived readiness (Stage 4) reports these; promotion throws the first one.
 */
export function collectDraftPromotionBlockers(
  bundle: DraftBundle,
): DraftPromotionBlocker[] {
  const blockers: DraftPromotionBlocker[] = [];

  if (bundle.documents.length === 0) {
    blockers.push({
      code: "NO_DOCUMENTS",
      message: "At least one document is required before promotion.",
    });
  }
  if (bundle.participants.length === 0) {
    blockers.push({
      code: "NO_PARTICIPANTS",
      message: "At least one participant is required before promotion.",
    });
  }

  const documentIds = new Set(bundle.documents.map((row) => row.id as string));
  const participantIds = new Set(
    bundle.participants.map((row) => row.id as string),
  );

  for (const field of bundle.fields) {
    if (!documentIds.has(field.signing_document_id as string)) {
      blockers.push({
        code: "FIELD_DOCUMENT_NOT_INCLUDED",
        message: "Signer field references a document not included in this Draft.",
        documentId: field.signing_document_id as string,
      });
    }
    if (!participantIds.has(field.signing_participant_id as string)) {
      blockers.push({
        code: "FIELD_PARTICIPANT_UNKNOWN",
        message: "Signer field references a participant not in this Signing.",
        participantId: field.signing_participant_id as string,
      });
    }
  }

  for (const participant of bundle.participants) {
    const hasSignatureOrInitials = bundle.fields.some(
      (field) =>
        field.signing_participant_id === participant.id &&
        (field.field_type === "SIGNATURE" || field.field_type === "INITIALS"),
    );
    if (!hasSignatureOrInitials) {
      blockers.push({
        code: "PARTICIPANT_MISSING_SIGNATURE_OR_INITIALS",
        message:
          "Every participant must have at least one Signature or Initials field.",
        participantId: participant.id as string,
      });
    }
  }

  for (const field of bundle.fields) {
    if (field.field_type === "DATE_SIGNED") {
      const linked = bundle.fields.find(
        (candidate) =>
          candidate.id === field.linked_signature_draft_field_id &&
          candidate.field_type === "SIGNATURE",
      );
      if (!linked) {
        blockers.push({
          code: "DATE_SIGNED_NOT_LINKED",
          message:
            "DATE_SIGNED fields require a linked Signature field in this Draft.",
          documentId: field.signing_document_id as string,
          participantId: field.signing_participant_id as string,
        });
        continue;
      }
      if (linked.signing_participant_id !== field.signing_participant_id) {
        blockers.push({
          code: "DATE_SIGNED_PARTICIPANT_MISMATCH",
          message:
            "DATE_SIGNED fields must link to a Signature field for the same participant.",
          documentId: field.signing_document_id as string,
          participantId: field.signing_participant_id as string,
        });
      }
    }
  }

  const orders = bundle.documents.map((row) => row.display_order as number);
  if (new Set(orders).size !== orders.length) {
    blockers.push({
      code: "DUPLICATE_DISPLAY_ORDER",
      message: "Document display order must be unique.",
    });
  }

  return blockers;
}

function validateDraftForPromotion(bundle: DraftBundle) {
  const [blocker] = collectDraftPromotionBlockers(bundle);
  if (blocker) {
    throw new SigningError("VALIDATION_FAILED", blocker.message);
  }
}

/**
 * Discard a never-current incomplete revision snapshot after relational failure.
 * Prepared document versions may remain; they are not package-actionable alone.
 */
export async function abandonIncompleteRevision(
  admin: SupabaseClient,
  signingId: string,
  revisionId: string,
): Promise<void> {
  await admin
    .from("signing_document_versions")
    .update({ introduced_by_package_revision_id: null })
    .eq("signing_id", signingId)
    .eq("introduced_by_package_revision_id", revisionId);

  await admin
    .from("signing_events")
    .delete()
    .eq("signing_id", signingId)
    .eq("package_revision_id", revisionId);

  await admin
    .from("signing_fields")
    .delete()
    .eq("signing_id", signingId)
    .eq("package_revision_id", revisionId);

  await admin
    .from("signing_package_revision_participants")
    .delete()
    .eq("signing_id", signingId)
    .eq("package_revision_id", revisionId);

  await admin
    .from("signing_package_revision_documents")
    .delete()
    .eq("signing_id", signingId)
    .eq("package_revision_id", revisionId);

  await admin
    .from("signing_package_revisions")
    .delete()
    .eq("signing_id", signingId)
    .eq("id", revisionId);
}

/**
 * Internal Stage 3 primitive: build a complete package revision from Draft state.
 * Not Send. Not Begin In-Person Signing. Not a browser activation action.
 *
 * Storage preparation (document versions) runs before relational promotion.
 * The current-revision pointer advances only after the complete snapshot is valid.
 */
export async function promotePackageRevisionFromDraftWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    promotionReason?: "INITIAL" | "AMENDMENT";
    amendmentNote?: unknown;
  },
  admin: SupabaseClient,
): Promise<PromotePackageRevisionResult> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  const promotionReason = input.promotionReason ?? "INITIAL";
  if (promotionReason !== "INITIAL" && promotionReason !== "AMENDMENT") {
    throw new SigningError("INVALID_INPUT", "Invalid promotion reason.");
  }

  const bundle = await loadDraftBundle(admin, signing.id);
  validateDraftForPromotion(bundle);
  const expectedFingerprint = draftBundleFingerprint(bundle);

  const { data: latestRevision, error: latestError } = await admin
    .from("signing_package_revisions")
    .select("revision_number, id")
    .eq("signing_id", signing.id)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(latestError.message);

  const nextRevisionNumber = (latestRevision?.revision_number ?? 0) + 1;
  if (promotionReason === "INITIAL" && nextRevisionNumber !== 1) {
    throw new SigningError(
      "CONFLICT",
      "INITIAL promotion is only valid for Package Revision 1.",
    );
  }
  if (promotionReason === "AMENDMENT" && nextRevisionNumber < 2) {
    throw new SigningError(
      "CONFLICT",
      "AMENDMENT promotion requires an existing package revision.",
    );
  }

  const amendmentNote =
    typeof input.amendmentNote === "string" && input.amendmentNote.trim()
      ? input.amendmentNote.trim()
      : null;

  // Phase 1: prepare/reuse exact document versions (Storage + version rows).
  // Does not create or advance a package revision.
  const reusedVersionIds: string[] = [];
  const createdVersionIds: string[] = [];
  const documentVersionIds: string[] = [];
  const versionByDocumentId = new Map<string, string>();

  for (const document of bundle.documents) {
    const ensured = await ensurePreparedDocumentVersion({
      actor,
      admin,
      signingId: signing.id,
      signingDocumentId: document.id as string,
      creationReason:
        promotionReason === "INITIAL" ? "INITIAL_PREPARE" : "AMENDMENT_PREPARE",
      introducedByPackageRevisionId: null,
    });

    if (ensured.reused) {
      reusedVersionIds.push(ensured.version.id);
    } else {
      createdVersionIds.push(ensured.version.id);
    }

    const integrity = await verifyPreparedDocumentVersionIntegrity(
      admin,
      ensured.version.id,
    );
    assertTrustedIntegrity(integrity);

    documentVersionIds.push(ensured.version.id);
    versionByDocumentId.set(document.id as string, ensured.version.id);
  }

  // Reject concurrent Draft edits before relational promotion begins.
  const refreshedBeforeRevision = await loadDraftBundle(admin, signing.id);
  validateDraftForPromotion(refreshedBeforeRevision);
  if (draftBundleFingerprint(refreshedBeforeRevision) !== expectedFingerprint) {
    throw new SigningError(
      "CONFLICT",
      "Draft preparation changed during promotion. Try again.",
    );
  }

  // Phase 2: relational complete snapshot, then advance current pointer.
  const previousPointer = signing.current_package_revision_id;
  let pointerAdvanced = false;

  const { data: revision, error: revisionError } = await admin
    .from("signing_package_revisions")
    .insert({
      signing_id: signing.id,
      revision_number: nextRevisionNumber,
      predecessor_revision_id: latestRevision?.id ?? null,
      promotion_reason: promotionReason,
      amendment_note: amendmentNote,
      promoted_by_user_id: actor.userId,
      promoted_by_display_name: actor.displayName,
    })
    .select("*")
    .single();

  if (revisionError || !revision) {
    throw new Error(revisionError?.message ?? "Failed to create package revision.");
  }

  try {
    for (const versionId of createdVersionIds) {
      const { error: linkError } = await admin
        .from("signing_document_versions")
        .update({
          introduced_by_package_revision_id: revision.id,
        })
        .eq("id", versionId)
        .eq("signing_id", signing.id)
        .is("introduced_by_package_revision_id", null);
      if (linkError) throw new Error(linkError.message);
    }

    const revisionDocumentIdByDocumentId = new Map<string, string>();
    for (const document of bundle.documents) {
      const { data: revDoc, error: revDocError } = await admin
        .from("signing_package_revision_documents")
        .insert({
          signing_id: signing.id,
          package_revision_id: revision.id,
          signing_document_id: document.id,
          signing_document_version_id: versionByDocumentId.get(
            document.id as string,
          ),
          display_order: document.display_order,
          frozen_display_name:
            (document.display_name as string | null) ??
            (document.logical_label as string | null) ??
            "Document",
          frozen_filename:
            (document.filename as string | null) ?? "document.pdf",
          source_title_snapshot: document.logical_label,
        })
        .select("id, signing_document_id")
        .single();
      if (revDocError || !revDoc) {
        throw new Error(
          revDocError?.message ?? "Failed to freeze revision document.",
        );
      }
      revisionDocumentIdByDocumentId.set(
        revDoc.signing_document_id as string,
        revDoc.id as string,
      );
    }

    const revisionParticipantIdByParticipantId = new Map<string, string>();
    for (const participant of bundle.participants) {
      const { data: revParticipant, error: revParticipantError } = await admin
        .from("signing_package_revision_participants")
        .insert({
          signing_id: signing.id,
          package_revision_id: revision.id,
          signing_participant_id: participant.id,
          display_order: participant.display_order,
          frozen_full_name: participant.full_name,
          frozen_email: participant.email ?? "",
          frozen_optional_role: participant.optional_role,
          frozen_linked_user_id: participant.linked_user_id,
          frozen_linked_contact_id: participant.linked_contact_id,
          frozen_signing_capacity_mode:
            (participant.signing_capacity_mode as string | undefined) ??
            "PERSONAL",
          frozen_represented_party_name:
            (participant.represented_party_name as string | null | undefined) ??
            null,
          frozen_capacity_label:
            (participant.capacity_label as string | null | undefined) ?? null,
          frozen_capacity_wording:
            (participant.capacity_wording as string | null | undefined) ?? null,
        })
        .select("id, signing_participant_id")
        .single();
      if (revParticipantError || !revParticipant) {
        throw new Error(
          revParticipantError?.message ??
            "Failed to freeze revision participant.",
        );
      }
      revisionParticipantIdByParticipantId.set(
        revParticipant.signing_participant_id as string,
        revParticipant.id as string,
      );
    }

    const evidenceFieldIdByDraftFieldId = new Map<string, string>();
    const signatureDraftFields = bundle.fields.filter(
      (field) => field.field_type === "SIGNATURE",
    );
    const otherDraftFields = bundle.fields.filter(
      (field) => field.field_type !== "SIGNATURE",
    );

    for (const field of [...signatureDraftFields, ...otherDraftFields]) {
      const linkedEvidenceId =
        field.field_type === "DATE_SIGNED" &&
        typeof field.linked_signature_draft_field_id === "string"
          ? evidenceFieldIdByDraftFieldId.get(
              field.linked_signature_draft_field_id,
            ) ?? null
          : null;

      const { data: evidenceField, error: fieldError } = await admin
        .from("signing_fields")
        .insert({
          signing_id: signing.id,
          package_revision_id: revision.id,
          package_revision_document_id: revisionDocumentIdByDocumentId.get(
            field.signing_document_id as string,
          ),
          package_revision_participant_id:
            revisionParticipantIdByParticipantId.get(
              field.signing_participant_id as string,
            ),
          field_type: field.field_type,
          is_required: field.is_required,
          page_number: field.page_number,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          linked_signature_field_id: linkedEvidenceId,
        })
        .select("id")
        .single();
      if (fieldError || !evidenceField) {
        throw new Error(fieldError?.message ?? "Failed to freeze signer field.");
      }
      evidenceFieldIdByDraftFieldId.set(
        field.id as string,
        evidenceField.id as string,
      );
    }

    // Final TOCTOU check immediately before advancing the current pointer.
    const refreshedBeforePointer = await loadDraftBundle(admin, signing.id);
    validateDraftForPromotion(refreshedBeforePointer);
    if (draftBundleFingerprint(refreshedBeforePointer) !== expectedFingerprint) {
      throw new SigningError(
        "CONFLICT",
        "Draft preparation changed during promotion. Try again.",
      );
    }

    let pointerQuery = admin
      .from("signings")
      .update({ current_package_revision_id: revision.id })
      .eq("id", signing.id)
      .eq("lifecycle_state", "DRAFT");

    if (previousPointer == null) {
      pointerQuery = pointerQuery.is("current_package_revision_id", null);
    } else {
      pointerQuery = pointerQuery.eq(
        "current_package_revision_id",
        previousPointer,
      );
    }

    const { data: pointerRows, error: pointerError } = await pointerQuery
      .select("id")
      .maybeSingle();
    if (pointerError) {
      throw new Error(pointerError.message);
    }
    if (!pointerRows) {
      throw new SigningError(
        "CONFLICT",
        "Signing current package revision changed during promotion.",
      );
    }
    pointerAdvanced = true;

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
      packageRevisionId: revision.id,
      eventType: "PACKAGE_REVISION_PROMOTED",
      actorType,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      visibility: "BUSINESS",
      summary: `Package revision ${nextRevisionNumber} promoted`,
      detailsJson: responsibleMeta,
    });
  } catch (error) {
    // Roll back this invocation's pointer first (RESTRICT FK), and only when we
    // advanced it — never regress a concurrently promoted current revision.
    if (pointerAdvanced) {
      await admin
        .from("signings")
        .update({ current_package_revision_id: previousPointer })
        .eq("id", signing.id)
        .eq("current_package_revision_id", revision.id as string);
    }
    await abandonIncompleteRevision(admin, signing.id, revision.id as string);
    throw error;
  }

  return {
    packageRevisionId: revision.id as string,
    revisionNumber: nextRevisionNumber,
    documentVersionIds,
    reusedVersionIds,
    createdVersionIds,
  };
}

/**
 * Undo a promotion that succeeded while a later activation step failed.
 * Regresses this invocation's current-revision pointer, then discards the
 * revision snapshot so the Signing remains a clean Draft.
 */
export async function abandonPromotedRevisionAfterFailedActivation(options: {
  admin: SupabaseClient;
  signingId: string;
  packageRevisionId: string;
  previousPackageRevisionId: string | null;
}): Promise<void> {
  await options.admin
    .from("signings")
    .update({
      current_package_revision_id: options.previousPackageRevisionId,
    })
    .eq("id", options.signingId)
    .eq("current_package_revision_id", options.packageRevisionId);

  await abandonIncompleteRevision(
    options.admin,
    options.signingId,
    options.packageRevisionId,
  );
}

/** Convenience guard for callers/tests. */
export function assertSigningId(value: unknown): string {
  if (!isUuid(value)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }
  return value;
}
