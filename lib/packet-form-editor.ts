import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFieldResolutionDiagnostics,
  loadFieldResolverContext,
  revertFieldInstanceToResolvedValue,
  type FieldResolutionDiagnostic,
} from "@/lib/field-resolver";
import {
  assertFieldInstancePacketFormEditable,
  assertPacketFormAllowsValueMutation,
} from "@/lib/packet-form-lifecycle";
import { createPacketFormSignedUrlWithFallback } from "@/lib/storage-path-resolve";
import {
  ensureFieldInstancesForPacketForm,
  fieldInstancesByFieldId,
  loadActiveFormFieldMappingsForForm,
  loadFieldInstancesForPacketFormWithoutSync,
} from "@/lib/field-instances";
import { filterMappableFormFieldMappings } from "@/lib/types/authentisign-excluded-fields";
import type {
  FieldInstanceMapping,
  FieldInstanceWithField,
} from "@/lib/types/field-instance";
import type { DocumentState } from "@/lib/types/packet";
import type { PacketWorkflowType } from "@/lib/types/packet-workflow";
import { isPacketFormValueEditable } from "@/lib/types/packet-form-lifecycle";
import {
  buildPacketFormFieldViews,
  type PacketFormEditorData,
  type ResolvedPacketPlacement,
} from "@/lib/types/packet-form-editor";

export const FIELD_INSTANCE_MAPPING_SELECT = "*";

