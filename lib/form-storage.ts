import type { SupabaseClient } from "@supabase/supabase-js";

export const FORM_TEMPLATES_BUCKET = "form-templates";

export type FormLibraryScope = "GLOBAL" | "PRIVATE" | "ORGANIZATION";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

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

export function sanitizePdfFileName(fileName: string): string {
  const trimmed = fileName.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  const baseName = trimmed.replace(/\.pdf$/i, "");
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const safeBase = sanitized || "form";
  return `${safeBase}.pdf`;
}

export function extractPdfFileNameFromStoragePath(storagePath: string): string {
  const trimmed = storagePath.trim().replace(/\\/g, "/");
  const base = trimmed.split("/").pop() ?? "form.pdf";
  return sanitizePdfFileName(base);
}

/** @deprecated Legacy folder-key path. Prefer buildFormStoragePath / buildGlobalFormStoragePath. */
export function buildLegacyFormStoragePath(
  folderKey: string,
  fileName: string,
): string {
  const sanitizedFolder = folderKey
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return assertSafePath(
    `${sanitizedFolder || "form"}/${sanitizePdfFileName(fileName)}`,
  );
}

export function buildGlobalFormStoragePath(
  formId: number,
  fileName: string,
): string {
  assertPositiveId(formId, "form ID");
  return assertSafePath(
    `global/forms/${formId}/${sanitizePdfFileName(fileName)}`,
  );
}

export function buildPrivateFormStoragePath(
  ownerUserId: string,
  formId: number,
  fileName: string,
): string {
  const ownerId = assertOwnerUserId(ownerUserId);
  assertPositiveId(formId, "form ID");
  return assertSafePath(
    `users/${ownerId}/forms/${formId}/${sanitizePdfFileName(fileName)}`,
  );
}

export function buildFormStoragePath(options: {
  scope: FormLibraryScope;
  formId: number;
  fileName: string;
  ownerUserId?: string | null;
}): string {
  if (options.scope === "GLOBAL") {
    return buildGlobalFormStoragePath(options.formId, options.fileName);
  }

  if (!options.ownerUserId?.trim()) {
    throw new Error(
      "Owner user ID is required for private or organization form Storage paths.",
    );
  }

  return buildPrivateFormStoragePath(
    options.ownerUserId,
    options.formId,
    options.fileName,
  );
}

export function isNewFormStoragePath(path: string): boolean {
  const trimmed = path.trim();
  return (
    trimmed.startsWith("global/forms/") ||
    /^users\/[0-9a-f-]{36}\/forms\//i.test(trimmed)
  );
}

export function isLegacyFormStoragePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith("pending/")) {
    return false;
  }
  return !isNewFormStoragePath(trimmed);
}

export function buildPendingFormStoragePath(token: string): string {
  const safeToken = token
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!safeToken) {
    throw new Error("A pending Storage path token is required.");
  }
  return assertSafePath(`pending/${safeToken}.pdf`);
}

export async function getFormPdfSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<string> {
  const trimmedPath = assertSafePath(storagePath);

  const { data, error } = await supabase.storage
    .from(FORM_TEMPLATES_BUCKET)
    .createSignedUrl(trimmedPath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create PDF preview URL.");
  }

  return data.signedUrl;
}

export async function uploadFormPdfToPath(
  supabase: SupabaseClient,
  file: File,
  storagePath: string,
  options?: { upsert?: boolean },
): Promise<string> {
  const trimmedPath = assertSafePath(storagePath);

  const { error } = await supabase.storage
    .from(FORM_TEMPLATES_BUCKET)
    .upload(trimmedPath, file, {
      upsert: options?.upsert ?? false,
      contentType: "application/pdf",
    });

  if (error) {
    throw new Error(error.message);
  }

  return trimmedPath;
}

/**
 * @deprecated Prefer uploadFormPdfToPath with an owner-scoped path that includes form ID.
 * Kept for narrow compatibility during Phase B transitional call sites.
 */
export async function uploadFormPdf(
  supabase: SupabaseClient,
  file: File,
  folderKey: string,
): Promise<string> {
  const storagePath = buildLegacyFormStoragePath(folderKey, file.name);
  return uploadFormPdfToPath(supabase, file, storagePath, { upsert: true });
}

export async function removeFormStorageObject(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<void> {
  const trimmedPath = assertSafePath(storagePath);
  const { error } = await supabase.storage
    .from(FORM_TEMPLATES_BUCKET)
    .remove([trimmedPath]);

  if (error) {
    throw new Error(error.message);
  }
}
