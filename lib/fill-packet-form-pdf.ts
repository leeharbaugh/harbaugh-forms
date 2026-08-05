/**
 * Rewrite fill-packet-form-pdf with multiline wrap, mask_background, and
 * shared font sizing. Keep AcroForm native fill path; enhance overlay draw.
 */
import {
  CHECKBOX_CHECKMARK_FILL_RATIO,
} from "@/lib/checkbox-constants";
import {
  fitTypedSignatureFontSize,
  layoutTextInBox,
  PDF_TEXT_PADDING_X,
  PDF_TEXT_PADDING_Y,
  resolveFieldFontSize,
  typedSignatureFontSize,
} from "@/lib/pdf-text-layout";
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
} from "@/lib/types/template-pdf-field";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { PacketFormAnnotation } from "@/lib/types/packet-form-annotation";

type ScaledFieldPlacement = {
  pageNumber: number;
  x: number;
  yFromTop: number;
  width: number;
  height: number;
  fontSize: number;
  alignment: string | null;
  isMultiline: boolean;
  maskBackground: boolean;
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

  const width = effective.width * scaleX;
  const height = effective.height * scaleY;
  const isMultiline = fieldView.mapping.is_multiline === true;
  const fontSize = resolveFieldFontSize({
    configuredFontSize: placement.font_size,
    boxHeightPdf: height,
    isMultiline,
    scale: 1,
  });

  return {
    pageNumber: placement.page_number,
    x: placement.x * scaleX,
    yFromTop: placement.y * scaleY,
    width,
    height,
    fontSize,
    alignment: placement.alignment,
    isMultiline,
    maskBackground: fieldView.mapping.mask_background === true,
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

  return formatPacketFieldOverlayValue(
    displayValue,
    fieldView.field_type,
    {
      field_data_type: fieldView.instance.fields?.field_data_type,
      field_widget_type:
        fieldView.instance.fields?.field_widget_type ??
        fieldView.mapping.field_widget_type,
      field_key: fieldView.instance.fields?.field_key,
      field_label: fieldView.instance.fields?.field_label,
      pdf_field_name: fieldView.mapping.pdf_field_name,
      mapping_name: fieldView.mapping.mapping_name,
    },
  );
}

function resolveTextX(
  alignment: string | null,
  boxX: number,
  boxWidth: number,
  textWidth: number,
  paddingX: number,
): number {
  const normalized = (alignment ?? "left").trim().toLowerCase();

  if (normalized === "center") {
    return boxX + Math.max(0, (boxWidth - textWidth) / 2);
  }

  if (normalized === "right") {
    return boxX + Math.max(0, boxWidth - textWidth - paddingX);
  }

  return boxX + paddingX;
}

function drawMaskIfNeeded(page: PDFPage, placement: ScaledFieldPlacement) {
  if (!placement.maskBackground) {
    return;
  }

  const pageHeight = page.getHeight();
  const pdfBoxBottom = pdfYFromTop(
    pageHeight,
    placement.yFromTop,
    placement.height,
  );

  page.drawRectangle({
    x: placement.x,
    y: pdfBoxBottom,
    width: placement.width,
    height: placement.height,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
}

function drawTextFieldOnPage(
  page: PDFPage,
  placement: ScaledFieldPlacement,
  text: string,
  font: PDFFont,
) {
  const content = placement.isMultiline ? text : text.trim();
  if (!content) {
    return;
  }

  drawMaskIfNeeded(page, placement);

  const pageHeight = page.getHeight();
  const layout = layoutTextInBox({
    text: content,
    boxWidth: placement.width,
    boxHeight: placement.height,
    fontSize: placement.fontSize,
    isMultiline: placement.isMultiline,
    measureWidth: (s) => font.widthOfTextAtSize(s, placement.fontSize),
  });

  // Re-measure with the possibly shrunk font size for accurate wrap.
  const fitted = layoutTextInBox({
    text: content,
    boxWidth: placement.width,
    boxHeight: placement.height,
    fontSize: layout.fontSize,
    isMultiline: placement.isMultiline,
    measureWidth: (s) => font.widthOfTextAtSize(s, layout.fontSize),
  });

  const fontSize = fitted.fontSize;
  const lineHeight = fitted.lineHeight;
  // Top of box in PDF coords: first baseline near top + padding.
  let baselineFromTop = placement.yFromTop + PDF_TEXT_PADDING_Y + fontSize;

  for (const line of fitted.lines) {
    if (!line && !placement.isMultiline) {
      continue;
    }
    const textWidth = font.widthOfTextAtSize(line, fontSize);
    const x = resolveTextX(
      placement.alignment,
      placement.x,
      placement.width,
      textWidth,
      PDF_TEXT_PADDING_X,
    );
    const textY = pageHeight - baselineFromTop;
    const boxBottom = pdfYFromTop(
      pageHeight,
      placement.yFromTop,
      placement.height,
    );
    // Skip lines that would draw below the placement box.
    if (textY < boxBottom + 0.5) {
      break;
    }

    page.drawText(line || " ", {
      x,
      y: Math.max(0, textY),
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });

    baselineFromTop += lineHeight;
  }
}

function drawFieldOnPage(
  page: PDFPage,
  fieldView: PacketFormFieldView,
  placement: ScaledFieldPlacement,
  font: PDFFont,
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
  if (!exportText && !placement.maskBackground) {
    return;
  }

  if (!exportText && placement.maskBackground) {
    drawMaskIfNeeded(page, placement);
    return;
  }

  drawTextFieldOnPage(page, placement, exportText, font);
}

function tryFillNativeAcroFormField(
  pdfDoc: PDFDocument,
  fieldView: PacketFormFieldView,
): boolean {
  const pdfFieldName = fieldView.mapping.pdf_field_name?.trim();
  if (!pdfFieldName) {
    return false;
  }

  // Overlay mask/multiline drawing must own fields that need presentation control.
  if (
    fieldView.mapping.mask_background === true ||
    fieldView.mapping.is_multiline === true
  ) {
    return false;
  }

  const displayValue = fieldView.displayValue ?? "";
  const fieldMeta = {
    field_type: fieldView.field_type,
    field_widget_type:
      fieldView.mapping.field_widget_type ??
      fieldView.instance.fields?.field_widget_type ??
      null,
  };

  try {
    const form = pdfDoc.getForm();

    if (isCheckboxPdfField(fieldMeta)) {
      const checked = resolveCheckboxCheckedState(
        displayValue,
        fieldView.instance.fields?.default_checked,
      );

      try {
        const checkbox = form.getCheckBox(pdfFieldName);
        if (checked) {
          checkbox.check();
        } else {
          checkbox.uncheck();
        }
        return true;
      } catch {
        const exportValue = fieldView.mapping.pdf_export_value?.trim();
        if (exportValue && checked) {
          try {
            const radioGroup = form.getRadioGroup(pdfFieldName);
            radioGroup.select(exportValue);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      }
    }

    const exportText = resolveExportText(fieldView, displayValue);

    try {
      const textField = form.getTextField(pdfFieldName);
      textField.setText(exportText);
      return true;
    } catch {
      // fall through to other field types
    }

    if (exportText) {
      try {
        const dropdown = form.getDropdown(pdfFieldName);
        dropdown.select(exportText);
        return true;
      } catch {
        // fall through
      }

      try {
        const optionList = form.getOptionList(pdfFieldName);
        optionList.select(exportText);
        return true;
      } catch {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function drawTypedSignatureAnnotation(
  page: PDFPage,
  annotation: PacketFormAnnotation,
  font: PDFFont,
  pageWidth: number,
  pageHeight: number,
  coordPageWidth: number,
  coordPageHeight: number,
) {
  const scaleX = pageWidth / coordPageWidth;
  const scaleY = pageHeight / coordPageHeight;
  const x = annotation.x * scaleX;
  const yFromTop = annotation.y * scaleY;
  const width = annotation.width * scaleX;
  const height = annotation.height * scaleY;
  const text = annotation.text_value.trim();
  if (!text) return;

  const baseSize = typedSignatureFontSize(height);
  const drawSize = fitTypedSignatureFontSize({
    text,
    boxWidth: width,
    boxHeight: height,
    measureWidth: (value) => font.widthOfTextAtSize(value, baseSize),
  });
  const baseline = pageHeight - yFromTop - drawSize - 1;

  page.drawText(text, {
    x,
    y: Math.max(0, baseline),
    size: drawSize,
    font,
    color: rgb(0.05, 0.05, 0.35),
  });
}

/**
 * Write packet form field values onto a PDF byte array.
 * Native AcroForm fields are filled by name when pdf_field_name is set;
 * overlay drawing is used as a fallback for manual placements.
 * Optional packet-form annotations (typed signatures) are drawn last.
 */
export async function fillPacketFormPdfBytes(
  sourcePdfBytes: Uint8Array,
  fields: PacketFormFieldView[],
  options?: {
    annotations?: PacketFormAnnotation[];
    signatureFontBytes?: Uint8Array | null;
  },
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(sourcePdfBytes);
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let signatureFont: PDFFont = font;
  if (options?.signatureFontBytes && options.signatureFontBytes.length > 0) {
    try {
      signatureFont = await pdfDoc.embedFont(options.signatureFontBytes);
    } catch (error) {
      console.error("Failed to embed Caveat signature font; falling back to Helvetica.", error);
      signatureFont = font;
    }
  }

  const overlayFields: PacketFormFieldView[] = [];

  for (const fieldView of fields) {
    const filledNatively = tryFillNativeAcroFormField(pdfDoc, fieldView);
    if (!filledNatively) {
      overlayFields.push(fieldView);
    }
  }

  for (const fieldView of overlayFields) {
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

  const annotations = (options?.annotations ?? []).filter(
    (row) => row.status === "ACTIVE" && row.annotation_type === "typed_signature",
  );

  for (const annotation of annotations) {
    const page = pages[annotation.page_number - 1];
    if (!page) continue;
    drawTypedSignatureAnnotation(
      page,
      annotation,
      signatureFont,
      page.getWidth(),
      page.getHeight(),
      page.getWidth(),
      page.getHeight(),
    );
  }

  return pdfDoc.save();
}
