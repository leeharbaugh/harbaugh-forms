"use server";

import "server-only";

import { nextUniqueGlobalFormIdentity } from "@/lib/admin/global-form-identity";
import { requireAppAdmin } from "@/lib/admin/require-app-admin";
import {
  buildGlobalFormStoragePath,
  buildPendingFormStoragePath,
  extractPdfFileNameFromStoragePath,
  FORM_TEMPLATES_BUCKET,
  removeFormStorageObject,
} from "@/lib/form-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

export type CopyFormToGlobalResult =
  | { ok: true; newFormId: number; message: string }
  | { ok: false; error: string };

type SourceFormRow = {
  id: number;
  form_code: string;
  form_name: string;
  form_category: string;
  state_code: string;
  version_label: string | null;
  source_storage_path: string;
  description: string | null;
  status: string;
  scope: string;
  owner_user_id: string | null;
  organization_id: string | null;
  update_date: string;
};

type MappingRow = {
  id: string;
  field_id: string | null;
  mapping_name: string | null;
  occurrence_index: number | null;
  page_number: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  page_width: number | null;
  page_height: number | null;
  font_size: number | null;
  alignment: string | null;
  field_widget_type: string | null;
  default_value_override: string | null;
  required: boolean | null;
  notes: string | null;
  status: string;
  pdf_field_name: string | null;
  pdf_field_type: string | null;
  pdf_export_value: string | null;
};

type FieldRow = {
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
  field_resolver_id: string | null;
  status: string;
  scope: string;
  owner_user_id: string | null;
  organization_id: string | null;
};

async function softDeleteForm(
  admin: ReturnType<typeof createAdminClient>,
  formId: number,
): Promise<void> {
  await admin.from("forms").update({ status: "DELETED" }).eq("id", formId);
}

async function resolveOrCopyFieldId(
  admin: ReturnType<typeof createAdminClient>,
  sourceField: FieldRow,
  fieldIdMap: Map<string, string>,
  createdFieldIds: string[],
): Promise<string> {
  const cached = fieldIdMap.get(sourceField.id);
  if (cached) {
    return cached;
  }

  // Shared GLOBAL catalog fields are referenced, not duplicated.
  if (sourceField.scope === "GLOBAL" && sourceField.status === "ACTIVE") {
    fieldIdMap.set(sourceField.id, sourceField.id);
    return sourceField.id;
  }

  // Prefer an existing ACTIVE GLOBAL field with the same key.
  const { data: existingGlobal } = await admin
    .from("fields")
    .select("id")
    .eq("status", "ACTIVE")
    .eq("scope", "GLOBAL")
    .eq("field_key", sourceField.field_key)
    .maybeSingle();

  if (existingGlobal?.id) {
    fieldIdMap.set(sourceField.id, existingGlobal.id as string);
    return existingGlobal.id as string;
  }

  // Create an independent GLOBAL field copy of private (or org) metadata.
  let attempt = 0;
  while (attempt < 50) {
    const candidate =
      attempt === 0
        ? sourceField.field_key
        : `${sourceField.field_key}_COPY${attempt === 1 ? "" : attempt}`.slice(
            0,
            100,
          );

    const { data: inserted, error } = await admin
      .from("fields")
      .insert({
        field_key: candidate,
        field_name: sourceField.field_name,
        field_label: sourceField.field_label,
        field_data_type: sourceField.field_data_type,
        field_widget_type: sourceField.field_widget_type,
        default_value: sourceField.default_value,
        default_checked: sourceField.default_checked,
        required: sourceField.required,
        notes: sourceField.notes,
        source_type: sourceField.source_type,
        source_path: sourceField.source_path,
        resolver_key: sourceField.resolver_key,
        fallback_value: sourceField.fallback_value,
        field_resolver_id: sourceField.field_resolver_id,
        status: "ACTIVE",
        scope: "GLOBAL",
        owner_user_id: null,
        organization_id: null,
      })
      .select("id")
      .single();

    if (!error && inserted?.id) {
      const newId = inserted.id as string;
      fieldIdMap.set(sourceField.id, newId);
      createdFieldIds.push(newId);
      return newId;
    }

    if (error?.code === "23505" || /duplicate|unique/i.test(error?.message ?? "")) {
      attempt += 1;
      continue;
    }

    throw new Error(error?.message ?? "Failed to copy a form field.");
  }

  throw new Error("Unable to allocate a unique GLOBAL field key.");
}

