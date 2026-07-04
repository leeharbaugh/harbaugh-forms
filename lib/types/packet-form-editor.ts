import { sortPacketFormFieldViews } from "@/lib/pdf-field-sort";
import type { FormFieldMapping } from "@/lib/types/form-field-mapping";
import type {
  FieldInstance,
  FieldInstanceMapping,
  FieldInstanceWithField,
} from "@/lib/types/field-instance";
import { isAuthentisignExcludedFormFieldMapping } from "@/lib/types/authentisign-excluded-fields";
import type { TemplatePdfFieldType } from "@/lib/types/template-pdf-field";
import { catalogTypesToLegacyFieldType } from "@/lib/types/field";

export type PlacementSource = "template" | "packet_override";

export type ResolvedPacketPlacement = {
  page_number: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  page_width: number | null;
  page_height: number | null;
  font_size: number | null;
  alignment: string | null;
  source: PlacementSource;
  field_instance_mapping_id: string | null;
};

export type PacketFormFieldView = {
  mapping: FormFieldMapping;
  instance: FieldInstanceWithField;
  placement: ResolvedPacketPlacement;
  displayValue: string;
  field_type: TemplatePdfFieldType;
  hasPlacementOverride: boolean;
};

export type PacketFormEditorData = {
  packetForm: {
    id: number;
    packet_id: number;
    form_id: number;
    document_name: string;
    storage_path: string | null;
    status: string;
    forms: {
      id: number;
      form_name: string;
      form_code: string;
      source_storage_path: string | null;
    } | null;
  };
  fields: PacketFormFieldView[];
};

export function resolvePacketFormPlacement(
  mapping: FormFieldMapping,
  placementOverride: FieldInstanceMapping | null | undefined,
): ResolvedPacketPlacement {
  if (placementOverride) {
    return {
      page_number: placementOverride.page_number,
      x: placementOverride.x,
      y: placementOverride.y,
      width: placementOverride.width,
      height: placementOverride.height,
      page_width: placementOverride.page_width,
      page_height: placementOverride.page_height,
      font_size: placementOverride.font_size,
      alignment: placementOverride.alignment,
      source: "packet_override",
      field_instance_mapping_id: placementOverride.id,
    };
  }

  return {
    page_number: mapping.page_number,
    x: mapping.x,
    y: mapping.y,
    width: mapping.width,
    height: mapping.height,
    page_width: mapping.page_width,
    page_height: mapping.page_height,
    font_size: mapping.font_size,
    alignment: mapping.alignment,
    source: "template",
    field_instance_mapping_id: null,
  };
}

export function buildPacketFormFieldViews(params: {
  mappings: FormFieldMapping[];
  instances: FieldInstanceWithField[];
  placementOverrides: FieldInstanceMapping[];
}): PacketFormFieldView[] {
  const instancesByFieldId = new Map(
    params.instances.map((instance) => [instance.field_id, instance]),
  );
  const overridesByMappingId = new Map(
    params.placementOverrides
      .filter((override) => override.form_field_mapping_id)
      .map((override) => [override.form_field_mapping_id as string, override]),
  );

  const fieldViews = params.mappings.flatMap((mapping) => {
    if (isAuthentisignExcludedFormFieldMapping(mapping)) {
      return [];
    }

    const instance = instancesByFieldId.get(mapping.field_id ?? "");
    if (!mapping.field_id || !instance) {
      return [];
    }

    const placementOverride = overridesByMappingId.get(mapping.id) ?? null;
    const placement = resolvePacketFormPlacement(mapping, placementOverride);
    const widgetType =
      mapping.field_widget_type ?? instance.fields?.field_widget_type ?? "text";

    return [
      {
        mapping,
        instance,
        placement,
        displayValue: instance.value ?? "",
        field_type: catalogTypesToLegacyFieldType(widgetType),
        hasPlacementOverride: placement.source === "packet_override",
      },
    ];
  });

  return sortPacketFormFieldViews(fieldViews);
}

/** Unique selection key per template placement row (mapping id), not per field instance. */
export function getPacketFormFieldSelectionKey(
  fieldView: Pick<PacketFormFieldView, "instance" | "mapping">,
): string {
  return fieldView.mapping.id || fieldView.instance.id;
}

