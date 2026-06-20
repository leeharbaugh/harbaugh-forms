import type { SupabaseClient } from "@supabase/supabase-js";

export const FORM_TEMPLATES_BUCKET = "form-templates";

export function sanitizePdfFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const baseName = trimmed.replace(/\.pdf$/i, "");
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const safeBase = sanitized || "form";
  return `${safeBase}.pdf`;
}

export function buildFormStoragePath(
  folderKey: string,
  fileName: string,
): string {
  const sanitizedFolder = folderKey
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${sanitizedFolder || "form"}/${sanitizePdfFileName(fileName)}`;
}

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

export async function getFormPdfSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<string> {
  const trimmedPath = storagePath.trim();
  if (!trimmedPath) {
    throw new Error("A stored PDF path is required.");
  }

  const { data, error } = await supabase.storage
    .from(FORM_TEMPLATES_BUCKET)
    .createSignedUrl(trimmedPath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create PDF preview URL.");
  }

  return data.signedUrl;
}

export async function uploadFormPdf(
  supabase: SupabaseClient,
  file: File,
  folderKey: string,
): Promise<string> {
  const storagePath = buildFormStoragePath(folderKey, file.name);

  const { error } = await supabase.storage
    .from(FORM_TEMPLATES_BUCKET)
    .upload(storagePath, file, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (error) {
    throw new Error(error.message);
  }

  return storagePath;
}
