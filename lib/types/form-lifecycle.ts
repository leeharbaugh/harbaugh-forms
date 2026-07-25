/**
 * Form library lifecycle: record status × publication state.
 *
 * Record status: ACTIVE (current) | INACTIVE (retired) | DELETED (soft-delete)
 * Publication: DRAFT | PUBLISHED
 * Packet-form availability is separate (see packet-form-availability).
 */

export type FormPublicationState = "DRAFT" | "PUBLISHED";

export type FormLifecycleStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type FormStateEventType =
  | "FORM_CREATED"
  | "FORM_PUBLISHED"
  | "FORM_UNPUBLISHED"
  | "FORM_RETIRED"
  | "FORM_RESTORED"
  | "FORM_DELETED";

export type FormLifecycleSnapshot = {
  status: string | null | undefined;
  publication_state: string | null | undefined;
};

export type PacketFormAvailabilityState = "AVAILABLE" | "PENDING_PUBLICATION";

export const FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE =
  "This form is published. Unpublish it before changing its structure.";

export const FORM_RETIRED_READONLY_MESSAGE =
  "Retired form versions are read-only.";

export const PENDING_PUBLICATION_MESSAGE =
  "Waiting for this form template to be published.";

export function normalizeFormFamilyKey(
  formCode: string | null | undefined,
  fallbackId?: number | null,
): string {
  const trimmed = (formCode ?? "").trim().toUpperCase();
  if (trimmed) {
    return trimmed.slice(0, 100);
  }
  if (fallbackId != null) {
    return `FORM-${fallbackId}`;
  }
  return "FORM";
}

export function isFormPublished(form: FormLifecycleSnapshot): boolean {
  return form.status === "ACTIVE" && form.publication_state === "PUBLISHED";
}

export function isFormDraft(form: FormLifecycleSnapshot): boolean {
  return form.status === "ACTIVE" && form.publication_state === "DRAFT";
}

export function isFormRetired(form: FormLifecycleSnapshot): boolean {
  return form.status === "INACTIVE";
}

export function isFormSelectableForCollection(
  form: FormLifecycleSnapshot,
): boolean {
  return isFormPublished(form);
}

export function isFormSelectableForNewPacket(
  form: FormLifecycleSnapshot,
): boolean {
  return isFormPublished(form);
}

export function canStructurallyEditForm(form: FormLifecycleSnapshot): boolean {
  return isFormDraft(form);
}

export function structuralEditBlockedMessage(
  form: FormLifecycleSnapshot,
): string | null {
  if (isFormRetired(form)) {
    return FORM_RETIRED_READONLY_MESSAGE;
  }
  if (isFormPublished(form)) {
    return FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE;
  }
  if (form.status === "DELETED") {
    return "This form has been deleted.";
  }
  return null;
}

export type FormLifecycleAction =
  | "publish"
  | "unpublish"
  | "retire"
  | "restore";

export function isValidFormLifecycleTransition(
  from: FormLifecycleSnapshot,
  to: FormLifecycleSnapshot,
): boolean {
  const fs = from.status;
  const fp = from.publication_state;
  const ts = to.status;
  const tp = to.publication_state;

  if (ts === "INACTIVE" && tp === "PUBLISHED") {
    return false;
  }

  // Soft-delete
  if (
    ts === "DELETED" &&
    (fs === "ACTIVE" || fs === "INACTIVE") &&
    tp !== "PUBLISHED"
  ) {
    return true;
  }

  // Publish
  if (
    fs === "ACTIVE" &&
    fp === "DRAFT" &&
    ts === "ACTIVE" &&
    tp === "PUBLISHED"
  ) {
    return true;
  }

  // Unpublish
  if (
    fs === "ACTIVE" &&
    fp === "PUBLISHED" &&
    ts === "ACTIVE" &&
    tp === "DRAFT"
  ) {
    return true;
  }

  // Retire
  if (
    fs === "ACTIVE" &&
    (fp === "DRAFT" || fp === "PUBLISHED") &&
    ts === "INACTIVE" &&
    tp === "DRAFT"
  ) {
    return true;
  }

  // Restore
  if (
    fs === "INACTIVE" &&
    fp === "DRAFT" &&
    ts === "ACTIVE" &&
    tp === "DRAFT"
  ) {
    return true;
  }

  return false;
}

export function canPublishForm(form: FormLifecycleSnapshot): boolean {
  return isFormDraft(form);
}

export function canUnpublishForm(form: FormLifecycleSnapshot): boolean {
  return isFormPublished(form);
}

export function canRetireForm(form: FormLifecycleSnapshot): boolean {
  return form.status === "ACTIVE";
}

export function canRestoreForm(form: FormLifecycleSnapshot): boolean {
  return form.status === "INACTIVE" && form.publication_state === "DRAFT";
}

