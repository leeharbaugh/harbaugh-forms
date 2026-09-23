/**
 * Manager Draft Signing preview (non-evidentiary).
 *
 * Renders from each document's selected Draft source snapshot — the same
 * source activation would consume — and overlays current signing_draft_fields.
 * Never creates package revisions, document versions, credentials, or work items.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import type { SigningCapacityLabel, SigningCapacityMode } from "./capacity-notices";
import { renderPreparedPdfFromSelectedDraftSnapshot } from "./draft-source-snapshots";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export type SigningPreviewField = {
  id: string;
  fieldType: "SIGNATURE" | "INITIALS" | "DATE_SIGNED";
  isRequired: boolean;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  participantId: string;
  participantFullName: string;
  capacityMode: SigningCapacityMode;
  representedPartyName: string | null;
  capacityLabel: SigningCapacityLabel | null;
};

export type SigningPreviewDocument = {
  id: string;
  displayName: string;
  displayOrder: number;
  pageCount: number | null;
  hasSelectedSnapshot: boolean;
  fields: SigningPreviewField[];
};

export type SigningPreviewModel = {
  signingId: string;
  title: string;
  documents: SigningPreviewDocument[];
};

async function requireDraftPreviewAuthority(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
) {
  assertNativeSigningEnabled();
  if (!isUuid(signingIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }
  const bundle = await loadSigningAuthorityBundle(admin, actor, signingIdRaw);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!bundle.authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot preview this Signing.");
  }
  if (bundle.signing.lifecycle_state !== "DRAFT") {
    throw new SigningError(
      "CONFLICT",
      "Signing preview is available while the Signing is being prepared.",
    );
  }
  return bundle;
}

/**
 * Load the manager preview model for a Draft Signing.
 * Read-only: does not write Signing rows or evidence.
 */
export async function loadSigningPreviewForActor(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
): Promise<SigningPreviewModel> {
  const bundle = await requireDraftPreviewAuthority(actor, signingIdRaw, admin);
  const signingId = bundle.signing.id;

  const [
    { data: documentRows, error: documentError },
    { data: participantRows, error: participantError },
    { data: fieldRows, error: fieldError },
  ] = await Promise.all([
    admin
      .from("signing_documents")
      .select(
        "id, display_name, logical_label, display_order, selected_draft_source_snapshot_id",
      )
      .eq("signing_id", signingId)
      .eq("included_in_draft", true)
      .order("display_order", { ascending: true }),
    admin
      .from("signing_participants")
      .select(
        "id, full_name, signing_capacity_mode, represented_party_name, capacity_label",
      )
      .eq("signing_id", signingId)
      .neq("participant_status", "REMOVED"),
    admin
      .from("signing_draft_fields")
      .select(
        "id, signing_document_id, signing_participant_id, field_type, is_required, page_number, x, y, width, height",
      )
      .eq("signing_id", signingId),
  ]);

  if (documentError) throw new Error(documentError.message);
  if (participantError) throw new Error(participantError.message);
  if (fieldError) throw new Error(fieldError.message);

  const participantsById = new Map(
    (participantRows ?? []).map((row) => [
      row.id as string,
      {
        fullName: row.full_name as string,
        capacityMode:
          (row.signing_capacity_mode as SigningCapacityMode | null) ??
          "PERSONAL",
        representedPartyName:
          (row.represented_party_name as string | null) ?? null,
        capacityLabel:
          (row.capacity_label as SigningCapacityLabel | null) ?? null,
      },
    ]),
  );

  const fieldsByDocument = new Map<string, SigningPreviewField[]>();
  for (const row of fieldRows ?? []) {
    const participant = participantsById.get(
      row.signing_participant_id as string,
    );
    if (!participant) continue;
    const documentId = row.signing_document_id as string;
    const list = fieldsByDocument.get(documentId) ?? [];
    list.push({
      id: row.id as string,
      fieldType: row.field_type as SigningPreviewField["fieldType"],
      isRequired: Boolean(row.is_required),
      pageNumber: row.page_number as number,
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
      participantId: row.signing_participant_id as string,
      participantFullName: participant.fullName,
      capacityMode: participant.capacityMode,
      representedPartyName: participant.representedPartyName,
      capacityLabel: participant.capacityLabel,
    });
    fieldsByDocument.set(documentId, list);
  }

  const documents: SigningPreviewDocument[] = (documentRows ?? []).map(
    (row) => {
      const documentId = row.id as string;
      const fields = (fieldsByDocument.get(documentId) ?? []).sort((a, b) => {
        if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });
      return {
        id: documentId,
        displayName:
          (row.display_name as string | null) ??
          (row.logical_label as string | null) ??
          "Document",
        displayOrder: row.display_order as number,
        pageCount: null,
        hasSelectedSnapshot: Boolean(row.selected_draft_source_snapshot_id),
        fields,
      };
    },
  );

  return {
    signingId,
    title: bundle.signing.title,
    documents,
  };
}

/**
 * Render preview PDF bytes from the selected Draft source snapshot only.
 * In-memory render — does not persist versions, revisions, or artifacts.
 */
export async function loadDraftPreviewDocumentBytes(options: {
  actor: SigningActor;
  signingId: unknown;
  signingDocumentId: unknown;
  admin: SupabaseClient;
}): Promise<{ bytes: Uint8Array; filename: string; pageCount: number }> {
  const bundle = await requireDraftPreviewAuthority(
    options.actor,
    options.signingId,
    options.admin,
  );
  if (!isUuid(options.signingDocumentId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing document id.");
  }

  const { data: document, error } = await options.admin
    .from("signing_documents")
    .select(
      "id, display_name, filename, included_in_draft, selected_draft_source_snapshot_id",
    )
    .eq("id", options.signingDocumentId)
    .eq("signing_id", bundle.signing.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!document || document.included_in_draft !== true) {
    throw new SigningError("NOT_FOUND", "Signing document not found.");
  }
  if (!document.selected_draft_source_snapshot_id) {
    throw new SigningError(
      "NOT_READY",
      "This document has no selected Draft source snapshot to preview.",
    );
  }

  const prepared = await renderPreparedPdfFromSelectedDraftSnapshot({
    admin: options.admin,
    signingId: bundle.signing.id,
    signingDocumentId: document.id as string,
  });

  const filename =
    (document.filename as string | null)?.trim() ||
    `${String(document.display_name ?? "document").replace(/[^\w.-]+/g, "_")}.pdf`;

  return {
    bytes: prepared.bytes,
    filename,
    pageCount: prepared.pageCount,
  };
}
