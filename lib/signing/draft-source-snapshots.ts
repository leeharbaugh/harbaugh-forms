/**
 * Native Signing Stage 4 Draft source snapshots.
 *
 * A Draft source snapshot is reproducible Signing-owned preparation state:
 * the exact source PDF bytes plus the canonical render inputs that produced a
 * document's appearance at capture time. It is NOT a signing_document_version,
 * NOT a package revision, and NOT signer evidence.
 *
 * Immutable bytes are not the same thing as evidence. A snapshot's bytes never
 * change after capture, yet the snapshot remains *preparation history*: it
 * records how the agent set the package up, not what a participant agreed to.
 * The evidentiary artifact is the prepared `signing_document_version` frozen
 * into a package revision at activation (see document-versions.ts). Storage
 * namespaces keep the two apart: `.../draft-snapshots/{id}/source.pdf` here
 * versus `.../versions/{id}.pdf` for versions. Superseded snapshots are retained
 * for audit/debug of preparation until a later retention policy prunes them, and
 * they are deleted outright when an evidence-free document is removed.
 *
 * Live packet_form edits never silently update a captured snapshot. Drift is
 * surfaced through content fingerprints (see source-drift.ts) and resolved
 * explicitly by Keep Current or Update to Latest.
 *
 * Server-only module: it reads Storage with a privileged client and loads the
 * server font. Never import it from a Client Component.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { fillPacketFormPdfBytes } from "@/lib/fill-packet-form-pdf";
import { loadPacketFormEditorData } from "@/lib/packet-form-editor";
import { GENERATED_DOCUMENTS_BUCKET } from "@/lib/packet-form-storage";
import { loadCaveatSignatureFontBytesServer } from "@/lib/signature-font-server";
import { downloadStorageBytesWithFallback } from "@/lib/storage-path-resolve";
import {
  computeDraftContentFingerprint,
  draftSnapshotAnnotationToPacketFormAnnotation,
  draftSnapshotFieldToFieldView,
  parseDraftSnapshotAnnotations,
  parseDraftSnapshotFields,
  toDraftSnapshotAnnotation,
  toDraftSnapshotField,
  type DraftSnapshotAnnotation,
  type DraftSnapshotField,
} from "./draft-source-fingerprint";
import { SigningError } from "./errors";
import {
  newOpaqueId,
  sha256Hex,
  uploadPreparedPdfObject,
  type PreparedPdfResult,
} from "./prepare-pdf";
import { SIGNING_ARTIFACTS_BUCKET } from "./stage1-schema";

export type DraftSourceSnapshotRow = {
  id: string;
  create_date: string;
  signing_id: string;
  signing_document_id: string;
  source_packet_form_id: number | null;
  source_packet_id: number | null;
  form_id: number | null;
  document_name_snapshot: string;
  source_pdf_storage_bucket: string;
  source_pdf_object_key: string;
  source_pdf_sha256: string;
  source_pdf_byte_size: number;
  field_views_json: unknown;
  annotations_json: unknown;
  content_fingerprint: string;
};

export type CapturedDraftSourceState = {
  sourcePacketFormId: number | null;
  sourcePacketId: number | null;
  formId: number | null;
  documentName: string;
  sourcePdfBytes: Uint8Array;
  sourcePdfSha256: string;
  sourcePdfByteSize: number;
  fields: DraftSnapshotField[];
  annotations: DraftSnapshotAnnotation[];
  contentFingerprint: string;
  /** packet_forms.update_date observed on both sides of the capture; null for ad hoc. */
  sourceUpdatedAt: string | null;
};

/**
 * Draft snapshot bytes live under a `draft-snapshots/` namespace, deliberately
 * separate from the evidentiary `versions/` namespace written by
 * `buildPreparedVersionObjectKey`. Snapshot bytes are immutable once written,
 * but immutability is not evidentiary status: see `isDraftSourceObjectKey` /
 * `isPreparedVersionObjectKey` in stage1-schema.ts.
 */
