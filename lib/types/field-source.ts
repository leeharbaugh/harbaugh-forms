export const FIELD_SOURCE_TYPES = [
  "settings_agent",
  "settings_brokerage",
  "packet_contact",
  "packet_property",
  "packet",
  "static_default",
  "custom_resolver",
  "manual_only",
] as const;

export type FieldSourceType = (typeof FIELD_SOURCE_TYPES)[number];

export const SETTINGS_AGENT_SOURCE_PATHS = [
  "agent_first_name",
  "agent_middle_name",
  "agent_last_name",
  "agent_full_name",
  "agent_license_number",
  "agent_phone",
  "agent_email",
  "agent_address",
  "agent_city",
  "agent_state",
  "agent_zip",
] as const;

export const SETTINGS_BROKERAGE_SOURCE_PATHS = [
  "brokerage_name",
  "brokerage_address",
  "brokerage_city",
  "brokerage_state",
  "brokerage_zip",
  "brokerage_office_phone",
  "broker_first_name",
  "broker_middle_name",
  "broker_last_name",
  "broker_full_name",
  "broker_license_number",
  "broker_phone",
  "broker_email",
] as const;

const CONTACT_ROLE_PREFIXES = ["buyer", "seller"] as const;
const CONTACT_ROLE_INDICES = [1, 2] as const;
const CONTACT_FIELD_SUFFIXES = [
  "first_name",
  "middle_name",
  "last_name",
  "full_name",
  "email",
  "phone",
] as const;

export const PACKET_CONTACT_SOURCE_PATHS = CONTACT_ROLE_PREFIXES.flatMap(
  (role) =>
    CONTACT_ROLE_INDICES.flatMap((index) =>
      CONTACT_FIELD_SUFFIXES.map(
        (field) => `${role}_${index}.${field}` as const,
      ),
    ),
);

export const PACKET_PROPERTY_SOURCE_PATHS = [
  "address",
  "street_address",
  "city",
  "state",
  "zip",
  "county",
  "legal_description",
  "subdivision",
  "lot",
  "block",
  "tax_id",
  "mls_number",
] as const;

export const PACKET_SOURCE_PATHS = [
  "packet_name",
  "packet_type",
  "effective_date",
  "expiration_date",
  "created_date",
] as const;

export const CUSTOM_RESOLVER_KEYS = [
  "agent_full_name",
  "broker_full_name",
  "property_hoa_name",
  "property_hoa_phone",
] as const;

export const STATIC_DEFAULT_SOURCE_PATHS = ["default_checked", "default_value"] as const;

const SOURCE_TYPE_LABELS: Record<FieldSourceType, string> = {
  settings_agent: "Settings · Agent profile",
  settings_brokerage: "Settings · Brokerage profile",
  packet_contact: "Packet contact",
  packet_property: "Packet property",
  packet: "Packet metadata",
  static_default: "Static default",
  custom_resolver: "Custom resolver",
  manual_only: "Manual entry only",
};

export function formatFieldSourceType(sourceType: string | null | undefined): string {
  if (!sourceType) {
    return "—";
  }

  return SOURCE_TYPE_LABELS[sourceType as FieldSourceType] ?? sourceType;
}

export function isFieldSourceType(
  value: string | null | undefined,
): value is FieldSourceType {
  return (
    value != null &&
    FIELD_SOURCE_TYPES.includes(value as FieldSourceType)
  );
}

export function sourcePathsForType(
  sourceType: FieldSourceType | "",
): readonly string[] {
  switch (sourceType) {
    case "settings_agent":
      return SETTINGS_AGENT_SOURCE_PATHS;
    case "settings_brokerage":
      return SETTINGS_BROKERAGE_SOURCE_PATHS;
    case "packet_contact":
      return PACKET_CONTACT_SOURCE_PATHS;
    case "packet_property":
      return PACKET_PROPERTY_SOURCE_PATHS;
    case "packet":
      return PACKET_SOURCE_PATHS;
    case "static_default":
      return STATIC_DEFAULT_SOURCE_PATHS;
    case "custom_resolver":
      return CUSTOM_RESOLVER_KEYS;
    default:
      return [];
  }
}

export function sourceTypeRequiresPath(sourceType: FieldSourceType | ""): boolean {
  return (
    sourceType === "settings_agent" ||
    sourceType === "settings_brokerage" ||
    sourceType === "packet_contact" ||
    sourceType === "packet_property" ||
    sourceType === "packet" ||
    sourceType === "static_default"
  );
}

export function sourceTypeRequiresResolverKey(
  sourceType: FieldSourceType | "",
): boolean {
  return sourceType === "custom_resolver";
}

export function sourceTypeAllowsFallbackValue(
  sourceType: FieldSourceType | "",
): boolean {
  return sourceType === "static_default" || sourceType === "manual_only";
}

