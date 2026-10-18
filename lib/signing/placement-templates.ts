import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_TEMPLATES_BUCKET, type FormLibraryScope } from "@/lib/form-storage";
import { loadFormPdfPageCount } from "@/lib/forms/form-pdf-page-count";
import { DATE_SIGNED_SOURCE_TYPES } from "@/lib/signing/date-signed-link";
import { SigningError } from "@/lib/signing/errors";
import {
  canUseFormForOrganizationTemplate,
  canUseFormForPersonalTemplate,
  COPY_FROM_VERSION_WARNING,
  formVersionDisplay,
  formVersionPlacementEligibility,
  isActivePlacementAppAdmin,
  isAdminManagingOwnerPersonalTemplate,
  isPlacementTemplateFieldType,
  mappedRegionsFromMappings,
  parseSlotKey,
  personalTemplateCardTitle,
  personalTemplateSubjectUserId,
  slotFromColumns,
  slotKey,
  slotLabel,
  templateSlotOptions,
  type MappedRegionSourceRow,
  type PlacementMappedRegion,
  type PlacementSlot,
  type PlacementTemplateFieldRecord,
  type PlacementTemplateFieldType,
  type PlacementTemplateFormRef,
  type PlacementTemplateScope,
} from "@/lib/signing/placement-template-model";
import type {
  SigningPreviewField,
  SigningPreviewModel,
  SigningPreviewParticipant,
} from "@/lib/signing/preview";
import type { SigningActor } from "@/lib/signing/types";
import { isUuid } from "@/lib/signing/types";
import { resolveFormStoragePath } from "@/lib/storage-path-resolve";
import { createClient } from "@/lib/supabase/server";

const FORM_SELECT =
  "id, form_name, form_code, version_label, form_family_key, scope, owner_user_id, organization_id, status, publication_state, source_storage_path";

const TEMPLATE_SELECT =
  "id, form_id, scope_type, owner_user_id, organization_id, status, update_date, copied_from_template_id";

const FIELD_SELECT =
  "id, template_id, field_type, slot_role_code, slot_ordinal, is_required, page_number, x, y, width, height, linked_template_field_id";

export type PlacementFormRow = PlacementTemplateFormRef & {
  form_name: string | null;
  form_code: string | null;
  version_label: string | null;
  form_family_key: string | null;
  source_storage_path: string | null;
};

export type PlacementTemplateRow = {
  id: string;
  form_id: number;
  scope_type: PlacementTemplateScope;
  owner_user_id: string | null;
  organization_id: string | null;
  status: string;
  update_date: string;
  copied_from_template_id: string | null;
};

type FieldRow = {
  id: string;
  template_id: string;
  field_type: string;
  slot_role_code: string | null;
  slot_ordinal: number | null;
  is_required: boolean;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  linked_template_field_id: string | null;
};

/** Organizations where the actor's membership and the organization are ACTIVE. */
export function activeOrganizationIds(actor: SigningActor): string[] {
  return actor.memberships
    .filter(
      (row) => row.membershipStatus === "ACTIVE" && row.organizationStatus === "ACTIVE",
    )
    .map((row) => row.organizationId);
}

export function orgAdminOrganizationIds(actor: SigningActor): string[] {
  return actor.memberships
    .filter(
      (row) =>
        row.membershipStatus === "ACTIVE" &&
        row.organizationStatus === "ACTIVE" &&
        row.membershipRole === "ORG_ADMIN",
    )
    .map((row) => row.organizationId);
}

function actorIsActiveAppAdmin(actor: SigningActor): boolean {
  return isActivePlacementAppAdmin(actor.profile);
}

/**
 * Who may see a template. Members may use an Organization template.
 * An active Global Admin may read a Personal template they are authorized
 * to administer for a Form owner (checked with form context at the call site
 * when elevating; ownership alone is never enough for an unrelated admin).
 */
export function canReadPlacementTemplate(
  actor: SigningActor,
  template: Pick<PlacementTemplateRow, "scope_type" | "owner_user_id" | "organization_id" | "form_id">,
  options?: { form?: PlacementTemplateFormRef | null },
): boolean {
  if (template.scope_type === "PERSONAL") {
    if (template.owner_user_id === actor.userId) return true;
    if (!actorIsActiveAppAdmin(actor) || !options?.form) return false;
    return (
      personalTemplateSubjectUserId(
        { userId: actor.userId, isActiveAppAdmin: true },
        options.form,
      ) === template.owner_user_id &&
      options.form.id === template.form_id
    );
  }
  return (
    template.organization_id != null &&
    activeOrganizationIds(actor).includes(template.organization_id)
  );
}

