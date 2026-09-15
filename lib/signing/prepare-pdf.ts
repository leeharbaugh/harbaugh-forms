import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { getFilledPacketFormPdfBytes } from "@/lib/packet-form-download";
import { SigningError } from "./errors";
import { SIGNING_ARTIFACTS_BUCKET } from "./stage1-schema";

export type PreparedPdfResult = {
  bytes: Uint8Array;
  contentSha256: string;
  byteSize: number;
  pageCount: number;
  sourcePacketFormId: number;
  sourceDocumentName: string;
  sourceUpdatedAt: string;
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildPreparedVersionObjectKey(options: {
  signingId: string;
  documentId: string;
  versionId: string;
}): string {
  // Opaque UUID path segments only — no participant or document names.
  return [
    "signings",
    options.signingId,
    "documents",
    options.documentId,
    "versions",
    `${options.versionId}.pdf`,
  ].join("/");
}

/**
 * Render exact prepared PDF bytes for a source packet_form using the proven
 * Fill Form pipeline (field overlays + ACTIVE working-document annotations).
 * Ceremony Signature/Initials marks are NOT applied here.
 */
export async function renderPreparedPacketFormPdf(options: {
  admin: SupabaseClient;
  packetFormId: number;
  expectedOwnerUserId: string;
}): Promise<PreparedPdfResult> {
  const { data: packetForm, error } = await options.admin
    .from("packet_forms")
    .select(
      "id, packet_id, form_id, document_name, storage_path, status, update_date, packets!inner(owner_user_id, status)",
    )
    .eq("id", options.packetFormId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!packetForm || packetForm.status === "DELETED") {
    throw new SigningError("INVALID_PACKET", "The source Packet Form is not available.");
  }

  const packet = Array.isArray(packetForm.packets)
    ? packetForm.packets[0]
    : packetForm.packets;
  if (!packet || packet.status === "DELETED") {
    throw new SigningError("INVALID_PACKET", "The source Packet is not available.");
  }
  if (packet.owner_user_id !== options.expectedOwnerUserId) {
    throw new SigningError(
      "INVALID_PACKET",
      "The source Packet Form is not available to this Signing.",
    );
  }

  const sourceUpdatedAt = packetForm.update_date as string;
  const bytes = await getFilledPacketFormPdfBytes(options.admin, {
    id: packetForm.id as number,
    packet_id: packetForm.packet_id as number,
    form_id: packetForm.form_id as number,
    document_name: packetForm.document_name as string,
    storage_path: packetForm.storage_path as string,
    owner_user_id: packet.owner_user_id as string,
  });

  // Stale-write guard: reject if working document changed during render.
  const { data: after, error: afterError } = await options.admin
    .from("packet_forms")
    .select("update_date, status")
    .eq("id", options.packetFormId)
    .maybeSingle();
  if (afterError) {
    throw new Error(afterError.message);
  }
  if (!after || after.status === "DELETED" || after.update_date !== sourceUpdatedAt) {
    throw new SigningError(
      "STALE_SOURCE",
      "The source Packet Form changed while preparing the PDF. Try again.",
    );
  }

  const pdf = await PDFDocument.load(bytes);
  const contentSha256 = sha256Hex(bytes);

  return {
    bytes,
    contentSha256,
    byteSize: bytes.byteLength,
    pageCount: pdf.getPageCount(),
    sourcePacketFormId: options.packetFormId,
    sourceDocumentName: String(packetForm.document_name ?? "Document"),
    sourceUpdatedAt,
  };
}

export async function uploadPreparedPdfObject(options: {
  admin: SupabaseClient;
  objectKey: string;
  bytes: Uint8Array;
  contentSha256: string;
}): Promise<void> {
  const { error } = await options.admin.storage
    .from(SIGNING_ARTIFACTS_BUCKET)
    .upload(options.objectKey, options.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data: downloaded, error: downloadError } = await options.admin.storage
    .from(SIGNING_ARTIFACTS_BUCKET)
    .download(options.objectKey);

  if (downloadError || !downloaded) {
    await options.admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .remove([options.objectKey]);
    throw new Error(downloadError?.message ?? "Failed to verify uploaded prepared PDF.");
  }

  const verified = new Uint8Array(await downloaded.arrayBuffer());
  const verifiedHash = sha256Hex(verified);
  if (verifiedHash !== options.contentSha256) {
    await options.admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .remove([options.objectKey]);
    throw new SigningError(
      "INTEGRITY_MISMATCH",
      "Prepared PDF failed post-upload integrity verification.",
    );
  }
}

export function newOpaqueId(): string {
  return randomUUID();
}
