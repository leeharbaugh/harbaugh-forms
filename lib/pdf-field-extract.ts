import { pdfjs } from "react-pdf";
import {
  shouldSkipAuthentisignPdfInventoryField,
  AUTHENTISIGN_EXCLUSION_MESSAGE,
} from "@/lib/types/authentisign-excluded-fields";
import { roundPdfCoordinate } from "@/lib/types/template-pdf-field";

export type PdfFieldInventorySkippedItem = {
  fieldKey: string;
  pageNumber: number;
  pdfFieldType: string | null;
  reason: "authentisign";
};

export type PdfFieldInventoryItem = {
  fieldKey: string;
  fieldLabel: string;
  fieldWidgetType: string;
  fieldDataType: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
  occurrenceIndex: number;
};

export type PdfFieldInventoryResult = {
  items: PdfFieldInventoryItem[];
  skipped: PdfFieldInventorySkippedItem[];
};

type PdfWidgetAnnotation = {
  subtype?: string;
  annotationType?: number;
  fieldType?: string;
  fieldName?: string;
  id?: string;
  rect?: number[];
  checkBox?: boolean;
  radioButton?: boolean;
};

function normalizeExtractedFieldKey(rawName: string): string {
  return rawName
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .toUpperCase();
}

function humanizeFieldKey(fieldKey: string): string {
  return fieldKey
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferCatalogTypesFromPdfAnnotation(
  annotation: PdfWidgetAnnotation,
): { fieldWidgetType: string; fieldDataType: string } {
  const pdfFieldType = (annotation.fieldType ?? "").trim();

  if (pdfFieldType === "Btn") {
    if (annotation.checkBox || annotation.radioButton) {
      return { fieldWidgetType: "checkbox", fieldDataType: "boolean" };
    }
  }

  if (pdfFieldType === "Ch") {
    return { fieldWidgetType: "text", fieldDataType: "text" };
  }

  return { fieldWidgetType: "text", fieldDataType: "text" };
}

function pdfRectToPlacement(
  rect: number[],
  pageWidth: number,
  pageHeight: number,
) {
  const [x1, y1, x2, y2] = rect;
  const width = Math.max(x2 - x1, 1);
  const height = Math.max(y2 - y1, 1);

  return {
    x: roundPdfCoordinate(x1),
    y: roundPdfCoordinate(pageHeight - y2),
    width: roundPdfCoordinate(width),
    height: roundPdfCoordinate(height),
    pageWidth: roundPdfCoordinate(pageWidth),
    pageHeight: roundPdfCoordinate(pageHeight),
  };
}

function isWidgetAnnotation(annotation: PdfWidgetAnnotation): boolean {
  return (
    annotation.subtype === "Widget" ||
    annotation.annotationType === 20 ||
    Boolean(annotation.fieldType)
  );
}

export async function extractPdfFieldInventory(
  pdfSource: string | ArrayBuffer | Uint8Array,
): Promise<PdfFieldInventoryResult> {
  const pdf = await pdfjs.getDocument(pdfSource).promise;
  const items: PdfFieldInventoryItem[] = [];
  const skipped: PdfFieldInventorySkippedItem[] = [];
  const occurrenceCounts = new Map<string, number>();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;
    const annotations = (await page.getAnnotations()) as PdfWidgetAnnotation[];

    for (const annotation of annotations) {
      if (!isWidgetAnnotation(annotation)) {
        continue;
      }

      const rawName = annotation.fieldName ?? annotation.id ?? "";
      const fieldKey = normalizeExtractedFieldKey(rawName);
      if (!fieldKey) {
        continue;
      }

      const pdfFieldType = annotation.fieldType ?? null;
      const catalogTypes = inferCatalogTypesFromPdfAnnotation(annotation);

      if (
        shouldSkipAuthentisignPdfInventoryField({
          fieldKey,
          pdfFieldType,
          fieldWidgetType: catalogTypes.fieldWidgetType,
        })
      ) {
        skipped.push({
          fieldKey,
          pageNumber,
          pdfFieldType,
          reason: "authentisign",
        });
        continue;
      }

      if (!annotation.rect || annotation.rect.length < 4) {
        continue;
      }

      const placement = pdfRectToPlacement(
        annotation.rect,
        pageWidth,
        pageHeight,
      );
      const occurrenceIndex = occurrenceCounts.get(fieldKey) ?? 0;
      occurrenceCounts.set(fieldKey, occurrenceIndex + 1);

      items.push({
        fieldKey,
        fieldLabel: humanizeFieldKey(fieldKey),
        fieldWidgetType: catalogTypes.fieldWidgetType,
        fieldDataType: catalogTypes.fieldDataType,
        pageNumber,
        occurrenceIndex,
        ...placement,
      });
    }
  }

  return { items, skipped };
}

export { AUTHENTISIGN_EXCLUSION_MESSAGE };
