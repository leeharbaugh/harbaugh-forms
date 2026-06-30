import {
  CHECKBOX_CHECKMARK_FILL_RATIO,
} from "@/lib/checkbox-constants";
import {
  formatPacketFieldOverlayValue,
  isPacketFieldValueEmpty,
  resolveCheckboxCheckedState,
  type PacketFormFieldView,
  type ResolvedPacketPlacement,
} from "@/lib/types/packet-form-editor";
import {
  getEffectivePdfFieldDimensions,
  isCheckboxPdfField,
  type TemplatePdfFieldType,
} from "@/lib/types/template-pdf-field";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

type ScaledFieldPlacement = {
  pageNumber: number;
  x: number;
  yFromTop: number;
  width: number;
  height: number;
  fontSize: number;
  alignment: string | null;
};

function scaleFieldPlacement(
  placement: ResolvedPacketPlacement,
  fieldView: PacketFormFieldView,
  pageWidth: number,
  pageHeight: number,
): ScaledFieldPlacement {
  const coordPageWidth = placement.page_width ?? pageWidth;
  const coordPageHeight = placement.page_height ?? pageHeight;
  const scaleX = pageWidth / coordPageWidth;
  const scaleY = pageHeight / coordPageHeight;

  const effective = getEffectivePdfFieldDimensions({
    field_type: fieldView.field_type,
    width: placement.width,
    height: placement.height,
    field_widget_type:
      fieldView.mapping.field_widget_type ??
      fieldView.instance.fields?.field_widget_type ??
      null,
  });

  return {
    pageNumber: placement.page_number,
    x: placement.x * scaleX,
    yFromTop: placement.y * scaleY,
    width: effective.width * scaleX,
    height: effective.height * scaleY,
    fontSize: Math.max(6, (placement.font_size ?? 10) * scaleY),
    alignment: placement.alignment,
  };
}

function pdfYFromTop(pageHeight: number, yFromTop: number, boxHeight: number) {
  return pageHeight - yFromTop - boxHeight;
}

function drawCheckboxOnPage(
  page: PDFPage,
  placement: ScaledFieldPlacement,
  checked: boolean,
) {
  const pageHeight = page.getHeight();
  const size = Math.min(placement.width, placement.height);
  const x = placement.x;
  const pdfBoxBottom = pdfYFromTop(pageHeight, placement.yFromTop, size);

  page.drawRectangle({
    x,
    y: pdfBoxBottom,
    width: size,
    height: size,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.55, 0.55, 0.55),
    borderWidth: 1,
  });

  if (!checked) {
    return;
  }

  const markSize = size * CHECKBOX_CHECKMARK_FILL_RATIO;
  const inset = (size - markSize) / 2;
  const boxX = x + inset;
  const boxBottom = pdfBoxBottom + inset;

  const mapPoint = (viewX: number, viewY: number) => ({
    x: boxX + (viewX / 24) * markSize,
    y: boxBottom + (1 - viewY / 24) * markSize,
  });

  const start = mapPoint(5.5, 12.5);
  const middle = mapPoint(10, 17);
  const end = mapPoint(18.5, 7.5);
  const strokeWidth = Math.max(1.25, markSize * (3.25 / 24));

  page.drawLine({
    start,
    end: middle,
    thickness: strokeWidth,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: middle,
    end,
    thickness: strokeWidth,
    color: rgb(0, 0, 0),
  });
}

function resolveExportText(
  fieldView: PacketFormFieldView,
  displayValue: string,
): string {
  if (
    isPacketFieldValueEmpty(
      displayValue,
      fieldView.field_type,
      fieldView.instance.fields?.default_checked,
    )
  ) {
    return "";
  }

  return formatPacketFieldOverlayValue(displayValue, fieldView.field_type);
}

function resolveTextX(
  alignment: string | null,
  boxX: number,
  boxWidth: number,
  textWidth: number,
): number {
  const normalized = (alignment ?? "left").trim().toLowerCase();

  if (normalized === "center") {
    return boxX + Math.max(0, (boxWidth - textWidth) / 2);
  }

  if (normalized === "right") {
    return boxX + Math.max(0, boxWidth - textWidth);
  }

  return boxX + 2;
}

function drawTextFieldOnPage(
  page: PDFPage,
  placement: ScaledFieldPlacement,
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const pageHeight = page.getHeight();
  const fontSize = placement.fontSize;
  const textWidth = font.widthOfTextAtSize(trimmed, fontSize);
  const x = resolveTextX(
    placement.alignment,
    placement.x,
    placement.width,
    textWidth,
  );
  const textY = pageHeight - placement.yFromTop - fontSize - 1;

  page.drawText(trimmed, {
    x,
    y: Math.max(0, textY),
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawFieldOnPage(
  page: PDFPage,
  fieldView: PacketFormFieldView,
  placement: ScaledFieldPlacement,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
) {
  const displayValue = fieldView.displayValue ?? "";
  const fieldMeta = {
    field_type: fieldView.field_type,
    field_widget_type:
      fieldView.mapping.field_widget_type ??
      fieldView.instance.fields?.field_widget_type ??
      null,
  };

  if (isCheckboxPdfField(fieldMeta)) {
    const checked = resolveCheckboxCheckedState(
      displayValue,
      fieldView.instance.fields?.default_checked,
    );
    drawCheckboxOnPage(page, placement, checked);
    return;
  }

  const exportText = resolveExportText(fieldView, displayValue);
  if (!exportText) {
    return;
  }

  drawTextFieldOnPage(page, placement, exportText, font);
}

/**
 * Write packet form field values onto a PDF byte array.
 * Coordinates match the on-screen overlay system (top-left origin, scaled to page size).
 */
export async function fillPacketFormPdfBytes(
  sourcePdfBytes: Uint8Array,
  fields: PacketFormFieldView[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(sourcePdfBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const fieldView of fields) {
    const pageIndex = fieldView.placement.page_number - 1;
    const page = pages[pageIndex];
    if (!page) {
      continue;
    }

    const scaled = scaleFieldPlacement(
      fieldView.placement,
      fieldView,
      page.getWidth(),
      page.getHeight(),
    );

    drawFieldOnPage(page, fieldView, scaled, font);
  }

  return pdfDoc.save();
}
