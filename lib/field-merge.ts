import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldUsageCounts } from "@/lib/field-retire";
import {
  type Field,
  type FieldAdminInput,
  normalizeFieldAdminInput,
  validateFieldInput,
} from "@/lib/types/field";
import { formatFieldSourceSaveError } from "@/lib/types/field-source";

export type FieldMergeMappingConflict = {
  mappingId: string;
  formId: number;
  duplicateFieldId: string;
  duplicateFieldKey: string;
  pageNumber: number;
  occurrenceIndex: number | null;
  reason: string;
};

export type FieldMergeInstanceConflict = {
  instanceId: string;
  packetFormId: number;
  duplicateFieldId: string;
  duplicateFieldKey: string;
  reason: string;
};

export type FieldMergePacketMappingConflict = {
  mappingId: string;
  packetFormId: number;
  duplicateFieldId: string;
  duplicateFieldKey: string;
  pageNumber: number;
  reason: string;
};

export type FieldMergePreview = {
  canonicalField: Field;
  duplicateFields: Field[];
  proposedCanonicalKey: string;
  proposedCanonicalLabel: string;
  duplicateUsageTotals: FieldUsageCounts;
  templateMappingConflicts: FieldMergeMappingConflict[];
  instanceConflicts: FieldMergeInstanceConflict[];
  packetMappingConflicts: FieldMergePacketMappingConflict[];
  typeMismatchWarnings: string[];
};

export type FieldMergeValidation = {
  error: string | null;
  warnings: string[];
};

export type FieldMergeResult = {
  canonicalFieldId: string;
  canonicalFieldKey: string;
  mergedDuplicateFieldIds: string[];
  remappedFormFieldMappings: number;
  remappedFieldInstances: number;
  remappedFieldInstanceMappings: number;
  inactivatedFormFieldMappings: number;
  inactivatedFieldInstances: number;
  inactivatedFieldInstanceMappings: number;
  templateMappingConflicts: FieldMergeMappingConflict[];
  instanceConflicts: FieldMergeInstanceConflict[];
  packetMappingConflicts: FieldMergePacketMappingConflict[];
};

type ActiveFormFieldMapping = {
  id: string;
  form_id: number;
  field_id: string;
  page_number: number;
  occurrence_index: number | null;
};

type ActiveFieldInstance = {
  id: string;
  packet_form_id: number;
  field_id: string;
};

type ActiveFieldInstanceMapping = {
  id: string;
  packet_form_id: number;
  field_id: string;
  page_number: number;
  form_field_mapping_id: string | null;
};

function sumUsageCounts(entries: FieldUsageCounts[]): FieldUsageCounts {
  return entries.reduce(
    (totals, entry) => ({
      formFieldMappings: totals.formFieldMappings + entry.formFieldMappings,
      fieldInstances: totals.fieldInstances + entry.fieldInstances,
      fieldInstanceMappings:
        totals.fieldInstanceMappings + entry.fieldInstanceMappings,
    }),
    {
      formFieldMappings: 0,
      fieldInstances: 0,
      fieldInstanceMappings: 0,
    },
  );
}

function mappingIdentityKey(mapping: {
  form_id: number;
  page_number: number;
  occurrence_index: number | null;
}): string {
  return `${mapping.form_id}:${mapping.page_number}:${mapping.occurrence_index ?? "null"}`;
}

function instanceMappingIdentityKey(mapping: {
  packet_form_id: number;
  page_number: number;
  form_field_mapping_id: string | null;
}): string {
  return `${mapping.packet_form_id}:${mapping.page_number}:${mapping.form_field_mapping_id ?? "null"}`;
}

