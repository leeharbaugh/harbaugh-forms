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
  /** @deprecated Use importedCount */
  createdMappings: number;
  /** @deprecated Use alreadyExistedCount */
  skippedExistingMappings: number;
  /** @deprecated Use skippedSignatureFields */
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

function buildMappingPayload(
  formId: number,
  fieldId: string | null,
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
    notes: "Imported from PDF AcroForm field inventory.",
    pdf_field_name: item.pdfFieldName,
    pdf_field_type: item.pdfFieldType,
    pdf_export_value: item.pdfExportValue,
    status: "ACTIVE" as const,
  };
}

function mappingNeedsUpdate(
  existing: FormFieldMapping,
  payload: ReturnType<typeof buildMappingPayload>,
  options?: { updateFieldId?: boolean },
): boolean {
  const fieldIdChanged =
    options?.updateFieldId && existing.field_id !== payload.field_id;

  return (
    fieldIdChanged ||
    existing.mapping_name !== payload.mapping_name ||
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

export async function applyPdfFieldInventory(
  supabase: SupabaseClient,
  formId: number,
  items: PdfFieldInventoryItem[],
  options?: {
    detectedCount?: number;
    skippedSignatureFields?: number;
    fieldIdResolver?: (
      item: PdfFieldInventoryItem,
      existingMapping: FormFieldMapping | null,
    ) => string | null;
    updateFieldId?: boolean;
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

    const acroKey = acroFormMappingKey(item.pdfFieldName, item.occurrenceIndex);
    const existingMapping = existingByAcroFormKey.get(acroKey);

    let fieldId = existingMapping?.field_id ?? null;

    if (options?.fieldIdResolver) {
      fieldId = options.fieldIdResolver(item, existingMapping ?? null);
    }

    const payload = buildMappingPayload(formId, fieldId, item);

    if (existingMapping) {
      if (
        !mappingNeedsUpdate(existingMapping, payload, {
          updateFieldId: options?.updateFieldId,
        })
      ) {
        result.alreadyExistedCount += 1;
        result.skippedExistingMappings += 1;
        result.alreadyExistedItems.push(toDetailItem(item));
        continue;
      }

      const { error } = await supabase
        .from("form_field_mappings")
        .update({
          ...(options?.updateFieldId ? { field_id: payload.field_id } : {}),
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

export async function loadMappableFormFieldMappingsForForm(
  supabase: SupabaseClient,
  formId: number,
): Promise<FormFieldMapping[]> {
  const mappings = await loadActiveFormFieldMappingsForForm(supabase, formId);
  return mappings.filter(
    (mapping) => !isAuthentisignExcludedFormFieldMapping(mapping),
  );
}

export { FORM_FIELD_MAPPING_SELECT };
