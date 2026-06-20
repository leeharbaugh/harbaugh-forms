import type { SupabaseClient } from "@supabase/supabase-js";
import { retireFieldGlobally } from "@/lib/field-retire";
import {
  type FieldSourceInput,
  emptyFieldSourceInput,
  fieldSourceFromField,
  normalizeFieldSourceInput,
  validateFieldSourceInput,
} from "@/lib/types/field-source";

export type Field = {
  id: string;
  field_key: string;
  field_name: string | null;
  field_label: string | null;
  field_data_type: string;
  field_widget_type: string;
  default_value: string | null;
  default_checked: boolean | null;
  required: boolean;
  notes: string | null;
  source_type: string | null;
  source_path: string | null;
  resolver_key: string | null;
  fallback_value: string | null;
  create_date: string;
  update_date: string;
  status: string;
};

export type FieldInput = {
  field_key: string;
  field_name: string;
  field_label: string;
  field_data_type: string;
  field_widget_type: string;
  default_value: string;
  default_checked: boolean;
  required: boolean;
  notes: string;
} & FieldSourceInput;

export type FieldStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type FieldAdminInput = FieldInput & {
  status: FieldStatus;
};

/** Legacy data-source binding metadata migrated from pre-refactor form_field_mappings. */
export type LegacyFieldSource = {
  legacy_source_type?: string | null;
  legacy_source_field?: string | null;
  mapping_origin?: string | null;
};

export const FIELD_DATA_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "currency",
  "email",
  "phone",
] as const;

export const FIELD_WIDGET_TYPES = [
  "text",
  "checkbox",
  "date",
  "signature",
  "initials",
] as const;

export const FIELD_STATUSES: FieldStatus[] = ["ACTIVE", "INACTIVE", "DELETED"];

export type FieldDataType = (typeof FIELD_DATA_TYPES)[number];
export type FieldWidgetType = (typeof FIELD_WIDGET_TYPES)[number];

const DATA_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Boolean",
  currency: "Currency",
  email: "Email",
  phone: "Phone",
  signature: "Signature",
  initial: "Initials",
  initials: "Initials",
};

const WIDGET_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  checkbox: "Checkbox",
  date: "Date",
  signature: "Signature",
  initial: "Initials",
  initials: "Initials",
};

const STATUS_LABELS: Record<FieldStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  DELETED: "Deleted",
};

export function formatFieldDataType(dataType: string): string {
  return DATA_TYPE_LABELS[dataType] ?? dataType;
}

export function formatFieldWidgetType(widgetType: string): string {
  return WIDGET_TYPE_LABELS[widgetType] ?? widgetType;
}

export function formatFieldStatus(status: string): string {
  return STATUS_LABELS[status as FieldStatus] ?? status;
}

export function formatFieldReference(id: string): string {
  return id.slice(0, 8);
}

export function isFieldDeleted(field: Pick<Field, "status">): boolean {
  return field.status === "DELETED";
}

export function isBooleanField(input: Pick<FieldInput, "field_data_type" | "field_widget_type">): boolean {
  return input.field_data_type === "boolean" || input.field_widget_type === "checkbox";
}

export function legacyFieldTypeToCatalogTypes(fieldType: string): {
  field_data_type: FieldDataType;
  field_widget_type: FieldWidgetType;
} {
  switch (fieldType.toUpperCase()) {
    case "CHECKBOX":
      return { field_data_type: "boolean", field_widget_type: "checkbox" };
    case "DATE":
      return { field_data_type: "date", field_widget_type: "date" };
    case "SIGNATURE_PLACEHOLDER":
      return { field_data_type: "text", field_widget_type: "signature" };
    case "INITIAL_PLACEHOLDER":
      return { field_data_type: "text", field_widget_type: "initials" };
    default:
      return { field_data_type: "text", field_widget_type: "text" };
  }
}

export function catalogTypesToLegacyFieldType(
  widgetType: string,
): "TEXT" | "CHECKBOX" | "DATE" | "SIGNATURE_PLACEHOLDER" | "INITIAL_PLACEHOLDER" {
  switch (widgetType.toLowerCase()) {
    case "checkbox":
      return "CHECKBOX";
    case "date":
      return "DATE";
    case "signature":
      return "SIGNATURE_PLACEHOLDER";
    case "initial":
    case "initials":
      return "INITIAL_PLACEHOLDER";
    default:
      return "TEXT";
  }
}

export function emptyFieldAdminInput(): FieldAdminInput {
  return {
    ...emptyFieldInput(),
    status: "ACTIVE",
  };
}

