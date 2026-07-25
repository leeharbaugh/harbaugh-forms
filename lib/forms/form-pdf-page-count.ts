import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_TEMPLATES_BUCKET } from "@/lib/form-storage";
import type { FormLibraryScope } from "@/lib/form-storage";
import { countPdfPagesFromBytes } from "@/lib/forms/pdf-page-count";
import { resolveFormStoragePath } from "@/lib/storage-path-resolve";

export type FormPdfPageCountResult =
  | { ok: true; pageCount: number; resolvedPath: string }
  | {
      ok: false;
      code:
        | "pdf_path_missing"
        | "pdf_pending"
        | "pdf_not_found"
        | "pdf_download_failed"
        | "pdf_unreadable"
        | "pdf_page_count_unknown";
      message: string;
    };

export { countPdfPagesFromBytes } from "@/lib/forms/pdf-page-count";

/**
 * Resolve, download, and count pages for a form's stored template PDF.
 * Authoritative server-side path used by Publish — never trusts client page counts.
 */
export async function loadFormPdfPageCount(
  supabase: SupabaseClient,
  form: {
    id: number;
    form_code?: string | null;
    source_storage_path?: string | null;
    scope?: string | null;
    owner_user_id?: string | null;
  },
): Promise<FormPdfPageCountResult> {
  const recordedPath = form.source_storage_path?.trim() ?? "";
  if (!recordedPath) {
    return {
      ok: false,
      code: "pdf_path_missing",
      message: "A readable PDF is required before publishing.",
    };
  }
  if (recordedPath.includes("/pending/")) {
    return {
      ok: false,
      code: "pdf_pending",
      message: "A readable PDF is required before publishing.",
    };
  }

  let resolvedPath: string;
  try {
    const resolved = await resolveFormStoragePath(supabase, {
      formId: form.id,
      path: recordedPath,
      formCode: form.form_code,
      scope: (form.scope as FormLibraryScope | null) ?? "GLOBAL",
      ownerUserId: form.owner_user_id,
    });
    resolvedPath = resolved.resolvedPath;
  } catch (error) {
    return {
      ok: false,
      code: "pdf_not_found",
      message:
        error instanceof Error
          ? error.message
          : "The form PDF could not be found in Storage.",
    };
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(FORM_TEMPLATES_BUCKET)
    .download(resolvedPath);

  if (downloadError || !blob) {
    return {
      ok: false,
      code: "pdf_download_failed",
      message:
        downloadError?.message ??
        "The form PDF could not be downloaded from Storage.",
    };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) {
    return {
      ok: false,
      code: "pdf_unreadable",
      message: "The stored file is not a readable PDF.",
    };
  }

  const counted = await countPdfPagesFromBytes(bytes);
  if (!counted.ok) {
    return counted;
  }

  return {
    ok: true,
    pageCount: counted.pageCount,
    resolvedPath,
  };
}
