"use server";

import "server-only";

import { requireAppAdmin } from "@/lib/admin/require-app-admin";
import {
  FIELD_DEFAULT_SELECT,
  resolveActingOrganizationIdForDefaults,
  validateFieldDefaultInput,
  type FieldDefault,
} from "@/lib/field-defaults";
import {
  isActiveAppAdmin,
  type LibraryActor,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/server";
import { formatFieldSourceSummary } from "@/lib/types/field-source";
import {
  canManageOrganizationDefault,
  canManagePrivateDefault,
  canOfferFormDefaultsManagement,
  canViewOrganizationDefaults,
  defaultsEditorKindForField,
  draftFromFieldDefault,
  formatDefaultsDisplayValue,
  isFormScopedPersonalClearTarget,
  pickScopedDefaultForFormField,
  resolveEffectiveDefaultPresentation,
  serializeDefaultsDraft,
  shouldShowDefaultsFieldKey,
  type DefaultSourceLabel,
  type DefaultsEditorKind,
  type DefaultsFieldValueDraft,
  type EffectiveScopedDefaultWinner,
} from "@/lib/types/field-default-management";
import { revalidatePath } from "next/cache";

export type DefaultsOrganizationOption = {
  id: string;
  name: string;
};

export type FormDefaultsFieldRow = {
  fieldId: string;
  fieldKey: string;
  fieldLabel: string;
  fieldDataType: string;
  fieldWidgetType: string;
  mappingSummary: string;
  editorKind: DefaultsEditorKind;
  privateDefault: FieldDefault | null;
  organizationDefault: FieldDefault | null;
  privateDisplay: string;
  organizationDisplay: string;
  effectiveWinner: EffectiveScopedDefaultWinner;
  effectiveDisplay: string;
  effectiveSourceLabel: DefaultSourceLabel;
  canClearFormScopedPersonal: boolean;
  legacyPersonalProtected: boolean;
  privateDraft: DefaultsFieldValueDraft;
  organizationDraft: DefaultsFieldValueDraft;
};

export type FormDefaultsPageData = {
  formId: number;
  formName: string;
  formCode: string;
  actor: LibraryActor;
  primaryOrganizationId: string | null;
  selectedOrganizationId: string | null;
  selectedOrganizationName: string | null;
  canEditPrivate: boolean;
  canEditOrganization: boolean;
  canSelectOrganization: boolean;
  showFieldKey: boolean;
  organizationOptions: DefaultsOrganizationOption[];
  fields: FormDefaultsFieldRow[];
};

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type FieldCatalogRow = {
  id: string;
  field_key: string;
  field_label: string | null;
  field_name: string | null;
  field_data_type: string;
  field_widget_type: string;
  source_type: string | null;
  source_path: string | null;
  resolver_key: string | null;
  fallback_value: string | null;
  status: string;
};

async function getSessionActor(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; actor: LibraryActor; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("status, app_role, onboarding_status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("organization_id, membership_role, status")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE"),
  ]);

  const activeMemberships = memberships ?? [];
  const actor: LibraryActor = {
    userId: user.id,
    isActiveAdmin: isActiveAppAdmin(profile),
    memberOrganizationIds: activeMemberships.map(
      (row) => row.organization_id as string,
    ),
    orgAdminOrganizationIds: activeMemberships
      .filter((row) => row.membership_role === "ORG_ADMIN")
      .map((row) => row.organization_id as string),
  };

  return { ok: true, supabase, actor, userId: user.id };
}

async function loadOrganizationOptionsForActor(
  actor: LibraryActor,
): Promise<DefaultsOrganizationOption[]> {
  if (actor.isActiveAdmin) {
    await requireAppAdmin();
    // App admins need a broad org list; use the service-role client after
    // requireAppAdmin so RLS visibility limits do not hide eligible orgs.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .select("id, name")
      .eq("status", "ACTIVE")
      .order("name");
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: (row.name as string) || "Organization",
    }));
  }

  const orgIds = [
    ...new Set([
      ...(actor.orgAdminOrganizationIds ?? []),
      ...(actor.memberOrganizationIds ?? []),
    ]),
  ];
  if (orgIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", orgIds)
    .neq("status", "DELETED")
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) || "Organization",
  }));
}