/**
 * Who may change a template: its owner, an ORG_ADMIN of its organization, or
 * a Global Admin managing the Form owner's Personal template on their behalf.
 */
export function canEditPlacementTemplate(
  actor: SigningActor,
  template: Pick<PlacementTemplateRow, "scope_type" | "owner_user_id" | "organization_id" | "form_id">,
  options?: { form?: PlacementTemplateFormRef | null },
): boolean {
  if (template.scope_type === "PERSONAL") {
    if (template.owner_user_id === actor.userId) return true;
    if (!actorIsActiveAppAdmin(actor) || !options?.form) return false;
    return (
      personalTemplateSubjectUserId(
        { userId: actor.userId, isActiveAppAdmin: true },
        options.form,
      ) === template.owner_user_id &&
      options.form.id === template.form_id
    );
  }
  return (
    template.organization_id != null &&
    orgAdminOrganizationIds(actor).includes(template.organization_id)
  );
}

function parseFormId(value: unknown): number {
  const formId = typeof value === "string" ? Number(value) : value;
  if (typeof formId !== "number" || !Number.isInteger(formId) || formId <= 0) {
    throw new SigningError("INVALID_INPUT", "Invalid form.");
  }
  return formId;
}

/** The signed-in user's own (RLS) client; defaults to the request session. */
export type PlacementSessionOptions = { sessionClient?: SupabaseClient };

async function userSession(options: PlacementSessionOptions): Promise<SupabaseClient> {
  return options.sessionClient ?? (await createClient());
}

