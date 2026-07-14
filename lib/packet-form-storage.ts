import {
  FORM_TEMPLATES_BUCKET,
  sanitizePdfFileName,
} from "@/lib/form-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

export const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

const SIGNED_URL_EXPIRY_SECONDS = 60;

function assertPositiveId(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`A valid ${label} is required for Storage paths.`);
  }
}

function assertOwnerUserId(ownerUserId: string): string {
  const trimmed = ownerUserId.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    throw new Error("A valid owner user ID is required for Storage paths.");
  }
  return trimmed.toLowerCase();
}

function assertSafePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) {
    throw new Error("Storage path is required.");
  }
  if (trimmed.includes("..") || trimmed.includes("//") || trimmed.startsWith("/")) {
    throw new Error(`Unsafe Storage path rejected: ${trimmed}`);
  }
  if (trimmed.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe Storage path segment rejected: ${trimmed}`);
  }
  return trimmed;
}

export function buildPacketFormStoragePath(options: {
  ownerUserId: string;
  packetId: number;
  packetFormId: number;
  documentName: string;
}): string {
  const ownerId = assertOwnerUserId(options.ownerUserId);
  assertPositiveId(options.packetId, "packet ID");
  assertPositiveId(options.packetFormId, "packet form ID");

  const safeFileName = sanitizePdfFileName(options.documentName).replace(
    /\.pdf$/i,
    "",
  );

  return assertSafePath(
    `users/${ownerId}/packets/${options.packetId}/${options.packetFormId}-${safeFileName}.pdf`,
  );
}

/** @deprecated Legacy packet path without owner or packet-form ID. */
export function buildLegacyPacketFormStoragePath(
  packetId: number,
  formId: number,
  documentName: string,
): string {
  assertPositiveId(packetId, "packet ID");
  assertPositiveId(formId, "form ID");
  const safeFileName = sanitizePdfFileName(documentName).replace(/\.pdf$/i, "");
  return assertSafePath(`${packetId}/${formId}-${safeFileName}.pdf`);
}

/** @deprecated Prefer insert-then-upload with buildPacketFormStoragePath. */
export function buildExternalPacketFormStoragePath(
  packetId: number,
  documentName: string,
): string {
  assertPositiveId(packetId, "packet ID");
  const safeFileName = sanitizePdfFileName(documentName).replace(/\.pdf$/i, "");
  const stamp = Date.now();
  return assertSafePath(
    `${packetId}/external-${stamp}-${safeFileName}.pdf`,
  );
}

export function isNewPacketStoragePath(path: string): boolean {
  return /^users\/[0-9a-f-]{36}\/packets\//i.test(path.trim());
}

export function isLegacyPacketStoragePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) {
    return false;
  }
  return !isNewPacketStoragePath(trimmed);
}

export async function uploadPdfToPacketFormStorage(
  supabase: SupabaseClient,
  storagePath: string,
  file: Blob,
  options?: { upsert?: boolean },
): Promise<string> {
  const trimmedPath = assertSafePath(storagePath);

  const { error: uploadError } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .upload(trimmedPath, file, {
      upsert: options?.upsert ?? false,
      contentType: "application/pdf",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return trimmedPath;
}

export async function uploadExternalPdfToPacketForm(
  supabase: SupabaseClient,
  options: {
    ownerUserId: string;
    packetId: number;
    packetFormId: number;
    file: File;
    documentName: string;
  },
): Promise<string> {
  const storagePath = buildPacketFormStoragePath({
    ownerUserId: options.ownerUserId,
    packetId: options.packetId,
    packetFormId: options.packetFormId,
    documentName: options.documentName,
  });
  return uploadPdfToPacketFormStorage(supabase, storagePath, options.file);
}

export async function copyFormPdfToPacketForm(
  supabase: SupabaseClient,
  options: {
    sourceStoragePath: string;
    ownerUserId: string;
    packetId: number;
    packetFormId: number;
    documentName: string;
  },
): Promise<string> {
  const trimmedSourcePath = assertSafePath(options.sourceStoragePath);

  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(FORM_TEMPLATES_BUCKET)
    .download(trimmedSourcePath);

  if (downloadError || !sourceBlob) {
    throw new Error(
      downloadError?.message ?? "Failed to download source form PDF.",
    );
  }

  const storagePath = buildPacketFormStoragePath({
    ownerUserId: options.ownerUserId,
    packetId: options.packetId,
    packetFormId: options.packetFormId,
    documentName: options.documentName,
  });

  await uploadPdfToPacketFormStorage(supabase, storagePath, sourceBlob);
  return storagePath;
}

export async function removePacketFormStorageObject(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<void> {
  const trimmedPath = assertSafePath(storagePath);
  const { error } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .remove([trimmedPath]);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createPacketFormDownloadUrl(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<string> {
  const trimmedPath = assertSafePath(storagePath);

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
