import {
  catalogTypesToLegacyFieldType,
  legacyFieldTypeToCatalogTypes,
} from "@/lib/types/field";
import type { FormFieldMapping } from "@/lib/types/form-field-mapping";

export type TemplatePdfFieldType =
  | "TEXT"
  | "CHECKBOX"
  | "DATE"
  | "SIGNATURE_PLACEHOLDER"
  | "INITIAL_PLACEHOLDER";

export type PlacedPdfField = {
  id: string;
  field_id: string;
  form_id: number;
  field_key: string;
  field_label: string | null;
  field_type: TemplatePdfFieldType;
  field_widget_type: string | null;
  mapping_name: string | null;
  occurrence_index: number | null;
  default_value_override: string | null;
  alignment: string | null;
  page_number: number;
  x_position: number;
  y_position: number;
  width: number | null;
  height: number | null;
  page_width: number | null;
  page_height: number | null;
  font_size: number;
  is_required: boolean;
  notes: string | null;
  create_date: string;
  update_date: string;
  status: string;
};

export type TemplatePdfField = PlacedPdfField;

export type TemplatePdfFieldInput = {
  field_key: string;
  field_label: string;
  field_type: TemplatePdfFieldType;
  width: string;
  height: string;
  font_size: string;
  is_required: boolean;
  notes: string;
};

export type PageMetrics = {
  renderedWidth: number;
  renderedHeight: number;
  originalWidth: number;
  originalHeight: number;
};

export type PendingPdfPlacement = {
  pageNumber: number;
  xPosition: number;
  yPosition: number;
};

export const TEMPLATE_PDF_FIELD_TYPES: TemplatePdfFieldType[] = [
  "TEXT",
  "CHECKBOX",
  "DATE",
  "SIGNATURE_PLACEHOLDER",
  "INITIAL_PLACEHOLDER",
];

const FIELD_TYPE_LABELS: Record<TemplatePdfFieldType, string> = {
  TEXT: "Text",
  CHECKBOX: "Checkbox",
  DATE: "Date",
  SIGNATURE_PLACEHOLDER: "Signature",
  INITIAL_PLACEHOLDER: "Initials",
};

const DEFAULT_FIELD_DIMENSIONS: Record<
  TemplatePdfFieldType,
  { width: number; height: number }
> = {
  TEXT: { width: 150, height: 18 },
  DATE: { width: 90, height: 18 },
  CHECKBOX: { width: 12, height: 12 },
  SIGNATURE_PLACEHOLDER: { width: 140, height: 28 },
  INITIAL_PLACEHOLDER: { width: 48, height: 18 },
};

export function formFieldMappingToPlacedPdfField(
  mapping: FormFieldMapping,
): PlacedPdfField {
  const field = mapping.fields;
  const widgetType =
    mapping.field_widget_type ?? field?.field_widget_type ?? "text";

  return {
    id: mapping.id,
    field_id: mapping.field_id,
    form_id: mapping.form_id,
    field_key: field?.field_key ?? "",
    field_label: field?.field_label ?? null,
    field_type: catalogTypesToLegacyFieldType(widgetType),
    field_widget_type: mapping.field_widget_type ?? field?.field_widget_type ?? null,
    mapping_name: mapping.mapping_name,
    occurrence_index: mapping.occurrence_index,
    default_value_override: mapping.default_value_override,
    alignment: mapping.alignment,
    page_number: mapping.page_number,
    x_position: mapping.x,
    y_position: mapping.y,
    width: mapping.width,
    height: mapping.height,
    page_width: mapping.page_width,
    page_height: mapping.page_height,
    font_size: mapping.font_size ?? 10,
    is_required: mapping.required,
    notes: mapping.notes,
    create_date: mapping.create_date,
    update_date: mapping.update_date,
    status: mapping.status,
  };
}

export function formatTemplatePdfFieldType(
  fieldType: TemplatePdfFieldType,
): string {
  return FIELD_TYPE_LABELS[fieldType];
}

export function getDefaultFieldDimensions(fieldType: TemplatePdfFieldType) {
  return DEFAULT_FIELD_DIMENSIONS[fieldType];
}

export function templatePdfFieldToInput(
  field: PlacedPdfField,
): TemplatePdfFieldInput {
  const defaults = getDefaultFieldDimensions(field.field_type);

  return {
    field_key: field.field_key,
    field_label: field.field_label ?? "",
    field_type: field.field_type,
    width: String(field.width ?? defaults.width),
    height: String(field.height ?? defaults.height),
    font_size: String(field.font_size),
    is_required: field.is_required,
    notes: field.notes ?? "",
  };
}

export function emptyTemplatePdfFieldInput(
  fieldType: TemplatePdfFieldType = "TEXT",
): TemplatePdfFieldInput {
  const defaults = getDefaultFieldDimensions(fieldType);

  return {
    field_key: "",
    field_label: "",
    field_type: fieldType,
    width: String(defaults.width),
    height: String(defaults.height),
    font_size: "10",
    is_required: false,
    notes: "",
  };
}

