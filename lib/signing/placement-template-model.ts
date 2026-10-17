/**
 * Signing Placement Templates: pure rules shared by the server modules, the
 * editor, and tests. A slot is a participant role plus an ordinal ("Buyer 2");
 * it never names a Contact, User, participant, or email.
 */
import {
  SIGNING_PARTICIPANT_ROLE_CODES,
  isSigningParticipantRoleCode,
  signingParticipantRoleLabel,
  type SigningParticipantRoleCode,
} from "@/lib/signing/participant-roles";
import { catalogTypesToLegacyFieldType } from "@/lib/types/field";
import { formatMappingOverlayLabel } from "@/lib/types/pdf-field-mapping-editor";
import {
  getEffectivePdfFieldDimensions,
  isCheckboxPdfField,
  type PlacedPdfField,
} from "@/lib/types/template-pdf-field";

/**
 * A Form field mapping shown as read-only context in the placement template
 * editor: page, geometry (Map Fields' top-left page coordinates) and a label.
 * It carries no ids, field keys, resolver sources, defaults, or values.
 */
export type PlacementMappedRegion = {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number | null;
  pageHeight: number | null;
  label: string;
  kind: "TEXT" | "CHECKBOX";
};

/** The `form_field_mappings` columns the editor overlay reads. */
export type MappedRegionSourceRow = {
  status: string;
  field_id: string | null;
  mapping_name: string | null;
  occurrence_index: number | null;
  page_number: number;
  x: number | string;
  y: number | string;
  width: number | string | null;
  height: number | string | null;
  page_width: number | string | null;
  page_height: number | string | null;
  field_widget_type: string | null;
  fields: {
    field_key: string | null;
    field_label: string | null;
    field_widget_type: string | null;
    status: string;
  } | null;
};

function finiteOrNull(value: number | string | null): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Mapped Form regions for one exact form version: ACTIVE mappings connected
 * to an ACTIVE catalog field with a page and position. Size and label follow
 * Map Fields (checkboxes use the fixed checkbox size; label is mapping name,
 * then field label, then field key).
 */
export function mappedRegionsFromMappings(
  rows: readonly MappedRegionSourceRow[],
): PlacementMappedRegion[] {
  const regions: PlacementMappedRegion[] = [];
  for (const row of rows) {
    if (row.status !== "ACTIVE" || !row.field_id || row.fields?.status !== "ACTIVE") continue;
    const x = finiteOrNull(row.x);
    const y = finiteOrNull(row.y);
    if (!Number.isInteger(row.page_number) || row.page_number < 1 || x == null || y == null) {
      continue;
    }
    const widgetType = row.field_widget_type ?? row.fields.field_widget_type ?? "text";
    const shape = {
      field_type: catalogTypesToLegacyFieldType(widgetType),
      field_widget_type: widgetType,
      width: finiteOrNull(row.width),
      height: finiteOrNull(row.height),
    };
    const size = getEffectivePdfFieldDimensions(shape);
    const label = formatMappingOverlayLabel({
      mapping_name: row.mapping_name,
      field_label: row.fields.field_label,
      field_key: row.fields.field_key ?? "",
      occurrence_index: row.occurrence_index,
    } as PlacedPdfField);
    regions.push({
      pageNumber: row.page_number,
      x,
      y,
      width: size.width,
      height: size.height,
      pageWidth: finiteOrNull(row.page_width),
      pageHeight: finiteOrNull(row.page_height),
      label: label === "Field" ? "Mapped field" : label,
      kind: isCheckboxPdfField(shape) ? "CHECKBOX" : "TEXT",
    });
  }
  return regions;
}

export const PLACEMENT_TEMPLATE_FIELD_TYPES = [
  "SIGNATURE",
  "INITIALS",
  "DATE_SIGNED",
  "PRINTED_NAME",
  "CHECKMARK",
] as const;

export type PlacementTemplateFieldType =
  (typeof PLACEMENT_TEMPLATE_FIELD_TYPES)[number];

export type PlacementTemplateScope = "PERSONAL" | "ORGANIZATION";

/** Highest ordinal a slot may use (matches the database constraint). */
export const PLACEMENT_SLOT_MAX_ORDINAL = 20;

/** Ordinals offered per role in the editor before any are used. */
export const PLACEMENT_SLOT_DEFAULT_ORDINALS = 3;

export type PlacementSlot = {
  roleCode: SigningParticipantRoleCode;
  ordinal: number;
};

