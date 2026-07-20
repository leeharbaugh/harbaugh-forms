/**
 * Pure helpers for Global-form defaults management UI.
 * Kept dependency-free so Node --experimental-strip-types tests can import
 * this file without path-alias or extension resolution issues.
 */

export type DefaultsManagementFieldDefault = {
  id: string;
  status: string;
  field_id: string;
  form_id: number | null;
  form_field_mapping_id: string | null;
  scope: string;
  owner_user_id: string | null;
  organization_id: string | null;
  default_value: string | null;
  default_checked: boolean | null;
};

export type DefaultsManagementActor = {
  userId: string;
  isActiveAdmin: boolean;
  memberOrganizationIds?: readonly string[];
  orgAdminOrganizationIds?: readonly string[];
};

function isBooleanFieldLike(field: {
  field_data_type?: string | null;
  field_widget_type?: string | null;
}): boolean {
  const data = (field.field_data_type ?? "").trim().toLowerCase();
  const widget = (field.field_widget_type ?? "").trim().toLowerCase();
  return data === "boolean" || widget === "checkbox";
}

/**
 * Prefer mapping-specific, then form+field, then field-only ACTIVE rows.
 * Mirrors pickBestFieldDefault without importing it (Node test compatibility).
 */
function pickBestActiveDefault(
  candidates: DefaultsManagementFieldDefault[],
  key: {
    fieldId: string;
    formId?: number | null;
    mappingId?: string | null;
  },
): DefaultsManagementFieldDefault | null {
  const active = candidates.filter((row) => row.status === "ACTIVE");
  if (active.length === 0) {
    return null;
  }

  const mappingId = key.mappingId ?? null;
  const formId = key.formId ?? null;

  if (mappingId) {
    const byMapping = active.find(
      (row) =>
        row.field_id === key.fieldId &&
        row.form_field_mapping_id === mappingId,
    );
    if (byMapping) {
      return byMapping;
    }
  }

  if (formId != null) {
    const byForm = active.find(
      (row) =>
        row.field_id === key.fieldId &&
        row.form_id === formId &&
        row.form_field_mapping_id == null,
    );
    if (byForm) {
      return byForm;
    }
  }

  return (
    active.find(
      (row) =>
        row.field_id === key.fieldId &&
        row.form_id == null &&
        row.form_field_mapping_id == null,
    ) ?? null
  );
}

export type DefaultsEditorKind =
  | "checkbox"
  | "date"
  | "number"
  | "currency"
  | "text"
  | "unsupported";

export type EffectiveScopedDefaultWinner = "Private" | "Organization" | "None";

export type DefaultsFieldValueDraft = {
  /** Text value for non-checkbox editors. Empty string means blank (not NA). */
  textValue: string;
  /** Checkbox only. null means no checkbox preference stored. */
  checked: boolean | null;
};

export type SerializedDefaultPayload = {
  default_value: string | null;
  default_checked: boolean | null;
};

/**
 * Choose an editor control from catalog field types.
 * Signature / initials are shown but not editable as preference defaults.
 */
export function defaultsEditorKindForField(field: {
  field_data_type?: string | null;
  field_widget_type?: string | null;
}): DefaultsEditorKind {
  const data = (field.field_data_type ?? "").trim().toLowerCase();
  const widget = (field.field_widget_type ?? "").trim().toLowerCase();

  if (widget === "signature" || widget === "initials" || widget === "initial") {
    return "unsupported";
  }
  if (isBooleanFieldLike(field)) {
    return "checkbox";
  }
  if (data === "date" || widget === "date") {
    return "date";
  }
  if (data === "currency" || widget === "currency") {
    return "currency";
  }
  if (data === "number" || widget === "number") {
    return "number";
  }
  return "text";
}

export function draftFromFieldDefault(
  row: DefaultsManagementFieldDefault | null | undefined,
  kind: DefaultsEditorKind,
): DefaultsFieldValueDraft {
  if (!row) {
    return { textValue: "", checked: null };
  }
  if (kind === "checkbox") {
    return {
      textValue: "",
      checked: row.default_checked ?? null,
    };
  }
  return {
    textValue: row.default_value ?? "",
    checked: null,
  };
}

/**
 * Serialize a UI draft into field_defaults columns.
 * Distinguishes blank vs zero vs false; never invents NA for clears.
 */