export function validateFieldMergeRequest(params: {
  canonicalFieldId: string;
  duplicateFieldIds: string[];
  canonicalInput: FieldAdminInput;
  canonicalField: Field | null;
  allFields: Field[];
  mergeGroupFieldIds: string[];
}): FieldMergeValidation {
  const warnings: string[] = [];
  const {
    canonicalFieldId,
    duplicateFieldIds,
    canonicalInput,
    canonicalField,
    allFields,
    mergeGroupFieldIds,
  } = params;

  if (!canonicalFieldId.trim()) {
    return { error: "Select a canonical field.", warnings };
  }

  if (duplicateFieldIds.length === 0) {
    return { error: "Select at least one duplicate field to merge.", warnings };
  }

  if (duplicateFieldIds.includes(canonicalFieldId)) {
    return { error: "A field cannot be merged into itself.", warnings };
  }

  if (!canonicalField) {
    return { error: "Canonical field was not found.", warnings };
  }

  if (canonicalField.status === "DELETED") {
    return {
      error: "Cannot merge into a deleted canonical field.",
      warnings,
    };
  }

  if (canonicalField.status === "INACTIVE") {
    return {
      error: "Cannot merge into an inactive canonical field.",
      warnings,
    };
  }

  const inputError = validateFieldInput(canonicalInput);
  if (inputError) {
    return { error: inputError, warnings };
  }

  const normalized = normalizeFieldAdminInput({
    ...canonicalInput,
    status: "ACTIVE",
  });
  const normalizedKey = normalized.field_key;

  const keyConflict = allFields.find(
    (field) =>
      field.status === "ACTIVE" &&
      field.id !== canonicalFieldId &&
      !mergeGroupFieldIds.includes(field.id) &&
      field.field_key.toLowerCase() === normalizedKey.toLowerCase(),
  );

  if (keyConflict) {
    return {
      error: `Field key ${normalizedKey} is already used by ${keyConflict.field_key}.`,
      warnings,
    };
  }

  for (const duplicateId of duplicateFieldIds) {
    const duplicate = allFields.find((field) => field.id === duplicateId);
    if (!duplicate) {
      return { error: "One or more duplicate fields were not found.", warnings };
    }

    if (duplicate.status === "DELETED") {
      return {
        error: `Cannot merge deleted field ${duplicate.field_key}.`,
        warnings,
      };
    }

    if (
      duplicate.field_data_type !== normalized.field_data_type ||
      duplicate.field_widget_type !== normalized.field_widget_type
    ) {
      warnings.push(
        `${duplicate.field_key} has ${duplicate.field_data_type}/${duplicate.field_widget_type}, which differs from the proposed canonical ${normalized.field_data_type}/${normalized.field_widget_type}.`,
      );
    }
  }

  return { error: null, warnings };
}

export function detectFieldMergeConflicts(params: {
  canonicalFieldId: string;
  duplicateFields: Field[];
  formFieldMappings: ActiveFormFieldMapping[];
  fieldInstances: ActiveFieldInstance[];
  fieldInstanceMappings: ActiveFieldInstanceMapping[];
}): Pick<
  FieldMergePreview,
  "templateMappingConflicts" | "instanceConflicts" | "packetMappingConflicts"
