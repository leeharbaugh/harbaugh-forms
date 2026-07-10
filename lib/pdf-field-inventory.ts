import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActiveFormFieldMappingsForForm } from "@/lib/field-instances";
import {
  isAuthentisignExcludedFormFieldMapping,
  shouldSkipAuthentisignPdfInventoryField,
} from "@/lib/types/authentisign-excluded-fields";
import {
  FORM_FIELD_MAPPING_SELECT,
  type FormFieldMapping,
} from "@/lib/types/form-field-mapping";
import type { PdfFieldInventoryItem } from "@/lib/pdf-field-extract";
import { isCheckboxWidgetType } from "@/lib/field-instances";
import { CHECKBOX_MAPPING_SIZE_PX } from "@/lib/checkbox-constants";
import type { Field } from "@/lib/types/field";

export type ApplyPdfFieldInventoryDetailItem = {
  pdfFieldName: string;
  pageNumber: number;
  occurrenceIndex: number;
};

export type ApplyPdfFieldInventoryResult = {
  detectedCount: number;
  importedCount: number;
  skippedSignatureFields: number;
  updatedCount: number;
  alreadyExistedCount: number;
  createdFields: number;
  reusedFields: number;
  importedItems: ApplyPdfFieldInventoryDetailItem[];
  updatedItems: ApplyPdfFieldInventoryDetailItem[];
  alreadyExistedItems: ApplyPdfFieldInventoryDetailItem[];
  createdMappings: number;
  skippedExistingMappings: number;
  skippedAuthentisign: number;
};

function toDetailItem(item: PdfFieldInventoryItem): ApplyPdfFieldInventoryDetailItem {
  return {
    pdfFieldName: item.pdfFieldName,
    pageNumber: item.pageNumber,
    occurrenceIndex: item.occurrenceIndex,
  };
}

function acroFormMappingKey(
  pdfFieldName: string,
  occurrenceIndex: number,
): string {
  return `${pdfFieldName.trim().toLowerCase()}:${occurrenceIndex}`;
}

