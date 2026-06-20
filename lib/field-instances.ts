import type { SupabaseClient } from "@supabase/supabase-js";
import type { Field } from "@/lib/types/field";
import {
  FORM_FIELD_MAPPING_SELECT,
  type FormFieldMapping,
} from "@/lib/types/form-field-mapping";
import type { FieldInstance, FieldInstanceWithField, FieldInstanceValueSource } from "@/lib/types/field-instance";

export const FIELD_INSTANCE_SELECT = "*, fields(*)";

export type { FieldInstanceWithField };

export type PacketFormFieldContext = {
  id: number;
  packet_id: number;
  form_id: number | null;
  status: string;
};

export type ResolvedFieldInstanceValue = {
  value: string;
  source: FieldInstanceValueSource;
};

export function isCheckboxWidgetType(
  widgetType: string | null | undefined,
): boolean {
  return widgetType?.toLowerCase() === "checkbox";
}

export function resolveInitialFieldValue(params: {
  existingInstance?: Pick<FieldInstance, "value"> | null;
  mapping?: Pick<
    FormFieldMapping,
    "default_value_override" | "field_widget_type"
  > | null;
  field?: Pick<
    Field,
    "default_value" | "default_checked" | "field_widget_type"
  > | null;
}): ResolvedFieldInstanceValue {
  const { existingInstance, mapping, field } = params;

  if (existingInstance) {
    return {
      value: existingInstance.value ?? "",
      source: "existing",
    };
  }

  const mappingOverride = mapping?.default_value_override?.trim();
  if (mappingOverride) {
    return {
      value: mappingOverride,
      source: "mapping_override",
    };
  }

  const fieldDefault = field?.default_value?.trim();
  if (fieldDefault) {
    return {
      value: fieldDefault,
      source: "field_default",
    };
  }

  const widgetType =
    mapping?.field_widget_type ?? field?.field_widget_type ?? null;

  if (
    isCheckboxWidgetType(widgetType) &&
    field?.default_checked === true
  ) {
    return {
      value: "true",
      source: "field_default_checked",
    };
  }

  return {
    value: "",
    source: "empty",
  };
}

export async function getPacketFormFieldContext(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<PacketFormFieldContext> {
  const { data, error } = await supabase
    .from("packet_forms")
    .select("id, packet_id, form_id, status")
    .eq("id", packetFormId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Packet form not found.");
  }

  return data as PacketFormFieldContext;
}

export async function loadActiveFormFieldMappingsForForm(
  supabase: SupabaseClient,
  formId: number,
): Promise<FormFieldMapping[]> {
  const { data, error } = await supabase
    .from("form_field_mappings")
    .select(FORM_FIELD_MAPPING_SELECT)
    .eq("form_id", formId)
    .eq("status", "ACTIVE")
    .order("page_number", { ascending: true })
    .order("occurrence_index", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as FormFieldMapping[]) ?? [];
}

export async function loadActiveFieldInstancesForPacketForm(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<FieldInstanceWithField[]> {
  const { data, error } = await supabase
    .from("field_instances")
    .select(FIELD_INSTANCE_SELECT)
    .eq("packet_form_id", packetFormId)
    .eq("status", "ACTIVE")
    .order("create_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as FieldInstanceWithField[]) ?? [];
}

export async function ensureFieldInstancesForPacketForm(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<FieldInstanceWithField[]> {
  const { syncFieldInstancesForPacketForm } = await import("@/lib/field-resolver");
  return syncFieldInstancesForPacketForm(supabase, packetFormId);
}

export async function getOrCreateFieldInstancesForPacketForm(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<FieldInstanceWithField[]> {
  return ensureFieldInstancesForPacketForm(supabase, packetFormId);
}

export async function ensureFieldInstancesForPacket(
  supabase: SupabaseClient,
  packetId: number,
): Promise<FieldInstanceWithField[]> {
  const { data, error } = await supabase
    .from("packet_forms")
    .select("id, form_id, status")
    .eq("packet_id", packetId)
    .eq("status", "ACTIVE")
    .not("form_id", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const packetForms =
    (data as Array<{ id: number; form_id: number | null; status: string }>) ??
    [];

  const instances: FieldInstanceWithField[] = [];

  for (const packetForm of packetForms) {
    const formInstances = await ensureFieldInstancesForPacketForm(
      supabase,
      packetForm.id,
    );
    instances.push(...formInstances);
  }

  return instances;
}

export function fieldInstancesByFieldId(
  instances: FieldInstanceWithField[],
): Map<string, FieldInstanceWithField> {
  return new Map(instances.map((instance) => [instance.field_id, instance]));
}
