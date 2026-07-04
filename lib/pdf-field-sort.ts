import {
  packetFieldSidebarLabel,
  type PacketFormFieldView,
} from "@/lib/types/packet-form-editor";
import type { PlacedPdfField } from "@/lib/types/template-pdf-field";

export type PdfFieldSortPosition = {
  page_number: number;
  y: number;
  x: number;
  occurrence_index?: number | null;
  labelOrKey: string;
};

export function comparePdfFieldPositions(
  a: PdfFieldSortPosition,
  b: PdfFieldSortPosition,
): number {
  if (a.page_number !== b.page_number) {
    return a.page_number - b.page_number;
  }

  if (a.y !== b.y) {
    return a.y - b.y;
  }

  if (a.x !== b.x) {
    return a.x - b.x;
  }

  const aOccurrence = a.occurrence_index ?? 0;
  const bOccurrence = b.occurrence_index ?? 0;
  if (aOccurrence !== bOccurrence) {
    return aOccurrence - bOccurrence;
  }

  return a.labelOrKey.localeCompare(b.labelOrKey);
}

export function placedPdfFieldSortPosition(
  field: PlacedPdfField,
): PdfFieldSortPosition {
  return {
    page_number: field.page_number,
    y: field.y_position,
    x: field.x_position,
    occurrence_index: field.occurrence_index,
    labelOrKey:
      field.field_label?.trim() || field.field_key?.trim() || field.id,
  };
}

export function sortPlacedPdfFields<T extends PlacedPdfField>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    comparePdfFieldPositions(
      placedPdfFieldSortPosition(a),
      placedPdfFieldSortPosition(b),
    ),
  );
}

export function packetFormFieldViewSortPosition(
  fieldView: PacketFormFieldView,
): PdfFieldSortPosition {
  const field = fieldView.instance.fields;

  return {
    page_number: fieldView.placement.page_number,
    y: fieldView.placement.y,
    x: fieldView.placement.x,
    occurrence_index: fieldView.mapping.occurrence_index,
    labelOrKey:
      packetFieldSidebarLabel(fieldView) ||
      field?.field_key?.trim() ||
      fieldView.mapping.id,
  };
}

export function sortPacketFormFieldViews(
  fieldViews: PacketFormFieldView[],
): PacketFormFieldView[] {
  return [...fieldViews].sort((a, b) =>
    comparePdfFieldPositions(
      packetFormFieldViewSortPosition(a),
      packetFormFieldViewSortPosition(b),
    ),
  );
}

export function sortGroupedPdfFields<T>(
  grouped: Record<number, T[]>,
  getPosition: (item: T) => PdfFieldSortPosition,
): Record<number, T[]> {
  const sorted: Record<number, T[]> = {};

  for (const [pageNumber, items] of Object.entries(grouped)) {
    sorted[Number(pageNumber)] = [...items].sort((a, b) =>
      comparePdfFieldPositions(getPosition(a), getPosition(b)),
    );
  }

  return sorted;
}
