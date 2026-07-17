import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldDefault } from "@/lib/types/field-default";

export type {
  FieldDefault,
  FieldDefaultInput,
  FieldDefaultMatchKey,
  FieldDefaultScope,
  FieldDefaultStatus,
  ScopedDefaultLookup,
} from "@/lib/types/field-default";

export {
  FIELD_DEFAULT_SCOPES,
  FIELD_DEFAULT_STATUSES,
  buildScopedDefaultLookup,
  classifyPrivateFieldForGlobalization,
  fieldDefaultToResolvedValue,
  globalCatalogFieldPreferenceDefaults,
  isFieldDefaultScope,
  isStructuralMappingDefaultOverride,
  mappingOverrideForGlobalCopy,
  pickBestFieldDefault,
  resolveScopedPreferenceDefault,
  validateFieldDefaultInput,
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