export type PlacementTemplateFieldRecord = {
  id: string;
  fieldType: PlacementTemplateFieldType;
  slot: PlacementSlot | null;
  isRequired: boolean;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  linkedTemplateFieldId: string | null;
};

export function isPlacementTemplateFieldType(
  value: unknown,
): value is PlacementTemplateFieldType {
  return (
    typeof value === "string" &&
    (PLACEMENT_TEMPLATE_FIELD_TYPES as readonly string[]).includes(value)
  );
}

export function placementFieldHasSlot(type: PlacementTemplateFieldType): boolean {
  return type !== "CHECKMARK";
}

export function slotKey(slot: PlacementSlot): string {
  return `${slot.roleCode}:${slot.ordinal}`;
}

/** Parses "BUYER:2"; anything else is not a slot. */
export function parseSlotKey(value: unknown): PlacementSlot | null {
  if (typeof value !== "string") return null;
  const match = /^([A-Z]+):(\d{1,2})$/.exec(value);
  if (!match) return null;
  const roleCode = match[1];
  const ordinal = Number(match[2]);
  if (!isSigningParticipantRoleCode(roleCode)) return null;
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > PLACEMENT_SLOT_MAX_ORDINAL) {
    return null;
  }
  return { roleCode, ordinal };
}

export function slotFromColumns(
  roleCode: unknown,
  ordinal: unknown,
): PlacementSlot | null {
  if (roleCode == null && ordinal == null) return null;
  return parseSlotKey(`${String(roleCode)}:${String(ordinal)}`);
}

export function slotLabel(slot: PlacementSlot): string {
  return `${signingParticipantRoleLabel(slot.roleCode)} ${slot.ordinal}`;
}

function compareSlots(a: PlacementSlot, b: PlacementSlot): number {
  const roleOrder =
    SIGNING_PARTICIPANT_ROLE_CODES.indexOf(a.roleCode) -
    SIGNING_PARTICIPANT_ROLE_CODES.indexOf(b.roleCode);
  return roleOrder !== 0 ? roleOrder : a.ordinal - b.ordinal;
}

/** Editor slot choices: each role's first ordinals plus every slot in use. */
export function templateSlotOptions(
  usedSlots: readonly PlacementSlot[],
  defaultOrdinals = PLACEMENT_SLOT_DEFAULT_ORDINALS,
): PlacementSlot[] {
  const byKey = new Map<string, PlacementSlot>();
  for (const roleCode of SIGNING_PARTICIPANT_ROLE_CODES) {
    for (let ordinal = 1; ordinal <= defaultOrdinals; ordinal += 1) {
      byKey.set(slotKey({ roleCode, ordinal }), { roleCode, ordinal });
    }
  }
  for (const slot of usedSlots) byKey.set(slotKey(slot), slot);
  return [...byKey.values()].sort(compareSlots);
}

export type SlotRankableParticipant = {
  id: string;
  roleCode: string | null;
  displayOrder: number;
  createDate: string;
  participantStatus: string;
};

