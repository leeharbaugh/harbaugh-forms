/**
 * Ad hoc PDF upload for Draft Signing documents.
 * Signing-owned preparation only — never creates Packet/Form rows or evidence.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { captureAndSelectAdHocDraftSourceSnapshot } from "./draft-source-snapshots";
import { SigningError } from "./errors";
import { requireManageableDraftSigning } from "./manage";
import { normalizeOptionalText, normalizeRequiredText } from "./manage";
import type { SigningActor } from "./types";
import type { SigningDocumentRow } from "./draft-documents";

/** Matches signing-artifacts bucket file_size_limit (50 MiB). */
export const SIGNING_AD_HOC_PDF_MAX_BYTES = 52_428_800;

const PDF_MAGIC = new TextEncoder().encode("%PDF-");

export function looksLikePdfBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC.byteLength) return false;
  for (let i = 0; i < PDF_MAGIC.byteLength; i += 1) {
    if (bytes[i] !== PDF_MAGIC[i]) return false;
  }
  return true;
}

export function sanitizeUploadedPdfFilename(raw: unknown): string {
  const name =
    typeof raw === "string" && raw.trim()
      ? raw.trim()
      : "document.pdf";
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "document.pdf";
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").replace(/_+/g, "_");
  const withExt = cleaned.toLowerCase().endsWith(".pdf")
    ? cleaned
    : `${cleaned || "document"}.pdf`;
  return withExt.slice(0, 180);
}

export function displayNameFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.pdf$/i, "").trim();
  return withoutExt || "Uploaded document";
}

async function nextDocumentDisplayOrder(
  admin: SupabaseClient,
  signingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("signing_documents")
    .select("display_order")
    .eq("signing_id", signingId)
    .eq("included_in_draft", true)
    .order("display_order", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data?.[0]?.display_order as number | undefined) ?? -1) + 1;
}

/**
 * Upload an ad hoc PDF into a Draft Signing as a Signing-owned document +
 * Draft source snapshot. No package revision or document version is created.
 */
export async function addAdHocDraftSigningDocumentWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    filename?: unknown;
    displayName?: unknown;
    pdfBytes: Uint8Array;
  },
  admin: SupabaseClient,
): Promise<SigningDocumentRow> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  const bytes = input.pdfBytes;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new SigningError("INVALID_INPUT", "A PDF file is required.");
  }
  if (bytes.byteLength > SIGNING_AD_HOC_PDF_MAX_BYTES) {
    throw new SigningError(
      "INVALID_INPUT",
      "The PDF is too large (maximum 50 MB).",
    );
  }
  if (!looksLikePdfBytes(bytes)) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "The uploaded file is not a PDF.",
    );
  }

  const filename = sanitizeUploadedPdfFilename(input.filename);
  const displayName =
    normalizeOptionalText(input.displayName, "display name") ??
    displayNameFromFilename(filename);

  const displayOrder = await nextDocumentDisplayOrder(admin, signing.id);

  const { data: inserted, error: insertError } = await admin
    .from("signing_documents")
    .insert({
      signing_id: signing.id,
      source_kind: "AD_HOC_PDF",
      source_packet_form_id: null,
      display_order: displayOrder,
      display_name: displayName,
      filename,
      included_in_draft: true,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(
      insertError?.message ?? "Failed to add Signing document.",
    );
  }

  try {
    await captureAndSelectAdHocDraftSourceSnapshot({
      admin,
      signingId: signing.id,
      signingDocumentId: inserted.id as string,
      documentName: displayName,
      sourcePdfBytes: bytes,
    });
  } catch (error) {
    await admin
      .from("signing_documents")
      .delete()
      .eq("id", inserted.id as string)
      .eq("signing_id", signing.id);
    throw error;
  }

  const { data: reloaded, error: reloadError } = await admin
    .from("signing_documents")
    .select("*")
    .eq("id", inserted.id as string)
    .eq("signing_id", signing.id)
    .single();
  if (reloadError || !reloaded) {
    throw new Error(reloadError?.message ?? "Failed to reload Signing document.");
  }
  return reloaded as SigningDocumentRow;
}

/** Helper for server actions that receive File/Blob ArrayBuffers. */
export async function readPdfBytesFromUnknown(
  file: unknown,
): Promise<Uint8Array> {
  if (file instanceof Uint8Array) return file;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (
    file &&
    typeof file === "object" &&
    "arrayBuffer" in file &&
    typeof (file as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer ===
      "function"
  ) {
    const buffer = await (
      file as { arrayBuffer: () => Promise<ArrayBuffer> }
    ).arrayBuffer();
    return new Uint8Array(buffer);
  }
  throw new SigningError("INVALID_INPUT", "A PDF file is required.");
}

export function assertDisplayNameForAdHoc(displayName: unknown): string {
  return normalizeRequiredText(displayName, "display name", 200);
}