export function roundPdfCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampPdfPlacementToPage(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  page_width: number;
  page_height: number;
}): { x: number; y: number; width: number; height: number } {
  const { page_width, page_height } = params;
  const minDimension = 1;

  let width = Math.max(minDimension, params.width);
  let height = Math.max(minDimension, params.height);
  width = Math.min(width, page_width);
  height = Math.min(height, page_height);

  const x = Math.max(0, Math.min(params.x, page_width - width));
  const y = Math.max(0, Math.min(params.y, page_height - height));

  return {
    x: roundPdfCoordinate(x),
    y: roundPdfCoordinate(y),
    width: roundPdfCoordinate(width),
    height: roundPdfCoordinate(height),
  };
}

export function clickToPdfCoordinates(
  clickX: number,
  clickY: number,
  metrics: PageMetrics,
): { x: number; y: number } {
  const x = (clickX / metrics.renderedWidth) * metrics.originalWidth;
  const y = (clickY / metrics.renderedHeight) * metrics.originalHeight;

  return {
    x: roundPdfCoordinate(x),
    y: roundPdfCoordinate(y),
  };
}

export function getFieldPageDimensions(
  field: Pick<PlacedPdfField, "page_width" | "page_height">,
  metrics: PageMetrics,
) {
  return {
    originalWidth: field.page_width ?? metrics.originalWidth,
    originalHeight: field.page_height ?? metrics.originalHeight,
  };
}

export function pdfToRenderRect(
  field: Pick<
    PlacedPdfField,
    | "x_position"
    | "y_position"
    | "width"
    | "height"
    | "field_type"
    | "page_width"
    | "page_height"
  >,
  metrics: PageMetrics,
) {
  const defaults = getDefaultFieldDimensions(field.field_type);
  const pdfWidth = field.width ?? defaults.width;
  const pdfHeight = field.height ?? defaults.height;
  const { originalWidth, originalHeight } = getFieldPageDimensions(
    field,
    metrics,
  );

  return {
    left: (field.x_position / originalWidth) * metrics.renderedWidth,
    top: (field.y_position / originalHeight) * metrics.renderedHeight,
    width: (pdfWidth / originalWidth) * metrics.renderedWidth,
    height: (pdfHeight / originalHeight) * metrics.renderedHeight,
  };
}

export function renderRectToPdfPlacement(
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  metrics: PageMetrics,
  fieldPageDimensions?: Pick<PlacedPdfField, "page_width" | "page_height"> | null,
) {
  const originalWidth =
    fieldPageDimensions?.page_width ?? metrics.originalWidth;
  const originalHeight =
    fieldPageDimensions?.page_height ?? metrics.originalHeight;
  const scaleX = originalWidth / metrics.renderedWidth;
  const scaleY = originalHeight / metrics.renderedHeight;

  return {
    x: roundPdfCoordinate(rect.x * scaleX),
    y: roundPdfCoordinate(rect.y * scaleY),
    width: roundPdfCoordinate(rect.width * scaleX),
    height: roundPdfCoordinate(rect.height * scaleY),
    page_width: roundPdfCoordinate(metrics.originalWidth),
    page_height: roundPdfCoordinate(metrics.originalHeight),
  };
}

export function validateTemplatePdfFieldInput(
  input: TemplatePdfFieldInput,
): string | null {
  if (!input.field_key.trim()) {
    return "Field key is required.";
  }

  if (!input.field_label.trim()) {
    return "Label is required.";
  }

  if (!input.field_type) {
    return "Field type is required.";
  }

  const width = Number(input.width);
  if (!Number.isFinite(width) || width <= 0) {
    return "Width must be a positive number.";
  }

  const height = Number(input.height);
  if (!Number.isFinite(height) || height <= 0) {
    return "Height must be a positive number.";
  }

  const fontSize = Number(input.font_size);
  if (!Number.isFinite(fontSize) || fontSize <= 0) {
    return "Font size must be a positive number.";
  }

  return null;
}

export function normalizeTemplatePdfFieldInput(input: TemplatePdfFieldInput) {
  const trim = (value: string) => value.trim();
  const catalogTypes = legacyFieldTypeToCatalogTypes(input.field_type);

  return {
    field_key: trim(input.field_key).toUpperCase(),
    field_label: trim(input.field_label),
    field_data_type: catalogTypes.field_data_type,
    field_widget_type: catalogTypes.field_widget_type,
    field_type: input.field_type,
    width: Number(trim(input.width)),
    height: Number(trim(input.height)),
    font_size: Number(trim(input.font_size) || "10"),
    is_required: input.is_required,
    notes: trim(input.notes) || null,
  };
}
