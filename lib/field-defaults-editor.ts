import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FIELD_DEFAULT_SELECT,
  resolveActingOrganizationIdForDefaults,
} from "@/lib/field-defaults";
import {
  buildFieldDefaultWritePayload,
  describeEffectiveFallback,
  formatSourceSummary,
  isCheckboxFieldMeta,
  isDateFieldMeta,
  pickFieldLevelDefault,
  scopedDefaultToDisplay,
  type DefaultsEditorFieldRow,
  type DefaultsEditorOrganizationContext,
  type DefaultsEditorScopeTab,
  type ScopedDefaultDraft,
  type UnmappedExistingDefaultRow,
} from "@/lib/types/field-defaults-manage";
import {
  canManageOrganizationDefaults,
  canManageOwnPrivateDefaults,
  canOpenManageDefaults,
  canViewInheritedOrganizationDefaults,
  FIELD_DEFAULTS_PERMISSION_DENIED,
  isActiveAppAdmin,
  type LibraryActor,
} from "@/lib/library-permissions";
import type { FieldDefault, FieldDefaultScope } from "@/lib/types/field-default";
import { FORM_FIELD_MAPPING_SELECT } from "@/lib/types/form-field-mapping";

export type FormDefaultsEditorDto = {
  form: {
    id: number;
    form_name: string;
    form_code: string;
    scope: string;
    status: string;
  };
  actorUserId: string;
  selectedScope: DefaultsEditorScopeTab;
  organization: DefaultsEditorOrganizationContext;
  fields: DefaultsEditorFieldRow[];
  unmappedExistingDefaults: UnmappedExistingDefaultRow[];
};

export class FieldDefaultsEditorError extends Error {
  readonly code:
    | "unauthorized"
    | "not_found"
    | "validation"
    | "conflict"
    | "stale_org";

  constructor(
    code: FieldDefaultsEditorError["code"],
    message: string,
  ) {
    super(message);
    this.name = "FieldDefaultsEditorError";
    this.code = code;
  }
}

async function loadLibraryActorForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<LibraryActor> {
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("status, app_role, onboarding_status, primary_organization_id")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("organization_id, membership_role, status")
      .eq("user_id", userId)
      .eq("status", "ACTIVE"),
  ]);

  const active = memberships ?? [];
  return {
    userId,
    isActiveAdmin: isActiveAppAdmin(profile),
    memberOrganizationIds: active.map(
      (row: { organization_id: string }) => row.organization_id,
    ),
    orgAdminOrganizationIds: active
      .filter(
        (row: { membership_role: string }) =>
          row.membership_role === "ORG_ADMIN",
      )
      .map((row: { organization_id: string }) => row.organization_id),
  };
}

async function loadOrganizationName(
  supabase: SupabaseClient,
  organizationId: string | null,
): Promise<string | null> {
  if (!organizationId) {
    return null;
  }
  const { data, error } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data?.name as string | null) ?? null;
}

async function loadSharedFormNamesByFieldId(
  supabase: SupabaseClient,
  fieldIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (fieldIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("form_field_mappings")
    .select("field_id, form_id, forms!inner(id, form_name, status)")
    .in("field_id", fieldIds)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    const fieldId = row.field_id as string | null;
    if (!fieldId) {
      continue;
    }
    const forms = row.forms as
      | { id: number; form_name: string; status: string }
      | { id: number; form_name: string; status: string }[]
      | null;
    const form = Array.isArray(forms) ? forms[0] : forms;
    if (!form || form.status !== "ACTIVE") {
      continue;
    }
    const list = map.get(fieldId) ?? [];
    if (!list.includes(form.form_name)) {
      list.push(form.form_name);
    }
    map.set(fieldId, list);
  }

  return map;
}