> {
  const {
    canonicalFieldId,
    duplicateFields,
    formFieldMappings,
    fieldInstances,
    fieldInstanceMappings,
  } = params;

  const duplicateFieldIds = new Set(duplicateFields.map((field) => field.id));
  const duplicateFieldKeys = new Map(
    duplicateFields.map((field) => [field.id, field.field_key]),
  );

  const canonicalMappings = formFieldMappings.filter(
    (mapping) => mapping.field_id === canonicalFieldId,
  );
  const canonicalMappingKeys = new Set(
    canonicalMappings.map((mapping) => mappingIdentityKey(mapping)),
  );

  const canonicalInstances = fieldInstances.filter(
    (instance) => instance.field_id === canonicalFieldId,
  );
  const canonicalInstancePacketForms = new Set(
    canonicalInstances.map((instance) => instance.packet_form_id),
  );

  const canonicalInstanceMappings = fieldInstanceMappings.filter(
    (mapping) => mapping.field_id === canonicalFieldId,
  );
  const canonicalInstanceMappingKeys = new Set(
    canonicalInstanceMappings.map((mapping) =>
      instanceMappingIdentityKey(mapping),
    ),
  );

  const templateMappingConflicts: FieldMergeMappingConflict[] = [];
  const instanceConflicts: FieldMergeInstanceConflict[] = [];
  const packetMappingConflicts: FieldMergePacketMappingConflict[] = [];

  for (const mapping of formFieldMappings) {
    if (!duplicateFieldIds.has(mapping.field_id)) {
      continue;
    }

    if (canonicalMappingKeys.has(mappingIdentityKey(mapping))) {
      templateMappingConflicts.push({
        mappingId: mapping.id,
        formId: mapping.form_id,
        duplicateFieldId: mapping.field_id,
        duplicateFieldKey:
          duplicateFieldKeys.get(mapping.field_id) ?? mapping.field_id,
        pageNumber: mapping.page_number,
        occurrenceIndex: mapping.occurrence_index,
        reason:
          "Canonical field already has an active template placement on this form, page, and occurrence.",
      });
    }
  }

  for (const instance of fieldInstances) {
    if (!duplicateFieldIds.has(instance.field_id)) {
      continue;
    }

    if (canonicalInstancePacketForms.has(instance.packet_form_id)) {
      instanceConflicts.push({
        instanceId: instance.id,
        packetFormId: instance.packet_form_id,
        duplicateFieldId: instance.field_id,
        duplicateFieldKey:
          duplicateFieldKeys.get(instance.field_id) ?? instance.field_id,
        reason:
          "Canonical field already has an active packet value on this packet form.",
      });
    }
  }

  const duplicateInstancesByPacketForm = new Map<number, ActiveFieldInstance[]>();
  for (const instance of fieldInstances) {
    if (!duplicateFieldIds.has(instance.field_id)) {
      continue;
    }

    const bucket = duplicateInstancesByPacketForm.get(instance.packet_form_id) ?? [];
    bucket.push(instance);
    duplicateInstancesByPacketForm.set(instance.packet_form_id, bucket);
  }

  for (const [packetFormId, instances] of duplicateInstancesByPacketForm) {
    if (canonicalInstancePacketForms.has(packetFormId) || instances.length <= 1) {
      continue;
    }

    const [, ...extraInstances] = instances.sort((left, right) =>
      left.id.localeCompare(right.id),
    );

    for (const instance of extraInstances) {
      instanceConflicts.push({
        instanceId: instance.id,
        packetFormId: instance.packet_form_id,
        duplicateFieldId: instance.field_id,
        duplicateFieldKey:
          duplicateFieldKeys.get(instance.field_id) ?? instance.field_id,
        reason:
          "Multiple duplicate fields have active packet values on this packet form. Only one can be remapped.",
      });
    }
  }

  for (const mapping of fieldInstanceMappings) {
    if (!duplicateFieldIds.has(mapping.field_id)) {
      continue;
    }

    if (canonicalInstanceMappingKeys.has(instanceMappingIdentityKey(mapping))) {
      packetMappingConflicts.push({
        mappingId: mapping.id,
        packetFormId: mapping.packet_form_id,
        duplicateFieldId: mapping.field_id,
        duplicateFieldKey:
          duplicateFieldKeys.get(mapping.field_id) ?? mapping.field_id,
        pageNumber: mapping.page_number,
        reason:
          "Canonical field already has an active packet placement override at this location.",
      });
    }
  }

  return { templateMappingConflicts, instanceConflicts, packetMappingConflicts };
}