export async function loadActiveFieldInstanceMappingsForPacketForm(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<FieldInstanceMapping[]> {
  const { data, error } = await supabase
    .from("field_instance_mappings")
    .select(FIELD_INSTANCE_MAPPING_SELECT)
    .eq("packet_form_id", packetFormId)
    .eq("status", "ACTIVE")
    .order("create_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as FieldInstanceMapping[]) ?? [];
}

export type PacketFormEditorLoadResult = PacketFormEditorData & {
  pdfUrl: string | null;
  propertyId: number | null;
  hasPacketProperty: boolean;
  packetType: PacketWorkflowType | null;
  fieldResolutionDiagnostics: FieldResolutionDiagnostic[] | null;
};

export async function loadPacketFormEditorData(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<PacketFormEditorLoadResult> {
  const { data: packetFormData, error: packetFormError } = await supabase
    .from("packet_forms")
    .select(
      `
      id,
      packet_id,
      form_id,
      document_name,
      document_state,
      storage_path,
      owner_user_id,
      status,
      forms(
        id,
        form_name,
        form_code,
        source_storage_path
      )
    `,
    )
    .eq("id", packetFormId)
    .single();

  if (packetFormError || !packetFormData) {
    throw new Error(packetFormError?.message ?? "Packet form not found.");
  }

  const rawForms = packetFormData.forms;
  const normalizedForms = Array.isArray(rawForms) ? rawForms[0] : rawForms;
  const documentState = packetFormData.document_state as DocumentState;

  const packetForm: PacketFormEditorData["packetForm"] = {
    id: packetFormData.id,
    packet_id: packetFormData.packet_id,
    form_id: packetFormData.form_id,
    document_name: packetFormData.document_name,
    document_state: documentState,
    storage_path: packetFormData.storage_path,
    status: packetFormData.status,
    forms: normalizedForms ?? null,
  };

  if (packetForm.status !== "ACTIVE") {
    throw new Error("Only active packet forms can be opened.");
  }

  if (packetForm.form_id == null) {
    throw new Error(
      "This packet form has no linked template form. External uploads cannot be field-filled.",
    );
  }

  const valuesEditable = isPacketFormValueEditable(
    documentState,
    packetForm.status,
  );

  const [mappings, instances, placementOverrides] = await Promise.all([
    loadActiveFormFieldMappingsForForm(supabase, packetForm.form_id),
    valuesEditable
      ? ensureFieldInstancesForPacketForm(supabase, packetFormId)
      : loadFieldInstancesForPacketFormWithoutSync(supabase, packetFormId),
    loadActiveFieldInstanceMappingsForPacketForm(supabase, packetFormId),
  ]);

  const fields = buildPacketFormFieldViews({
    mappings: filterMappableFormFieldMappings(mappings),
    instances,
    placementOverrides,
  });

  const resolverContext = await loadFieldResolverContext(
    supabase,
    packetForm.packet_id,
    packetFormId,
  );

  const fieldResolutionDiagnostics =
    process.env.NODE_ENV === "development"
      ? buildFieldResolutionDiagnostics({
          context: resolverContext,
          fields: fields.map((fieldView) => ({
            mapping: fieldView.mapping,
            instance: fieldView.instance,
          })),
        })
      : null;

  let pdfUrl: string | null = null;
  if (packetForm.storage_path) {
    const { signedUrl } = await createPacketFormSignedUrlWithFallback(supabase, {
      packetFormId: packetForm.id,
      packetId: packetForm.packet_id,
      path: packetForm.storage_path,
      ownerUserId:
        (packetFormData as { owner_user_id?: string | null }).owner_user_id ??
        null,
      formId: packetForm.form_id,
      documentName: packetForm.document_name,
    });
    pdfUrl = signedUrl;
  }

  return {
    packetForm,
    fields,
    pdfUrl,
    propertyId: resolverContext.packet.property_id,
    hasPacketProperty: resolverContext.packet.properties != null,
    packetType: (resolverContext.packet.packet_type as PacketWorkflowType | null) ?? null,
    fieldResolutionDiagnostics,
  };
}

export async function saveFieldInstanceValue(
  supabase: SupabaseClient,
  fieldInstanceId: string,
  value: string,
  source: "manual_override" | "override" = "manual_override",
): Promise<void> {
  await assertFieldInstancePacketFormEditable(supabase, fieldInstanceId);

  const normalizedValue = value.trim();
  const isCheckboxValue =
    normalizedValue === "true" ||
    normalizedValue === "false" ||
    normalizedValue === "1" ||
    normalizedValue === "0";
  const checked =
    normalizedValue === "true" || normalizedValue === "1";

  const { data, error } = await supabase
    .from("field_instances")
    .update({
      value: normalizedValue || null,
      value_json: isCheckboxValue ? { checked } : null,
      is_override: true,
      source,
    })
    .eq("id", fieldInstanceId)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      "Could not save this field. The form may no longer be a Draft — reload and try again.",
    );
  }
}

export async function saveFieldInstanceValues(
  supabase: SupabaseClient,
  updates: Array<{ fieldInstanceId: string; value: string }>,
  source: "manual_override" | "override" = "manual_override",
): Promise<void> {
  await Promise.all(
    updates.map((update) =>
      saveFieldInstanceValue(
        supabase,
        update.fieldInstanceId,
        update.value,
        source,
      ),
    ),
  );
}

export type PlacementUpdateInput = Pick<
  ResolvedPacketPlacement,
  | "page_number"
  | "x"
  | "y"
  | "width"
  | "height"
  | "page_width"
  | "page_height"
  | "font_size"
  | "alignment"
>;

export async function upsertFieldInstanceMappingPlacement(
  supabase: SupabaseClient,
  params: {
    packetId: number;
    packetFormId: number;
    fieldId: string;
    fieldInstanceId: string;
    formFieldMappingId: string;
    placement: PlacementUpdateInput;
  },
): Promise<FieldInstanceMapping> {
  await assertPacketFormAllowsValueMutation(supabase, params.packetFormId);

  const { data: existing, error: existingError } = await supabase
    .from("field_instance_mappings")
    .select(FIELD_INSTANCE_MAPPING_SELECT)
    .eq("packet_form_id", params.packetFormId)
    .eq("form_field_mapping_id", params.formFieldMappingId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const row = {
    field_instance_id: params.fieldInstanceId,
    packet_id: params.packetId,
    packet_form_id: params.packetFormId,
    field_id: params.fieldId,
    form_field_mapping_id: params.formFieldMappingId,
    page_number: params.placement.page_number,
    x: params.placement.x,
    y: params.placement.y,
    width: params.placement.width,
    height: params.placement.height,
    page_width: params.placement.page_width,
    page_height: params.placement.page_height,
    font_size: params.placement.font_size,
    alignment: params.placement.alignment,
    notes: null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("field_instance_mappings")
      .update(row)
      .eq("id", existing.id)
      .eq("status", "ACTIVE")
      .select(FIELD_INSTANCE_MAPPING_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as FieldInstanceMapping;
  }

  const { data, error } = await supabase
    .from("field_instance_mappings")
    .insert(row)
    .select(FIELD_INSTANCE_MAPPING_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as FieldInstanceMapping;
}

export async function resetFieldInstanceMappingPlacement(
  supabase: SupabaseClient,
  packetFormId: number,
  formFieldMappingId: string,
): Promise<void> {
  await assertPacketFormAllowsValueMutation(supabase, packetFormId);

  const { error } = await supabase
    .from("field_instance_mappings")
    .update({ status: "DELETED" })
    .eq("packet_form_id", packetFormId)
    .eq("form_field_mapping_id", formFieldMappingId)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }
}

export async function revertPacketFormFieldValue(
  supabase: SupabaseClient,
  params: {
    packetId: number;
    packetFormId: number;
    fieldInstanceId: string;
  },
): Promise<FieldInstanceWithField> {
  return revertFieldInstanceToResolvedValue(supabase, params);
}

export async function refreshPacketFormFieldValues(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<void> {
  await assertPacketFormAllowsValueMutation(supabase, packetFormId);

  const { syncFieldInstancesForPacketForm } = await import("@/lib/field-resolver");
  // Explicit editor "Refresh values" control — may rewrite non-override
  // snapshots from the packet owner's current resolution context.
  await syncFieldInstancesForPacketForm(supabase, packetFormId, {
    mode: "refresh_non_overrides",
  });
}

export { fieldInstancesByFieldId };

export {
  markPacketFormFinal,
  reopenPacketFormToDraft,
} from "@/lib/packet-form-lifecycle";