export function serializeDefaultsDraft(
  kind: DefaultsEditorKind,
  draft: DefaultsFieldValueDraft,
): { ok: true; payload: SerializedDefaultPayload } | { ok: false; error: string } {
  if (kind === "unsupported") {
    return {
      ok: false,
      error: "This field type does not support preference defaults.",
    };
  }

  if (kind === "checkbox") {
    if (draft.checked == null) {
      return {
        ok: false,
        error: "Choose checked or unchecked, or clear the default instead.",
      };
    }
    return {
      ok: true,
      payload: {
        default_value: null,
        default_checked: draft.checked,
      },
    };
  }

  const raw = draft.textValue;
  if (kind === "date") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {
        ok: false,
        error: "Enter a date, or clear the default instead.",
      };
    }
    if (/^n\/?a$/i.test(trimmed) || trimmed.toLowerCase() === "n.a.") {
      return { ok: false, error: "Dates cannot be stored as NA." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { ok: false, error: "Use a valid date (YYYY-MM-DD)." };
    }
    return {
      ok: true,
      payload: { default_value: trimmed, default_checked: null },
    };
  }

  if (kind === "number" || kind === "currency") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return {
        ok: false,
        error: "Enter a number (including 0), or clear the default instead.",
      };
    }
    if (/^n\/?a$/i.test(trimmed)) {
      return {
        ok: false,
        error: "Use Clear to remove a numeric default instead of NA.",
      };
    }
    const normalized = trimmed.replace(/,/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
      return { ok: false, error: "Enter a valid number." };
    }
    return {
      ok: true,
      payload: { default_value: normalized, default_checked: null },
    };
  }

  // text / email / phone / multiline — empty string is a valid stored blank preference
  return {
    ok: true,
    payload: {
      default_value: raw,
      default_checked: null,
    },
  };
}

export function formatDefaultsDisplayValue(
  row: DefaultsManagementFieldDefault | null | undefined,
  kind: DefaultsEditorKind,
): string {
  if (!row) {
    return "None";
  }
  if (kind === "checkbox" || row.default_checked != null) {
    if (row.default_checked === true) {
      return "Checked";
    }
    if (row.default_checked === false) {
      return "Unchecked";
    }
  }
  if (row.default_value == null) {
    return "None";
  }
  if (row.default_value === "") {
    return "(blank)";
  }
  return row.default_value;
}

export function effectiveScopedDefaultWinner(options: {
  privateDefault: DefaultsManagementFieldDefault | null;
  organizationDefault: DefaultsManagementFieldDefault | null;
}): EffectiveScopedDefaultWinner {
  if (options.privateDefault) {
    return "Private";
  }
  if (options.organizationDefault) {
    return "Organization";
  }
  return "None";
}

export function pickScopedDefaultForFormField(
  rows: DefaultsManagementFieldDefault[],
  options: {
    fieldId: string;
    formId: number;
    mappingId?: string | null;
  },
): DefaultsManagementFieldDefault | null {
  return pickBestActiveDefault(rows, {
    fieldId: options.fieldId,
    formId: options.formId,
    mappingId: options.mappingId ?? null,
  });
}

export function canManagePrivateDefault(
  actor: DefaultsManagementActor | null | undefined,
  ownerUserId: string | null | undefined,
): boolean {
  if (!actor || !ownerUserId) {
    return false;
  }
  return actor.userId === ownerUserId;
}

export function canManageOrganizationDefault(
  actor: DefaultsManagementActor | null | undefined,
  organizationId: string | null | undefined,
): boolean {
  if (!actor || !organizationId) {
    return false;
  }
  if (actor.isActiveAdmin) {
    return true;
  }
  return (actor.orgAdminOrganizationIds ?? []).includes(organizationId);
}

export function canViewOrganizationDefaults(
  actor: DefaultsManagementActor | null | undefined,
  organizationId: string | null | undefined,
): boolean {
  if (!actor || !organizationId) {
    return false;
  }
  if (actor.isActiveAdmin) {
    return true;
  }
  return (actor.memberOrganizationIds ?? []).includes(organizationId);
}

export function assertWritableDefaultScope(
  scope: string,
): "PRIVATE" | "ORGANIZATION" | null {
  const normalized = scope.trim().toUpperCase();
  if (normalized === "GLOBAL") {
    return null;
  }
  if (normalized === "PRIVATE" || normalized === "ORGANIZATION") {
    return normalized;
  }
  return null;
}

/** True when a Global form may offer the defaults management entry point. */
export function canOfferFormDefaultsManagement(form: {
  scope?: string | null;
  status?: string | null;
} | null | undefined): boolean {
  if (!form) {
    return false;
  }
  return form.scope === "GLOBAL" && (form.status == null || form.status === "ACTIVE");
}

export const DEFAULTS_PRECEDENCE_NOTICE =
  "Defaults help prefill new form values. Transaction data and packet-specific values take precedence. Changing a default does not change existing packet forms.";