function normalizeFormCodeForFieldKey(formCode: string): string {
  return formCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function normalizePdfNameForFieldKey(pdfFieldName: string): string {
  return pdfFieldName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function buildFormSpecificFieldKey(
  formCode: string,
  pdfFieldName: string,
): string {
  const prefix = normalizeFormCodeForFieldKey(formCode);
  const suffix = normalizePdfNameForFieldKey(pdfFieldName);
  return `${prefix}_${suffix}`;
}

function humanizePdfFieldName(pdfFieldName: string): string {
  return pdfFieldName
    .trim()
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function buildMappingPayload(
  formId: number,
  fieldId: string,
  item: PdfFieldInventoryItem,
) {
  return {
    form_id: formId,
    field_id: fieldId,
    mapping_name: item.fieldLabel,
    occurrence_index: item.occurrenceIndex,
    page_number: item.pageNumber,
    x: item.x,
    y: item.y,
    width: isCheckboxWidgetType(item.fieldWidgetType)
      ? CHECKBOX_MAPPING_SIZE_PX
      : item.width,
    height: isCheckboxWidgetType(item.fieldWidgetType)
      ? CHECKBOX_MAPPING_SIZE_PX
      : item.height,
    page_width: item.pageWidth,
    page_height: item.pageHeight,
    font_size: 9,
    alignment: "left",
    field_widget_type: item.fieldWidgetType,
    default_value_override: item.pdfDefaultValue,
    required: false,
    notes: `Imported from AcroForm field: ${item.pdfFieldName}`,
    pdf_field_name: item.pdfFieldName,
    pdf_field_type: item.pdfFieldType,
    pdf_export_value: item.pdfExportValue,
    status: "ACTIVE" as const,
  };
}

function mappingNeedsUpdate(
  existing: FormFieldMapping,
  payload: ReturnType<typeof buildMappingPayload>,
): boolean {
  return (
    existing.page_number !== payload.page_number ||
    (existing.occurrence_index ?? 0) !== payload.occurrence_index ||
    existing.x !== payload.x ||
    existing.y !== payload.y ||
    existing.width !== payload.width ||
    existing.height !== payload.height ||
    existing.page_width !== payload.page_width ||
    existing.page_height !== payload.page_height ||
    existing.field_widget_type !== payload.field_widget_type ||
    existing.default_value_override !== payload.default_value_override ||
    existing.pdf_field_type !== payload.pdf_field_type ||
    existing.pdf_export_value !== payload.pdf_export_value
  );
}

async function findOrCreateFormField(
  supabase: SupabaseClient,
  fieldKey: string,
  item: PdfFieldInventoryItem,
): Promise<{ field: Field; created: boolean }> {
  const { data: existing } = await supabase
    .from("fields")
    .select("*")
    .eq("field_key", fieldKey)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (existing) {
    const existingField = existing as Field;
    // Upgrade AcroForm text fields to currency when name inference says so.
    if (
      item.fieldDataType === "currency" &&
      (existingField.field_data_type ?? "").toLowerCase() !== "currency"
    ) {
      const { data: updated, error: updateError } = await supabase
        .from("fields")
        .update({ field_data_type: "currency" })
        .eq("id", existingField.id)
        .select("*")
        .single();

      if (updateError) {
        throw new Error(
          `Failed to upgrade field ${fieldKey} to currency: ${updateError.message}`,
        );
      }

      return { field: updated as Field, created: false };
    }

    return { field: existingField, created: false };
  }

  const { data: created, error } = await supabase
    .from("fields")
    .insert({
      field_key: fieldKey,
      field_name: fieldKey,
      field_label: humanizePdfFieldName(item.pdfFieldName),
      field_data_type: item.fieldDataType,
      field_widget_type: item.fieldWidgetType,
      default_value: null,
      default_checked: item.fieldWidgetType === "checkbox" ? false : null,
      required: false,
      notes: `Imported from AcroForm field: ${item.pdfFieldName}`,
      source_type: "manual_only",
      source_path: null,
      resolver_key: null,
      fallback_value: null,
      status: "ACTIVE",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create field ${fieldKey}: ${error.message}`);
  }

  return { field: created as Field, created: true };
}

export async function importAcroformFields(
  supabase: SupabaseClient,
  formId: number,
  formCode: string,
  items: PdfFieldInventoryItem[],
  options?: {
    detectedCount?: number;
    skippedSignatureFields?: number;
  },
): Promise<ApplyPdfFieldInventoryResult> {
  const existingMappings = await loadActiveFormFieldMappingsForForm(
    supabase,
    formId,
  );
  const mappableExisting = existingMappings.filter(
    (mapping) => !isAuthentisignExcludedFormFieldMapping(mapping),
  );

  const existingByAcroFormKey = new Map<string, FormFieldMapping>();
  for (const mapping of mappableExisting) {
    const pdfFieldName = mapping.pdf_field_name?.trim();
    if (!pdfFieldName) {
      continue;
    }

    existingByAcroFormKey.set(
      acroFormMappingKey(pdfFieldName, mapping.occurrence_index ?? 0),
      mapping,
    );
  }

  const result: ApplyPdfFieldInventoryResult = {
    detectedCount: options?.detectedCount ?? items.length,
    importedCount: 0,
    skippedSignatureFields: options?.skippedSignatureFields ?? 0,
    updatedCount: 0,
    alreadyExistedCount: 0,
    createdFields: 0,
    reusedFields: 0,
    importedItems: [],
    updatedItems: [],
    alreadyExistedItems: [],
    createdMappings: 0,
    skippedExistingMappings: 0,
    skippedAuthentisign: options?.skippedSignatureFields ?? 0,
  };

  for (const item of items) {
    if (
      shouldSkipAuthentisignPdfInventoryField({
        fieldKey: item.fieldKey,
        pdfFieldType: item.pdfFieldType,
        fieldWidgetType: item.fieldWidgetType,
      })
    ) {
      result.skippedSignatureFields += 1;
      result.skippedAuthentisign += 1;
      continue;
    }

    const fieldKey = buildFormSpecificFieldKey(formCode, item.pdfFieldName);
    const { field, created: fieldCreated } = await findOrCreateFormField(
      supabase,
      fieldKey,
      item,
    );

    if (fieldCreated) {
      result.createdFields += 1;
    } else {
      result.reusedFields += 1;
    }

    const acroKey = acroFormMappingKey(item.pdfFieldName, item.occurrenceIndex);
    const existingMapping = existingByAcroFormKey.get(acroKey);
    const payload = buildMappingPayload(formId, field.id, item);

    if (existingMapping) {
      if (!mappingNeedsUpdate(existingMapping, payload)) {
        if (existingMapping.field_id !== field.id) {
          await supabase
            .from("form_field_mappings")
            .update({ field_id: field.id })
            .eq("id", existingMapping.id)
            .eq("status", "ACTIVE");
          result.updatedCount += 1;
          result.updatedItems.push(toDetailItem(item));
        } else {
          result.alreadyExistedCount += 1;
          result.skippedExistingMappings += 1;
          result.alreadyExistedItems.push(toDetailItem(item));
        }
        continue;
      }

      const { error } = await supabase
        .from("form_field_mappings")
        .update({
          field_id: field.id,
          mapping_name: payload.mapping_name,
          page_number: payload.page_number,
          occurrence_index: payload.occurrence_index,
          x: payload.x,
          y: payload.y,
          width: payload.width,
          height: payload.height,
          page_width: payload.page_width,
          page_height: payload.page_height,
          font_size: payload.font_size,
          alignment: payload.alignment,
          field_widget_type: payload.field_widget_type,
          default_value_override: payload.default_value_override,
          notes: payload.notes,
          pdf_field_name: payload.pdf_field_name,
          pdf_field_type: payload.pdf_field_type,
          pdf_export_value: payload.pdf_export_value,
          status: "ACTIVE",
        })
        .eq("id", existingMapping.id)
        .eq("status", "ACTIVE");

      if (error) {
        throw new Error(error.message);
      }

      result.updatedCount += 1;
      result.updatedItems.push(toDetailItem(item));
      continue;
    }

    const { error } = await supabase
      .from("form_field_mappings")
      .insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    result.importedCount += 1;
    result.createdMappings += 1;
    result.importedItems.push(toDetailItem(item));
  }

  return result;
}

export { FORM_FIELD_MAPPING_SELECT };