export async function buildFieldMergePreview(
  supabase: SupabaseClient,
  params: {
    canonicalField: Field;
    duplicateFields: Field[];
    canonicalInput: FieldAdminInput;
    usageByFieldId: Record<string, FieldUsageCounts>;
    allFields: Field[];
    mergeGroupFieldIds: string[];
  },
): Promise<FieldMergePreview> {
  const {
    canonicalField,
    duplicateFields,
    canonicalInput,
    usageByFieldId,
    allFields,
    mergeGroupFieldIds,
  } = params;
  const involvedFieldIds = [
    canonicalField.id,
    ...duplicateFields.map((field) => field.id),
  ];

  const [formFieldMappingsResult, fieldInstancesResult, fieldInstanceMappingsResult] =
    await Promise.all([
      supabase
        .from("form_field_mappings")
        .select("id, form_id, field_id, page_number, occurrence_index")
        .in("field_id", involvedFieldIds)
        .eq("status", "ACTIVE"),
      supabase
        .from("field_instances")
        .select("id, packet_form_id, field_id")
        .in("field_id", involvedFieldIds)
        .eq("status", "ACTIVE"),
      supabase
        .from("field_instance_mappings")
        .select("id, packet_form_id, field_id, page_number, form_field_mapping_id")
        .in("field_id", involvedFieldIds)
        .eq("status", "ACTIVE"),
    ]);

  if (formFieldMappingsResult.error) {
    throw new Error(formFieldMappingsResult.error.message);
  }
  if (fieldInstancesResult.error) {
    throw new Error(fieldInstancesResult.error.message);
  }
  if (fieldInstanceMappingsResult.error) {
    throw new Error(fieldInstanceMappingsResult.error.message);
  }

  const normalized = normalizeFieldAdminInput({
    ...canonicalInput,
    status: "ACTIVE",
  });

  const validation = validateFieldMergeRequest({
    canonicalFieldId: canonicalField.id,
    duplicateFieldIds: duplicateFields.map((field) => field.id),
    canonicalInput,
    canonicalField,
    allFields,
    mergeGroupFieldIds,
  });

  const {
    templateMappingConflicts,
    instanceConflicts,
    packetMappingConflicts,
  } = detectFieldMergeConflicts({
    canonicalFieldId: canonicalField.id,
    duplicateFields,
    formFieldMappings:
      (formFieldMappingsResult.data as ActiveFormFieldMapping[]) ?? [],
    fieldInstances: (fieldInstancesResult.data as ActiveFieldInstance[]) ?? [],
    fieldInstanceMappings:
      (fieldInstanceMappingsResult.data as ActiveFieldInstanceMapping[]) ?? [],
  });

  return {
    canonicalField,
    duplicateFields,
    proposedCanonicalKey: normalized.field_key,
    proposedCanonicalLabel: normalized.field_label ?? normalized.field_key,
    duplicateUsageTotals: sumUsageCounts(
      duplicateFields.map(
        (field) =>
          usageByFieldId[field.id] ?? {
            formFieldMappings: 0,
            fieldInstances: 0,
            fieldInstanceMappings: 0,
          },
      ),
    ),
    templateMappingConflicts,
    instanceConflicts,
    packetMappingConflicts,
    typeMismatchWarnings: validation.warnings,
  };
}

async function inactivateRows(
  supabase: SupabaseClient,
  table: "form_field_mappings" | "field_instances" | "field_instance_mappings",
  ids: string[],
): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from(table)
    .update({ status: "INACTIVE" })
    .in("id", ids)
    .eq("status", "ACTIVE")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? 0;
}