function resolveSelectedOrganizationId(options: {
  actor: LibraryActor;
  primaryOrganizationId: string | null;
  requestedOrganizationId: string | null | undefined;
  organizationOptions: DefaultsOrganizationOption[];
}): string | null {
  const optionIds = new Set(options.organizationOptions.map((o) => o.id));

  if (options.actor.isActiveAdmin) {
    const requested = options.requestedOrganizationId?.trim() || null;
    if (requested && optionIds.has(requested)) {
      return requested;
    }
    if (
      options.primaryOrganizationId &&
      optionIds.has(options.primaryOrganizationId)
    ) {
      return options.primaryOrganizationId;
    }
    return options.organizationOptions[0]?.id ?? null;
  }

  // Non-admins: never silently switch away from primary when it is valid.
  if (
    options.primaryOrganizationId &&
    optionIds.has(options.primaryOrganizationId) &&
    canViewOrganizationDefaults(options.actor, options.primaryOrganizationId)
  ) {
    return options.primaryOrganizationId;
  }

  const firstAdminOrg = (options.actor.orgAdminOrganizationIds ?? []).find(
    (id) => optionIds.has(id),
  );
  if (firstAdminOrg) {
    return firstAdminOrg;
  }

  const firstMemberOrg = (options.actor.memberOrganizationIds ?? []).find(
    (id) => optionIds.has(id),
  );
  return firstMemberOrg ?? null;
}

async function loadActiveDefaultsForFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
    .eq("status", "ACTIVE")
    .eq("scope", "PRIVATE")
    .eq("owner_user_id", options.ownerUserId)
    .in("field_id", fieldIds);

  if (privateError) {
    throw new Error(privateError.message);
  }

  let organizationRows: FieldDefault[] = [];
  if (options.organizationId) {
    const { data: orgRows, error: orgError } = await supabase
      .from("field_defaults")
      .select(FIELD_DEFAULT_SELECT)
      .eq("status", "ACTIVE")
      .eq("scope", "ORGANIZATION")
      .eq("organization_id", options.organizationId)
      .in("field_id", fieldIds);

    if (orgError) {
      throw new Error(orgError.message);
    }
    organizationRows = (orgRows as FieldDefault[]) ?? [];
  }

  return {
    privateRows: (privateRows as FieldDefault[]) ?? [],
    organizationRows,
  };
}

