import { PDFDocument } from "pdf-lib";

/**
 * Pure helper: count pages from PDF bytes. Used by unit tests and Publish.
 */
export async function countPdfPagesFromBytes(
  bytes: Uint8Array | ArrayBuffer,
): Promise<
  | { ok: true; pageCount: number }
  | { ok: false; code: "pdf_unreadable" | "pdf_page_count_unknown"; message: string }
> {
  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    if (!Number.isFinite(pageCount) || pageCount < 1) {
      return {
        ok: false,
        code: "pdf_page_count_unknown",
        message: "The PDF page count could not be determined.",
      };
    }
    return { ok: true, pageCount };
  } catch {
    return {
      ok: false,
      code: "pdf_unreadable",
      message: "The stored file is not a readable PDF.",
    };
  }
}
