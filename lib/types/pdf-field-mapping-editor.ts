import {
  FIELD_DATA_TYPES,
  FIELD_WIDGET_TYPES,
  catalogTypesToLegacyFieldType,
  legacyFieldTypeToCatalogTypes,
  type Field,
  type FieldInput,
  formatFieldDataType,
  formatFieldWidgetType,
  normalizeFieldInput,
  validateFieldInput,
} from "@/lib/types/field";
import { emptyFieldSourceInput } from "@/lib/types/field-source";
import { CHECKBOX_MAPPING_SIZE_PX } from "@/lib/checkbox-constants";
import {
  type PlacedPdfField,
  getDefaultFieldDimensions,
  getEffectivePdfFieldDimensions,
  type PendingPdfPlacement,
} from "@/lib/types/template-pdf-field";
import { isCheckboxWidgetType } from "@/lib/field-instances";

export type { PendingPdfPlacement };

export type FieldSelectionMode = "existing" | "quick_create";

export type QuickCreateFieldInput = {
  field_key: string;
  field_name: string;
  field_label: string;
  field_data_type: string;
  field_widget_type: string;
};

export type PdfMappingEditorInput = {
  field_selection_mode: FieldSelectionMode;
  field_id: string;
  quick_create: QuickCreateFieldInput;
  mapping_name: string;
  occurrence_index: string;
  field_widget_type: string;
  default_value_override: string;
  required: boolean;
  notes: string;
  page_number: string;
  x: string;
  y: string;
  width: string;
  height: string;
  font_size: string;
  alignment: string;
};

export const MAPPING_ALIGNMENT_OPTIONS = ["left", "center", "right"] as const;

export const MAPPABLE_FIELD_WIDGET_TYPES = [...FIELD_WIDGET_TYPES];

export function emptyQuickCreateFieldInput(): QuickCreateFieldInput {
  return {
    field_key: "",
    field_name: "",
    field_label: "",
    field_data_type: "text",
    field_widget_type: "text",
  };
}

export function emptyPdfMappingEditorInput(
  widgetType = "text",
): PdfMappingEditorInput {
  const legacyType = catalogTypesToLegacyFieldType(widgetType);
  const defaults = getDefaultFieldDimensions(legacyType);

  return {
    field_selection_mode: "existing",
    field_id: "",
    quick_create: emptyQuickCreateFieldInput(),
    mapping_name: "",
    occurrence_index: "0",
    field_widget_type: widgetType,
    default_value_override: "",
    required: false,
    notes: "",
    page_number: "1",
    x: "0",
    y: "0",
    width: String(defaults.width),
    height: String(defaults.height),
    font_size: "10",
    alignment: "left",
  };
}

export function placedPdfFieldToMappingInput(
  placed: PlacedPdfField,
): PdfMappingEditorInput {
  const widgetType =
    placed.field_widget_type ??
    legacyFieldTypeToCatalogTypes(placed.field_type).field_widget_type;
  const effective = getEffectivePdfFieldDimensions({
    field_type: placed.field_type,
    field_widget_type: widgetType,
    width: placed.width,
    height: placed.height,
  });

  return {
    field_selection_mode: "existing",
    field_id: placed.field_id,
    quick_create: emptyQuickCreateFieldInput(),
    mapping_name: placed.mapping_name ?? "",
    occurrence_index: String(placed.occurrence_index ?? 0),
    field_widget_type: widgetType,
    default_value_override: placed.default_value_override ?? "",
    required: placed.is_required,
    notes: placed.notes ?? "",
    page_number: String(placed.page_number),
    x: String(placed.x_position),
    y: String(placed.y_position),
    width: String(effective.width),
    height: String(effective.height),
    font_size: String(placed.font_size),
    alignment: placed.alignment ?? "left",
  };
}

export function mappingInputForPlacement(
  pageNumber: number,
  x: number,
  y: number,
  widgetType = "text",
): PdfMappingEditorInput {
  return {
    ...emptyPdfMappingEditorInput(widgetType),
    page_number: String(pageNumber),
    x: String(x),
    y: String(y),
  };
}

export function formatMappingOverlayLabel(placed: PlacedPdfField): string {
  const base =
    placed.mapping_name?.trim() ||
    placed.field_label?.trim() ||
    placed.field_key ||
    "Field";

  if (placed.occurrence_index != null && placed.occurrence_index > 0) {
    return `${base} #${placed.occurrence_index}`;
  }

  return base;
}

export type TemplatePlacementSidebarDetails = {
  field_key: string;
  field_label: string;
  page_number: number;
  mapping_name: string | null;
  occurrence_index: number | null;
};

