import type { SupabaseClient } from "@supabase/supabase-js";
import { findActiveFieldByKey, upsertActiveField } from "@/lib/field-catalog";
import { loadActiveFormFieldMappingsForForm } from "@/lib/field-instances";
import {
  isAuthentisignExcludedFormFieldMapping,
  shouldSkipAuthentisignPdfInventoryField,
} from "@/lib/types/authentisign-excluded-fields";
import { emptyFieldSourceInput } from "@/lib/types/field-source";
import {
  FORM_FIELD_MAPPING_SELECT,
  type FormFieldMapping,
} from "@/lib/types/form-field-mapping";
import type { PdfFieldInventoryItem } from "@/lib/pdf-field-extract";
import { isCheckboxWidgetType } from "@/lib/field-instances";
import { CHECKBOX_MAPPING_SIZE_PX } from "@/lib/checkbox-constants";

export type ApplyPdfFieldInventoryResult = {
  createdFields: number;
  reusedFields: number;
  createdMappings: number;
  skippedExistingMappings: number;
  skippedAuthentisign: number;
};

function mappingPlacementKey(
  mapping: Pick<
    FormFieldMapping,
    "field_id" | "page_number" | "occurrence_index" | "x" | "y"
  >,
): string {
  return [
    mapping.field_id,
    mapping.page_number,
    mapping.occurrence_index ?? 0,
    mapping.x,
    mapping.y,
  ].join(":");
}

function inventoryPlacementKey(
  fieldId: string,
  item: PdfFieldInventoryItem,
): string {
  return [
    fieldId,
    item.pageNumber,
    item.occurrenceIndex,
    item.x,
    item.y,
  ].join(":");
}

export async function applyPdfFieldInventory(
  supabase: SupabaseClient,
  formId: number,
  items: PdfFieldInventoryItem[],
): Promise<ApplyPdfFieldInventoryResult> {
  const existingMappings = await loadActiveFormFieldMappingsForForm(
    supabase,
    formId,
  );
  const mappableExisting = existingMappings.filter(
    (mapping) => !isAuthentisignExcludedFormFieldMapping(mapping),
  );
  const existingPlacementKeys = new Set(
    mappableExisting.map((mapping) => mappingPlacementKey(mapping)),
  );

  const result: ApplyPdfFieldInventoryResult = {
    createdFields: 0,
    reusedFields: 0,
    createdMappings: 0,
    skippedExistingMappings: 0,
    skippedAuthentisign: 0,
  };

  for (const item of items) {
    if (
      shouldSkipAuthentisignPdfInventoryField({
        fieldKey: item.fieldKey,
        fieldWidgetType: item.fieldWidgetType,
      })
    ) {
      result.skippedAuthentisign += 1;
      continue;
    }

    const existingCatalogField = await findActiveFieldByKey(
      supabase,
      item.fieldKey,
    );
    const field = await upsertActiveField(supabase, {
      field_key: item.fieldKey,
      field_name: item.fieldKey,
      field_label: item.fieldLabel,
      field_data_type: item.fieldDataType,
      field_widget_type: item.fieldWidgetType,
      default_value: "",
      default_checked: false,
      required: false,
      notes: "Imported from PDF AcroForm field inventory.",
      ...emptyFieldSourceInput(),
    });

    if (existingCatalogField) {
      result.reusedFields += 1;
    } else {
      result.createdFields += 1;
    }

    const placementKey = inventoryPlacementKey(field.id, item);
    if (existingPlacementKeys.has(placementKey)) {
      result.skippedExistingMappings += 1;
      continue;
    }

    const { error } = await supabase.from("form_field_mappings").insert({
      form_id: formId,
      field_id: field.id,
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
      font_size: 10,
      alignment: "left",
      field_widget_type: item.fieldWidgetType,
      default_value_override: null,
      required: false,
      notes: "Imported from PDF AcroForm field inventory.",
    });

    if (error) {
      throw new Error(error.message);
    }

    existingPlacementKeys.add(placementKey);
    result.createdMappings += 1;
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
