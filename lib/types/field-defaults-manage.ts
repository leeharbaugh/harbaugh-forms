import type { FieldDefault, FieldDefaultScope } from "./field-default.ts";
import {
  fieldDefaultToResolvedValue,
  pickBestFieldDefault,
  resolveScopedPreferenceDefault,
  validateFieldDefaultInput,
} from "./field-default.ts";

/** Local date display normalize (matches field-resolver; avoids @/ import in Node tests). */
function normalizeDateDisplay(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-");
    return `${month}/${day}/${year}`;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${month}/${day}/${year}`;
  }

  return trimmed;
}

export type DefaultsEditorScopeTab = "PRIVATE" | "ORGANIZATION";

export type TextDefaultMode = "inherit" | "value" | "blank";
export type CheckboxDefaultMode = "inherit" | "checked" | "unchecked";

export type ScopedDefaultDraft =
  | { kind: "text"; mode: "inherit" }
  | { kind: "text"; mode: "value"; value: string }
  | { kind: "text"; mode: "blank" }
  | { kind: "checkbox"; mode: "inherit" }
  | { kind: "checkbox"; mode: "checked" }
  | { kind: "checkbox"; mode: "unchecked" };

export type DefaultsEditorFieldMeta = {
  fieldId: string;
  fieldKey: string;
  fieldLabel: string;
  fieldDataType: string;
  fieldWidgetType: string | null;
  sourceType: string | null;
  sourcePath: string | null;
  notes: string | null;
  pageNumber: number | null;
  mappingId: string | null;
  isCheckbox: boolean;
  isDate: boolean;
  sharedFormNames: string[];
};

export type ScopedDefaultDisplay = {
  mode: TextDefaultMode | CheckboxDefaultMode;
  defaultId: string | null;
  displayValue: string | null;
  isBlankOverride: boolean;
  source: "private_default" | "organization_default" | null;
};

export type DefaultsEditorFieldRow = DefaultsEditorFieldMeta & {
  selectedScopeDefault: ScopedDefaultDisplay;
  inheritedOrganizationDefault: ScopedDefaultDisplay | null;
  effectiveFallback: {
    label: string;
    detail: string;
  };
  sourcePriorityNote: string;
};

export type UnmappedExistingDefaultRow = {
  defaultId: string;
  fieldId: string;
  fieldKey: string;
  fieldLabel: string;
  isCheckbox: boolean;
  display: ScopedDefaultDisplay;
};

export type DefaultsEditorOrganizationContext = {
  organizationId: string | null;
  organizationName: string | null;
  canViewInherited: boolean;
  canManageOrganization: boolean;
  primaryOrgWarning: string | null;
};

export const DEFAULTS_PAGE_EXPLANATION =
  "Defaults configured here apply to your packets when linked transaction data does not supply a value. They do not modify the Global form.";

export const SOURCE_PRIORITY_NOTE =
  "Linked packet, contact, property, agreement, agent, or brokerage data takes priority over defaults.";

export const REMOVE_PRIVATE_DEFAULT_TITLE = "Remove this default?";
export const REMOVE_PRIVATE_DEFAULT_MESSAGE =
  "This field will return to its inherited Organization default, or remain blank if no Organization default exists.";
export const REMOVE_ORGANIZATION_DEFAULT_TITLE = "Remove this default?";
export const REMOVE_ORGANIZATION_DEFAULT_MESSAGE =
  "This field will no longer have an Organization default.";

export const UNMAPPED_DEFAULTS_TITLE = "Unmapped Existing Defaults";
export const UNMAPPED_DEFAULTS_EXPLANATION =
  "These saved defaults are not currently connected to an active field on this form. They are shown so they can be reviewed or removed. They are account-wide (not specific to this form) and appear here because they have no active mapping on any form.";

export function isCheckboxFieldMeta(field: {
  field_data_type?: string | null;
  field_widget_type?: string | null;
}): boolean {
  const data = field.field_data_type?.toLowerCase() ?? "";
  const widget = field.field_widget_type?.toLowerCase() ?? "";
  return data === "boolean" || widget === "checkbox";
}

export function isDateFieldMeta(field: {
  field_data_type?: string | null;
  field_widget_type?: string | null;
}): boolean {
  const data = field.field_data_type?.toLowerCase() ?? "";
  const widget = field.field_widget_type?.toLowerCase() ?? "";
  return data === "date" || widget === "date";
}

export function formatSourceSummary(field: {
  source_type?: string | null;
  source_path?: string | null;
}): string {
  const sourceType = field.source_type?.trim() || null;
  const sourcePath = field.source_path?.trim() || null;

  if (!sourceType || sourceType === "manual_only") {
    return "Manual/default value";
  }

  const typeLabel = sourceType.replace(/_/g, " ");
  if (sourcePath) {
    return `${typeLabel} · ${sourcePath}`;
  }
  return typeLabel;
}

export function formatSharedFieldWarning(formNames: string[]): string | null {
  const names = formNames.map((name) => name.trim()).filter(Boolean);
  if (names.length <= 1) {
    return null;
  }
  return `This field is shared with: ${names.join(", ")}. This default will apply anywhere this field is used.`;
}

export function scopedDefaultToDisplay(
  row: FieldDefault | null | undefined,
  isCheckbox: boolean,
): ScopedDefaultDisplay {
  if (!row || row.status !== "ACTIVE") {
    return {
      mode: "inherit",
      defaultId: null,
      displayValue: null,
      isBlankOverride: false,
      source: null,
    };
  }

  const source =
    row.scope === "PRIVATE" ? "private_default" : "organization_default";

  if (isCheckbox || row.default_checked != null) {
    const checked = row.default_checked === true;
    return {
      mode: checked ? "checked" : "unchecked",
      defaultId: row.id,
      displayValue: checked ? "Checked" : "Unchecked",
      isBlankOverride: false,
      source,
    };
  }

  if (row.default_value === "") {
    return {
      mode: "blank",
      defaultId: row.id,
      displayValue: "Blank override",
      isBlankOverride: true,
      source,
    };
  }

  return {
    mode: "value",
    defaultId: row.id,
    displayValue: row.default_value,
    isBlankOverride: false,
    source,
  };
}

export function draftFromDisplay(
  display: ScopedDefaultDisplay,
  isCheckbox: boolean,
): ScopedDefaultDraft {
  if (isCheckbox) {
    if (display.mode === "checked") {
      return { kind: "checkbox", mode: "checked" };
    }
    if (display.mode === "unchecked") {
      return { kind: "checkbox", mode: "unchecked" };
    }
    return { kind: "checkbox", mode: "inherit" };
  }

  if (display.mode === "blank") {
    return { kind: "text", mode: "blank" };
  }
  if (display.mode === "value") {
    return {
      kind: "text",
      mode: "value",
      value: display.displayValue ?? "",
    };
  }
  return { kind: "text", mode: "inherit" };
}

/**
 * Normalize a Use value payload for persistence. Preserves meaningful zero and
 * legacy strings such as "5th". Dates use existing display normalization.
 */
export function normalizeDefaultValueForSave(
  raw: string,
  options: { isDate: boolean },
): string {
  const trimmed = raw.trim();
  if (options.isDate) {
    return normalizeDateDisplay(trimmed);
  }
  // Preserve explicit "0" after trim; empty means caller should use blank mode.
  return trimmed;
}

export function buildFieldDefaultWritePayload(options: {
  fieldId: string;
  scope: FieldDefaultScope;
  ownerUserId: string | null;
  organizationId: string | null;
  draft: ScopedDefaultDraft;
  isDate: boolean;
}): {
  error: string | null;
  values: {
    field_id: string;
    form_id: null;
    form_field_mapping_id: null;
    scope: FieldDefaultScope;
    owner_user_id: string | null;
    organization_id: string | null;
    default_value: string | null;
    default_checked: boolean | null;
    status: "ACTIVE";
  } | null;
} {
  const { draft } = options;

  if (draft.mode === "inherit") {
    return { error: "Choose a value or remove the default instead.", values: null };
  }

  let default_value: string | null = null;
  let default_checked: boolean | null = null;

  if (draft.kind === "checkbox") {
    default_checked = draft.mode === "checked";
  } else if (draft.mode === "blank") {
    default_value = "";
  } else {
    const normalized = normalizeDefaultValueForSave(draft.value, {
      isDate: options.isDate,
    });
    if (normalized === "" && draft.value.trim() === "") {
      return {
        error: "Enter a value, or choose Use blank.",
        values: null,
      };
    }
    default_value = normalized;
  }

  const input = {
    field_id: options.fieldId,
    form_id: null,
    form_field_mapping_id: null,
    scope: options.scope,
    owner_user_id: options.ownerUserId,
    organization_id: options.organizationId,
    default_value,
    default_checked,
    status: "ACTIVE",
  };

  const error = validateFieldDefaultInput(input);
  if (error) {
    return { error, values: null };
  }

  return {
    error: null,
    values: {
      field_id: options.fieldId,
      form_id: null,
      form_field_mapping_id: null,
      scope: options.scope,
      owner_user_id: options.ownerUserId,
      organization_id: options.organizationId,
      default_value,
      default_checked,
      status: "ACTIVE",
    },
  };
}

export function pickFieldLevelDefault(
  candidates: FieldDefault[],
  fieldId: string,
): FieldDefault | null {
  return pickBestFieldDefault(candidates, {
    fieldId,
    formId: null,
    mappingId: null,
  });
}

export function describeEffectiveFallback(options: {
  selectedScope: DefaultsEditorScopeTab;
  fieldId: string;
  privateRow: FieldDefault | null;
  organizationRow: FieldDefault | null;
  isCheckbox: boolean;
  hasSourceMapping: boolean;
}): { label: string; detail: string } {
  const {
    fieldId,
    privateRow,
    organizationRow,
    isCheckbox,
    hasSourceMapping,
  } = options;

  const scoped = resolveScopedPreferenceDefault({
    lookup: {
      privateDefaults: privateRow ? [privateRow] : [],
      organizationDefaults: organizationRow ? [organizationRow] : [],
    },
    fieldId,
    formId: null,
    mappingId: null,
  });

  const sourceNote = hasSourceMapping
    ? "Source/transaction data still takes priority when present on a packet."
    : "No linked source mapping; fallback applies when the packet has no other value.";

  if (!scoped) {
    return {
      label: isCheckbox ? "Unchecked (empty)" : "Blank",
      detail: `No scoped preference. ${sourceNote}`,
    };
  }

  const resolved = fieldDefaultToResolvedValue(
    scoped.source === "private_default"
      ? (privateRow as FieldDefault)
      : (organizationRow as FieldDefault),
  );

  if (scoped.source === "private_default" && privateRow?.default_value === "") {
    return {
      label: "Blank override (Private)",
      detail: `Private blank overrides Organization. ${sourceNote}`,
    };
  }

  if (isCheckbox || resolved.value_json?.checked != null) {
    const checked = resolved.value_json?.checked === true;
    return {
      label: `${checked ? "Checked" : "Unchecked"} (${scoped.source === "private_default" ? "Private" : "Organization"})`,
      detail: sourceNote,
    };
  }

  return {
    label: `${resolved.value || "Blank"} (${scoped.source === "private_default" ? "Private" : "Organization"})`,
    detail: sourceNote,
  };
}

export function filterDefaultsEditorRows(
  rows: DefaultsEditorFieldRow[],
  query: string,
  typeFilter: string | null,
): DefaultsEditorFieldRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (typeFilter === "checkbox" && !row.isCheckbox) {
      return false;
    }
    if (typeFilter === "text" && row.isCheckbox) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      row.fieldLabel.toLowerCase().includes(q) ||
      row.fieldKey.toLowerCase().includes(q)
    );
  });
}

export function assertNeverGlobalScope(scope: string): void {
  if (scope.trim().toUpperCase() === "GLOBAL") {
    throw new Error("Default values cannot have Global scope.");
  }
}
