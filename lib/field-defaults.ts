import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fieldDefaultToResolvedValue,
  pickBestFieldDefault,
  type FieldDefault,
} from "@/lib/types/field-default";

export const FIELD_DEFAULT_SELECT =
  "id, create_date, update_date, status, field_id, form_id, form_field_mapping_id, scope, owner_user_id, organization_id, default_value, default_checked, created_by_user_id, updated_by_user_id, notes";

/**
 * Resolve the acting business user's organization for defaults:
 * profiles.primary_organization_id when the user has an ACTIVE membership there.
 * Does not silently pick an arbitrary membership.
 */
export async function resolveActingOrganizationIdForDefaults(
  supabase: SupabaseClient,
  actingUserId: string,
): Promise<string | null> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("primary_organization_id")
    .eq("id", actingUserId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const orgId = (profile?.primary_organization_id as string | null) ?? null;
  if (!orgId) {
    return null;
  }

  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", actingUserId)
    .eq("organization_id", orgId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (memberError) {
    throw new Error(memberError.message);
  }

  return membership ? orgId : null;
}

/**
 * Load ACTIVE private + organization preference defaults for a packet's acting user.
 */
export async function loadScopedFieldDefaultsForActor(
  supabase: SupabaseClient,
  options: {
    actingUserId: string;
    organizationId: string | null;
    fieldIds: string[];
  },
): Promise<FieldDefault[]> {
  const fieldIds = [...new Set(options.fieldIds.filter(Boolean))];
  if (fieldIds.length === 0) {
    return [];
  }

  const results: FieldDefault[] = [];

  const { data: privateRows, error: privateError } = await supabase
    .from("field_defaults")
    .select(FIELD_DEFAULT_SELECT)
    .eq("status", "ACTIVE")
    .eq("scope", "PRIVATE")
    .eq("owner_user_id", options.actingUserId)
    .in("field_id", fieldIds);

  if (privateError) {
    throw new Error(privateError.message);
  }
  results.push(...((privateRows as FieldDefault[]) ?? []));

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
    results.push(...((orgRows as FieldDefault[]) ?? []));
  }

  return results;
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