export function fieldToAdminInput(field: Field): FieldAdminInput {
  return {
    ...fieldToInput(field),
    status: (field.status as FieldStatus) ?? "ACTIVE",
  };
}

export function emptyFieldInput(): FieldInput {
  return {
    field_key: "",
    field_name: "",
    field_label: "",
    field_data_type: "text",
    field_widget_type: "text",
    default_value: "",
    default_checked: false,
    required: false,
    notes: "",
    ...emptyFieldSourceInput(),
  };
}

export function fieldToInput(field: Field): FieldInput {
  return {
    field_key: field.field_key,
    field_name: field.field_name ?? "",
    field_label: field.field_label ?? "",
    field_data_type: field.field_data_type,
    field_widget_type: field.field_widget_type,
    default_value: field.default_value ?? "",
    default_checked: field.default_checked ?? false,
    required: field.required,
    notes: field.notes ?? "",
    ...fieldSourceFromField(field),
  };
}

export function parseLegacyFieldSource(notes: string | null): LegacyFieldSource | null {
  if (!notes?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(notes) as LegacyFieldSource;
    if (
      parsed.legacy_source_type ||
      parsed.legacy_source_field ||
      parsed.mapping_origin
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function serializeLegacyFieldSource(source: LegacyFieldSource): string | null {
  if (
    !source.legacy_source_type &&
    !source.legacy_source_field &&
    !source.mapping_origin
  ) {
    return null;
  }

  return JSON.stringify({
    legacy_source_type: source.legacy_source_type ?? null,
    legacy_source_field: source.legacy_source_field ?? null,
    mapping_origin: source.mapping_origin ?? null,
  });
}

export function mergeFieldNotes(
  userNotes: string | null,
  legacySource: LegacyFieldSource | null,
): string | null {
  const legacyJson = legacySource ? serializeLegacyFieldSource(legacySource) : null;
  const trimmedNotes = userNotes?.trim() || null;

  if (legacyJson && trimmedNotes) {
    return trimmedNotes === legacyJson ? legacyJson : trimmedNotes;
  }

  return trimmedNotes ?? legacyJson;
}

export function validateFieldAdminInput(input: FieldAdminInput): string | null {
  const baseError = validateFieldInput(input);
  if (baseError) {
    return baseError;
  }

  if (!FIELD_STATUSES.includes(input.status)) {
    return "Status is required.";
  }

  return null;
}

export function validateFieldInput(input: FieldInput): string | null {
  if (!input.field_key.trim()) {
    return "Field key is required.";
  }
  if (!input.field_label.trim()) {
    return "Field label is required.";
  }
  if (!input.field_data_type.trim()) {
    return "Field data type is required.";
  }
  if (!input.field_widget_type.trim()) {
    return "Field widget type is required.";
  }

  return validateFieldSourceInput(input);
}

export function normalizeFieldInput(input: FieldInput) {
  const trim = (value: string) => value.trim();
  const fieldKey = trim(input.field_key).toUpperCase();
  const widgetType =
    trim(input.field_widget_type) === "initial"
      ? "initials"
      : trim(input.field_widget_type);

  return {
    field_key: fieldKey,
    field_name: trim(input.field_name) || fieldKey,
    field_label: trim(input.field_label) || null,
    field_data_type: trim(input.field_data_type),
    field_widget_type: widgetType,
    default_value: trim(input.default_value) || null,
    default_checked: isBooleanField(input) ? input.default_checked : null,
    required: input.required,
    notes: trim(input.notes) || null,
    ...normalizeFieldSourceInput(input),
  };
}

export function normalizeFieldAdminInput(input: FieldAdminInput) {
  return {
    ...normalizeFieldInput(input),
    status: input.status,
  };
}

export async function deleteField(
  supabase: SupabaseClient,
  fieldId: string,
): Promise<void> {
  await retireFieldGlobally(supabase, fieldId);
}

export async function restoreField(
  supabase: SupabaseClient,
  fieldId: string,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("fields")
    .select("id, status")
    .eq("id", fieldId)
    .single();

  if (fetchError || !data) {
    throw new Error("Field not found.");
  }

  if (data.status !== "DELETED") {
    throw new Error("Only deleted fields can be restored.");
  }

  const { error } = await supabase
    .from("fields")
    .update({ status: "ACTIVE" })
    .eq("id", fieldId)
    .eq("status", "DELETED");

  if (error) {
    throw new Error(error.message);
  }
}