export async function loadFormDefaultsPage(options: {
  formId: number;
  organizationId?: string | null;
}): Promise<ActionResult<FormDefaultsPageData>> {
  try {
    const session = await getSessionActor();
    if (!session.ok) {
      return session;
    }
    const { supabase, actor, userId } = session;

    if (!Number.isFinite(options.formId) || options.formId <= 0) {
      return { ok: false, error: "Invalid form." };
    }

    const { data: form, error: formError } = await supabase
      .from("forms")
      .select("id, form_name, form_code, scope, status")
      .eq("id", options.formId)
      .maybeSingle();

    if (formError) {
      return { ok: false, error: formError.message };
    }
    if (!form) {
      return { ok: false, error: "Form not found." };
    }
    if (!canOfferFormDefaultsManagement(form)) {
      return {
        ok: false,
        error: "Defaults management is available only for active Global forms.",
      };
    }

    const { data: mappings, error: mappingsError } = await supabase
      .from("form_field_mappings")
      .select("id, field_id, status")
      .eq("form_id", options.formId)
      .eq("status", "ACTIVE");

    if (mappingsError) {
      return { ok: false, error: mappingsError.message };
    }

    const fieldIds = [
      ...new Set(
        (mappings ?? [])
          .map((row) => row.field_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    let fields: FieldCatalogRow[] = [];
    if (fieldIds.length > 0) {
      const { data: fieldRows, error: fieldsError } = await supabase
        .from("fields")
        .select(
          "id, field_key, field_label, field_name, field_data_type, field_widget_type, source_type, source_path, resolver_key, fallback_value, status",
        )
        .in("id", fieldIds)
        .neq("status", "DELETED");

      if (fieldsError) {
        return { ok: false, error: fieldsError.message };
      }
      fields = (fieldRows as FieldCatalogRow[]) ?? [];
    }

    fields.sort((a, b) =>
      (a.field_label || a.field_key).localeCompare(
        b.field_label || b.field_key,
        undefined,
        { sensitivity: "base" },
      ),
    );

    const primaryOrganizationId =
      await resolveActingOrganizationIdForDefaults(supabase, userId);
    const organizationOptions = await loadOrganizationOptionsForActor(actor);
    const selectedOrganizationId = resolveSelectedOrganizationId({
      actor,
      primaryOrganizationId,
      requestedOrganizationId: options.organizationId,
      organizationOptions,
    });

    if (
      selectedOrganizationId &&
      !canViewOrganizationDefaults(actor, selectedOrganizationId) &&
      !actor.isActiveAdmin
    ) {
      return {
        ok: false,
        error: "You do not have access to that organization.",
      };
    }

    const selectedOrganizationName =
      organizationOptions.find((o) => o.id === selectedOrganizationId)?.name ??
      null;

    const { privateRows, organizationRows } = await loadActiveDefaultsForFields(
      supabase,
      {
        fieldIds: fields.map((f) => f.id),
        ownerUserId: userId,
        organizationId: selectedOrganizationId,
      },
    );

    const canEditPrivate = canManagePrivateDefault(actor, userId);
    const canEditOrganization = canManageOrganizationDefault(
      actor,
      selectedOrganizationId,
    );

    const pageFields: FormDefaultsFieldRow[] = fields.map((field) => {
      const editorKind = defaultsEditorKindForField(field);
      const presentation = resolveEffectiveDefaultPresentation({
        privateRows,
        organizationRows,
        fieldId: field.id,
        formId: options.formId,
        editorKind,
      });
      const privateDefault = presentation.privateDefault as FieldDefault | null;
      const organizationDefault =
        presentation.organizationDefault as FieldDefault | null;

      return {
        fieldId: field.id,
        fieldKey: field.field_key,
        fieldLabel: field.field_label || field.field_name || field.field_key,
        fieldDataType: field.field_data_type,
        fieldWidgetType: field.field_widget_type,
        mappingSummary: formatFieldSourceSummary(field),
        editorKind,
        privateDefault,
        organizationDefault,
        privateDisplay: formatDefaultsDisplayValue(privateDefault, editorKind),
        organizationDisplay: formatDefaultsDisplayValue(
          organizationDefault,
          editorKind,
        ),
        effectiveWinner: presentation.winner,
        effectiveDisplay: presentation.displayValue,
        effectiveSourceLabel: presentation.sourceLabel,
        canClearFormScopedPersonal: presentation.canClearFormScopedPersonal,
        legacyPersonalProtected: presentation.legacyPersonalProtected,
        privateDraft: draftFromFieldDefault(privateDefault, editorKind),
        organizationDraft: draftFromFieldDefault(
          organizationDefault,
          editorKind,
        ),
      };
    });

    return {
      ok: true,
      data: {
        formId: options.formId,
        formName: form.form_name as string,
        formCode: form.form_code as string,
        actor,
        primaryOrganizationId,
        selectedOrganizationId,
        selectedOrganizationName,
        canEditPrivate,
        canEditOrganization,
        canSelectOrganization: actor.isActiveAdmin,
        showFieldKey: shouldShowDefaultsFieldKey(actor),
        organizationOptions: actor.isActiveAdmin
          ? organizationOptions
          : organizationOptions.filter(
              (o) =>
                (actor.orgAdminOrganizationIds ?? []).includes(o.id) ||
                o.id === selectedOrganizationId,
            ),
        fields: pageFields,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load defaults.",
    };
  }
}

async function assertGlobalForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: form, error } = await supabase
    .from("forms")
    .select("id, scope, status")
    .eq("id", formId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!form || !canOfferFormDefaultsManagement(form)) {
    return {
      ok: false,
      error: "Defaults management is available only for active Global forms.",
    };
  }
  return { ok: true };
}

async function assertFieldOnForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formId: number,
  fieldId: string,
): Promise<
  | { ok: true; field: FieldCatalogRow }
  | { ok: false; error: string }
> {
  const { data: mapping, error: mappingError } = await supabase
    .from("form_field_mappings")
    .select("id")
    .eq("form_id", formId)
    .eq("field_id", fieldId)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();

  if (mappingError) {
    return { ok: false, error: mappingError.message };
  }
  if (!mapping) {
    return { ok: false, error: "That field is not mapped on this Global form." };
  }

  const { data: field, error: fieldError } = await supabase
    .from("fields")
    .select(
      "id, field_key, field_label, field_name, field_data_type, field_widget_type, source_type, source_path, resolver_key, fallback_value, status",
    )
    .eq("id", fieldId)
    .neq("status", "DELETED")
    .maybeSingle();

  if (fieldError) {
    return { ok: false, error: fieldError.message };
  }
  if (!field) {
    return { ok: false, error: "Field not found." };
  }

  return { ok: true, field: field as FieldCatalogRow };
}

/**
 * Find the form-scoped ACTIVE row to update, else null (caller inserts).
 * Prefer exact form+field (no mapping), then any ACTIVE form-scoped row.
 */
async function findFormScopedActiveDefault(
  supabase: Awaited<ReturnType<typeof createClient>>,
  options: {
    fieldId: string;
    formId: number;
    scope: "PRIVATE" | "ORGANIZATION";
    ownerUserId?: string | null;
    organizationId?: string | null;
  },
): Promise<FieldDefault | null> {
  let query = supabase
    .from("field_defaults")
    .select(FIELD_DEFAULT_SELECT)
    .eq("status", "ACTIVE")
    .eq("scope", options.scope)
    .eq("field_id", options.fieldId)
    .eq("form_id", options.formId)
    .is("form_field_mapping_id", null);

  if (options.scope === "PRIVATE") {
    query = query.eq("owner_user_id", options.ownerUserId!);
  } else {
    query = query.eq("organization_id", options.organizationId!);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as FieldDefault | null) ?? null;
}

export async function savePrivateFormDefault(input: {
  formId: number;
  fieldId: string;
  draft: DefaultsFieldValueDraft;
}): Promise<ActionResult<{ defaultId: string }>> {
  try {
    const session = await getSessionActor();
    if (!session.ok) {
      return session;
    }
    const { supabase, actor, userId } = session;

    if (!canManagePrivateDefault(actor, userId)) {
      return { ok: false, error: "You can only manage your own Private defaults." };
    }

    const formOk = await assertGlobalForm(supabase, input.formId);
    if (!formOk.ok) {
      return formOk;
    }

    const fieldOk = await assertFieldOnForm(
      supabase,
      input.formId,
      input.fieldId,
    );
    if (!fieldOk.ok) {
      return fieldOk;
    }

    const kind = defaultsEditorKindForField(fieldOk.field);
    const serialized = serializeDefaultsDraft(kind, input.draft);
    if (!serialized.ok) {
      return serialized;
    }

    const validationError = validateFieldDefaultInput({
      field_id: input.fieldId,
      form_id: input.formId,
      form_field_mapping_id: null,
      scope: "PRIVATE",
      owner_user_id: userId,
      organization_id: null,
      default_value: serialized.payload.default_value,
      default_checked: serialized.payload.default_checked,
      status: "ACTIVE",
    });
    if (validationError) {
      return { ok: false, error: validationError };
    }

    const existing = await findFormScopedActiveDefault(supabase, {
      fieldId: input.fieldId,
      formId: input.formId,
      scope: "PRIVATE",
      ownerUserId: userId,
    });

    if (existing) {
      const { data, error } = await supabase
        .from("field_defaults")
        .update({
          default_value: serialized.payload.default_value,
          default_checked: serialized.payload.default_checked,
          updated_by_user_id: userId,
          status: "ACTIVE",
        })
        .eq("id", existing.id)
        .eq("owner_user_id", userId)
        .eq("scope", "PRIVATE")
        .select("id")
        .single();

      if (error) {
        return { ok: false, error: error.message };
      }
      revalidatePath(`/forms/${input.formId}/defaults`);
      return { ok: true, data: { defaultId: data.id as string } };
    }

    const { data, error } = await supabase
      .from("field_defaults")
      .insert({
        field_id: input.fieldId,
        form_id: input.formId,
        form_field_mapping_id: null,
        scope: "PRIVATE",
        owner_user_id: userId,
        organization_id: null,
        default_value: serialized.payload.default_value,
        default_checked: serialized.payload.default_checked,
        status: "ACTIVE",
        created_by_user_id: userId,
        updated_by_user_id: userId,
        notes: null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "An active Private default already exists for this field.",
        };
      }
      return { ok: false, error: error.message };
    }

    revalidatePath(`/forms/${input.formId}/defaults`);
    return { ok: true, data: { defaultId: data.id as string } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save Private default.",
    };
  }
}

