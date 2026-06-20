import {
  FORM_TEMPLATES_BUCKET,
  sanitizePdfFileName,
} from "@/lib/form-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

export const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

const SIGNED_URL_EXPIRY_SECONDS = 60;

export function buildPacketFormStoragePath(
  packetId: number,
  formId: number,
  documentName: string,
): string {
  const safeFileName = sanitizePdfFileName(documentName).replace(/\.pdf$/i, "");
  return `${packetId}/${formId}-${safeFileName}.pdf`;
}

export function buildExternalPacketFormStoragePath(
  packetId: number,
  documentName: string,
): string {
  const safeFileName = sanitizePdfFileName(documentName).replace(/\.pdf$/i, "");
  const stamp = Date.now();
  return `${packetId}/external-${stamp}-${safeFileName}.pdf`;
}

export async function uploadPdfToPacketFormStorage(
  supabase: SupabaseClient,
  storagePath: string,
  file: Blob,
): Promise<string> {
  const trimmedPath = storagePath.trim();
  if (!trimmedPath) {
    throw new Error("Storage path is required.");
  }

  const { error: uploadError } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .upload(trimmedPath, file, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return trimmedPath;
}

export async function uploadExternalPdfToPacketForm(
  supabase: SupabaseClient,
  packetId: number,
  file: File,
  documentName: string,
): Promise<string> {
  const storagePath = buildExternalPacketFormStoragePath(packetId, documentName);
  return uploadPdfToPacketFormStorage(supabase, storagePath, file);
}

export async function copyFormPdfToPacketForm(
  supabase: SupabaseClient,
  sourceStoragePath: string,
  packetId: number,
  formId: number,
  documentName: string,
): Promise<string> {
  const trimmedSourcePath = sourceStoragePath.trim();
  if (!trimmedSourcePath) {
    throw new Error("Source PDF storage path is missing for this form.");
  }

  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(FORM_TEMPLATES_BUCKET)
    .download(trimmedSourcePath);

  if (downloadError || !sourceBlob) {
    throw new Error(
      downloadError?.message ?? "Failed to download source form PDF.",
    );
  }

  const storagePath = buildPacketFormStoragePath(
    packetId,
    formId,
    documentName,
  );

  const { error: uploadError } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .upload(storagePath, sourceBlob, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return storagePath;
}

export async function createPacketFormDownloadUrl(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<string> {
  const trimmedPath = storagePath.trim();
  if (!trimmedPath) {
    throw new Error("Packet form storage path is missing.");
  }

  const { data, error } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .createSignedUrl(trimmedPath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create download URL.");
  }

  return data.signedUrl;
}

export function triggerBrowserDownload(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizePdfFileName(fileName);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
