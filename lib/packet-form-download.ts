import { fillPacketFormPdfBytes } from "@/lib/fill-packet-form-pdf";
import { loadPacketFormEditorData } from "@/lib/packet-form-editor";
import {
  GENERATED_DOCUMENTS_BUCKET,
  createPacketFormDownloadUrl,
  triggerBrowserDownload,
} from "@/lib/packet-form-storage";
import { sanitizePdfFileName } from "@/lib/form-storage";
import type { PacketFormFieldView } from "@/lib/types/packet-form-editor";
import type { PacketForm } from "@/lib/types/packet";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PacketFormDownloadTarget = Pick<
  PacketForm,
  "id" | "packet_id" | "form_id" | "document_name" | "storage_path"
>;

async function downloadStoragePdfBytes(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .download(storagePath.trim());

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to download packet form PDF.");
  }

  const buffer = await data.arrayBuffer();
  return new Uint8Array(buffer);
}

function triggerFilledPdfDownload(bytes: Uint8Array, documentName: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    triggerBrowserDownload(objectUrl, sanitizePdfFileName(documentName));
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

/**
 * Download a packet form PDF with field values written into the file.
 * External uploads (no linked template form) download the stored PDF unchanged.
 */
export async function downloadFilledPacketFormPdf(
  supabase: SupabaseClient,
  document: PacketFormDownloadTarget,
  options?: {
    /** When provided (e.g. from the live editor), uses on-screen values including unsaved drafts. */
    fields?: PacketFormFieldView[];
  },
): Promise<void> {
  if (!document.storage_path?.trim()) {
    throw new Error("This document does not have a stored PDF yet.");
  }

  if (document.form_id == null) {
    const url = await createPacketFormDownloadUrl(
      supabase,
      document.storage_path,
    );
    triggerBrowserDownload(url, document.document_name);
    return;
  }

  const sourceBytesPromise = downloadStoragePdfBytes(
    supabase,
    document.storage_path,
  );

  let fields = options?.fields;
  if (!fields) {
    const editorData = await loadPacketFormEditorData(supabase, document.id);
    if (editorData.packetForm.packet_id !== document.packet_id) {
      throw new Error("Packet form does not belong to this packet.");
    }
    fields = editorData.fields;
  }

  const sourceBytes = await sourceBytesPromise;
  const filledBytes = await fillPacketFormPdfBytes(sourceBytes, fields);

  triggerFilledPdfDownload(filledBytes, document.document_name);
}