export async function clearPrivateFormDefault(input: {
  formId: number;
  fieldId: string;
}): Promise<ActionResult<{ cleared: boolean }>> {
  try {
    const session = await getSessionActor();
    if (!session.ok) {
      return session;
    }
    const { supabase, actor, userId } = session;

    if (!canManagePrivateDefault(actor, userId)) {
      return { ok: false, error: "You can only manage your own Private defaults." };
    }

    const formOk = await assertGlobalForm(supabase, input.formId);
    if (!formOk.ok) {
      return formOk;
    }

    const { privateRows } = await loadActiveDefaultsForFields(supabase, {
      fieldIds: [input.fieldId],
      ownerUserId: userId,
      organizationId: null,
    });

    // Form-level Clear only targets form-scoped Personal rows.
    // Never soft-delete legacy all-forms (form_id IS NULL) Personal defaults.
    const target = await findFormScopedActiveDefault(supabase, {
      fieldId: input.fieldId,
      formId: input.formId,
      scope: "PRIVATE",
      ownerUserId: userId,
    });

    if (!target) {
      const legacyOrOther = pickScopedDefaultForFormField(privateRows, {
        fieldId: input.fieldId,
        formId: input.formId,
      });
      if (
        legacyOrOther &&
        !isFormScopedPersonalClearTarget(legacyOrOther, input.formId)
      ) {
        return {
          ok: false,
          error:
            "This Personal default applies to all forms and cannot be cleared from a single form. Form-specific overrides are managed separately.",
        };
      }
      return { ok: true, data: { cleared: false } };
    }

    if (target.owner_user_id !== userId || target.scope !== "PRIVATE") {
      return { ok: false, error: "You can only clear your own Private defaults." };
    }

    if (!isFormScopedPersonalClearTarget(target, input.formId)) {
      return {
        ok: false,
        error:
          "This Personal default applies to all forms and cannot be cleared from a single form.",
      };
    }

    const { error } = await supabase
      .from("field_defaults")
      .update({
        status: "DELETED",
        updated_by_user_id: userId,
      })
      .eq("id", target.id)
      .eq("owner_user_id", userId)
      .eq("scope", "PRIVATE")
      .eq("form_id", input.formId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(`/forms/${input.formId}/defaults`);
    revalidatePath(`/forms/${input.formId}/editor`);
    return { ok: true, data: { cleared: true } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to clear Private default.",
    };
  }
}

export async function saveOrganizationFormDefault(input: {
  formId: number;
  fieldId: string;
  organizationId: string;
  draft: DefaultsFieldValueDraft;
}): Promise<ActionResult<{ defaultId: string }>> {
  try {
    const session = await getSessionActor();
    if (!session.ok) {
      return session;
    }
    const { supabase, actor, userId } = session;
    const organizationId = input.organizationId?.trim();

    if (!organizationId) {
      return { ok: false, error: "An organization is required." };
    }
    if (!canManageOrganizationDefault(actor, organizationId)) {
      return {
        ok: false,
        error: "You do not have permission to manage Organization defaults for that organization.",
      };
    }

    const formOk = await assertGlobalForm(supabase, input.formId);
    if (!formOk.ok) {
      return formOk;
    }

    const fieldOk = await assertFieldOnForm(
      supabase,
      input.formId,
      input.fieldId,
    );
    if (!fieldOk.ok) {
      return fieldOk;
    }

    const kind = defaultsEditorKindForField(fieldOk.field);
    const serialized = serializeDefaultsDraft(kind, input.draft);
    if (!serialized.ok) {
      return serialized;
    }

    const validationError = validateFieldDefaultInput({
      field_id: input.fieldId,
      form_id: input.formId,
      form_field_mapping_id: null,
      scope: "ORGANIZATION",
      owner_user_id: null,
      organization_id: organizationId,
      default_value: serialized.payload.default_value,
      default_checked: serialized.payload.default_checked,
      status: "ACTIVE",
    });
    if (validationError) {
      return { ok: false, error: validationError };
    }

    const existing = await findFormScopedActiveDefault(supabase, {
      fieldId: input.fieldId,
      formId: input.formId,
      scope: "ORGANIZATION",
      organizationId,
    });

    if (existing) {
      const { data, error } = await supabase
        .from("field_defaults")
        .update({
          default_value: serialized.payload.default_value,
          default_checked: serialized.payload.default_checked,
          updated_by_user_id: userId,
          status: "ACTIVE",
        })
        .eq("id", existing.id)
        .eq("organization_id", organizationId)
        .eq("scope", "ORGANIZATION")
        .select("id")
        .single();

      if (error) {
        return { ok: false, error: error.message };
      }
      revalidatePath(`/forms/${input.formId}/defaults`);
      return { ok: true, data: { defaultId: data.id as string } };
    }

    const { data, error } = await supabase
      .from("field_defaults")
      .insert({
        field_id: input.fieldId,
        form_id: input.formId,
        form_field_mapping_id: null,
        scope: "ORGANIZATION",
        owner_user_id: null,
        organization_id: organizationId,
        default_value: serialized.payload.default_value,
        default_checked: serialized.payload.default_checked,
        status: "ACTIVE",
        created_by_user_id: userId,
        updated_by_user_id: userId,
        notes: null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "An active Organization default already exists for this field.",
        };
      }
      return { ok: false, error: error.message };
    }

    revalidatePath(`/forms/${input.formId}/defaults`);
    return { ok: true, data: { defaultId: data.id as string } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to save Organization default.",
    };
  }
}