export function buildDraftSourceObjectKey(options: {
  signingId: string;
  documentId: string;
  snapshotId: string;
}): string {
  // Opaque UUID path segments only — no participant or document names.
  return [
    "signings",
    options.signingId,
    "documents",
    options.documentId,
    "draft-snapshots",
    options.snapshotId,
    "source.pdf",
  ].join("/");
}

/**
 * Signing-owned ad hoc Draft PDF bytes. Distinct from Packet-derived
 * `draft-snapshots/` and evidentiary `versions/` namespaces.
 */
export function buildAdHocDraftSourceObjectKey(options: {
  signingId: string;
  documentId: string;
  snapshotId: string;
}): string {
  return [
    "signings",
    options.signingId,
    "documents",
    options.documentId,
    "draft-ad-hoc",
    options.snapshotId,
    "source.pdf",
  ].join("/");
}

type LivePacketFormSource = {
  id: number;
  packet_id: number;
  form_id: number | null;
  document_name: string;
  storage_path: string | null;
  update_date: string;
  ownerUserId: string;
};

async function loadLivePacketFormSource(
  admin: SupabaseClient,
  packetFormId: number,
  expectedOwnerUserId: string,
): Promise<LivePacketFormSource> {
  const { data: packetForm, error } = await admin
    .from("packet_forms")
    .select(
      "id, packet_id, form_id, document_name, storage_path, status, update_date, packets!inner(owner_user_id, status)",
    )
    .eq("id", packetFormId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!packetForm || packetForm.status === "DELETED") {
    throw new SigningError(
      "INVALID_PACKET",
      "The source Packet Form is not available.",
    );
  }

  const packet = Array.isArray(packetForm.packets)
    ? packetForm.packets[0]
    : packetForm.packets;
  if (!packet || packet.status === "DELETED") {
    throw new SigningError("INVALID_PACKET", "The source Packet is not available.");
  }
  if (packet.owner_user_id !== expectedOwnerUserId) {
    throw new SigningError(
      "INVALID_PACKET",
      "The source Packet Form is not available to this Signing.",
    );
  }
  if (!packetForm.storage_path) {
    throw new SigningError(
      "INVALID_PACKET",
      "The source Packet Form does not have a stored PDF yet.",
    );
  }

  return {
    id: packetForm.id as number,
    packet_id: packetForm.packet_id as number,
    form_id: (packetForm.form_id as number | null) ?? null,
    document_name: String(packetForm.document_name ?? "Document"),
    storage_path: packetForm.storage_path as string,
    update_date: packetForm.update_date as string,
    ownerUserId: packet.owner_user_id as string,
  };
}

