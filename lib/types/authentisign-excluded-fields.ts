import type { Field } from "@/lib/types/field";
import type { FormFieldMapping } from "@/lib/types/form-field-mapping";
import type { TemplatePdfFieldType } from "@/lib/types/template-pdf-field";
import { catalogTypesToLegacyFieldType } from "@/lib/types/field";

export const AUTHENTISIGN_EXCLUDED_WIDGET_TYPES = [
  "signature",
  "initial",
  "initials",
] as const;

export type AuthentisignExcludedWidgetType =
  (typeof AUTHENTISIGN_EXCLUDED_WIDGET_TYPES)[number];

export function normalizeAuthentisignFieldKey(fieldKey: string): string {
  return fieldKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function isAuthentisignExcludedWidgetType(
  widgetType: string | null | undefined,
): boolean {
  const normalized = (widgetType ?? "").trim().toLowerCase();
  return AUTHENTISIGN_EXCLUDED_WIDGET_TYPES.includes(
    normalized as AuthentisignExcludedWidgetType,
  );
}

export function isAuthentisignExcludedLegacyFieldType(
  fieldType: TemplatePdfFieldType | string | null | undefined,
): boolean {
  const normalized = (fieldType ?? "").trim().toUpperCase();
  return (
    normalized === "SIGNATURE_PLACEHOLDER" ||
    normalized === "INITIAL_PLACEHOLDER"
  );
}

export function isAuthentisignExcludedFieldKey(
  fieldKey: string | null | undefined,
): boolean {
  const key = normalizeAuthentisignFieldKey(fieldKey ?? "");
  if (!key) {
    return false;
  }

  if (
    key.includes("signature") ||
    key.endsWith("_sig") ||
    key.startsWith("sig_")
  ) {
    return true;
  }

  if (
    key.includes("_initial") ||
    key.includes("_initials") ||
    key.startsWith("initial_") ||
    key.startsWith("initials_") ||
    key.endsWith("_initial") ||
    key.endsWith("_initials")
  ) {
    return true;
  }

  return false;
}

export function isAuthentisignExcludedPdfFieldType(
  pdfFieldType: string | null | undefined,
): boolean {
  const normalized = (pdfFieldType ?? "").trim().toLowerCase();
  return normalized === "sig" || normalized === "signature";
}

export function isAuthentisignExcludedField(
  field: Pick<Field, "field_key" | "field_widget_type"> | null | undefined,
): boolean {
  if (!field) {
    return false;
  }

  return (
    isAuthentisignExcludedWidgetType(field.field_widget_type) ||
    isAuthentisignExcludedFieldKey(field.field_key) ||
    isAuthentisignExcludedLegacyFieldType(
      catalogTypesToLegacyFieldType(field.field_widget_type),
    )
  );
}

export function isAuthentisignExcludedFormFieldMapping(
  mapping: Pick<FormFieldMapping, "field_widget_type" | "fields">,
): boolean {
  const widgetType =
    mapping.field_widget_type ?? mapping.fields?.field_widget_type ?? null;

  return (
    isAuthentisignExcludedWidgetType(widgetType) ||
    isAuthentisignExcludedField(mapping.fields) ||
    isAuthentisignExcludedLegacyFieldType(
      catalogTypesToLegacyFieldType(widgetType ?? "text"),
    )
  );
}

export function filterMappableFormFieldMappings<
  T extends Pick<FormFieldMapping, "field_widget_type" | "fields">,
>(mappings: T[]): T[] {
  return mappings.filter(
    (mapping) => !isAuthentisignExcludedFormFieldMapping(mapping),
  );
}

export function shouldSkipAuthentisignPdfInventoryField(params: {
  fieldKey: string;
  pdfFieldType?: string | null;
  fieldWidgetType?: string | null;
}): boolean {
  return (
    isAuthentisignExcludedPdfFieldType(params.pdfFieldType) ||
    isAuthentisignExcludedFieldKey(params.fieldKey) ||
    isAuthentisignExcludedWidgetType(params.fieldWidgetType)
  );
}

export const AUTHENTISIGN_EXCLUSION_MESSAGE =
  "Initials and signatures are handled in Authentisign and are not imported into Harbaugh Forms.";