/** Reads the form through the actor's own session (RLS) before any elevation. */
async function loadVisibleForm(
  formIdRaw: unknown,
  options: PlacementSessionOptions,
): Promise<PlacementFormRow> {
  const formId = parseFormId(formIdRaw);
  const supabase = await userSession(options);
  const { data, error } = await supabase
    .from("forms")
    .select(FORM_SELECT)
    .eq("id", formId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new SigningError("NOT_FOUND", "Form not found.");
  return data as PlacementFormRow;
}

function personalActorContext(actor: SigningActor) {
  return {
    userId: actor.userId,
    memberOrganizationIds: activeOrganizationIds(actor),
    isActiveAppAdmin: actorIsActiveAppAdmin(actor),
  };
}

function assertFormUsableForPersonal(actor: SigningActor, form: PlacementFormRow) {
  if (!canUseFormForPersonalTemplate(personalActorContext(actor), form)) {
    throw new SigningError("NOT_FOUND", "Form not found.");
  }
}

function assertFormEligible(form: PlacementFormRow) {
  const eligibility = formVersionPlacementEligibility(form);
  if (!eligibility.ok) throw new SigningError("CONFLICT", eligibility.reason);
}

function toFieldRecord(row: FieldRow): PlacementTemplateFieldRecord {
  return {
    id: row.id,
    fieldType: row.field_type as PlacementTemplateFieldType,
    slot: slotFromColumns(row.slot_role_code, row.slot_ordinal),
    isRequired: Boolean(row.is_required),
    pageNumber: row.page_number,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    linkedTemplateFieldId: row.linked_template_field_id,
  };
}

export async function loadTemplateFields(
  admin: SupabaseClient,
  templateId: string,
): Promise<PlacementTemplateFieldRecord[]> {
  const { data, error } = await admin
    .from("signing_placement_template_fields")
    .select(FIELD_SELECT)
    .eq("template_id", templateId)
    .order("page_number", { ascending: true })
    .order("y", { ascending: true })
    .order("x", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as FieldRow[]).map(toFieldRecord);
}

async function countTemplateFields(
  admin: SupabaseClient,
  templateIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (templateIds.length === 0) return counts;
  const { data, error } = await admin
    .from("signing_placement_template_fields")
    .select("template_id")
    .in("template_id", templateIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const id = row.template_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

async function loadTemplateRow(
  admin: SupabaseClient,
  templateIdRaw: unknown,
): Promise<PlacementTemplateRow | null> {
  if (!isUuid(templateIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid placement template.");
  }
  const { data, error } = await admin
    .from("signing_placement_templates")
    .select(TEMPLATE_SELECT)
    .eq("id", templateIdRaw)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PlacementTemplateRow | null) ?? null;
}

/**
 * Load an ACTIVE template the actor may read (or edit). Unreadable templates
 * are reported as not found so their existence is not disclosed.
 */
export async function requirePlacementTemplate(
  actor: SigningActor,
  templateIdRaw: unknown,
  admin: SupabaseClient,
  need: "read" | "edit",
): Promise<PlacementTemplateRow> {
  const template = await loadTemplateRow(admin, templateIdRaw);
  if (!template || template.status !== "ACTIVE") {
    throw new SigningError("NOT_FOUND", "Placement template not found.");
  }
  let form: PlacementFormRow | null = null;
  if (template.scope_type === "PERSONAL" && template.owner_user_id !== actor.userId) {
    // Global Admin on-behalf path: Form must be PRIVATE and owned by the
    // template's owner. Never grants access to another user's Personal
    // template on a Global form.
    const { data, error } = await admin
      .from("forms")
      .select(FORM_SELECT)
      .eq("id", template.form_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    form = (data as PlacementFormRow | null) ?? null;
  }
  if (!canReadPlacementTemplate(actor, template, { form })) {
    throw new SigningError("NOT_FOUND", "Placement template not found.");
  }
  if (need === "edit" && !canEditPlacementTemplate(actor, template, { form })) {
    throw new SigningError(
      "FORBIDDEN",
      template.scope_type === "ORGANIZATION"
        ? "Only an organization admin can change this Organization placement template."
        : "You cannot change this Personal placement template.",
    );
  }
  return template;
}

async function loadOrganizationNames(
  admin: SupabaseClient,
  organizationIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (organizationIds.length === 0) return names;
  const { data, error } = await admin
    .from("organizations")
    .select("id, name")
    .in("id", organizationIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    names.set(row.id as string, (row.name as string | null)?.trim() || "Organization");
  }
  return names;
}

// ---------------------------------------------------------------------------
// Form page model
// ---------------------------------------------------------------------------

export type PlacementTemplateSummary = {
  templateId: string;
  placementCount: number;
  updatedAt: string;
  copiedFromTemplateId: string | null;
};

export type PlacementCopySource = {
  templateId: string;
  formId: number;
  formDisplay: string;
  placementCount: number;
  sameFamily: boolean;
};

export type FormPlacementOrganization = {
  organizationId: string;
  name: string;
  isOrgAdmin: boolean;
  formUsable: boolean;
  template: PlacementTemplateSummary | null;
  copySources: PlacementCopySource[];
};

export type FormPlacementPageModel = {
  form: {
    id: number;
    display: string;
    name: string;
    code: string | null;
    versionLabel: string | null;
    status: string | null;
    publicationState: string | null;
    scope: string | null;
    ownerUserId: string | null;
  };
  eligibility: { ok: true } | { ok: false; reason: string };
  /** Display name of the Personal template's subject (owner), not always the actor. */
  personalOwnerDisplayName: string | null;
  ownerFirstName: string | null;
  /** True when a Global Admin is managing the Form owner's Personal template. */
  managingPersonalOnBehalf: boolean;
  personalCardTitle: string;
  personal: PlacementTemplateSummary | null;
  personalCopySources: PlacementCopySource[];
  organizations: FormPlacementOrganization[];
  copyWarning: string;
};

function summarize(
  template: PlacementTemplateRow,
  counts: Map<string, number>,
): PlacementTemplateSummary {
  return {
    templateId: template.id,
    placementCount: counts.get(template.id) ?? 0,
    updatedAt: template.update_date,
    copiedFromTemplateId: template.copied_from_template_id,
  };
}

async function loadCopySources(
  admin: SupabaseClient,
  options: {
    form: PlacementFormRow;
    templates: PlacementTemplateRow[];
    counts: Map<string, number>;
    session: PlacementSessionOptions;
  },
): Promise<PlacementCopySource[]> {
  const candidates = options.templates.filter(
    (row) => row.form_id !== options.form.id,
  );
  if (candidates.length === 0) return [];
  const formIds = [...new Set(candidates.map((row) => row.form_id))];
  const supabase = await userSession(options.session);
  const { data, error } = await supabase
    .from("forms")
    .select("id, form_name, form_code, version_label, form_family_key")
    .in("id", formIds);
  if (error) throw new Error(error.message);
  const forms = new Map(
    (data ?? []).map((row) => [row.id as number, row as Record<string, unknown>]),
  );
  const family = options.form.form_family_key?.trim().toLowerCase() || null;
  return candidates
    .map((row) => {
      const source = forms.get(row.form_id);
      const sourceFamily =
        (source?.form_family_key as string | null | undefined)?.trim().toLowerCase() ||
        null;
      return {
        templateId: row.id,
        formId: row.form_id,
        formDisplay: source
          ? formVersionDisplay({
              id: row.form_id,
              form_name: source.form_name as string | null,
              form_code: source.form_code as string | null,
              version_label: source.version_label as string | null,
            })
          : `Form #${row.form_id}`,
        placementCount: options.counts.get(row.id) ?? 0,
        sameFamily: family != null && sourceFamily === family,
      };
    })
    .sort(
      (a, b) =>
        Number(b.sameFamily) - Number(a.sameFamily) ||
        a.formDisplay.localeCompare(b.formDisplay),
    );
}

export async function loadFormPlacementPageWithActor(
  actor: SigningActor,
  input: { formId: unknown },
  admin: SupabaseClient,
  session: PlacementSessionOptions = {},
): Promise<FormPlacementPageModel> {
  const form = await loadVisibleForm(input.formId, session);
  assertFormUsableForPersonal(actor, form);

  const subjectUserId = personalTemplateSubjectUserId(personalActorContext(actor), form);
  const managingOnBehalf = isAdminManagingOwnerPersonalTemplate(
    personalActorContext(actor),
    form,
  );

  const memberOrgIds = activeOrganizationIds(actor);
  const adminOrgIds = orgAdminOrganizationIds(actor);

  const { data: personalRows, error: personalError } = await admin
    .from("signing_placement_templates")
    .select(TEMPLATE_SELECT)
    .eq("scope_type", "PERSONAL")
    .eq("owner_user_id", subjectUserId)
    .eq("status", "ACTIVE");
  if (personalError) throw new Error(personalError.message);

  let organizationRows: PlacementTemplateRow[] = [];
  if (memberOrgIds.length > 0) {
    const { data, error } = await admin
      .from("signing_placement_templates")
      .select(TEMPLATE_SELECT)
      .eq("scope_type", "ORGANIZATION")
      .in("organization_id", memberOrgIds)
      .eq("status", "ACTIVE");
    if (error) throw new Error(error.message);
    organizationRows = (data ?? []) as PlacementTemplateRow[];
  }

  const personalTemplates = (personalRows ?? []) as PlacementTemplateRow[];
  const counts = await countTemplateFields(admin, [
    ...personalTemplates.map((row) => row.id),
    ...organizationRows.map((row) => row.id),
  ]);
  const names = await loadOrganizationNames(admin, memberOrgIds);

  let personalOwnerDisplayName: string | null =
    subjectUserId === actor.userId
      ? [actor.profile.first_name, actor.profile.last_name]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(" ") ||
        actor.profile.display_name?.trim() ||
        actor.profile.first_name?.trim() ||
        null
      : null;
  if (subjectUserId !== actor.userId) {
    const { data: ownerProfile, error: ownerError } = await admin
      .from("profiles")
      .select("first_name, last_name, display_name")
      .eq("id", subjectUserId)
      .maybeSingle();
    if (ownerError) throw new Error(ownerError.message);
    personalOwnerDisplayName =
      [ownerProfile?.first_name, ownerProfile?.last_name]
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter(Boolean)
        .join(" ") ||
      (typeof ownerProfile?.display_name === "string"
        ? ownerProfile.display_name.trim()
        : null) ||
      null;
  }

  const personal = personalTemplates.find((row) => row.form_id === form.id) ?? null;
  const personalCopySources = await loadCopySources(admin, {
    form,
    templates: personalTemplates,
    counts,
    session,
  });

  const organizations: FormPlacementOrganization[] = [];
  for (const organizationId of memberOrgIds) {
    const orgTemplates = organizationRows.filter(
      (row) => row.organization_id === organizationId,
    );
    const isOrgAdmin = adminOrgIds.includes(organizationId);
    const current = orgTemplates.find((row) => row.form_id === form.id) ?? null;
    organizations.push({
      organizationId,
      name: names.get(organizationId) ?? "Organization",
      isOrgAdmin,
      formUsable: canUseFormForOrganizationTemplate(organizationId, form),
      template: current ? summarize(current, counts) : null,
      copySources: isOrgAdmin
        ? await loadCopySources(admin, { form, templates: orgTemplates, counts, session })
        : [],
    });
  }

  const ownerFirstName =
    personalOwnerDisplayName?.split(/\s+/)[0] ??
    (subjectUserId === actor.userId ? actor.profile.first_name ?? null : null);

  return {
    form: {
      id: form.id,
      display: formVersionDisplay(form),
      name: form.form_name?.trim() || "Form",
      code: form.form_code,
      versionLabel: form.version_label,
      status: form.status,
      publicationState: form.publication_state,
      scope: form.scope,
      ownerUserId: form.owner_user_id,
    },
    eligibility: formVersionPlacementEligibility(form),
    personalOwnerDisplayName,
    ownerFirstName,
    managingPersonalOnBehalf: managingOnBehalf,
    personalCardTitle: personalTemplateCardTitle({
      ownerDisplayName: personalOwnerDisplayName,
      managingOnBehalf: managingOnBehalf,
    }),
    personal: personal ? summarize(personal, counts) : null,
    personalCopySources,
    organizations,
    copyWarning: COPY_FROM_VERSION_WARNING,
  };
}

// ---------------------------------------------------------------------------
// Create / delete
// ---------------------------------------------------------------------------

function parseScope(value: unknown): PlacementTemplateScope {
  if (value === "PERSONAL" || value === "ORGANIZATION") return value;
  throw new SigningError("INVALID_INPUT", "Choose Personal or Organization.");
}

/**
 * Authorize creating a template of `scope` for `form`.
 * Personal ownership is the subject user (Form owner when a Global Admin
 * manages a private Form on their behalf); created_by / updated_by stay the actor.
 */
function authorizeTemplateScope(
  actor: SigningActor,
  form: PlacementFormRow,
  scope: PlacementTemplateScope,
  organizationIdRaw: unknown,
): { ownerUserId: string | null; organizationId: string | null } {
  if (scope === "PERSONAL") {
    assertFormUsableForPersonal(actor, form);
    return {
      ownerUserId: personalTemplateSubjectUserId(personalActorContext(actor), form),
      organizationId: null,
    };
  }
  if (!isUuid(organizationIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Choose an organization.");
  }
  if (!orgAdminOrganizationIds(actor).includes(organizationIdRaw)) {
    throw new SigningError(
      "FORBIDDEN",
      "Only an organization admin can create Organization placement templates.",
    );
  }
  if (!canUseFormForOrganizationTemplate(organizationIdRaw, form)) {
    throw new SigningError(
      "CONFLICT",
      "Organization placement templates need a form every member of the organization can use.",
    );
  }
  return { ownerUserId: null, organizationId: organizationIdRaw };
}

export async function createPlacementTemplateWithActor(
  actor: SigningActor,
  input: { formId: unknown; scope: unknown; organizationId?: unknown },
  admin: SupabaseClient,
  session: PlacementSessionOptions = {},
): Promise<{ templateId: string }> {
  const scope = parseScope(input.scope);
  const form = await loadVisibleForm(input.formId, session);
  const owner = authorizeTemplateScope(actor, form, scope, input.organizationId);
  assertFormEligible(form);

  const { data, error } = await admin
    .from("signing_placement_templates")
    .insert({
      form_id: form.id,
      scope_type: scope,
      owner_user_id: owner.ownerUserId,
      organization_id: owner.organizationId,
      status: "ACTIVE",
      created_by_user_id: actor.userId,
      updated_by_user_id: actor.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const personalConflict =
        owner.ownerUserId === actor.userId
          ? "You already have a Personal placement template for this form version."
          : "This person already has a Personal placement template for this form version.";
      throw new SigningError(
        "CONFLICT",
        scope === "PERSONAL"
          ? personalConflict
          : "This organization already has a placement template for this form version.",
      );
    }
    throw new Error(error.message);
  }
  return { templateId: data.id as string };
}

export async function deletePlacementTemplateWithActor(
  actor: SigningActor,
  input: { templateId: unknown },
  admin: SupabaseClient,
): Promise<{ deleted: true }> {
  const template = await requirePlacementTemplate(actor, input.templateId, admin, "edit");
  const { error } = await admin
    .from("signing_placement_templates")
    .update({
      status: "DELETED",
      deleted_at: new Date().toISOString(),
      updated_by_user_id: actor.userId,
    })
    .eq("id", template.id)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export type PlacementTemplateEditorModel = {
  model: SigningPreviewModel;
  canEdit: boolean;
  scope: PlacementTemplateScope;
  formId: number;
  formDisplay: string;
};

function slotParticipant(slot: PlacementSlot): SigningPreviewParticipant {
  return {
    id: slotKey(slot),
    fullName: slotLabel(slot),
    roleCode: slot.roleCode,
    optionalRole: null,
    capacityMode: "PERSONAL",
    representedPartyName: null,
    capacityWording: null,
  };
}

function editorField(field: PlacementTemplateFieldRecord): SigningPreviewField {
  return {
    id: field.id,
    fieldType: field.fieldType,
    isRequired: field.isRequired,
    pageNumber: field.pageNumber,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    participantId: field.slot ? slotKey(field.slot) : "",
    participantFullName: field.slot ? slotLabel(field.slot) : "",
    capacityMode: "PERSONAL",
    representedPartyName: null,
    capacityLabel: null,
    capacityWording: null,
    linkedSignatureFieldId: field.linkedTemplateFieldId,
  };
}

const MAPPED_REGION_SELECT =
  "status, field_id, mapping_name, occurrence_index, page_number, x, y, width, height, page_width, page_height, field_widget_type, fields(field_key, field_label, field_widget_type, status)";

/**
 * The exact form version's mapped regions, as editor context only. Called
 * after the template read is authorized; never another version's mappings.
 */
async function loadMappedRegions(
  admin: SupabaseClient,
  formId: number,
): Promise<PlacementMappedRegion[]> {
  const { data, error } = await admin
    .from("form_field_mappings")
    .select(MAPPED_REGION_SELECT)
    .eq("form_id", formId)
    .eq("status", "ACTIVE")
    .not("field_id", "is", null)
    .order("page_number", { ascending: true })
    .order("y", { ascending: true })
    .order("x", { ascending: true });
  if (error) throw new Error(error.message);
  return mappedRegionsFromMappings(
    (data ?? []).map((row) => ({
      ...row,
      fields: Array.isArray(row.fields) ? (row.fields[0] ?? null) : row.fields,
    })) as MappedRegionSourceRow[],
  );
}

export async function loadPlacementTemplateEditorWithActor(
  actor: SigningActor,
  input: { templateId: unknown },
  admin: SupabaseClient,
): Promise<PlacementTemplateEditorModel> {
  const template = await requirePlacementTemplate(actor, input.templateId, admin, "read");
  const { data: form, error: formError } = await admin
    .from("forms")
    .select(FORM_SELECT)
    .eq("id", template.form_id)
    .maybeSingle();
  if (formError) throw new Error(formError.message);
  if (!form) throw new SigningError("NOT_FOUND", "Form not found.");
  const fields = await loadTemplateFields(admin, template.id);
  const mappedRegions = await loadMappedRegions(admin, template.form_id);
  const used = fields.flatMap((field) => (field.slot ? [field.slot] : []));
  const display = formVersionDisplay(form as PlacementFormRow);
  return {
    model: {
      signingId: template.id,
      title: display,
      documents: [
        {
          id: template.id,
          displayName: display,
          displayOrder: 0,
          pageCount: null,
          hasSelectedSnapshot: true,
          fields: fields.map(editorField),
          mappedRegions,
        },
      ],
      participants: templateSlotOptions(used).map(slotParticipant),
    },
    canEdit: canEditPlacementTemplate(actor, template, {
      form: form as PlacementFormRow,
    }),
    scope: template.scope_type,
    formId: template.form_id,
    formDisplay: display,
  };
}

function parseNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SigningError("INVALID_INPUT", `Invalid ${label}.`);
  }
  return value;
}

export async function upsertPlacementTemplateFieldWithActor(
  actor: SigningActor,
  input: {
    templateId: unknown;
    fieldId?: unknown;
    slotKey?: unknown;
    fieldType: unknown;
    isRequired?: unknown;
    pageNumber: unknown;
    x: unknown;
    y: unknown;
    width: unknown;
    height: unknown;
    linkedTemplateFieldId?: unknown;
    dateLinkMode?: unknown;
  },
  admin: SupabaseClient,
): Promise<{ id: string }> {
  const template = await requirePlacementTemplate(actor, input.templateId, admin, "edit");

  if (!isPlacementTemplateFieldType(input.fieldType)) {
    throw new SigningError("INVALID_INPUT", "Invalid placement type.");
  }
  const fieldType = input.fieldType;
  let slot: PlacementSlot | null = null;
  if (fieldType !== "CHECKMARK") {
    slot = parseSlotKey(input.slotKey);
    if (!slot) {
      throw new SigningError("INVALID_INPUT", "Choose a signer slot for this placement.");
    }
  }

  const pageNumber = parseNumber(input.pageNumber, "page number");
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new SigningError("INVALID_INPUT", "Invalid page number.");
  }
  const x = parseNumber(input.x, "x");
  const y = parseNumber(input.y, "y");
  const width = parseNumber(input.width, "width");
  const height = parseNumber(input.height, "height");
  if (width <= 0 || height <= 0) {
    throw new SigningError("INVALID_INPUT", "Placement size must be positive.");
  }
  if (
    input.dateLinkMode !== undefined &&
    input.dateLinkMode !== "AUTO_NEAREST" &&
    input.dateLinkMode !== "EXPLICIT_SOURCE"
  ) {
    throw new SigningError("INVALID_INPUT", "Invalid Date Signed link mode.");
  }

  const prepared = fieldType === "PRINTED_NAME" || fieldType === "CHECKMARK";
  const isRequired = prepared
    ? false
    : input.isRequired === undefined
      ? true
      : Boolean(input.isRequired);

  let linkedTemplateFieldId: string | null = null;
  if (fieldType === "DATE_SIGNED") {
    if (!isUuid(input.linkedTemplateFieldId)) {
      throw new SigningError(
        "INVALID_INPUT",
        "Date Signed must be linked to a Signature or Initials placement.",
      );
    }
    const { data: source, error: sourceError } = await admin
      .from("signing_placement_template_fields")
      .select("id, field_type, slot_role_code, slot_ordinal, page_number")
      .eq("template_id", template.id)
      .eq("id", input.linkedTemplateFieldId)
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    if (!source || !DATE_SIGNED_SOURCE_TYPES.includes(source.field_type as string)) {
      throw new SigningError(
        "INVALID_INPUT",
        "Date Signed must be linked to a Signature or Initials placement.",
      );
    }
    const sourceSlot = slotFromColumns(source.slot_role_code, source.slot_ordinal);
    if (!sourceSlot || !slot || slotKey(sourceSlot) !== slotKey(slot)) {
      throw new SigningError(
        "INVALID_INPUT",
        "Date Signed must link to a Signature or Initials for the same signer slot.",
      );
    }
    if (input.dateLinkMode === "AUTO_NEAREST" && source.page_number !== pageNumber) {
      throw new SigningError(
        "INVALID_INPUT",
        "An automatically linked Date Signed must be on the same page as its Signature or Initials.",
      );
    }
    linkedTemplateFieldId = source.id as string;
  }

  const payload = {
    template_id: template.id,
    field_type: fieldType,
    slot_role_code: slot?.roleCode ?? null,
    slot_ordinal: slot?.ordinal ?? null,
    is_required: isRequired,
    page_number: pageNumber,
    x,
    y,
    width,
    height,
    linked_template_field_id: linkedTemplateFieldId,
  };

  if (input.fieldId !== undefined && input.fieldId !== null) {
    if (!isUuid(input.fieldId)) {
      throw new SigningError("INVALID_INPUT", "Invalid placement.");
    }
    const { data: current, error: currentError } = await admin
      .from("signing_placement_template_fields")
      .select("id, field_type")
      .eq("template_id", template.id)
      .eq("id", input.fieldId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) throw new SigningError("NOT_FOUND", "Placement not found.");
    if (current.field_type !== fieldType) {
      throw new SigningError(
        "INVALID_INPUT",
        "Remove this placement and place a new one to change its type.",
      );
    }
    const { data, error } = await admin
      .from("signing_placement_template_fields")
      .update(payload)
      .eq("template_id", template.id)
      .eq("id", input.fieldId)
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update placement.");
    }
    await touchTemplate(admin, template.id, actor.userId);
    return { id: data.id as string };
  }

  const { data, error } = await admin
    .from("signing_placement_template_fields")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create placement.");
  }
  await touchTemplate(admin, template.id, actor.userId);
  return { id: data.id as string };
}

async function touchTemplate(admin: SupabaseClient, templateId: string, userId: string) {
  const { error } = await admin
    .from("signing_placement_templates")
    .update({ updated_by_user_id: userId })
    .eq("id", templateId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);
}

/** Removing a Signature or Initials also removes its Dates (database cascade). */
export async function removePlacementTemplateFieldWithActor(
  actor: SigningActor,
  input: { templateId: unknown; fieldId: unknown },
  admin: SupabaseClient,
): Promise<{ removedFieldIds: string[] }> {
  const template = await requirePlacementTemplate(actor, input.templateId, admin, "edit");
  if (!isUuid(input.fieldId)) {
    throw new SigningError("INVALID_INPUT", "Invalid placement.");
  }
  const { data: linked, error: linkedError } = await admin
    .from("signing_placement_template_fields")
    .select("id")
    .eq("template_id", template.id)
    .eq("linked_template_field_id", input.fieldId);
  if (linkedError) throw new Error(linkedError.message);
  const { data: removed, error } = await admin
    .from("signing_placement_template_fields")
    .delete()
    .eq("template_id", template.id)
    .eq("id", input.fieldId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!removed || removed.length === 0) return { removedFieldIds: [] };
  await touchTemplate(admin, template.id, actor.userId);
  return {
    removedFieldIds: [
      input.fieldId,
      ...(linked ?? []).map((row) => row.id as string),
    ],
  };
}

// ---------------------------------------------------------------------------
// Copy from another Form version
// ---------------------------------------------------------------------------

export type PlacementTemplateCopyResult = {
  templateId: string;
  copied: number;
  skipped: number;
  skippedPages: number[];
  warning: string;
};

export async function copyPlacementTemplateWithActor(
  actor: SigningActor,
  input: { sourceTemplateId: unknown; targetFormId: unknown },
  admin: SupabaseClient,
  session: PlacementSessionOptions = {},
): Promise<PlacementTemplateCopyResult> {
  const source = await requirePlacementTemplate(actor, input.sourceTemplateId, admin, "edit");
  const target = await loadVisibleForm(input.targetFormId, session);
  if (target.id === source.form_id) {
    throw new SigningError("CONFLICT", "Choose a template from a different form version.");
  }
  authorizeTemplateScope(actor, target, source.scope_type, source.organization_id);
  assertFormEligible(target);

  const pages = await loadFormPdfPageCount(admin, target);
  if (!pages.ok) {
    throw new SigningError("CONFLICT", "This form version's PDF could not be read.");
  }

  const { data, error } = await admin.rpc("signing_copy_placement_template", {
    p_source_template_id: source.id,
    p_target_form_id: target.id,
    p_target_page_count: pages.pageCount,
    p_actor_user_id: actor.userId,
  });
  if (error) {
    if (error.message.includes("PLACEMENT_TEMPLATE_ALREADY_EXISTS")) {
      throw new SigningError(
        "CONFLICT",
        "A placement template already exists for this form version in that scope.",
      );
    }
    if (error.message.includes("PLACEMENT_TEMPLATE_NOT_AVAILABLE")) {
      throw new SigningError("NOT_FOUND", "Placement template not found.");
    }
    throw new Error(error.message);
  }
  const result = data as {
    template_id: string;
    copied: number;
    skipped: number;
    skipped_pages: number[] | null;
  };
  return {
    templateId: result.template_id,
    copied: result.copied,
    skipped: result.skipped,
    skippedPages: result.skipped_pages ?? [],
    warning: COPY_FROM_VERSION_WARNING,
  };
}

// ---------------------------------------------------------------------------
// Blank form PDF for the editor
// ---------------------------------------------------------------------------

export async function loadPlacementTemplatePdfWithActor(
  actor: SigningActor,
  input: { formId: unknown; templateId: unknown },
  admin: SupabaseClient,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const formId = parseFormId(input.formId);
  const template = await requirePlacementTemplate(actor, input.templateId, admin, "read");
  if (template.form_id !== formId) {
    throw new SigningError("NOT_FOUND", "Placement template not found.");
  }
  const { data: form, error } = await admin
    .from("forms")
    .select(FORM_SELECT)
    .eq("id", formId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const path = (form?.source_storage_path as string | null | undefined)?.trim();
  if (!form || !path) throw new SigningError("NOT_FOUND", "Form PDF not found.");

  const resolved = await resolveFormStoragePath(admin, {
    formId,
    path,
    formCode: form.form_code as string | null,
    scope: (form.scope as FormLibraryScope | null) ?? "GLOBAL",
    ownerUserId: form.owner_user_id as string | null,
  });
  const { data: blob, error: downloadError } = await admin.storage
    .from(FORM_TEMPLATES_BUCKET)
    .download(resolved.resolvedPath);
  if (downloadError || !blob) throw new SigningError("NOT_FOUND", "Form PDF not found.");
  const code = (form.form_code as string | null)?.trim() || `form-${formId}`;
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    filename: `${code}.pdf`,
  };
}
