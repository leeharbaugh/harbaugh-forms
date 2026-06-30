import {
  BUYER_REP_DETAILS_SOURCE_PATHS,
  REPRESENTATION_AGREEMENT_SOURCE_PATHS,
} from "@/lib/types/buyer-rep-field-resolution";
import { CONTRACT_DETAILS_SOURCE_PATHS } from "@/lib/types/contract-field-resolution";
import {
  formatPacketContactSourcePathMappingLabel,
  formatPacketContactSourcePathOptionLabel,
  getPacketContactSourcePathMeta,
  getPacketContactSourcePathOptions,
  PACKET_CONTACT_SOURCE_PATHS,
} from "@/lib/types/packet-contact-source-paths";
import {
  formatPacketPropertySourcePathMappingLabel,
  getPacketPropertySourcePathMeta,
  getPacketPropertySourcePathOptions,
  isValidPacketPropertySourcePath,
  PACKET_PROPERTY_SOURCE_PATHS,
  formatPacketPropertySourcePathOptionLabel,
} from "@/lib/types/packet-property-source-paths";

export { BUYER_REP_DETAILS_SOURCE_PATHS, REPRESENTATION_AGREEMENT_SOURCE_PATHS };
export { CONTRACT_DETAILS_SOURCE_PATHS } from "@/lib/types/contract-field-resolution";
export {
  formatPacketContactSourcePathMappingLabel,
  formatPacketContactSourcePathOptionLabel,
  getPacketContactSourcePathMeta,
  getPacketContactSourcePathOptions,
  isValidPacketContactSourcePath,
  PACKET_CONTACT_SOURCE_PATHS,
} from "@/lib/types/packet-contact-source-paths";
export {
  formatPacketPropertySourcePathLabel,
  formatPacketPropertySourcePathMappingLabel,
  formatPacketPropertySourcePathOptionLabel,
  getPacketPropertySourcePathMeta,
  getPacketPropertySourcePathOptions,
  isValidPacketPropertySourcePath,
  PACKET_PROPERTY_CANONICAL_SOURCE_PATHS,
  PACKET_PROPERTY_SOURCE_PATHS,
} from "@/lib/types/packet-property-source-paths";

export const FIELD_SOURCE_TYPES = [
  "settings_agent",
  "settings_brokerage",
  "packet_contact",
  "packet_property",
  "packet",
  "buyer_rep_details",
  "listing_agreement_details",
  "contract_details",
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
  "supervisor_name",
  "supervisor_license_number",
  "supervisor_phone",
  "supervisor_email",
] as const;

export { BUYER_CLIENT_CONTACT_SOURCE_PATHS } from "@/lib/types/packet-contact-source-paths";

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
  "property_address_street_zip",
  "seller_names",
  "buyer_names",
  "contract_survey_option_seller_existing",
  "contract_survey_option_buyer_new",
  "contract_survey_option_seller_new",
  "contract_effective_day",
  "contract_effective_month",
  "contract_effective_year",
  "buyer_notice_address",
  "buyer_notice_phone",
  "buyer_notice_email",
  "seller_notice_address",
  "seller_notice_phone",
  "seller_notice_email",
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
  contract_details: "Contract details",
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
    case "contract_details":
      return CONTRACT_DETAILS_SOURCE_PATHS;
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
    sourceType === "contract_details" ||
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

    const trimmedPath = input.source_path.trim();

    if (input.source_type === "packet_property") {
      if (!isValidPacketPropertySourcePath(trimmedPath)) {
        return "Enter a valid packet property source path (for example, full_address or street_address).";
      }
    } else {
      const allowed = sourcePathsForType(input.source_type);
      if (allowed.length > 0 && !allowed.includes(trimmedPath)) {
        return "Select a valid source path for the selected value source.";
      }
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
    if (field.source_type === "packet_property") {
      return `${typeLabel} → ${formatPacketPropertySourcePathMappingLabel(field.source_path)}`;
    }

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
  if (!sourcePath) {
    return sourceType;
  }

  if (sourceType === "packet_property") {
    return `${sourceType} → ${formatPacketPropertySourcePathMappingLabel(sourcePath)}`;
  }

  if (sourceType === "packet_contact") {
    return `${sourceType} → ${formatPacketContactSourcePathMappingLabel(sourcePath)}`;
  }

  return `${sourceType} → ${sourcePath}`;
}

export const SOURCE_PATH_PRESET_CUSTOM_LEGACY = "__custom_legacy__";

export function resolveSourcePathPresetValue(
  sourceType: FieldSourceType | "",
  sourcePath: string | null | undefined,
): string {
  const trimmed = sourcePath?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  const options = sourcePathDropdownOptionsForType(sourceType, trimmed);
  const normalized = trimmed.toLowerCase();
  const match = options.find(
    (option) =>
      option.value === trimmed || option.value.toLowerCase() === normalized,
  );

  if (match) {
    return match.value;
  }

  return SOURCE_PATH_PRESET_CUSTOM_LEGACY;
}

export function formatSourcePathCustomLegacyLabel(
  sourcePath: string | null | undefined,
): string {
  const trimmed = sourcePath?.trim();
  return trimmed ? `Custom / legacy: ${trimmed}` : "Custom / legacy path";
}

export function sourcePathDropdownOptionsForType(
  sourceType: FieldSourceType | "",
  currentValue?: string | null,
): Array<{ value: string; label: string }> {
  if (sourceType === "packet_property") {
    return getPacketPropertySourcePathOptions(currentValue).map((option) => ({
      value: option.value,
      label: formatPacketPropertySourcePathOptionLabel(option),
    }));
  }

  if (sourceType === "packet_contact") {
    return getPacketContactSourcePathOptions(currentValue).map((option) => ({
      value: option.value,
      label: formatPacketContactSourcePathOptionLabel(option),
    }));
  }

  return sourcePathsForType(sourceType).map((path) => ({
    value: path,
    label: path,
  }));
}

export function formatSourcePathDisplay(
  sourceType: string | null | undefined,
  sourcePath: string | null | undefined,
): {
  rawPath: string;
  friendlyLabel: string | null;
  example: string | null;
} {
  const rawPath = sourcePath?.trim() ?? "";
  if (!rawPath) {
    return { rawPath: "", friendlyLabel: null, example: null };
  }

  if (sourceType === "packet_property") {
    const meta = getPacketPropertySourcePathMeta(rawPath);
    return {
      rawPath,
      friendlyLabel: meta
        ? formatPacketPropertySourcePathMappingLabel(rawPath)
        : rawPath,
      example: meta?.example ?? null,
    };
  }

  if (sourceType === "packet_contact") {
    const meta = getPacketContactSourcePathMeta(rawPath);
    return {
      rawPath,
      friendlyLabel: meta
        ? formatPacketContactSourcePathMappingLabel(rawPath)
        : rawPath,
      example: meta?.example ?? null,
    };
  }

  return {
    rawPath,
    friendlyLabel: rawPath,
    example: null,
  };
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