async function loadFieldLevelDefaults(
  supabase: SupabaseClient,
  options: {
    fieldIds: string[];
    ownerUserId: string;
    organizationId: string | null;
  },
): Promise<{ privateRows: FieldDefault[]; organizationRows: FieldDefault[] }> {
  const fieldIds = [...new Set(options.fieldIds.filter(Boolean))];
  if (fieldIds.length === 0) {
    return { privateRows: [], organizationRows: [] };
  }

  const { data: privateRows, error: privateError } = await supabase
    .from("field_defaults")
    .select(FIELD_DEFAULT_SELECT)
    .eq("scope", "PRIVATE")
    .eq("owner_user_id", options.ownerUserId)
    .is("form_id", null)
    .is("form_field_mapping_id", null)
    .in("field_id", fieldIds)
    .in("status", ["ACTIVE", "INACTIVE", "DELETED"]);

  if (privateError) {
    throw new Error(privateError.message);
  }

  let organizationRows: FieldDefault[] = [];
  if (options.organizationId) {
    const { data, error } = await supabase
      .from("field_defaults")
      .select(FIELD_DEFAULT_SELECT)
      .eq("scope", "ORGANIZATION")
      .eq("organization_id", options.organizationId)
      .is("form_id", null)
      .is("form_field_mapping_id", null)
      .in("field_id", fieldIds)
      .in("status", ["ACTIVE", "INACTIVE", "DELETED"]);

    if (error) {
      throw new Error(error.message);
    }
    organizationRows = (data as FieldDefault[]) ?? [];
  }

  return {
    privateRows: (privateRows as FieldDefault[]) ?? [],
    organizationRows,
  };
}