export function formatFormPublicationBadge(
  form: FormLifecycleSnapshot,
): string {
  if (isFormRetired(form)) {
    return "Retired";
  }
  if (isFormPublished(form)) {
    return "Published";
  }
  if (isFormDraft(form)) {
    return "Draft";
  }
  if (form.status === "DELETED") {
    return "Deleted";
  }
  return form.publication_state?.trim() || "—";
}

export function formatCollectionFormAvailabilityBadge(
  form: FormLifecycleSnapshot,
): string {
  if (isFormRetired(form) || form.status === "DELETED") {
    return "Retired";
  }
  if (isFormDraft(form)) {
    return "Draft — temporarily unavailable";
  }
  if (isFormPublished(form)) {
    return "Published";
  }
  return "—";
}

export function formatFormStateEventType(eventType: string): string {
  switch (eventType) {
    case "FORM_CREATED":
      return "Created";
    case "FORM_PUBLISHED":
      return "Published";
    case "FORM_UNPUBLISHED":
      return "Unpublished";
    case "FORM_RETIRED":
      return "Retired";
    case "FORM_RESTORED":
      return "Restored";
    case "FORM_DELETED":
      return "Deleted";
    default:
      return eventType;
  }
}

export function formatLifecycleTransitionLabel(
  fromStatus: string | null | undefined,
  fromPublication: string | null | undefined,
  toStatus: string | null | undefined,
  toPublication: string | null | undefined,
): string {
  const from = `${fromStatus ?? "—"} / ${fromPublication ?? "—"}`;
  const to = `${toStatus ?? "—"} / ${toPublication ?? "—"}`;
  return `${from} → ${to}`;
}

/**
 * Classify how a collection-linked form should instantiate into a packet.
 */
export type PacketFormInstantiationPlan =
  | { kind: "available" }
  | { kind: "pending_publication" }
  | { kind: "skip"; reason: "retired" | "deleted" | "missing" };

export function planPacketFormInstantiation(
  form: FormLifecycleSnapshot | null | undefined,
): PacketFormInstantiationPlan {
  if (!form) {
    return { kind: "skip", reason: "missing" };
  }
  if (form.status === "DELETED") {
    return { kind: "skip", reason: "deleted" };
  }
  if (form.status === "INACTIVE") {
    return { kind: "skip", reason: "retired" };
  }
  if (form.status === "ACTIVE" && form.publication_state === "DRAFT") {
    return { kind: "pending_publication" };
  }
  if (form.status === "ACTIVE" && form.publication_state === "PUBLISHED") {
    return { kind: "available" };
  }
  return { kind: "skip", reason: "missing" };
}

export function isPacketFormPendingPublication(
  availabilityState: string | null | undefined,
): boolean {
  return availabilityState === "PENDING_PUBLICATION";
}

export function canOperateOnPacketFormContent(options: {
  rowStatus?: string | null;
  documentState?: string | null;
  availabilityState?: string | null;
}): boolean {
  if (options.rowStatus != null && options.rowStatus !== "ACTIVE") {
    return false;
  }
  if (isPacketFormPendingPublication(options.availabilityState)) {
    return false;
  }
  return options.documentState === "DRAFT" || options.documentState == null;
}

export function pendingPublicationBlockedMessage(): string {
  return PENDING_PUBLICATION_MESSAGE;
}

export type PublishConflict = {
  publishedFormId: number;
  formName: string;
  versionLabel: string | null;
  formFamilyKey: string;
};

export function backfillPublicationState(status: string): FormPublicationState {
  if (status === "ACTIVE") {
    return "PUBLISHED";
  }
  return "DRAFT";
}

export function backfillPacketAvailabilityState(): PacketFormAvailabilityState {
  return "AVAILABLE";
}

export function assertFormAllowsStructuralEdit(
  form: FormLifecycleSnapshot,
): { ok: true } | { ok: false; error: string } {
  if (canStructurallyEditForm(form)) {
    return { ok: true };
  }
  return {
    ok: false,
    error:
      structuralEditBlockedMessage(form) ??
      (isFormRetired(form)
        ? FORM_RETIRED_READONLY_MESSAGE
        : FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE),
  };
}

/** Structural catalog columns that must not change through a Published form workflow. */
export const STRUCTURAL_FIELD_COLUMNS = [
  "field_key",
  "field_name",
  "field_label",
  "field_data_type",
  "field_widget_type",
  "source_type",
  "source_path",
  "resolver_key",
  "fallback_value",
  "field_resolver_id",
  "required",
  "notes",
] as const;

export type StructuralFieldPatch = Partial<
  Record<(typeof STRUCTURAL_FIELD_COLUMNS)[number], unknown>
>;

export function structuralFieldPatchHasChanges(
  patch: StructuralFieldPatch,
): boolean {
  return STRUCTURAL_FIELD_COLUMNS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key),
  );
}

