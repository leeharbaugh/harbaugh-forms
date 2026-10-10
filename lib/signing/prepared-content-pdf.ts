/**
 * Bake manager-prepared content (Printed Name, Checkmark) into prepared PDF
 * bytes. Runs only while building the immutable prepared document version, so
 * the content is ordinary document content in the ceremony and the completed
 * PDF. Deterministic: same input bytes and items produce the same output.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PDF_TEXT_PADDING_X } from "@/lib/pdf-text-layout";
import {
  CHECKMARK_POINTS,
  checkmarkThickness,
  printedNameFontSize,
  printedNameTextTop,
} from "./prepared-content-geometry";
import type { PreparedContentType } from "./prepared-content-types";

export type PreparedContentRenderItem = {
  contentType: PreparedContentType;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Printed Name text (the participant's display name); unused for Checkmark. */
  text: string | null;
};

const INK = rgb(0.05, 0.05, 0.08);

function drawPrintedName(page: PDFPage, font: PDFFont, item: PreparedContentRenderItem) {
  const text = (item.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return;
  const size = printedNameFontSize({
    text,
    width: item.width,
    height: item.height,
    measureWidth: (value, fontSize) => font.widthOfTextAtSize(value, fontSize),
  });
  const pageHeight = page.getHeight();
  const centeredTop = printedNameTextTop(item, size);
  page.drawText(text, {
    x: item.x + PDF_TEXT_PADDING_X,
    y: Math.max(0, pageHeight - centeredTop - size * 0.8),
    size,
    font,
    color: INK,
  });
}

function drawCheckmark(page: PDFPage, item: PreparedContentRenderItem) {
  const pageHeight = page.getHeight();
  const side = Math.min(item.width, item.height);
  const left = item.x + (item.width - side) / 2;
  const top = item.y + (item.height - side) / 2;
  const thickness = checkmarkThickness(side);
  const points = CHECKMARK_POINTS.map(([px, py]) => ({
    x: left + px * side,
    y: pageHeight - (top + py * side),
  }));
  for (let index = 0; index < points.length - 1; index += 1) {
    page.drawLine({
      start: points[index],
      end: points[index + 1],
      thickness,
      color: INK,
    });
  }
}

/** Returns the input bytes unchanged when there is nothing to bake. */
export async function bakePreparedContentIntoPdf(
  bytes: Uint8Array,
  items: readonly PreparedContentRenderItem[],
): Promise<Uint8Array> {
  if (items.length === 0) return bytes;
  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = pdfDoc.getPages();
  const needsFont = items.some((item) => item.contentType === "PRINTED_NAME");
  const helvetica = needsFont ? await pdfDoc.embedFont(StandardFonts.Helvetica) : null;

  const ordered = [...items].sort(
    (a, b) => a.pageNumber - b.pageNumber || a.y - b.y || a.x - b.x,
  );
  for (const item of ordered) {
    const page = pages[item.pageNumber - 1];
    if (!page) {
      throw new Error(`Prepared content references missing page ${item.pageNumber}.`);
    }
    if (item.contentType === "PRINTED_NAME") {
      drawPrintedName(page, helvetica!, item);
    } else {
      drawCheckmark(page, item);
    }
  }
  return pdfDoc.save({ useObjectStreams: false });
}