async function remapRows(
  supabase: SupabaseClient,
  table: "form_field_mappings" | "field_instances" | "field_instance_mappings",
  duplicateFieldIds: string[],
  canonicalFieldId: string,
  excludedIds: Set<string>,
): Promise<number> {
  if (duplicateFieldIds.length === 0) {
    return 0;
  }

  const { data: rows, error: fetchError } = await supabase
    .from(table)
    .select("id")
    .in("field_id", duplicateFieldIds)
    .eq("status", "ACTIVE");

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const idsToRemap = (rows ?? [])
    .map((row) => row.id as string)
    .filter((id) => !excludedIds.has(id));

  if (idsToRemap.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from(table)
    .update({ field_id: canonicalFieldId })
    .in("id", idsToRemap)
    .eq("status", "ACTIVE")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? 0;
}

export async function executeFieldMerge(
  supabase: SupabaseClient,
  params: {
    canonicalFieldId: string;
    duplicateFieldIds: string[];
    canonicalInput: FieldAdminInput;
    canonicalField: Field;
    allFields: Field[];
    mergeGroupFieldIds: string[];
    preview: FieldMergePreview;
  },
): Promise<FieldMergeResult> {
  const {
    canonicalFieldId,
    duplicateFieldIds,
    canonicalInput,
    canonicalField,
    allFields,
    mergeGroupFieldIds,
    preview,
  } = params;

  const validation = validateFieldMergeRequest({
    canonicalFieldId,
    duplicateFieldIds,
    canonicalInput,
    canonicalField,
    allFields,
    mergeGroupFieldIds,
  });

  if (validation.error) {
    throw new Error(validation.error);
  }

  const normalized = normalizeFieldAdminInput({
    ...canonicalInput,
    status: "ACTIVE",
  });

  const { error: canonicalUpdateError } = await supabase
    .from("fields")
    .update(normalized)
    .eq("id", canonicalFieldId)
    .eq("status", "ACTIVE");

  if (canonicalUpdateError) {
    throw new Error(formatFieldSourceSaveError(canonicalUpdateError.message));
  }

  const conflictTemplateMappingIds = new Set(
    preview.templateMappingConflicts.map((conflict) => conflict.mappingId),
  );
  const conflictInstanceIds = new Set(
    preview.instanceConflicts.map((conflict) => conflict.instanceId),
  );
  const conflictPacketMappingIds = new Set(
    preview.packetMappingConflicts.map((conflict) => conflict.mappingId),
  );

  const inactivatedFormFieldMappings = await inactivateRows(
    supabase,
    "form_field_mappings",
    [...conflictTemplateMappingIds],
  );

  const inactivatedFieldInstances = await inactivateRows(
    supabase,
    "field_instances",
    [...conflictInstanceIds],
  );

  const inactivatedFieldInstanceMappings = await inactivateRows(
    supabase,
    "field_instance_mappings",
    [...conflictPacketMappingIds],
  );

  const remappedFormFieldMappings = await remapRows(
    supabase,
    "form_field_mappings",
    duplicateFieldIds,
    canonicalFieldId,
    conflictTemplateMappingIds,
  );

  const remappedFieldInstances = await remapRows(
    supabase,
    "field_instances",
    duplicateFieldIds,
    canonicalFieldId,
    conflictInstanceIds,
  );

  const remappedFieldInstanceMappings = await remapRows(
    supabase,
    "field_instance_mappings",
    duplicateFieldIds,
    canonicalFieldId,
    conflictPacketMappingIds,
  );

  for (const duplicateFieldId of duplicateFieldIds) {
    const { error: duplicateUpdateError } = await supabase
      .from("fields")
      .update({ status: "DELETED" })
      .eq("id", duplicateFieldId)
      .in("status", ["ACTIVE", "INACTIVE"]);

    if (duplicateUpdateError) {
      throw new Error(duplicateUpdateError.message);
    }
  }

  return {
    canonicalFieldId,
    canonicalFieldKey: normalized.field_key,
    mergedDuplicateFieldIds: duplicateFieldIds,
    remappedFormFieldMappings,
    remappedFieldInstances,
    remappedFieldInstanceMappings,
    inactivatedFormFieldMappings,
    inactivatedFieldInstances,
    inactivatedFieldInstanceMappings,
    templateMappingConflicts: preview.templateMappingConflicts,
    instanceConflicts: preview.instanceConflicts,
    packetMappingConflicts: preview.packetMappingConflicts,
  };
}
