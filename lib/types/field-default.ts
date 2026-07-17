export const FIELD_DEFAULT_SCOPES = ["PRIVATE", "ORGANIZATION"] as const;

export type FieldDefaultScope = (typeof FIELD_DEFAULT_SCOPES)[number];

export const FIELD_DEFAULT_STATUSES = ["ACTIVE", "INACTIVE", "DELETED"] as const;

export type FieldDefaultStatus = (typeof FIELD_DEFAULT_STATUSES)[number];

export type FieldDefault = {
  id: string;
  create_date: string;
  update_date: string;
  status: FieldDefaultStatus;
  field_id: string;
  form_id: number | null;
  form_field_mapping_id: string | null;
  scope: FieldDefaultScope;
  owner_user_id: string | null;
  organization_id: string | null;
  default_value: string | null;
  default_checked: boolean | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  notes: string | null;
};

export type FieldDefaultInput = {
  field_id: string;
  form_id?: number | null;
  form_field_mapping_id?: string | null;
  scope: string;
  owner_user_id?: string | null;
  organization_id?: string | null;
  default_value?: string | null;
  default_checked?: boolean | null;
  notes?: string | null;
  status?: string;
};

export function isFieldDefaultScope(value: string): value is FieldDefaultScope {
  return (FIELD_DEFAULT_SCOPES as readonly string[]).includes(value);
}

/**
 * Validate scoped preference defaults. GLOBAL is always rejected.
 */
export function validateFieldDefaultInput(input: FieldDefaultInput): string | null {
  const scope = input.scope?.trim().toUpperCase() ?? "";
  if (scope === "GLOBAL") {
    return "Default values cannot have Global scope.";
  }
  if (!isFieldDefaultScope(scope)) {
    return "Default scope must be Private or Organization.";
  }

  if (!input.field_id?.trim()) {
    return "A field is required.";
  }

  const owner = input.owner_user_id?.trim() || null;
  const org = input.organization_id?.trim() || null;

  if (scope === "PRIVATE") {
    if (!owner) {
      return "Private defaults require an owner.";
    }
    if (org) {
      return "Private defaults cannot also belong to an organization.";
    }
  }

  if (scope === "ORGANIZATION") {
    if (!org) {
      return "Organization defaults require an organization.";
    }
    if (owner) {
      return "Organization defaults cannot also have a private owner.";
    }
  }

  if (input.default_value == null && input.default_checked == null) {
    return "A default value or checked state is required.";
  }

  const status = input.status?.trim().toUpperCase();
  if (
    status &&
    !(FIELD_DEFAULT_STATUSES as readonly string[]).includes(status)
  ) {
    return "Invalid default status.";
  }

  return null;
}

export type FieldDefaultMatchKey = {
  fieldId: string;
  formId?: number | null;
  mappingId?: string | null;
};

/**
 * Prefer mapping-specific, then form+field, then field-only rows.
 */
export function pickBestFieldDefault(
  candidates: FieldDefault[],
  key: FieldDefaultMatchKey,
): FieldDefault | null {
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

export function fieldDefaultToResolvedValue(row: FieldDefault): {
  value: string;
  value_json: Record<string, unknown> | null;
} {
  if (row.default_checked != null) {
    return {
      value: row.default_checked ? "true" : "false",
      value_json: { checked: row.default_checked },
    };
  }

  return {
    value: row.default_value ?? "",
    value_json: null,
  };
}

export type ScopedDefaultLookup = {
  privateDefaults: FieldDefault[];
  organizationDefaults: FieldDefault[];
};

export function buildScopedDefaultLookup(
  rows: FieldDefault[],
): ScopedDefaultLookup {
  return {
    privateDefaults: rows.filter((row) => row.scope === "PRIVATE"),
    organizationDefaults: rows.filter((row) => row.scope === "ORGANIZATION"),
  };
}

/**
 * Private beats Organization. Mapping > form > field-only specificity.
 */
export function resolveScopedPreferenceDefault(options: {
  lookup: ScopedDefaultLookup | null | undefined;
  fieldId: string;
  formId?: number | null;
  mappingId?: string | null;
}): {
  value: string;
  value_json: Record<string, unknown> | null;
  source: "private_default" | "organization_default";
} | null {
  if (!options.lookup) {
    return null;
  }

  const key = {
    fieldId: options.fieldId,
    formId: options.formId,
    mappingId: options.mappingId,
  };

  const privateHit = pickBestFieldDefault(options.lookup.privateDefaults, key);
  if (privateHit) {
    return {
      ...fieldDefaultToResolvedValue(privateHit),
      source: "private_default",
    };
  }

  const orgHit = pickBestFieldDefault(
    options.lookup.organizationDefaults,
    key,
  );
  if (orgHit) {
    return {
      ...fieldDefaultToResolvedValue(orgHit),
      source: "organization_default",
    };
  }

  return null;
}

/** Structural PDF unchecked / placeholder mapping overrides that may stay Global. */
export function isStructuralMappingDefaultOverride(
  value: string | null | undefined,
): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return true;
  }
  const normalized = trimmed.toLowerCase();
  return (
    normalized === "off" ||
    normalized === "false" ||
    normalized === "0" ||
    normalized === "na" ||
    normalized === "n/a" ||
    normalized === "n.a."
  );
}

/**
 * Mapping overrides kept on a Global form copy. Preference literals are stripped;
 * structural placeholders (Off / NA / empty / checkbox 0) may remain.
 */
export function mappingOverrideForGlobalCopy(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return isStructuralMappingDefaultOverride(value) ? value : null;
}

/**
 * Global catalog field copies never receive Private/Organization preference
 * defaults. Structural field.default_value / default_checked stay null here.
 */
export function globalCatalogFieldPreferenceDefaults(): {
  default_value: null;
  default_checked: null;
} {
  return {
    default_value: null,
    default_checked: null,
  };
}

const UNSAFE_GLOBALIZATION_PATTERN =
  /\b(lee|davey|goosmann|harbaugh|internal[_ -]?code|office[_ -]?only|brokerage[_ -]?only)\b/i;

/**
 * Private catalog fields that appear user/brokerage-specific and should not
 * be auto-promoted into the Global field catalog.
 */
export function classifyPrivateFieldForGlobalization(field: {
  field_key: string;
  field_label?: string | null;
  field_name?: string | null;
  notes?: string | null;
}): { safe: true } | { safe: false; reason: string } {
  const haystack = [
    field.field_key,
    field.field_label,
    field.field_name,
    field.notes,
  ]
    .filter(Boolean)
    .join(" ")
    // Underscores are word chars for \b; treat them as separators in keys.
    .replace(/_/g, " ");

  if (UNSAFE_GLOBALIZATION_PATTERN.test(haystack)) {
    return {
      safe: false,
      reason:
        "Field key, label, or notes appear user- or brokerage-specific and need admin review before becoming Global.",
    };
  }

  return { safe: true };
}