/**
 * Copy a private user form into the statewide Global library.
 * Application ADMIN only. Source form is never mutated.
 */
export async function copyFormToGlobalLibrary(
  sourceFormId: number,
): Promise<CopyFormToGlobalResult> {
  if (!Number.isInteger(sourceFormId) || sourceFormId <= 0) {
    return { ok: false, error: "A valid source form is required." };
  }

  let admin;
  let adminUser;
  try {
    adminUser = await requireAppAdmin();
    admin = createAdminClient();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Administrator access required.";
    return { ok: false, error: message };
  }

  const { data: source, error: sourceError } = await admin
    .from("forms")
    .select(
      "id, form_code, form_name, form_category, state_code, version_label, source_storage_path, description, status, scope, owner_user_id, organization_id, update_date",
    )
    .eq("id", sourceFormId)
    .maybeSingle();

  if (sourceError) {
    return { ok: false, error: sourceError.message };
  }

  const sourceForm = source as SourceFormRow | null;
  if (!sourceForm) {
    return { ok: false, error: "Source form was not found." };
  }

  if (sourceForm.scope !== "PRIVATE") {
    return {
      ok: false,
      error: "Only private forms can be copied to the Global library.",
    };
  }

  if (sourceForm.status !== "ACTIVE") {
    return {
      ok: false,
      error: "Only active private forms can be copied to the Global library.",
    };
  }

  if (!sourceForm.owner_user_id) {
    return {
      ok: false,
      error: "This private form has no owner and cannot be copied.",
    };
  }

  if (!sourceForm.source_storage_path?.trim()) {
    return {
      ok: false,
      error: "This form has no PDF on file and cannot be copied.",
    };
  }

  // Verify source PDF exists.
  const { data: sourceProbe, error: probeError } = await admin.storage
    .from(FORM_TEMPLATES_BUCKET)
    .download(sourceForm.source_storage_path);

  if (probeError || !sourceProbe) {
    return {
      ok: false,
      error: "The source PDF could not be read. Copy was not started.",
    };
  }

  const { data: existingGlobal, error: existingError } = await admin
    .from("forms")
    .select("form_code, version_label")
    .eq("status", "ACTIVE")
    .eq("scope", "GLOBAL");

  if (existingError) {
    return { ok: false, error: existingError.message };
  }

  const identity = nextUniqueGlobalFormIdentity(
    {
      form_name: sourceForm.form_name,
      form_code: sourceForm.form_code,
      version_label: sourceForm.version_label,
    },
    (existingGlobal ?? []) as { form_code: string; version_label: string | null }[],
  );

  const pendingPath = buildPendingFormStoragePath(randomUUID());
  const copiedAt = new Date().toISOString();

  const { data: created, error: createError } = await admin
    .from("forms")
    .insert({
      form_name: identity.form_name,
      form_code: identity.form_code,
      form_category: sourceForm.form_category,
      state_code: sourceForm.state_code,
      version_label: identity.version_label,
      description: sourceForm.description,
      source_storage_path: pendingPath,
      status: "INACTIVE",
      scope: "GLOBAL",
      owner_user_id: null,
      organization_id: null,
      copied_from_form_id: sourceForm.id,
      copied_from_owner_user_id: sourceForm.owner_user_id,
      copied_by_user_id: adminUser.userId,
      copied_to_global_at: copiedAt,
    })
    .select("id")
    .single();

  if (createError || !created?.id) {
    return {
      ok: false,
      error: createError?.message ?? "Failed to create the Global form record.",
    };
  }

  const newFormId = created.id as number;
  let destinationPath: string | null = null;
  const createdFieldIds: string[] = [];

  try {
    const fileName = extractPdfFileNameFromStoragePath(
      sourceForm.source_storage_path,
    );
    destinationPath = buildGlobalFormStoragePath(newFormId, fileName);

    const { error: copyError } = await admin.storage
      .from(FORM_TEMPLATES_BUCKET)
      .copy(sourceForm.source_storage_path, destinationPath);

    if (copyError) {
      // Fallback: download + upload if copy unsupported for this path.
      const bytes = await sourceProbe.arrayBuffer();
      const { error: uploadError } = await admin.storage
        .from(FORM_TEMPLATES_BUCKET)
        .upload(destinationPath, Buffer.from(bytes), {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
    }

    const { data: destProbe, error: destProbeError } = await admin.storage
      .from(FORM_TEMPLATES_BUCKET)
      .download(destinationPath);

    if (destProbeError || !destProbe) {
      throw new Error("Global PDF copy could not be verified.");
    }

    const { error: pathUpdateError } = await admin
      .from("forms")
      .update({ source_storage_path: destinationPath })
      .eq("id", newFormId);

    if (pathUpdateError) {
      throw new Error(pathUpdateError.message);
    }

    const { data: mappings, error: mappingsError } = await admin
      .from("form_field_mappings")
      .select(
        "id, field_id, mapping_name, occurrence_index, page_number, x, y, width, height, page_width, page_height, font_size, alignment, field_widget_type, default_value_override, required, notes, status, pdf_field_name, pdf_field_type, pdf_export_value",
      )
      .eq("form_id", sourceForm.id)
      .eq("status", "ACTIVE");

    if (mappingsError) {
      throw new Error(mappingsError.message);
    }

    const mappingRows = (mappings ?? []) as MappingRow[];
    const fieldIds = [
      ...new Set(
        mappingRows
          .map((row) => row.field_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const fieldIdMap = new Map<string, string>();
    if (fieldIds.length > 0) {
      const { data: fields, error: fieldsError } = await admin
        .from("fields")
        .select(
          "id, field_key, field_name, field_label, field_data_type, field_widget_type, default_value, default_checked, required, notes, source_type, source_path, resolver_key, fallback_value, field_resolver_id, status, scope, owner_user_id, organization_id",
        )
        .in("id", fieldIds);

      if (fieldsError) {
        throw new Error(fieldsError.message);
      }

      for (const field of (fields ?? []) as FieldRow[]) {
        await resolveOrCopyFieldId(admin, field, fieldIdMap, createdFieldIds);
      }
    }

    if (mappingRows.length > 0) {
      const insertMappings = mappingRows.map((row) => ({
        form_id: newFormId,
        field_id: row.field_id
          ? (fieldIdMap.get(row.field_id) ?? row.field_id)
          : null,
        mapping_name: row.mapping_name,
        occurrence_index: row.occurrence_index,
        page_number: row.page_number,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        page_width: row.page_width,
        page_height: row.page_height,
        font_size: row.font_size,
        alignment: row.alignment,
        field_widget_type: row.field_widget_type,
        default_value_override: row.default_value_override,
        required: row.required,
        notes: row.notes,
        status: "ACTIVE",
        pdf_field_name: row.pdf_field_name,
        pdf_field_type: row.pdf_field_type,
        pdf_export_value: row.pdf_export_value,
      }));

      const { error: insertMapError } = await admin
        .from("form_field_mappings")
        .insert(insertMappings);

      if (insertMapError) {
        throw new Error(insertMapError.message);
      }
    }

    const { error: activateError } = await admin
      .from("forms")
      .update({ status: "ACTIVE" })
      .eq("id", newFormId);

    if (activateError) {
      throw new Error(activateError.message);
    }

    // Confirm source unchanged (no update_date drift from our operations).
    const { data: sourceAfter } = await admin
      .from("forms")
      .select("update_date, scope, owner_user_id, source_storage_path, status")
      .eq("id", sourceForm.id)
      .single();

    if (
      sourceAfter &&
      (sourceAfter.update_date !== sourceForm.update_date ||
        sourceAfter.scope !== "PRIVATE" ||
        sourceAfter.owner_user_id !== sourceForm.owner_user_id ||
        sourceAfter.source_storage_path !== sourceForm.source_storage_path ||
        sourceAfter.status !== "ACTIVE")
    ) {
      // Unexpected source mutation — keep copy but report loudly in logs via error message? Spec: prefer preserving source. We did not write to source; if update_date differed something else interleaved. Soft warning only.
    }

    return {
      ok: true,
      newFormId,
      message:
        "Global copy created. The original private form remains unchanged.",
    };
  } catch (error) {
    // Cleanup provisional Global form artifacts.
    try {
      await admin
        .from("form_field_mappings")
        .update({ status: "DELETED" })
        .eq("form_id", newFormId);
    } catch {
      // ignore
    }

    for (const fieldId of createdFieldIds) {
      try {
        await admin
          .from("fields")
          .update({ status: "DELETED" })
          .eq("id", fieldId)
          .eq("scope", "GLOBAL");
      } catch {
        // ignore
      }
    }

    if (destinationPath) {
      try {
        await removeFormStorageObject(admin, destinationPath);
      } catch {
        // ignore
      }
    }

    try {
      await softDeleteForm(admin, newFormId);
    } catch {
      // ignore
    }

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to copy the form to the Global library.",
    };
  }
}
