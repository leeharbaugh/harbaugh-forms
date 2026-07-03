import { pdfjs } from "react-pdf";
import { acquirePdfWorker, releasePdfWorker } from "@/lib/pdfjs-setup";
import {
  shouldSkipAuthentisignPdfInventoryField,
  AUTHENTISIGN_EXCLUSION_MESSAGE,
} from "@/lib/types/authentisign-excluded-fields";
import { roundPdfCoordinate } from "@/lib/types/template-pdf-field";

export type PdfFieldInventorySkippedItem = {
  fieldKey: string;
  pdfFieldName: string;
  pageNumber: number;
  pdfFieldType: string | null;
  reason: "authentisign";
};

export type PdfFieldInventoryItem = {
  /** Normalized catalog field key */
  fieldKey: string;
  /** Native AcroForm field name from the PDF */
  pdfFieldName: string;
  fieldLabel: string;
  fieldWidgetType: string;
  fieldDataType: string;
  pdfFieldType: string | null;
  pdfDefaultValue: string | null;
  pdfExportValue: string | null;
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
  detectedCount: number;
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
  fieldValue?: string | boolean;
  buttonValue?: string;
  exportValue?: string;
  defaultFieldValue?: string;
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

function readAnnotationString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value).trim() || null;
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
  acquirePdfWorker();

  try {
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

        const pdfFieldName = (annotation.fieldName ?? annotation.id ?? "").trim();
        if (!pdfFieldName) {
          continue;
        }

        const fieldKey = normalizeExtractedFieldKey(pdfFieldName);
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
            pdfFieldName,
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
        const occurrenceIndex = occurrenceCounts.get(pdfFieldName) ?? 0;
        occurrenceCounts.set(pdfFieldName, occurrenceIndex + 1);

        const pdfDefaultValue =
          readAnnotationString(annotation.defaultFieldValue) ??
          readAnnotationString(annotation.fieldValue);
        const pdfExportValue =
          readAnnotationString(annotation.exportValue) ??
          readAnnotationString(annotation.buttonValue);

        items.push({
          fieldKey,
          pdfFieldName,
          fieldLabel: humanizeFieldKey(fieldKey),
          fieldWidgetType: catalogTypes.fieldWidgetType,
          fieldDataType: catalogTypes.fieldDataType,
          pdfFieldType,
          pdfDefaultValue,
          pdfExportValue,
          pageNumber,
          occurrenceIndex,
          ...placement,
        });
      }
    }

    return {
      items,
      skipped,
      detectedCount: items.length + skipped.length,
    };
  } finally {
    releasePdfWorker();
  }
}

export { AUTHENTISIGN_EXCLUSION_MESSAGE };