export function templatePlacementSidebarDetails(
  placed: PlacedPdfField,
): TemplatePlacementSidebarDetails {
  return {
    field_key: placed.field_key || "—",
    field_label: placed.field_label?.trim() || "—",
    page_number: placed.page_number,
    mapping_name: placed.mapping_name?.trim() || null,
    occurrence_index: placed.occurrence_index,
  };
}

export function validatePdfPlacementInput(
  input: PdfMappingEditorInput,
): string | null {
  if (!input.field_widget_type.trim()) {
    return "Widget type is required.";
  }

  const pageNumber = Number(input.page_number);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return "Page number must be at least 1.";
  }

  const x = Number(input.x);
  const y = Number(input.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return "X and Y position must be valid numbers.";
  }

  const width = Number(input.width);
  const height = Number(input.height);
  if (!Number.isFinite(width) || width <= 0) {
    return "Width must be a positive number.";
  }
  if (!Number.isFinite(height) || height <= 0) {
    return "Height must be a positive number.";
  }

  const fontSize = Number(input.font_size);
  if (!Number.isFinite(fontSize) || fontSize <= 0) {
    return "Font size must be a positive number.";
  }

  const occurrenceIndex = Number(input.occurrence_index);
  if (!Number.isFinite(occurrenceIndex) || occurrenceIndex < 0) {
    return "Occurrence index must be zero or greater.";
  }

  return null;
}

export function validatePdfMappingEditorInput(
  input: PdfMappingEditorInput,
): string | null {
  if (input.field_selection_mode === "existing" && !input.field_id.trim()) {
    return "Select a field from the catalog.";
  }

  if (input.field_selection_mode === "quick_create") {
    const quickCreateInput: FieldInput = {
      field_key: input.quick_create.field_key,
      field_name: input.quick_create.field_name,
      field_label: input.quick_create.field_label,
      field_data_type: input.quick_create.field_data_type,
      field_widget_type: input.quick_create.field_widget_type,
      default_value: "",
      default_checked: false,
      required: false,
      notes: "",
      ...emptyFieldSourceInput(),
    };
    const quickCreateError = validateFieldInput(quickCreateInput);
    if (quickCreateError) {
      return quickCreateError;
    }
  }

  return validatePdfPlacementInput(input);
}

export function normalizePdfMappingEditorInput(input: PdfMappingEditorInput) {
  const trim = (value: string) => value.trim();
  const widgetType = trim(input.field_widget_type);
  const isCheckbox = isCheckboxWidgetType(widgetType);

  return {
    field_selection_mode: input.field_selection_mode,
    field_id: trim(input.field_id) || null,
    quick_create:
      input.field_selection_mode === "quick_create"
        ? normalizeFieldInput({
            field_key: input.quick_create.field_key,
            field_name: input.quick_create.field_name,
            field_label: input.quick_create.field_label,
            field_data_type: input.quick_create.field_data_type,
            field_widget_type: input.quick_create.field_widget_type,
            default_value: "",
            default_checked: false,
            required: false,
            notes: "",
            ...emptyFieldSourceInput(),
          })
        : null,
    mapping: {
      mapping_name: trim(input.mapping_name) || null,
      occurrence_index: Number(trim(input.occurrence_index) || "0"),
      page_number: Number(trim(input.page_number) || "1"),
      x: Number(trim(input.x) || "0"),
      y: Number(trim(input.y) || "0"),
      width: isCheckbox
        ? CHECKBOX_MAPPING_SIZE_PX
        : Number(trim(input.width)),
      height: isCheckbox
        ? CHECKBOX_MAPPING_SIZE_PX
        : Number(trim(input.height)),
      font_size: Number(trim(input.font_size) || "10"),
      alignment: trim(input.alignment) || null,
      field_widget_type: widgetType,
      default_value_override: trim(input.default_value_override) || null,
      required: input.required,
      notes: trim(input.notes) || null,
    },
  };
}

export function applyWidgetTypeDefaults(
  input: PdfMappingEditorInput,
  widgetType: string,
): PdfMappingEditorInput {
  const legacyType = catalogTypesToLegacyFieldType(widgetType);
  const defaults = getDefaultFieldDimensions(legacyType);
  const catalogTypes = legacyFieldTypeToCatalogTypes(legacyType);

  return {
    ...input,
    field_widget_type: widgetType,
    width: String(defaults.width),
    height: String(defaults.height),
    quick_create:
      input.field_selection_mode === "quick_create"
        ? {
            ...input.quick_create,
            field_data_type: catalogTypes.field_data_type,
            field_widget_type: catalogTypes.field_widget_type,
          }
        : input.quick_create,
  };
}

export function fieldOptionLabel(field: Field): string {
  const label = field.field_label?.trim() || field.field_name?.trim();
  return label ? `${field.field_key} · ${label}` : field.field_key;
}

export {
  FIELD_DATA_TYPES,
  FIELD_WIDGET_TYPES,
  formatFieldDataType,
  formatFieldWidgetType,
};
