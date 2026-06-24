import {
  BUYER_REP_DETAILS_SOURCE_PATHS,
  REPRESENTATION_AGREEMENT_SOURCE_PATHS,
} from "@/lib/types/buyer-rep-field-resolution";

export { BUYER_REP_DETAILS_SOURCE_PATHS, REPRESENTATION_AGREEMENT_SOURCE_PATHS };

export const FIELD_SOURCE_TYPES = [
  "settings_agent",
  "settings_brokerage",
  "packet_contact",
  "packet_property",
  "packet",
  "buyer_rep_details",
  "listing_agreement_details",
  "representation_agreement",
  "static_default",
  "custom_resolver",
  "manual_only",
  "packet_instance",
] as const;

export type FieldSourceType = (typeof FIELD_SOURCE_TYPES)[number];

export type FieldSourceStatus =
  | "globally_mapped"
  | "packet_instance"
  | "unmapped";

/** Canonical field keys backfilled to packet_instance via migration (not used for UI inference). */
export const PACKET_INSTANCE_BACKFILL_FIELD_KEYS = [
  "special_provisions",
  "seller_contribution",
  "option_fee",
  "earnest_money",
  "hoa_transfer_fee",
  "custom_contract_language",
  "transaction_notes",
  "listing_price",
  "buyer_specific_terms",
] as const;

/** @deprecated Use PACKET_INSTANCE_BACKFILL_FIELD_KEYS. Kept for migration references only. */
export const PACKET_INSTANCE_FIELD_KEY_HINTS = PACKET_INSTANCE_BACKFILL_FIELD_KEYS;

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
  "brokerage_license_number",
  "brokerage_email",
  "brokerage_city_state_zip",
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

const BUYER_CLIENT_CONTACT_FIELD_SUFFIXES = [
  ...CONTACT_FIELD_SUFFIXES,
  "phone_primary",
  "phone_secondary",
  "mailing_address_line_1",
  "mailing_address_line_2",
  "mailing_city",
  "mailing_state",
  "mailing_zip",
] as const;

const BUYER_CLIENT_CONTACT_INDICES = [1, 2] as const;

export const BUYER_CLIENT_CONTACT_SOURCE_PATHS =
  BUYER_CLIENT_CONTACT_INDICES.flatMap((index) =>
    BUYER_CLIENT_CONTACT_FIELD_SUFFIXES.map(
      (field) => `buyer_client_${index}.${field}` as const,
    ),
  );

export const PACKET_CONTACT_SOURCE_PATHS = [
  ...CONTACT_ROLE_PREFIXES.flatMap((role) =>
    CONTACT_ROLE_INDICES.flatMap((index) =>
      CONTACT_FIELD_SUFFIXES.map(
        (field) => `${role}_${index}.${field}` as const,
      ),
    ),
  ),
  ...BUYER_CLIENT_CONTACT_SOURCE_PATHS,
];

export const PACKET_PROPERTY_SOURCE_PATHS = [
  "address",
  "address_city",
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
  "property_address_city",
  "buyer_client_address",
  "buyer_client_city_state_zip",
  "brokerage_city_state_zip",
  "buyer_rep_agreement_between",
  "buyer_rep_retainer_will_not_apply",
  "buyer_rep_intermediary_status_no",
] as const;

export const STATIC_DEFAULT_SOURCE_PATHS = ["default_checked", "default_value"] as const;

const SOURCE_TYPE_LABELS: Record<FieldSourceType, string> = {
  settings_agent: "Settings · Agent profile",
  settings_brokerage: "Settings · Brokerage profile",
  packet_contact: "Packet contact",
  packet_property: "Packet property",
  packet: "Packet metadata",
  buyer_rep_details: "Buyer rep details",
  listing_agreement_details: "Listing agreement details",
  representation_agreement: "Representation agreement",
  static_default: "Static default",
  custom_resolver: "Custom resolver",
  manual_only: "Manual entry only",
  packet_instance: "Packet/form instance value",
};

export function isGloballyMappedSourceType(
  sourceType: string | null | undefined,
): sourceType is Exclude<FieldSourceType, "packet_instance"> {
  return (
    sourceType != null &&
    isFieldSourceType(sourceType) &&
    sourceType !== "packet_instance"
  );
}

export function getFieldSourceStatus(field: {
  source_type?: string | null;
}): FieldSourceStatus {
  if (field.source_type === "packet_instance") {
    return "packet_instance";
  }

  if (isGloballyMappedSourceType(field.source_type)) {
    return "globally_mapped";
  }

  return "unmapped";
}

export type FieldSourceStatusDisplay = {
  status: FieldSourceStatus;
  label: string;
  detail: string | null;
  helperText: string | null;
};

export function formatFieldSourceStatusDisplay(field: {
  field_key?: string | null;
  source_type?: string | null;
  source_path?: string | null;
  resolver_key?: string | null;
  fallback_value?: string | null;
}): FieldSourceStatusDisplay {
  const status = getFieldSourceStatus(field);

  if (status === "globally_mapped") {
    return {
      status,
      label: "Globally Mapped",
      detail: formatFieldSourceMappingCatalog(field),
      helperText: null,
    };
  }

  if (status === "packet_instance") {
    return {
      status,
      label: "Packet/Form Instance Value",
      detail: null,
      helperText:
        "This field is intentionally supplied on a per-packet basis and does not derive its value from a global source.",
    };
  }

  return {
    status,
    label: "Unmapped",
    detail: null,
    helperText: "This field does not currently have a configured value source.",
  };
}

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
    case "buyer_rep_details":
      return BUYER_REP_DETAILS_SOURCE_PATHS;
    case "representation_agreement":
      return REPRESENTATION_AGREEMENT_SOURCE_PATHS;
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
    sourceType === "buyer_rep_details" ||
    sourceType === "representation_agreement" ||
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
  return (
    sourceType === "static_default" ||
    sourceType === "manual_only" ||
    sourceType === "packet_instance"
  );
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
  field_key?: string | null;
  source_type?: string | null;
  source_path?: string | null;
  resolver_key?: string | null;
  fallback_value?: string | null;
}): string {
  const statusDisplay = formatFieldSourceStatusDisplay(field);
  if (statusDisplay.status !== "globally_mapped") {
    return statusDisplay.label;
  }

  if (!field.source_type) {
    return statusDisplay.label;
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
  field_key?: string | null;
  source_type?: string | null;
  source_path?: string | null;
  resolver_key?: string | null;
  fallback_value?: string | null;
}): string | null {
  if (!field.source_type?.trim()) {
    return null;
  }

  const sourceType = field.source_type.trim();

  if (sourceType === "packet_instance") {
    return "packet_instance";
  }

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