async function loadUnmappedOrphanDefaults(
  supabase: SupabaseClient,
  options: {
    scope: FieldDefaultScope;
    ownerUserId: string;
    organizationId: string | null;
    mappedFieldIds: Set<string>;
  },
): Promise<UnmappedExistingDefaultRow[]> {
  let query = supabase
    .from("field_defaults")
    .select(
      `${FIELD_DEFAULT_SELECT}, fields!inner(id, field_key, field_label, field_data_type, field_widget_type, status)`,
    )
    .eq("status", "ACTIVE")
    .eq("scope", options.scope)
    .is("form_id", null)
    .is("form_field_mapping_id", null);

  if (options.scope === "PRIVATE") {
    query = query.eq("owner_user_id", options.ownerUserId);
  } else {
    if (!options.organizationId) {
      return [];
    }
    query = query.eq("organization_id", options.organizationId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const candidateFieldIds = [
    ...new Set(
      rows
        .map((row) => row.field_id as string)
        .filter((id) => id && !options.mappedFieldIds.has(id)),
    ),
  ];

  if (candidateFieldIds.length === 0) {
    return [];
  }

  const { data: anyMappings, error: mappingError } = await supabase
    .from("form_field_mappings")
    .select("field_id")
    .eq("status", "ACTIVE")
    .in("field_id", candidateFieldIds);

  if (mappingError) {
    throw new Error(mappingError.message);
  }

  const fieldsWithAnyMapping = new Set(
    (anyMappings ?? []).map((row) => row.field_id as string),
  );

  const result: UnmappedExistingDefaultRow[] = [];
  for (const row of rows) {
    const fieldId = row.field_id as string;
    if (options.mappedFieldIds.has(fieldId)) {
      continue;
    }
    if (fieldsWithAnyMapping.has(fieldId)) {
      // Mapped on some other form — not an orphan; skip account-wide noise.
      continue;
    }
    const fieldJoin = row.fields as
      | {
          field_key: string;
          field_label: string;
          field_data_type: string;
          field_widget_type: string | null;
          status: string;
        }
      | {
          field_key: string;
          field_label: string;
          field_data_type: string;
          field_widget_type: string | null;
          status: string;
        }[]
      | null;
    const field = Array.isArray(fieldJoin) ? fieldJoin[0] : fieldJoin;
    if (!field || field.status !== "ACTIVE") {
      continue;
    }
    const isCheckbox = isCheckboxFieldMeta(field);
    result.push({
      defaultId: row.id as string,
      fieldId,
      fieldKey: field.field_key,
      fieldLabel: field.field_label,
      isCheckbox,
      display: scopedDefaultToDisplay(row as FieldDefault, isCheckbox),
    });
  }

  return result.sort((a, b) => a.fieldLabel.localeCompare(b.fieldLabel));
}

/**
 * Unmapped orphans (no ACTIVE mappings on any form) are listed on every Global
 * form defaults page for the selected scope, with copy stating they are
 * account-wide — not form-specific — so Lee can review/remove ALLOW_INTERMEDIARY
 * without visiting a dedicated hub. Future: move to an account-level defaults page.
 */
export async function loadFormDefaultsEditor(
  supabase: SupabaseClient,
  options: {
    formId: number;
    userId: string;
    selectedScope: DefaultsEditorScopeTab;
  },
): Promise<FormDefaultsEditorDto> {
  const actor = await loadLibraryActorForUser(supabase, options.userId);

  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, form_name, form_code, scope, status")
    .eq("id", options.formId)
    .maybeSingle();

  if (formError) {
    throw new Error(formError.message);
  }
  if (!form) {
    throw new FieldDefaultsEditorError("not_found", "Form not found.");
  }
  if (!canOpenManageDefaults(actor, form)) {
    throw new FieldDefaultsEditorError(
      "unauthorized",
      "Manage Defaults is only available for visible Global forms.",
    );
  }

  if (options.selectedScope === "ORGANIZATION") {
    // Authorization checked after org resolution below.
  }

  const { data: mappings, error: mappingsError } = await supabase
    .from("form_field_mappings")
    .select(FORM_FIELD_MAPPING_SELECT)
    .eq("form_id", options.formId)
    .eq("status", "ACTIVE")
    .order("page_number", { ascending: true });

  if (mappingsError) {
    throw new Error(mappingsError.message);
  }

  const activeMappings = (mappings ?? []).filter(
    (row) => row.field_id && row.fields && row.fields.status === "ACTIVE",
  );

  const fieldIds = activeMappings.map((row) => row.field_id as string);
  const mappedFieldIds = new Set(fieldIds);

  const primaryOrgId = await resolveActingOrganizationIdForDefaults(
    supabase,
    options.userId,
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("primary_organization_id")
    .eq("id", options.userId)
    .maybeSingle();

  const rawPrimary =
    (profile?.primary_organization_id as string | null) ?? null;

  let primaryOrgWarning: string | null = null;
  if (!rawPrimary) {
    primaryOrgWarning =
      "No primary organization is set on your profile. Organization defaults cannot be viewed or edited until a valid primary organization with an active membership is configured.";
  } else if (!primaryOrgId) {
    primaryOrgWarning =
      "Your primary organization is missing or no longer has an active membership. Organization defaults cannot be viewed or edited. Another organization will not be chosen automatically.";
  }

  const organizationId = primaryOrgId;
  const organizationName = await loadOrganizationName(supabase, organizationId);
  const canViewInherited = canViewInheritedOrganizationDefaults(
    actor,
    organizationId,
  );
  const canManageOrganization = canManageOrganizationDefaults(
    actor,
    organizationId,
  );

  if (
    options.selectedScope === "ORGANIZATION" &&
    !canManageOrganization
  ) {
    throw new FieldDefaultsEditorError(
      "unauthorized",
      organizationId
        ? FIELD_DEFAULTS_PERMISSION_DENIED
        : (primaryOrgWarning ?? FIELD_DEFAULTS_PERMISSION_DENIED),
    );
  }

  const { privateRows, organizationRows } = await loadFieldLevelDefaults(
    supabase,
    {
      fieldIds,
      ownerUserId: options.userId,
      organizationId: canViewInherited || canManageOrganization ? organizationId : null,
    },
  );

  const sharedByField = await loadSharedFormNamesByFieldId(supabase, fieldIds);

  const fields: DefaultsEditorFieldRow[] = activeMappings.map((mapping) => {
    const field = mapping.fields!;
    const fieldId = mapping.field_id as string;
    const isCheckbox = isCheckboxFieldMeta(field);
    const isDate = isDateFieldMeta(field);
    const privateActive = pickFieldLevelDefault(
      privateRows.filter((row) => row.status === "ACTIVE"),
      fieldId,
    );
    const orgActive = pickFieldLevelDefault(
      organizationRows.filter((row) => row.status === "ACTIVE"),
      fieldId,
    );

    const selectedScopeDefault =
      options.selectedScope === "PRIVATE"
        ? scopedDefaultToDisplay(privateActive, isCheckbox)
        : scopedDefaultToDisplay(orgActive, isCheckbox);

    const inheritedOrganizationDefault =
      options.selectedScope === "PRIVATE" && canViewInherited
        ? scopedDefaultToDisplay(orgActive, isCheckbox)
        : null;

    const hasSourceMapping = Boolean(
      field.source_type && field.source_type !== "manual_only",
    );

    return {
      fieldId,
      fieldKey: field.field_key,
      fieldLabel: field.field_label,
      fieldDataType: field.field_data_type,
      fieldWidgetType: field.field_widget_type,
      sourceType: field.source_type,
      sourcePath: field.source_path,
      notes: field.notes,
      pageNumber: mapping.page_number ?? null,
      mappingId: mapping.id,
      isCheckbox,
      isDate,
      sharedFormNames: sharedByField.get(fieldId) ?? [form.form_name],
      selectedScopeDefault,
      inheritedOrganizationDefault,
      effectiveFallback: describeEffectiveFallback({
        selectedScope: options.selectedScope,
        fieldId,
        privateRow: privateActive,
        organizationRow: canViewInherited ? orgActive : null,
        isCheckbox,
        hasSourceMapping,
      }),
      sourcePriorityNote: formatSourceSummary(field),
    };
  });

  fields.sort((a, b) => {
    const pageA = a.pageNumber ?? 9999;
    const pageB = b.pageNumber ?? 9999;
    if (pageA !== pageB) {
      return pageA - pageB;
    }
    return a.fieldLabel.localeCompare(b.fieldLabel);
  });

  const unmappedExistingDefaults = await loadUnmappedOrphanDefaults(supabase, {
    scope: options.selectedScope,
    ownerUserId: options.userId,
    organizationId:
      options.selectedScope === "ORGANIZATION" ? organizationId : organizationId,
    mappedFieldIds,
  });

  return {
    form: {
      id: form.id,
      form_name: form.form_name,
      form_code: form.form_code,
      scope: form.scope,
      status: form.status,
    },
    actorUserId: options.userId,
    selectedScope: options.selectedScope,
    organization: {
      organizationId,
      organizationName,
      canViewInherited,
      canManageOrganization,
      primaryOrgWarning,
    },
    fields,
    unmappedExistingDefaults,
  };
}

async function findMatchingFieldLevelRows(
  supabase: SupabaseClient,
  options: {
    scope: FieldDefaultScope;
    fieldId: string;
    ownerUserId: string | null;
    organizationId: string | null;
  },
): Promise<FieldDefault[]> {
  let query = supabase
    .from("field_defaults")
    .select(FIELD_DEFAULT_SELECT)
    .eq("scope", options.scope)
    .eq("field_id", options.fieldId)
    .is("form_id", null)
    .is("form_field_mapping_id", null)
    .in("status", ["ACTIVE", "INACTIVE", "DELETED"]);

  if (options.scope === "PRIVATE") {
    query = query.eq("owner_user_id", options.ownerUserId!);
  } else {
    query = query.eq("organization_id", options.organizationId!);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return (data as FieldDefault[]) ?? [];
}

/**
 * Upsert a field-level scoped default for the authenticated user / primary org.
 * Reactivates inactive/deleted matching rows instead of inserting duplicates.
 */
export async function upsertFieldLevelDefault(
  supabase: SupabaseClient,
  options: {
    userId: string;
    formId: number;
    fieldId: string;
    scope: FieldDefaultScope;
    draft: ScopedDefaultDraft;
  },
): Promise<FieldDefault> {
  if (options.draft.mode === "inherit") {
    throw new FieldDefaultsEditorError(
      "validation",
      "Use Remove Default to return to inheritance.",
    );
  }

  const actor = await loadLibraryActorForUser(supabase, options.userId);
  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, scope, status, owner_user_id")
    .eq("id", options.formId)
    .maybeSingle();

  if (formError) {
    throw new Error(formError.message);
  }
  if (!form || !canOpenManageDefaults(actor, form)) {
    throw new FieldDefaultsEditorError(
      "unauthorized",
      "Manage Defaults is only available for visible Global forms.",
    );
  }

  const { data: field, error: fieldError } = await supabase
    .from("fields")
    .select(
      "id, field_key, field_label, field_data_type, field_widget_type, status",
    )
    .eq("id", options.fieldId)
    .maybeSingle();

  if (fieldError) {
    throw new Error(fieldError.message);
  }
  if (!field || field.status !== "ACTIVE") {
    throw new FieldDefaultsEditorError("not_found", "Field not found.");
  }

  // Field must be mapped on this form OR be an unmapped orphan (no mappings anywhere).
  const { data: onFormMappings, error: onFormError } = await supabase
    .from("form_field_mappings")
    .select("id")
    .eq("form_id", options.formId)
    .eq("field_id", options.fieldId)
    .eq("status", "ACTIVE")
    .limit(1);

  if (onFormError) {
    throw new Error(onFormError.message);
  }

  if ((onFormMappings ?? []).length === 0) {
    const { data: anyMappings, error: anyError } = await supabase
      .from("form_field_mappings")
      .select("id")
      .eq("field_id", options.fieldId)
      .eq("status", "ACTIVE")
      .limit(1);
    if (anyError) {
      throw new Error(anyError.message);
    }
    if ((anyMappings ?? []).length > 0) {
      throw new FieldDefaultsEditorError(
        "validation",
        "This field is not mapped on the selected Global form.",
      );
    }
  }

  let ownerUserId: string | null = null;
  let organizationId: string | null = null;

  if (options.scope === "PRIVATE") {
    if (!canManageOwnPrivateDefaults(actor)) {
      throw new FieldDefaultsEditorError(
        "unauthorized",
        FIELD_DEFAULTS_PERMISSION_DENIED,
      );
    }
    ownerUserId = options.userId;
  } else {
    const primaryOrgId = await resolveActingOrganizationIdForDefaults(
      supabase,
      options.userId,
    );
    if (!primaryOrgId) {
      throw new FieldDefaultsEditorError(
        "stale_org",
        "Organization defaults require a valid active primary organization.",
      );
    }
    if (!canManageOrganizationDefaults(actor, primaryOrgId)) {
      throw new FieldDefaultsEditorError(
        "unauthorized",
        FIELD_DEFAULTS_PERMISSION_DENIED,
      );
    }
    organizationId = primaryOrgId;
  }

  const built = buildFieldDefaultWritePayload({
    fieldId: options.fieldId,
    scope: options.scope,
    ownerUserId,
    organizationId,
    draft: options.draft,
    isDate: isDateFieldMeta(field),
  });

  if (built.error || !built.values) {
    throw new FieldDefaultsEditorError(
      "validation",
      built.error ?? "Invalid default.",
    );
  }

  const matching = await findMatchingFieldLevelRows(supabase, {
    scope: options.scope,
    fieldId: options.fieldId,
    ownerUserId,
    organizationId,
  });

  const active = matching.find((row) => row.status === "ACTIVE");
  const inactive = matching.find(
    (row) => row.status === "INACTIVE" || row.status === "DELETED",
  );
  const target = active ?? inactive ?? null;

  const writeBody = {
    ...built.values,
    updated_by_user_id: options.userId,
  };

  if (target) {
    const { data, error } = await supabase
      .from("field_defaults")
      .update(writeBody)
      .eq("id", target.id)
      .select(FIELD_DEFAULT_SELECT)
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new FieldDefaultsEditorError(
          "conflict",
          "Another active default already exists for this field. Reload and try again.",
        );
      }
      throw new Error(error.message);
    }
    return data as FieldDefault;
  }

  const { data, error } = await supabase
    .from("field_defaults")
    .insert({
      ...writeBody,
      created_by_user_id: options.userId,
    })
    .select(FIELD_DEFAULT_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      // Concurrent insert won — update the active row.
      const retry = await findMatchingFieldLevelRows(supabase, {
        scope: options.scope,
        fieldId: options.fieldId,
        ownerUserId,
        organizationId,
      });
      const winner = retry.find((row) => row.status === "ACTIVE");
      if (!winner) {
        throw new FieldDefaultsEditorError(
          "conflict",
          "Could not save default due to a concurrent update. Reload and try again.",
        );
      }
      const { data: updated, error: updateError } = await supabase
        .from("field_defaults")
        .update(writeBody)
        .eq("id", winner.id)
        .select(FIELD_DEFAULT_SELECT)
        .single();
      if (updateError) {
        throw new Error(updateError.message);
      }
      return updated as FieldDefault;
    }
    throw new Error(error.message);
  }

  return data as FieldDefault;
}

export async function softRemoveFieldLevelDefault(
  supabase: SupabaseClient,
  options: {
    userId: string;
    formId: number;
    fieldId: string;
    scope: FieldDefaultScope;
    defaultId?: string | null;
  },
): Promise<void> {
  const actor = await loadLibraryActorForUser(supabase, options.userId);
  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, scope, status, owner_user_id")
    .eq("id", options.formId)
    .maybeSingle();

  if (formError) {
    throw new Error(formError.message);
  }
  if (!form || !canOpenManageDefaults(actor, form)) {
    throw new FieldDefaultsEditorError(
      "unauthorized",
      "Manage Defaults is only available for visible Global forms.",
    );
  }

  let ownerUserId: string | null = null;
  let organizationId: string | null = null;

  if (options.scope === "PRIVATE") {
    if (!canManageOwnPrivateDefaults(actor)) {
      throw new FieldDefaultsEditorError(
        "unauthorized",
        FIELD_DEFAULTS_PERMISSION_DENIED,
      );
    }
    ownerUserId = options.userId;
  } else {
    const primaryOrgId = await resolveActingOrganizationIdForDefaults(
      supabase,
      options.userId,
    );
    if (!primaryOrgId || !canManageOrganizationDefaults(actor, primaryOrgId)) {
      throw new FieldDefaultsEditorError(
        "unauthorized",
        FIELD_DEFAULTS_PERMISSION_DENIED,
      );
    }
    organizationId = primaryOrgId;
  }

  const matching = await findMatchingFieldLevelRows(supabase, {
    scope: options.scope,
    fieldId: options.fieldId,
    ownerUserId,
    organizationId,
  });

  const active =
    matching.find((row) => row.status === "ACTIVE" && row.id === options.defaultId) ??
    matching.find((row) => row.status === "ACTIVE");

  if (!active) {
    return;
  }

  // Never allow removing another user's private default even if id guessed.
  if (
    options.scope === "PRIVATE" &&
    active.owner_user_id !== options.userId
  ) {
    throw new FieldDefaultsEditorError(
      "unauthorized",
      FIELD_DEFAULTS_PERMISSION_DENIED,
    );
  }

  const { error } = await supabase
    .from("field_defaults")
    .update({
      status: "DELETED",
      updated_by_user_id: options.userId,
    })
    .eq("id", active.id)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }
}