async function assertPacketFormUnchanged(
  admin: SupabaseClient,
  packetFormId: number,
  expectedUpdatedAt: string,
): Promise<void> {
  const { data: after, error } = await admin
    .from("packet_forms")
    .select("update_date, status")
    .eq("id", packetFormId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (
    !after ||
    after.status === "DELETED" ||
    after.update_date !== expectedUpdatedAt
  ) {
    throw new SigningError(
      "STALE_SOURCE",
      "The source Packet Form changed while capturing the Draft source. Try again.",
    );
  }
}

/**
 * Capture the live render inputs for one packet_form.
 *
 * Only inputs are captured — never a filled PDF. Rendering happens later, from
 * the snapshot, so promotion never depends on live packet_form content.
 *
 * TOCTOU: packet_forms.update_date is compared before and after loading, and
 * the fingerprint is recomputed from the loaded values, so a concurrent Fill
 * Form edit fails closed with STALE_SOURCE instead of producing a torn capture.
 */
export async function captureLivePacketFormRenderState(
  admin: SupabaseClient,
  packetFormId: number,
  expectedOwnerUserId: string,
): Promise<CapturedDraftSourceState> {
  const source = await loadLivePacketFormSource(
    admin,
    packetFormId,
    expectedOwnerUserId,
  );

  const { bytes: sourcePdfBytes } = await downloadStorageBytesWithFallback(admin, {
    bucket: GENERATED_DOCUMENTS_BUCKET,
    entityType: "PACKET_FORM",
    entityId: source.id,
    packetId: source.packet_id,
    path: source.storage_path as string,
    ownerUserId: source.ownerUserId,
    formId: source.form_id,
    documentName: source.document_name,
  });

  let fields: DraftSnapshotField[] = [];
  let annotations: DraftSnapshotAnnotation[] = [];

  // External uploads have no template form: the stored PDF is the render output
  // and there are no field/annotation inputs to snapshot.
  if (source.form_id != null) {
    let editorData: Awaited<ReturnType<typeof loadPacketFormEditorData>>;
    try {
      editorData = await loadPacketFormEditorData(admin, source.id);
    } catch (error) {
      console.error(
        "[native-signing-stage4] failed to load live render inputs:",
        error instanceof Error ? error.message : "unknown error",
      );
      throw new SigningError(
        "INVALID_PACKET",
        "The source Packet Form could not be prepared for Signing.",
      );
    }
    if (editorData.packetForm.packet_id !== source.packet_id) {
      throw new SigningError(
        "INVALID_PACKET",
        "The source Packet Form does not belong to its Packet.",
      );
    }
    fields = editorData.fields.map(toDraftSnapshotField);
    annotations = editorData.annotations.map(toDraftSnapshotAnnotation);
  }

  await assertPacketFormUnchanged(admin, source.id, source.update_date);

  const sourcePdfSha256 = sha256Hex(sourcePdfBytes);
  const contentFingerprint = computeDraftContentFingerprint({
    sourcePdfSha256,
    fieldViews: fields,
    annotations,
  });

  return {
    sourcePacketFormId: source.id,
    sourcePacketId: source.packet_id,
    formId: source.form_id,
    documentName: source.document_name,
    sourcePdfBytes,
    sourcePdfSha256,
    sourcePdfByteSize: sourcePdfBytes.byteLength,
    fields,
    annotations,
    contentFingerprint,
    sourceUpdatedAt: source.update_date,
  };
}

/**
 * Live fingerprint for drift comparison only. Returns null when the live source
 * can no longer be read or reproduced, which callers treat as SOURCE_UNAVAILABLE
 * and therefore fail closed.
 */
export async function computeLiveContentFingerprintForPacketForm(
  admin: SupabaseClient,
  packetFormId: number,
  expectedOwnerUserId: string,
): Promise<string | null> {
  try {
    const captured = await captureLivePacketFormRenderState(
      admin,
      packetFormId,
      expectedOwnerUserId,
    );
    return captured.contentFingerprint;
  } catch (error) {
    console.error(
      "[native-signing-stage4] live source fingerprint unavailable:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}

export async function persistDraftSourceSnapshot(options: {
  admin: SupabaseClient;
  signingId: string;
  signingDocumentId: string;
  captured: CapturedDraftSourceState;
}): Promise<DraftSourceSnapshotRow> {
  const snapshotId = newOpaqueId();
  const isAdHoc =
    options.captured.sourcePacketFormId == null &&
    options.captured.sourcePacketId == null;
  const objectKey = isAdHoc
    ? buildAdHocDraftSourceObjectKey({
        signingId: options.signingId,
        documentId: options.signingDocumentId,
        snapshotId,
      })
    : buildDraftSourceObjectKey({
        signingId: options.signingId,
        documentId: options.signingDocumentId,
        snapshotId,
      });

  await uploadPreparedPdfObject({
    admin: options.admin,
    objectKey,
    bytes: options.captured.sourcePdfBytes,
    contentSha256: options.captured.sourcePdfSha256,
  });

  const { data: inserted, error } = await options.admin
    .from("signing_draft_source_snapshots")
    .insert({
      id: snapshotId,
      signing_id: options.signingId,
      signing_document_id: options.signingDocumentId,
      source_packet_form_id: options.captured.sourcePacketFormId,
      source_packet_id: options.captured.sourcePacketId,
      form_id: options.captured.formId,
      document_name_snapshot: options.captured.documentName,
      source_pdf_storage_bucket: SIGNING_ARTIFACTS_BUCKET,
      source_pdf_object_key: objectKey,
      source_pdf_sha256: options.captured.sourcePdfSha256,
      source_pdf_byte_size: options.captured.sourcePdfByteSize,
      field_views_json: options.captured.fields,
      annotations_json: options.captured.annotations,
      content_fingerprint: options.captured.contentFingerprint,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    await options.admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .remove([objectKey]);
    throw new Error(error?.message ?? "Failed to record Draft source snapshot.");
  }

  return inserted as DraftSourceSnapshotRow;
}

/**
 * Point a Draft document at a snapshot. Selecting a snapshot always clears a
 * previous Keep Current acknowledgement: the acknowledgement is scoped to the
 * exact live fingerprint that was accepted against the previous selection.
 */
export async function selectDraftSourceSnapshotOnDocument(
  admin: SupabaseClient,
  signingId: string,
  signingDocumentId: string,
  snapshotId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("signing_documents")
    .update({
      selected_draft_source_snapshot_id: snapshotId,
      acknowledged_live_content_fingerprint: null,
    })
    .eq("id", signingDocumentId)
    .eq("signing_id", signingId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new SigningError("NOT_FOUND", "Signing document not found.");
  }
}

export async function loadDraftSourceSnapshotById(
  admin: SupabaseClient,
  signingId: string,
  snapshotId: string,
): Promise<DraftSourceSnapshotRow | null> {
  const { data, error } = await admin
    .from("signing_draft_source_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .eq("signing_id", signingId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as DraftSourceSnapshotRow | null) ?? null;
}

export async function loadSelectedDraftSourceSnapshot(
  admin: SupabaseClient,
  signingId: string,
  signingDocumentId: string,
): Promise<DraftSourceSnapshotRow | null> {
  const { data: document, error } = await admin
    .from("signing_documents")
    .select("id, selected_draft_source_snapshot_id")
    .eq("id", signingDocumentId)
    .eq("signing_id", signingId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!document) {
    throw new SigningError("NOT_FOUND", "Signing document not found.");
  }
  const snapshotId = document.selected_draft_source_snapshot_id as
    | string
    | null;
  if (!snapshotId) {
    return null;
  }
  return loadDraftSourceSnapshotById(admin, signingId, snapshotId);
}

/**
 * Capture the current live render state and select it for this document.
 * Used when a document is first added and by Update to Latest.
 */
export async function captureAndSelectDraftSourceSnapshot(options: {
  admin: SupabaseClient;
  signingId: string;
  signingDocumentId: string;
  packetFormId: number;
  expectedOwnerUserId: string;
}): Promise<DraftSourceSnapshotRow> {
  const captured = await captureLivePacketFormRenderState(
    options.admin,
    options.packetFormId,
    options.expectedOwnerUserId,
  );
  const snapshot = await persistDraftSourceSnapshot({
    admin: options.admin,
    signingId: options.signingId,
    signingDocumentId: options.signingDocumentId,
    captured,
  });
  await selectDraftSourceSnapshotOnDocument(
    options.admin,
    options.signingId,
    options.signingDocumentId,
    snapshot.id,
  );
  return snapshot;
}

/**
 * Capture an ad hoc uploaded PDF as a Signing-owned Draft source snapshot.
 * Empty render inputs: the uploaded bytes are the prepared appearance.
 */
export async function captureAndSelectAdHocDraftSourceSnapshot(options: {
  admin: SupabaseClient;
  signingId: string;
  signingDocumentId: string;
  documentName: string;
  sourcePdfBytes: Uint8Array;
}): Promise<DraftSourceSnapshotRow> {
  // Reject encrypted / unloadable PDFs up front so Draft never holds bad source.
  let pageCount = 0;
  try {
    const pdf = await PDFDocument.load(options.sourcePdfBytes, {
      ignoreEncryption: false,
    });
    pageCount = pdf.getPageCount();
  } catch {
    throw new SigningError(
      "VALIDATION_FAILED",
      "The uploaded file is not a usable PDF.",
    );
  }
  if (pageCount < 1) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "The uploaded PDF has no pages.",
    );
  }
  if (pageCount > 200) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "The uploaded PDF has too many pages (maximum 200).",
    );
  }

  const sourcePdfSha256 = sha256Hex(options.sourcePdfBytes);
  const contentFingerprint = computeDraftContentFingerprint({
    sourcePdfSha256,
    fieldViews: [],
    annotations: [],
  });

  const captured: CapturedDraftSourceState = {
    sourcePacketFormId: null,
    sourcePacketId: null,
    formId: null,
    documentName: options.documentName,
    sourcePdfBytes: options.sourcePdfBytes,
    sourcePdfSha256,
    sourcePdfByteSize: options.sourcePdfBytes.byteLength,
    fields: [],
    annotations: [],
    contentFingerprint,
    sourceUpdatedAt: null,
  };

  const snapshot = await persistDraftSourceSnapshot({
    admin: options.admin,
    signingId: options.signingId,
    signingDocumentId: options.signingDocumentId,
    captured,
  });
  await selectDraftSourceSnapshotOnDocument(
    options.admin,
    options.signingId,
    options.signingDocumentId,
    snapshot.id,
  );
  return snapshot;
}

/**
 * Render prepared PDF bytes from a Draft source snapshot.
 * This is the only rendering path allowed for promotion/activation.
 */
export async function renderPreparedPdfFromDraftSnapshot(options: {
  admin: SupabaseClient;
  snapshot: DraftSourceSnapshotRow;
}): Promise<PreparedPdfResult> {
  const bucket =
    options.snapshot.source_pdf_storage_bucket || SIGNING_ARTIFACTS_BUCKET;
  const { data: downloaded, error } = await options.admin.storage
    .from(bucket)
    .download(options.snapshot.source_pdf_object_key);

  if (error || !downloaded) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "The Draft source snapshot PDF is no longer available.",
    );
  }

  const sourceBytes = new Uint8Array(await downloaded.arrayBuffer());
  if (sha256Hex(sourceBytes) !== options.snapshot.source_pdf_sha256) {
    throw new SigningError(
      "INTEGRITY_MISMATCH",
      "The Draft source snapshot PDF failed integrity verification.",
    );
  }

  const fields = parseDraftSnapshotFields(options.snapshot.field_views_json);
  const annotations = parseDraftSnapshotAnnotations(
    options.snapshot.annotations_json,
  );

  // No render inputs (external upload): the snapshot bytes are the prepared
  // bytes, matching Fill Form download behavior and keeping bytes reusable.
  let bytes: Uint8Array = sourceBytes;
  if (fields.length > 0 || annotations.length > 0) {
    bytes = await fillPacketFormPdfBytes(
      sourceBytes,
      fields.map(draftSnapshotFieldToFieldView),
      {
        annotations: annotations.map(
          draftSnapshotAnnotationToPacketFormAnnotation,
        ),
        signatureFontBytes: await loadCaveatSignatureFontBytesServer(),
      },
    );
  }

  const pdf = await PDFDocument.load(bytes);

  return {
    bytes,
    contentSha256: sha256Hex(bytes),
    byteSize: bytes.byteLength,
    pageCount: pdf.getPageCount(),
    sourcePacketFormId: options.snapshot.source_packet_form_id ?? null,
    sourceDocumentName: options.snapshot.document_name_snapshot,
    sourceUpdatedAt: options.snapshot.create_date,
  };
}

/**
 * Promotion entry point: render from the document's selected Draft snapshot.
 * Fails closed when no snapshot is selected so live content can never be
 * promoted by accident.
 */
export async function renderPreparedPdfFromSelectedDraftSnapshot(options: {
  admin: SupabaseClient;
  signingId: string;
  signingDocumentId: string;
}): Promise<PreparedPdfResult> {
  const snapshot = await loadSelectedDraftSourceSnapshot(
    options.admin,
    options.signingId,
    options.signingDocumentId,
  );
  if (!snapshot) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "This document has no selected Draft source snapshot.",
    );
  }
  return renderPreparedPdfFromDraftSnapshot({
    admin: options.admin,
    snapshot,
  });
}