export type FieldSourceInput = {
  source_type: FieldSourceType | "";
  source_path: string;
  resolver_key: string;
  fallback_value: string;
};

export function emptyFieldSourceInput(): FieldSourceInput {
  return {
    source_type: "",
    source_path: "",
    resolver_key: "",
    fallback_value: "",
  };
}

export function fieldSourceFromField(field: {
  source_type?: string | null;
  source_path?: string | null;
  resolver_key?: string | null;
  fallback_value?: string | null;
}): FieldSourceInput {
  return {
    source_type: isFieldSourceType(field.source_type) ? field.source_type : "",
    source_path: field.source_path ?? "",
    resolver_key: field.resolver_key ?? "",
    fallback_value: field.fallback_value ?? "",
  };
}

export function validateFieldSourceInput(input: FieldSourceInput): string | null {
  if (!input.source_type) {
    return null;
  }

  if (!isFieldSourceType(input.source_type)) {
    return "Select a valid value source type.";
  }

  if (sourceTypeRequiresPath(input.source_type)) {
    if (!input.source_path.trim()) {
      return "Source path is required for the selected value source.";
    }

    const allowed = sourcePathsForType(input.source_type);
    if (
      allowed.length > 0 &&
      !allowed.includes(input.source_path.trim())
    ) {
      return "Select a valid source path for the selected value source.";
    }
  }

  if (sourceTypeRequiresResolverKey(input.source_type)) {
    if (!input.resolver_key.trim()) {
      return "Resolver key is required for custom resolver fields.";
    }
  }

  if (input.source_type === "static_default" && !input.fallback_value.trim()) {
    if (input.source_path.trim() !== "default_checked") {
      return "Fallback value is required for static default fields.";
    }
  }

  return null;
}

export function normalizeFieldSourceInput(input: FieldSourceInput) {
  const trim = (value: string) => value.trim();

  if (!input.source_type || !isFieldSourceType(input.source_type)) {
    return {
      source_type: null,
      source_path: null,
      resolver_key: null,
      fallback_value: null,
    };
  }

  return {
    source_type: input.source_type,
    source_path: sourceTypeRequiresPath(input.source_type)
      ? trim(input.source_path) || null
      : null,
    resolver_key: sourceTypeRequiresResolverKey(input.source_type)
      ? trim(input.resolver_key) || null
      : null,
    fallback_value:
      trim(input.fallback_value) || null,
  };
}

export function formatFieldSourceSummary(field: {
  source_type?: string | null;
  source_path?: string | null;
  resolver_key?: string | null;
  fallback_value?: string | null;
}): string {
  if (!field.source_type) {
    return "Field key fallback";
  }

  const typeLabel = formatFieldSourceType(field.source_type);

  if (field.source_type === "custom_resolver" && field.resolver_key) {
    return `${typeLabel} · ${field.resolver_key}`;
  }

  if (field.source_path) {
    return `${typeLabel} · ${field.source_path}`;
  }

  if (field.fallback_value) {
    return `${typeLabel} · ${field.fallback_value}`;
  }

  return typeLabel;
}

/** Compact catalog display: settings_brokerage → brokerage_name */
export function formatFieldSourceMappingCatalog(field: {
  source_type?: string | null;
  source_path?: string | null;
  resolver_key?: string | null;
  fallback_value?: string | null;
}): string | null {
  if (!field.source_type?.trim()) {
    return null;
  }

  const sourceType = field.source_type.trim();

  if (sourceType === "manual_only") {
    return "manual_only";
  }

  if (sourceType === "custom_resolver") {
    const resolverKey = field.resolver_key?.trim();
    return resolverKey ? `${sourceType} → ${resolverKey}` : sourceType;
  }

  if (sourceType === "static_default") {
    const detail =
      field.fallback_value?.trim() || field.source_path?.trim() || null;
    return detail ? `${sourceType} → ${detail}` : sourceType;
  }

  const sourcePath = field.source_path?.trim();
  return sourcePath ? `${sourceType} → ${sourcePath}` : sourceType;
}

export const FIELD_SOURCE_MAPPING_MIGRATION =
  "20250618120000_field_source_mapping.sql";

export function formatFieldSourceSaveError(message: string): string {
  if (
    message.includes("schema cache") &&
    (message.includes("fallback_value") ||
      message.includes("source_type") ||
      message.includes("source_path") ||
      message.includes("resolver_key"))
  ) {
    return `The database is missing field source mapping columns. Apply supabase/migrations/${FIELD_SOURCE_MAPPING_MIGRATION} to your Supabase project, then reload the API schema (NOTIFY pgrst, 'reload schema';).`;
  }

  return message;
}
