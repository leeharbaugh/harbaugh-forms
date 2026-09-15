import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadDraftSourceSnapshotById,
  renderPreparedPdfFromDraftSnapshot,
} from "./draft-source-snapshots";
import { SigningError } from "./errors";
import {
  assertTrustedIntegrity,
  verifyPreparedDocumentVersionIntegrity,
} from "./integrity";
import {
  buildPreparedVersionObjectKey,
  newOpaqueId,
  requireSelectedDraftSourceSnapshotId,
  uploadPreparedPdfObject,
} from "./prepare-pdf";
import type { SigningActor } from "./types";

export type SigningDocumentVersionRow = {
  id: string;
  signing_id: string;
  signing_document_id: string;
  version_number: number;
  content_sha256: string | null;
  storage_object_key: string | null;
  byte_size: number | null;
  page_count: number | null;
  creation_reason: string;
  introduced_by_package_revision_id: string | null;
};

export type EnsurePreparedVersionResult = {
  version: SigningDocumentVersionRow;
  reused: boolean;
  orphanObjectKeys: string[];
};

/**
 * Create or reuse an immutable prepared document version for one logical
 * Signing Document. Reuse is scoped to the same signing_document only.
 * Does not advance package-revision pointers.
 *
 * Stage 4: prepared bytes are rendered from the document's selected Draft
 * source snapshot, never from live Packet Form content.
 */
export async function ensurePreparedDocumentVersion(options: {
  actor: SigningActor;
  admin: SupabaseClient;
  signingId: string;
  signingDocumentId: string;
  creationReason?: "INITIAL_PREPARE" | "AMENDMENT_PREPARE" | "REPREPARE";
  introducedByPackageRevisionId?: string | null;
}): Promise<EnsurePreparedVersionResult> {
  const orphanObjectKeys: string[] = [];
  const creationReason = options.creationReason ?? "INITIAL_PREPARE";

  const { data: document, error: documentError } = await options.admin
    .from("signing_documents")
    .select("*")
    .eq("id", options.signingDocumentId)
    .eq("signing_id", options.signingId)
    .maybeSingle();

  if (documentError) {
    throw new Error(documentError.message);
  }
  if (!document) {
    throw new SigningError("NOT_FOUND", "Signing document not found.");
  }
  if (!document.source_packet_form_id) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "Signing document is missing a source Packet Form.",
    );
  }

  const snapshotId = requireSelectedDraftSourceSnapshotId(document);
  const snapshot = await loadDraftSourceSnapshotById(
    options.admin,
    options.signingId,
    snapshotId,
  );
  if (!snapshot) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "The selected Draft source snapshot for this document is missing.",
    );
  }

  const prepared = await renderPreparedPdfFromDraftSnapshot({
    admin: options.admin,
    snapshot,
  });

  const { data: existingVersions, error: existingError } = await options.admin
    .from("signing_document_versions")
    .select("*")
    .eq("signing_document_id", options.signingDocumentId)
    .eq("signing_id", options.signingId)
    .order("version_number", { ascending: false });

  if (existingError) {
    throw new Error(existingError.message);
  }

  for (const candidate of existingVersions ?? []) {
    if (candidate.content_sha256 !== prepared.contentSha256) {
      continue;
    }
    const integrity = await verifyPreparedDocumentVersionIntegrity(
      options.admin,
      candidate.id,
    );
    if (integrity.trusted) {
      return {
        version: candidate as SigningDocumentVersionRow,
        reused: true,
        orphanObjectKeys,
      };
    }
    // Mismatch: do not reuse and do not rewrite the recorded hash.
  }

  const versionId = newOpaqueId();
  const objectKey = buildPreparedVersionObjectKey({
    signingId: options.signingId,
    documentId: options.signingDocumentId,
    versionId,
  });

  await uploadPreparedPdfObject({
    admin: options.admin,
    objectKey,
    bytes: prepared.bytes,
    contentSha256: prepared.contentSha256,
  });

  const nextVersionNumber =
    ((existingVersions?.[0]?.version_number as number | undefined) ?? 0) + 1;

  const { data: inserted, error: insertError } = await options.admin
    .from("signing_document_versions")
    .insert({
      id: versionId,
      signing_id: options.signingId,
      signing_document_id: options.signingDocumentId,
      version_number: nextVersionNumber,
      creation_reason: creationReason,
      introduced_by_package_revision_id:
        options.introducedByPackageRevisionId ?? null,
      source_packet_form_id: prepared.sourcePacketFormId,
      source_document_name_snapshot: prepared.sourceDocumentName,
      storage_bucket: "signing-artifacts",
      storage_object_key: objectKey,
      content_sha256: prepared.contentSha256,
      byte_size: prepared.byteSize,
      page_count: prepared.pageCount,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    orphanObjectKeys.push(objectKey);
    await options.admin.storage
      .from("signing-artifacts")
      .remove([objectKey]);
    throw new Error(insertError?.message ?? "Failed to create document version.");
  }

  // Mark prior current versions as superseded by lineage pointer when creating new.
  const prior = (existingVersions ?? []).find(
    (row) => row.superseded_by_version_id == null,
  );
  if (prior) {
    await options.admin
      .from("signing_document_versions")
      .update({ superseded_by_version_id: versionId })
      .eq("id", prior.id)
      .eq("signing_id", options.signingId);
  }

  assertTrustedIntegrity(
    await verifyPreparedDocumentVersionIntegrity(options.admin, versionId),
  );

  return {
    version: inserted as SigningDocumentVersionRow,
    reused: false,
    orphanObjectKeys,
  };
}