export function packetFormFieldViewToOverlayField(
  fieldView: PacketFormFieldView,
): {
  id: string;
  selectionKey: string;
  field_instance_id: string;
  field_id: string;
  field_key: string;
  field_label: string | null;
  field_type: TemplatePdfFieldType;
  page_number: number;
  x_position: number;
  y_position: number;
  width: number | null;
  height: number | null;
  page_width: number | null;
  page_height: number | null;
  font_size: number;
  is_required: boolean;
  hasPlacementOverride: boolean;
  displayValue: string;
  default_checked: boolean;
  editorControl: PacketFieldEditorControl;
  occurrence_index: number | null;
} {
  const field = fieldView.instance.fields;
  const selectionKey = getPacketFormFieldSelectionKey(fieldView);

  return {
    id: fieldView.mapping.id,
    selectionKey,
    field_instance_id: fieldView.instance.id,
    field_id: fieldView.mapping.field_id ?? fieldView.instance.field_id,
    field_key: field?.field_key ?? "",
    field_label: field?.field_label ?? fieldView.mapping.mapping_name,
    field_type: fieldView.field_type,
    page_number: fieldView.placement.page_number,
    x_position: fieldView.placement.x,
    y_position: fieldView.placement.y,
    width: fieldView.placement.width,
    height: fieldView.placement.height,
    page_width: fieldView.placement.page_width,
    page_height: fieldView.placement.page_height,
    font_size: fieldView.placement.font_size ?? 10,
    is_required: fieldView.mapping.required,
    hasPlacementOverride: fieldView.hasPlacementOverride,
    displayValue: fieldView.displayValue,
    default_checked: field?.default_checked ?? false,
    editorControl: resolvePacketFieldEditorControl(fieldView),
    occurrence_index: fieldView.mapping.occurrence_index,
  };
}

export function formatPacketFieldDisplayValue(
  value: string,
  fieldType: TemplatePdfFieldType,
): string {
  if (fieldType === "CHECKBOX") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return "Yes";
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return "No";
    }
  }

  return value.trim() || "—";
}

export function isCheckboxCheckedValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return false;
}

export function resolveCheckboxCheckedState(
  value: string,
  defaultChecked?: boolean | null,
): boolean {
  const trimmed = value.trim();
  if (trimmed) {
    return isCheckboxCheckedValue(trimmed);
  }
  return defaultChecked === true;
}

export function isPacketFieldValueEmpty(
  value: string,
  fieldType: TemplatePdfFieldType,
  defaultChecked?: boolean | null,
): boolean {
  if (fieldType === "CHECKBOX") {
    if (value.trim()) {
      return !resolveCheckboxCheckedState(value, defaultChecked);
    }
    return defaultChecked !== true;
  }

  return !value.trim();
}

export function formatPacketFieldOverlayValue(
  value: string,
  fieldType: TemplatePdfFieldType,
): string {
  if (fieldType === "CHECKBOX") {
    return "";
  }

  return value.trim();
}

export function packetFieldSidebarLabel(fieldView: PacketFormFieldView): string {
  const field = fieldView.instance.fields;
  return (
    field?.field_label?.trim() ||
    fieldView.mapping.mapping_name?.trim() ||
    field?.field_key ||
    "Field"
  );
}

export type PacketFieldEditorControl =
  | "text"
  | "number"
  | "date"
  | "checkbox";

export function resolvePacketFieldEditorControl(
  fieldView: PacketFormFieldView,
): PacketFieldEditorControl {
  const field = fieldView.instance.fields;
  const widgetType = (
    field?.field_widget_type ??
    fieldView.mapping.field_widget_type ??
    "text"
  ).toLowerCase();
  const dataType = (field?.field_data_type ?? "text").toLowerCase();

  if (widgetType === "checkbox" || dataType === "boolean") {
    return "checkbox";
  }

  if (widgetType === "date" || dataType === "date") {
    return "date";
  }

  if (dataType === "number" || dataType === "currency") {
    return "number";
  }

  return "text";
}

export function buildDraftValuesFromFieldViews(
  fieldViews: PacketFormFieldView[],
): Record<string, string> {
  const drafts: Record<string, string> = {};

  for (const fieldView of fieldViews) {
    drafts[fieldView.instance.id] = fieldView.displayValue;
  }

  return drafts;
}

export function applyDraftValuesToFieldViews(
  fieldViews: PacketFormFieldView[],
  draftValuesByInstanceId: Record<string, string>,
): PacketFormFieldView[] {
  return fieldViews.map((fieldView) => ({
    ...fieldView,
    displayValue:
      draftValuesByInstanceId[fieldView.instance.id] ?? fieldView.displayValue,
  }));
}

export function getDirtyFieldInstanceIds(
  draftValuesByInstanceId: Record<string, string>,
  savedValuesByInstanceId: Record<string, string>,
): string[] {
  const dirtyIds = new Set<string>();

  for (const [instanceId, draftValue] of Object.entries(
    draftValuesByInstanceId,
  )) {
    if (draftValue !== (savedValuesByInstanceId[instanceId] ?? "")) {
      dirtyIds.add(instanceId);
    }
  }

  return [...dirtyIds];
}

export function isManualFieldValueOverride(
  instance: Pick<FieldInstance, "is_override" | "source">,
): boolean {
  if (instance.is_override) {
    return true;
  }

  const source = (instance.source ?? "").trim().toLowerCase();
  return (
    source === "manual" ||
    source === "manual_override" ||
    source === "override"
  );
}