export async function clearOrganizationFormDefault(input: {
  formId: number;
  fieldId: string;
  organizationId: string;
}): Promise<ActionResult<{ cleared: boolean }>> {
  try {
    const session = await getSessionActor();
    if (!session.ok) {
      return session;
    }
    const { supabase, actor, userId } = session;
    const organizationId = input.organizationId?.trim();

    if (!organizationId) {
      return { ok: false, error: "An organization is required." };
    }
    if (!canManageOrganizationDefault(actor, organizationId)) {
      return {
        ok: false,
        error: "You do not have permission to manage Organization defaults for that organization.",
      };
    }

    const formOk = await assertGlobalForm(supabase, input.formId);
    if (!formOk.ok) {
      return formOk;
    }

    const { organizationRows } = await loadActiveDefaultsForFields(supabase, {
      fieldIds: [input.fieldId],
      ownerUserId: userId,
      organizationId,
    });

    const target =
      (await findFormScopedActiveDefault(supabase, {
        fieldId: input.fieldId,
        formId: input.formId,
        scope: "ORGANIZATION",
        organizationId,
      })) ??
      pickScopedDefaultForFormField(organizationRows, {
        fieldId: input.fieldId,
        formId: input.formId,
      });

    if (!target) {
      return { ok: true, data: { cleared: false } };
    }

    if (
      target.organization_id !== organizationId ||
      target.scope !== "ORGANIZATION"
    ) {
      return {
        ok: false,
        error: "That Organization default does not belong to the selected organization.",
      };
    }

    const { error } = await supabase
      .from("field_defaults")
      .update({
        status: "DELETED",
        updated_by_user_id: userId,
      })
      .eq("id", target.id)
      .eq("organization_id", organizationId)
      .eq("scope", "ORGANIZATION");

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(`/forms/${input.formId}/defaults`);
    return { ok: true, data: { cleared: true } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to clear Organization default.",
    };
  }
}