function compareUuidText(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Slot -> participant id using role_code plus the stable participant order the
 * manager sees (display order, then creation, then id). Removed participants
 * and participants without a role never fill a slot. Must stay identical to
 * the ordering in signing_apply_placement_template().
 */
export function mapParticipantsToSlots(
  participants: readonly SlotRankableParticipant[],
): Map<string, string> {
  const eligible = participants
    .filter(
      (row) =>
        row.participantStatus !== "REMOVED" &&
        isSigningParticipantRoleCode(row.roleCode),
    )
    .sort(
      (a, b) =>
        a.displayOrder - b.displayOrder ||
        Date.parse(a.createDate) - Date.parse(b.createDate) ||
        compareUuidText(a.id, b.id),
    );
  const nextOrdinal = new Map<string, number>();
  const slots = new Map<string, string>();
  for (const row of eligible) {
    const roleCode = row.roleCode as SigningParticipantRoleCode;
    const ordinal = (nextOrdinal.get(roleCode) ?? 0) + 1;
    nextOrdinal.set(roleCode, ordinal);
    slots.set(slotKey({ roleCode, ordinal }), row.id);
  }
  return slots;
}

export type PlacementApplicationSlotRow = {
  slot: PlacementSlot;
  label: string;
  participantId: string | null;
  placementCount: number;
};

export type PlacementApplicationPlan = {
  slots: PlacementApplicationSlotRow[];
  checkmarkCount: number;
  applicableCount: number;
  skippedCount: number;
};

/** What applying would create: Checkmarks always, slot placements when the slot resolves. */
export function planTemplateApplication(
  fields: readonly Pick<PlacementTemplateFieldRecord, "fieldType" | "slot">[],
  slotParticipants: ReadonlyMap<string, string>,
): PlacementApplicationPlan {
  const rows = new Map<string, PlacementApplicationSlotRow>();
  let checkmarkCount = 0;
  for (const field of fields) {
    if (!field.slot) {
      if (field.fieldType === "CHECKMARK") checkmarkCount += 1;
      continue;
    }
    const key = slotKey(field.slot);
    const row = rows.get(key) ?? {
      slot: field.slot,
      label: slotLabel(field.slot),
      participantId: slotParticipants.get(key) ?? null,
      placementCount: 0,
    };
    row.placementCount += 1;
    rows.set(key, row);
  }
  const slots = [...rows.values()].sort((a, b) => compareSlots(a.slot, b.slot));
  const skippedCount = slots
    .filter((row) => row.participantId === null)
    .reduce((sum, row) => sum + row.placementCount, 0);
  const slotted = slots.reduce((sum, row) => sum + row.placementCount, 0);
  return {
    slots,
    checkmarkCount,
    applicableCount: checkmarkCount + slotted - skippedCount,
    skippedCount,
  };
}

export type PlacementTemplateApplyPreview =
  | { available: false; reason: "NO_FORM" | "NO_TEMPLATE" }
  | {
      available: true;
      templateId: string;
      scope: PlacementTemplateScope;
      sourceLabel: string;
      placementCount: number;
      placementCountLabel: string;
      slots: {
        slotKey: string;
        label: string;
        participantName: string | null;
        placementCount: number;
        notice: string | null;
      }[];
      applicableCount: number;
      skippedCount: number;
      existingPlacementCount: number;
    };

export type PlacementTemplateApplyResult = {
  created: number;
  skipped: number;
  replayed: boolean;
};

export function unresolvedSlotNotice(row: PlacementApplicationSlotRow): string {
  const count = row.placementCount;
  return `${row.label} has no matching participant. ${count} placement${count === 1 ? "" : "s"} will not be added.`;
}

export function placementCountLabel(count: number): string {
  return `${count} placement${count === 1 ? "" : "s"}`;
}

export function templateSourceLabel(input: {
  scope: PlacementTemplateScope;
  ownerFirstName?: string | null;
  organizationName?: string | null;
}): string {
  if (input.scope === "PERSONAL") {
    const name = input.ownerFirstName?.trim();
    return name ? `${name} Personal` : "Your Personal";
  }
  const org = input.organizationName?.trim();
  return org ? `${org} Organization` : "Organization";
}

/** A Personal template fully wins; the Organization template is never merged. */
export function pickEffectiveTemplate<T>(candidates: {
  personal: T | null;
  organization: T | null;
}): { scope: PlacementTemplateScope; template: T } | null {
  if (candidates.personal) return { scope: "PERSONAL", template: candidates.personal };
  if (candidates.organization) {
    return { scope: "ORGANIZATION", template: candidates.organization };
  }
  return null;
}

export type PlacementTemplateFormRef = {
  id: number;
  scope: string | null;
  owner_user_id: string | null;
  organization_id: string | null;
  status: string | null;
  publication_state: string | null;
};

/**
 * Only an immutable source PDF can carry placements: a published version, or
 * a retired one. An active Draft form can still have its PDF replaced.
 */
export function formVersionPlacementEligibility(
  form: Pick<PlacementTemplateFormRef, "status" | "publication_state">,
): { ok: true } | { ok: false; reason: string } {
  if (form.status === "DELETED") {
    return { ok: false, reason: "This form version has been deleted." };
  }
  if (form.status === "ACTIVE" && form.publication_state !== "PUBLISHED") {
    return {
      ok: false,
      reason: "Publish this form version before adding Signing placements.",
    };
  }
  if (form.status !== "ACTIVE" && form.status !== "INACTIVE") {
    return { ok: false, reason: "This form version is not available." };
  }
  return { ok: true };
}

/** Active application (Global) Admin — never grants Organization template authority alone. */
export function isActivePlacementAppAdmin(profile: {
  status?: string | null;
  app_role?: string | null;
  onboarding_status?: string | null;
} | null | undefined): boolean {
  return (
    profile?.status === "ACTIVE" &&
    profile?.app_role === "ADMIN" &&
    profile?.onboarding_status === "ACTIVE"
  );
}

/**
 * Forms a user may attach a Personal template to.
 * An active Global Admin may also open a privately owned Form to manage that
 * owner's Personal template (not a Global template, and not ownership transfer).
 */
export function canUseFormForPersonalTemplate(
  actor: {
    userId: string;
    memberOrganizationIds: readonly string[];
    isActiveAppAdmin?: boolean;
  },
  form: PlacementTemplateFormRef,
): boolean {
  if (form.scope === "GLOBAL") return true;
  if (form.scope === "PRIVATE") {
    if (form.owner_user_id === actor.userId) return true;
    return Boolean(actor.isActiveAppAdmin && form.owner_user_id);
  }
  if (form.scope === "ORGANIZATION") {
    return (
      form.organization_id != null &&
      actor.memberOrganizationIds.includes(form.organization_id)
    );
  }
  return false;
}

/**
 * Whose Personal template the page manages for this form.
 * Private forms under Global Admin management stay owned by the form owner.
 * Global / own forms stay the signed-in user.
 */
export function personalTemplateSubjectUserId(
  actor: { userId: string; isActiveAppAdmin?: boolean },
  form: PlacementTemplateFormRef,
): string {
  if (
    form.scope === "PRIVATE" &&
    form.owner_user_id &&
    actor.isActiveAppAdmin &&
    form.owner_user_id !== actor.userId
  ) {
    return form.owner_user_id;
  }
  return actor.userId;
}

/** True when the actor is managing another user's Personal template on their behalf. */
export function isAdminManagingOwnerPersonalTemplate(
  actor: { userId: string; isActiveAppAdmin?: boolean },
  form: PlacementTemplateFormRef,
): boolean {
  return (
    personalTemplateSubjectUserId(actor, form) !== actor.userId &&
    Boolean(actor.isActiveAppAdmin)
  );
}

/** Card / summary label for a Personal template (never says "Global"). */
export function personalTemplateCardTitle(input: {
  ownerDisplayName: string | null;
  managingOnBehalf: boolean;
}): string {
  const name = input.ownerDisplayName?.trim();
  if (input.managingOnBehalf && name) {
    return `Personal placement template for ${name}`;
  }
  if (name) return `${name} · Personal`;
  return "Personal";
}

/** Forms an organization's members can all see, so an Organization template is usable. */
export function canUseFormForOrganizationTemplate(
  organizationId: string,
  form: PlacementTemplateFormRef,
): boolean {
  if (form.scope === "GLOBAL") return true;
  return form.scope === "ORGANIZATION" && form.organization_id === organizationId;
}

export function formVersionDisplay(form: {
  id: number;
  form_name?: string | null;
  form_code?: string | null;
  version_label?: string | null;
}): string {
  const parts = [
    form.form_name?.trim() || "Form",
    form.form_code?.trim() || null,
    form.version_label?.trim() ? `Version ${form.version_label.trim()}` : null,
    `Form #${form.id}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export const COPY_FROM_VERSION_WARNING =
  "Placement locations may have changed in this form version. Review all placements before using this template.";

/** Mirrors signing_copy_placement_template(): pages beyond the target are skipped, with their Dates. */
export function planTemplateCopy(
  fields: readonly Pick<
    PlacementTemplateFieldRecord,
    "id" | "fieldType" | "pageNumber" | "linkedTemplateFieldId"
  >[],
  targetPageCount: number,
): { copiedIds: string[]; skippedIds: string[]; skippedPages: number[] } {
  const copied = new Set<string>();
  const copiedIds: string[] = [];
  const skippedIds: string[] = [];
  const skippedPages = new Set<number>();
  const ordered = [...fields].sort(
    (a, b) =>
      Number(a.fieldType === "DATE_SIGNED") - Number(b.fieldType === "DATE_SIGNED"),
  );
  for (const field of ordered) {
    if (field.pageNumber > targetPageCount) {
      skippedIds.push(field.id);
      skippedPages.add(field.pageNumber);
      continue;
    }
    if (
      field.fieldType === "DATE_SIGNED" &&
      (!field.linkedTemplateFieldId || !copied.has(field.linkedTemplateFieldId))
    ) {
      skippedIds.push(field.id);
      continue;
    }
    copied.add(field.id);
    copiedIds.push(field.id);
  }
  return {
    copiedIds,
    skippedIds,
    skippedPages: [...skippedPages].sort((a, b) => a - b),
  };
}
