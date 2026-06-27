import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FIELD_INSTANCE_SELECT,
  getPacketFormFieldContext,
  isCheckboxWidgetType,
  loadActiveFieldInstancesForPacketForm,
  loadActiveFormFieldMappingsForForm,
} from "@/lib/field-instances";
import type { Field } from "@/lib/types/field";
import { isFieldSourceType } from "@/lib/types/field-source";
import { findActiveFieldByKey } from "@/lib/field-catalog";
import type { FormFieldMapping } from "@/lib/types/form-field-mapping";
import type {
  FieldInstance,
  FieldInstanceWithField,
} from "@/lib/types/field-instance";
import {
  isAuthentisignExcludedFieldKey,
  isAuthentisignExcludedFormFieldMapping,
} from "@/lib/types/authentisign-excluded-fields";
import {
  type BrokerageSettings,
  agentFullName,
  brokerFullName,
  fetchActiveBrokerageSettings,
  resolveBrokerageSettingsField,
} from "@/lib/types/brokerage-settings";
import {
  type Contact,
  formatContactDisplayName,
} from "@/lib/types/contact";
import {
  formatPacketContactResolvedFieldValue,
  normalizePacketContactFieldSuffix,
} from "@/lib/types/packet-contact-source-paths";
import {
  type PacketContact,
  type PacketContactRole,
  getBuyerClientContactAtIndex,
  getOrderedBuyerClientContacts,
  getPrimaryBuyerClientContact,
  parseBuyerClientIndexSlug,
  sortPacketContacts,
} from "@/lib/types/packet-contact";
import type { Packet } from "@/lib/types/packet";
import {
  formatPropertyResolvedFieldValue,
  normalizePacketPropertySourcePath,
} from "@/lib/types/packet-property-source-paths";
import type { Property } from "@/lib/types/property";
import { formatPropertyAddressCity } from "@/lib/types/property";
import {
  type PropertyHoa,
  isPropertyHoaResolverKey,
  pickPrimaryPropertyHoa,
  resolvePropertyHoaFieldValue,
} from "@/lib/types/property-hoa";
import {
  type BuyerRepDetails,
} from "@/lib/types/buyer-rep-agreement";
import {
  formatBrokerageCityStateZip,
  formatBuyerRepAgreementBetween,
  isBooleanBuyerRepDetailsSourcePath,
  isBuyerRepDetailsSourcePath,
  isRepresentationAgreementSourcePath,
  resolveBuyerRepDetailsFieldValue,
  resolveBuyerRepCheckboxMatches,
} from "@/lib/types/buyer-rep-field-resolution";
import {
  isBooleanListingAgreementDetailsSourcePath,
  isListingAgreementDetailsSourcePath,
  resolveListingAgreementDetailsFieldValue,
  resolveListingBrokerNoCoopOtherSelected,
  resolveListingBrokerNoCoopPercentOrFlatFeeSelected,
  resolveSellerIsNotForeignPerson,
  type ListingAgreementDetailsRow,
} from "@/lib/types/listing-agreement-field-resolution";

export type FieldResolverSource =
  | "manual_override"
  | "contact_role"
  | "property"
  | "packet"
  | "settings"
  | "mapping_override"
  | "fallback"
  | "field_default"
  | "field_default_checked"
  | "empty";

export type ResolvedFieldValue = {
  value: string;
  value_json: Record<string, unknown> | null;
  source: FieldResolverSource;
};

export type FieldResolverContext = {
  packetId: number;
  packetFormId?: number;
  packet: Pick<
    Packet,
    | "id"
    | "property_id"
    | "label"
    | "packet_type"
    | "create_date"
    | "representation_agreement_id"
  > & {
    properties?: Property | null;
  };
  packetContacts: PacketContact[];
  settings: BrokerageSettings | null;
  representationAgreement: {
    effective_date: string | null;
    expiration_date: string | null;
  } | null;
  buyerRepDetails: BuyerRepDetails | null;
  listingAgreementDetails: ListingAgreementDetailsRow | null;
  propertyHoas: PropertyHoa[];
};

const NUMBERED_CONTACT_ROLE_PREFIXES = [
  "buyer",
  "seller",
  "tenant",
  "landlord",
] as const;

const ROLE_PREFIX_TO_PACKET_ROLE: Record<
  (typeof NUMBERED_CONTACT_ROLE_PREFIXES)[number],
  PacketContactRole
> = {
  buyer: "BUYER",
  seller: "SELLER",
  tenant: "TENANT",
  landlord: "LANDLORD",
};

function normalizeContactFieldName(contactField: string): string {
  if (contactField === "phone") {
    return "phone_primary";
  }

  return contactField;
}

function resolveContactFieldValue(
  contact: Contact,
  contactField: string,
): string {
  const normalized = normalizeContactFieldName(contactField);
  const suffix = normalizePacketContactFieldSuffix(normalized);
  if (!suffix) {
    return "";
  }

  return formatPacketContactResolvedFieldValue(contact, suffix);
}

const isPropertyResolverDebugEnabled =
  process.env.NODE_ENV === "development";

function logPropertyResolutionDebug(
  message: string,
  details: Record<string, unknown>,
): void {
  if (!isPropertyResolverDebugEnabled) {
    return;
  }

  console.debug(`[field-resolver:property] ${message}`, details);
}

export type FieldResolutionDiagnostic = {
  field_key: string;
  source_type: string | null;
  source_path: string | null;
  resolved_value: string;
  resolver_source: FieldResolverSource;
  packet_property_exists: boolean;
};

const PACKET_RESOLVER_SELECT = `
  id,
  property_id,
  label,
  packet_type,
  create_date,
  representation_agreement_id,
  properties(*),
  representation_agreements(
    effective_date,
    expiration_date,
    property_id,
    buyer_rep_details(*),
    listing_agreement_details(*)
  ),
  packet_contacts(
    id,
    packet_id,
    contact_id,
    packet_role,
    sort_order,
    status,
    contacts(*)
  )
`;

export function normalizeFieldKey(fieldKey: string): string {
  return fieldKey.trim().toLowerCase();
}

export function buildAgentFullName(
  settings: Pick<
    BrokerageSettings,
    "agent_first_name" | "agent_middle_name" | "agent_last_name"
  >,
): string {
  return agentFullName(settings);
}

export function buildBrokerFullName(
  settings: Pick<
    BrokerageSettings,
    "broker_first_name" | "broker_middle_name" | "broker_last_name"
  >,
): string {
  return brokerFullName(settings);
}

export function getPacketContactByRole(
  packetContacts: PacketContact[],
  role: string,
): Contact | null {
  const parsed = parseNumberedContactRoleSlug(role);
  if (!parsed) {
    return null;
  }

  const activeContacts = sortPacketContacts(
    packetContacts.filter((row) => row.status === "ACTIVE"),
  );

  const match = activeContacts.find(
    (row) =>
      row.packet_role === parsed.packetRole &&
      row.sort_order === parsed.sortOrder,
  );

  return match?.contacts ?? null;
}

export function normalizeDateDisplay(value: string | null | undefined): string {
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

function parseNumberedContactRoleSlug(role: string): {
  packetRole: PacketContactRole;
  sortOrder: number;
} | null {
  const normalized = role.trim().toLowerCase();
  const match = normalized.match(
    /^(buyer|seller|tenant|landlord)_(\d+)$/,
  );

  if (!match) {
    return null;
  }

  const prefix = match[1] as (typeof NUMBERED_CONTACT_ROLE_PREFIXES)[number];
  const index = Number(match[2]);

  if (!Number.isFinite(index) || index < 1) {
    return null;
  }

  return {
    packetRole: ROLE_PREFIX_TO_PACKET_ROLE[prefix],
    sortOrder: index - 1,
  };
}

type ParsedPacketContactSourcePath =
  | {
      kind: "buyer_client";
      index: number;
      contactField: string;
    }
  | {
      kind: "numbered_role";
      roleSlug: string;
      contactField: string;
    };

function parsePacketContactSourcePath(
  sourcePath: string,
): ParsedPacketContactSourcePath | null {
  const trimmed = sourcePath.trim();
  const dotMatch = trimmed.match(/^([a-z0-9_]+)\.([a-z_]+)$/i);
  if (!dotMatch) {
    return null;
  }

  const slug = dotMatch[1].toLowerCase();
  const contactField = normalizeContactFieldName(dotMatch[2].toLowerCase());

  const buyerClientIndex = parseBuyerClientIndexSlug(slug);
  if (buyerClientIndex != null) {
    return {
      kind: "buyer_client",
      index: buyerClientIndex,
      contactField,
    };
  }

  if (parseNumberedContactRoleSlug(slug)) {
    return {
      kind: "numbered_role",
      roleSlug: slug,
      contactField,
    };
  }

  return null;
}

function parseContactRoleFieldKey(fieldKey: string): {
  roleSlug: string;
  contactField: string;
} | null {
  const normalized = normalizeFieldKey(fieldKey);

  for (const prefix of NUMBERED_CONTACT_ROLE_PREFIXES) {
    const match = normalized.match(
      new RegExp(`^(${prefix}_\\d+)_(.+)$`),
    );
    if (match) {
      return {
        roleSlug: match[1],
        contactField: normalizeContactFieldName(match[2]),
      };
    }
  }

  return null;
}

function resolvePacketContactSourcePath(
  sourcePath: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const parsed = parsePacketContactSourcePath(sourcePath);
  if (!parsed) {
    return null;
  }

  const contact =
    parsed.kind === "buyer_client"
      ? getBuyerClientContactAtIndex(context.packetContacts, parsed.index)
      : getPacketContactByRole(context.packetContacts, parsed.roleSlug);

  if (!contact) {
    return null;
  }

  const value = resolveContactFieldValue(contact, parsed.contactField);
  if (!value) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "contact_role",
  };
}

function resolveBuyerClientContactField(
  contact: Contact,
  fieldSuffix: string,
): string | null {
  const suffix = normalizePacketContactFieldSuffix(
    normalizeContactFieldName(fieldSuffix),
  );
  if (!suffix) {
    return null;
  }

  const value = formatPacketContactResolvedFieldValue(contact, suffix);
  return value || null;
}

function resolveBuyerRepAgreementCheckboxFieldKey(
  fieldKey: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const normalized = normalizeFieldKey(fieldKey);
  const details = context.buyerRepDetails;

  let matches: boolean | null = null;

  switch (normalized) {
    case "buyer_rep_retainer_will_apply":
      matches = details
        ? resolveBuyerRepCheckboxMatches(details, "retainer_applies_to_fee", true)
        : null;
      break;
    case "buyer_rep_retainer_will_not_apply":
      matches = details
        ? resolveBuyerRepCheckboxMatches(details, "retainer_applies_to_fee", false)
        : null;
      break;
    case "buyer_rep_intermediary_status_yes":
      matches = details
        ? resolveBuyerRepCheckboxMatches(details, "intermediary_allowed", true)
        : null;
      break;
    case "buyer_rep_intermediary_status_no":
      matches = details
        ? resolveBuyerRepCheckboxMatches(details, "intermediary_allowed", false)
        : null;
      break;
    default:
      return null;
  }

  if (matches == null) {
    return null;
  }

  return resolveBuyerRepCheckboxValue(matches);
}

function resolveBuyerClientFieldKey(
  fieldKey: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const normalized = normalizeFieldKey(fieldKey);

  if (
    isAuthentisignExcludedFieldKey(normalized) ||
    !normalized.startsWith("buyer_client_")
  ) {
    return null;
  }

  const nameMatch = normalized.match(/^buyer_client_name_(\d+)$/);
  if (nameMatch) {
    const index = Number(nameMatch[1]);
    if (index !== 1 && index !== 2) {
      return null;
    }

    const contact = getBuyerClientContactAtIndex(context.packetContacts, index);
    if (!contact) {
      return null;
    }

    const value = formatContactDisplayName(contact);
    if (!value) {
      return null;
    }

    return {
      value,
      value_json: null,
      source: "contact_role",
    };
  }

  const fieldSuffix = normalized.slice("buyer_client_".length);
  if (!fieldSuffix || fieldSuffix.startsWith("name_")) {
    return null;
  }

  const contact = getPrimaryBuyerClientContact(context.packetContacts);
  if (!contact) {
    return null;
  }

  const value = resolveBuyerClientContactField(contact, fieldSuffix);
  if (!value) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "contact_role",
  };
}

function resolvePropertyAddressCity(
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const property = context.packet.properties;
  if (!property) {
    return null;
  }

  const value = formatPropertyAddressCity(property);
  if (!value) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "property",
  };
}

function resolvePropertySourcePath(
  sourcePath: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const property = context.packet.properties;
  const normalizedPath = sourcePath.trim().toLowerCase();

  if (!property) {
    logPropertyResolutionDebug("no packet property for source_path", {
      source_path: normalizedPath,
      property_id: context.packet.property_id,
      packet_id: context.packetId,
    });
    return null;
  }

  const mappedField = normalizePacketPropertySourcePath(sourcePath);

  if (!mappedField) {
    logPropertyResolutionDebug("unmapped property source_path", {
      source_path: normalizedPath,
      property_id: property.id,
    });
    return null;
  }

  const value = formatPropertyResolvedFieldValue(property, mappedField);

  if (!value) {
    logPropertyResolutionDebug("empty property field value", {
      source_path: normalizedPath,
      mapped_field: mappedField,
      property_id: property.id,
    });
    return null;
  }

  return {
    value,
    value_json: null,
    source: "property",
  };
}

function resolvePacketMetadataSourcePath(
  sourcePath: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const normalizedPath = sourcePath.trim().toLowerCase();
  const { packet, representationAgreement } = context;

  let value = "";

  switch (normalizedPath) {
    case "packet_name":
      value = packet.label ?? "";
      break;
    case "packet_type":
      value = packet.packet_type ?? "";
      break;
    case "created_date":
      value = packet.create_date
        ? normalizeDateDisplay(packet.create_date.split("T")[0])
        : "";
      break;
    case "effective_date":
      value = representationAgreement?.effective_date
        ? normalizeDateDisplay(
            representationAgreement.effective_date.split("T")[0],
          )
        : "";
      break;
    case "expiration_date":
      value = representationAgreement?.expiration_date
        ? normalizeDateDisplay(
            representationAgreement.expiration_date.split("T")[0],
          )
        : "";
      break;
    default:
      return null;
  }

  if (!value) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "packet",
  };
}

function resolveSettingsSourcePath(
  sourcePath: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  if (!context.settings) {
    return null;
  }

  const value = resolveBrokerageSettingsField(
    context.settings,
    sourcePath.trim().toLowerCase(),
  );

  if (!value?.trim()) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "settings",
  };
}

function resolvePropertyHoaResolverKey(
  resolverKey: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  if (!isPropertyHoaResolverKey(resolverKey)) {
    return null;
  }

  const hoa = pickPrimaryPropertyHoa(context.propertyHoas);
  const value = resolvePropertyHoaFieldValue(resolverKey, hoa);

  if (!value) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "property",
  };
}

function resolveBuyerRepCheckboxValue(checked: boolean): ResolvedFieldValue {
  return {
    value: checked ? "true" : "false",
    value_json: { checked },
    source: "packet",
  };
}

function resolveBuyerRepDetailsSourcePath(
  sourcePath: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const details = context.buyerRepDetails;
  if (!details) {
    return null;
  }

  const normalizedPath = sourcePath.trim().toLowerCase();
  if (!isBuyerRepDetailsSourcePath(normalizedPath)) {
    return null;
  }

  if (isBooleanBuyerRepDetailsSourcePath(normalizedPath)) {
    const checked =
      normalizedPath === "retainer_applies_to_fee" ||
      normalizedPath === "intermediary_allowed"
        ? resolveBuyerRepCheckboxMatches(
            details,
            normalizedPath,
            true,
          )
        : details[normalizedPath as keyof BuyerRepDetails] === true;

    return resolveBuyerRepCheckboxValue(checked);
  }

  const value = resolveBuyerRepDetailsFieldValue(details, normalizedPath);
  if (!value) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "packet",
  };
}

function resolveListingAgreementDetailsSourcePath(
  sourcePath: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const details = context.listingAgreementDetails;
  if (!details) {
    return null;
  }

  const normalizedPath = sourcePath.trim().toLowerCase();
  if (!isListingAgreementDetailsSourcePath(normalizedPath)) {
    return null;
  }

  if (isBooleanListingAgreementDetailsSourcePath(normalizedPath)) {
    const value = resolveListingAgreementDetailsFieldValue(details, normalizedPath);
    return resolveBuyerRepCheckboxValue(value === "true");
  }

  const value = resolveListingAgreementDetailsFieldValue(details, normalizedPath);
  if (!value) {
    return null;
  }

  const displayValue =
    normalizedPath === "listing_begin_date" ||
    normalizedPath === "listing_end_date"
      ? normalizeDateDisplay(value.split("T")[0])
      : value;

  if (!displayValue) {
    return null;
  }

  return {
    value: displayValue,
    value_json: null,
    source: "packet",
  };
}

function resolveRepresentationAgreementSourcePath(
  sourcePath: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const normalizedPath = sourcePath.trim().toLowerCase();
  if (!isRepresentationAgreementSourcePath(normalizedPath)) {
    return null;
  }

  const agreement = context.representationAgreement;
  if (!agreement) {
    return null;
  }

  const rawValue = agreement[normalizedPath];
  if (!rawValue) {
    return null;
  }

  const value = normalizeDateDisplay(rawValue.split("T")[0]);
  if (!value) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "packet",
  };
}

function resolveCustomResolverKey(
  resolverKey: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const normalizedKey = resolverKey.trim().toLowerCase();
  const hoaResolved = resolvePropertyHoaResolverKey(normalizedKey, context);

  if (hoaResolved) {
    return hoaResolved;
  }

  if (isPropertyHoaResolverKey(normalizedKey)) {
    return null;
  }

  if (normalizedKey === "buyer_client_address") {
    const contact = getPrimaryBuyerClientContact(context.packetContacts);
    if (!contact) {
      return null;
    }

    const value = resolveBuyerClientContactField(contact, "address");
    if (!value) {
      return null;
    }

    return {
      value,
      value_json: null,
      source: "contact_role",
    };
  }

  if (normalizedKey === "buyer_client_city_state_zip") {
    const contact = getPrimaryBuyerClientContact(context.packetContacts);
    if (!contact) {
      return null;
    }

    const value = resolveBuyerClientContactField(contact, "city_state_zip");
    if (!value) {
      return null;
    }

    return {
      value,
      value_json: null,
      source: "contact_role",
    };
  }

  if (normalizedKey === "brokerage_city_state_zip") {
    if (!context.settings) {
      return null;
    }

    const value = formatBrokerageCityStateZip(context.settings);
    if (!value) {
      return null;
    }

    return {
      value,
      value_json: null,
      source: "settings",
    };
  }

  if (normalizedKey === "buyer_rep_agreement_between") {
    const buyerNames = getOrderedBuyerClientContacts(context.packetContacts).map(
      (contact) => formatContactDisplayName(contact),
    );
    const value = formatBuyerRepAgreementBetween(
      buyerNames,
      context.settings?.brokerage_name,
    );

    if (!value) {
      return null;
    }

    return {
      value,
      value_json: null,
      source: "contact_role",
    };
  }

  if (normalizedKey === "property_address_city") {
    return resolvePropertyAddressCity(context);
  }

  if (normalizedKey === "buyer_rep_retainer_will_not_apply") {
    const details = context.buyerRepDetails;
    if (!details) {
      return null;
    }

    return resolveBuyerRepCheckboxValue(
      resolveBuyerRepCheckboxMatches(details, "retainer_applies_to_fee", false),
    );
  }

  if (normalizedKey === "buyer_rep_intermediary_status_no") {
    const details = context.buyerRepDetails;
    if (!details) {
      return null;
    }

    return resolveBuyerRepCheckboxValue(
      resolveBuyerRepCheckboxMatches(details, "intermediary_allowed", false),
    );
  }

  if (normalizedKey === "buyer_rep_retainer_will_apply") {
    const details = context.buyerRepDetails;
    if (!details) {
      return null;
    }

    return resolveBuyerRepCheckboxValue(
      resolveBuyerRepCheckboxMatches(details, "retainer_applies_to_fee", true),
    );
  }

  if (normalizedKey === "buyer_rep_intermediary_status_yes") {
    const details = context.buyerRepDetails;
    if (!details) {
      return null;
    }

    return resolveBuyerRepCheckboxValue(
      resolveBuyerRepCheckboxMatches(details, "intermediary_allowed", true),
    );
  }

  if (normalizedKey === "agent_full_name") {
    if (!context.settings) {
      return null;
    }

    const value = agentFullName(context.settings);
    if (!value) {
      return null;
    }

    return {
      value,
      value_json: null,
      source: "settings",
    };
  }

  if (normalizedKey === "broker_full_name") {
    if (!context.settings) {
      return null;
    }

    const value = brokerFullName(context.settings);
    if (!value) {
      return null;
    }

    return {
      value,
      value_json: null,
      source: "settings",
    };
  }

  const listingDetails = context.listingAgreementDetails;
  if (listingDetails) {
    if (normalizedKey === "seller_is_not_foreign_person") {
      return resolveBuyerRepCheckboxValue(
        resolveSellerIsNotForeignPerson(listingDetails),
      );
    }

    if (normalizedKey === "listing_broker_no_coop_other_selected") {
      return resolveBuyerRepCheckboxValue(
        resolveListingBrokerNoCoopOtherSelected(listingDetails),
      );
    }

    if (normalizedKey === "listing_broker_no_coop_percent_or_flat_fee_selected") {
      return resolveBuyerRepCheckboxValue(
        resolveListingBrokerNoCoopPercentOrFlatFeeSelected(listingDetails),
      );
    }
  }

  return null;
}

function resolveStaticDefaultSource(field: Field): ResolvedFieldValue | null {
  const sourcePath = field.source_path?.trim().toLowerCase() ?? "";
  const fallback = field.fallback_value?.trim() ?? "";

  if (sourcePath === "default_checked") {
    const checked =
      fallback === "true" ||
      fallback === "1" ||
      field.default_checked === true;

    return {
      value: checked ? "true" : "false",
      value_json: { checked },
      source: fallback ? "fallback" : "field_default_checked",
    };
  }

  if (fallback) {
    return {
      value: fallback,
      value_json: null,
      source: "fallback",
    };
  }

  return null;
}

function resolveFromFieldSourceMapping(
  field: Field,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  if (!field.source_type || !isFieldSourceType(field.source_type)) {
    return null;
  }

  switch (field.source_type) {
    case "settings_agent":
    case "settings_brokerage":
      return field.source_path
        ? resolveSettingsSourcePath(field.source_path, context)
        : null;
    case "packet_contact":
      return field.source_path
        ? resolvePacketContactSourcePath(field.source_path, context)
        : null;
    case "packet_property":
      if (
        field.resolver_key?.trim().toLowerCase() === "property_address_city"
      ) {
        return resolvePropertyAddressCity(context);
      }
      return field.source_path
        ? resolvePropertySourcePath(field.source_path, context)
        : null;
    case "packet":
      return field.source_path
        ? resolvePacketMetadataSourcePath(field.source_path, context)
        : null;
    case "buyer_rep_details":
      return field.source_path
        ? resolveBuyerRepDetailsSourcePath(field.source_path, context)
        : null;
    case "listing_agreement_details":
      return field.source_path
        ? resolveListingAgreementDetailsSourcePath(field.source_path, context)
        : null;
    case "representation_agreement":
      return field.source_path
        ? resolveRepresentationAgreementSourcePath(field.source_path, context)
        : null;
    case "static_default":
      return resolveStaticDefaultSource(field);
    case "custom_resolver":
      return field.resolver_key
        ? resolveCustomResolverKey(field.resolver_key, context)
        : null;
    case "manual_only":
      return null;
    case "packet_instance":
      return null;
    default:
      return null;
  }
}

function isDateField(field: Pick<Field, "field_data_type" | "field_widget_type">): boolean {
  return (
    field.field_data_type?.toLowerCase() === "date" ||
    field.field_widget_type?.toLowerCase() === "date"
  );
}

function isBooleanField(field: Pick<Field, "field_data_type" | "field_widget_type">): boolean {
  return (
    field.field_data_type?.toLowerCase() === "boolean" ||
    isCheckboxWidgetType(field.field_widget_type)
  );
}

function resolvePacketInstanceValue(params: {
  field: Field;
  mapping?: FormFieldMapping | null;
  existingInstance?: Pick<
    FieldInstance,
    "value" | "value_json" | "is_override"
  > | null;
}): ResolvedFieldValue {
  const { field, mapping, existingInstance } = params;

  if (existingInstance) {
    const instanceValue = existingInstance.value ?? "";
    if (instanceValue.trim() !== "") {
      return {
        value: instanceValue,
        value_json: existingInstance.value_json,
        source: "packet",
      };
    }

    if (
      isBooleanField(field) &&
      existingInstance.value_json &&
      typeof existingInstance.value_json.checked === "boolean"
    ) {
      const checked = existingInstance.value_json.checked === true;
      return {
        value: checked ? "true" : "false",
        value_json: existingInstance.value_json,
        source: "packet",
      };
    }
  }

  const fallback = field.fallback_value?.trim();
  if (fallback) {
    return {
      value: fallback,
      value_json: null,
      source: "fallback",
    };
  }

  if (isBooleanField(field)) {
    const checked = field.default_checked === true;
    return {
      value: checked ? "true" : "false",
      value_json: { checked },
      source: "field_default_checked",
    };
  }

  const defaultValue =
    field.default_value?.trim() || mapping?.default_value_override?.trim() || "";
  if (defaultValue) {
    return {
      value: defaultValue,
      value_json: null,
      source: "field_default",
    };
  }

  return {
    value: "",
    value_json: null,
    source: "empty",
  };
}

function resolveContactRoleFieldKey(
  fieldKey: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const parsed = parseContactRoleFieldKey(fieldKey);
  if (!parsed) {
    return null;
  }

  const contact = getPacketContactByRole(
    context.packetContacts,
    parsed.roleSlug,
  );

  if (!contact) {
    return null;
  }

  const value = resolveContactFieldValue(contact, parsed.contactField);
  if (!value) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "contact_role",
  };
}

function resolvePropertyHoaFieldKey(
  fieldKey: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  return resolvePropertyHoaResolverKey(normalizeFieldKey(fieldKey), context);
}

function resolvePropertyFieldKey(
  fieldKey: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  const normalized = normalizeFieldKey(fieldKey);
  if (!normalized.startsWith("property_")) {
    return null;
  }

  const property = context.packet.properties;
  if (!property) {
    return null;
  }

  const propertyField = normalized.slice("property_".length);

  const mappedField = normalizePacketPropertySourcePath(propertyField);

  if (!mappedField) {
    return null;
  }

  const value = formatPropertyResolvedFieldValue(property, mappedField);
  if (!value) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "property",
  };
}

function resolveSettingsFieldKey(
  fieldKey: string,
  context: FieldResolverContext,
): ResolvedFieldValue | null {
  if (!context.settings) {
    return null;
  }

  const normalized = normalizeFieldKey(fieldKey);
  const value = resolveBrokerageSettingsField(context.settings, normalized);

  if (!value?.trim()) {
    return null;
  }

  return {
    value,
    value_json: null,
    source: "settings",
  };
}

const CONTEXT_FIELD_KEY_HANDLERS: Array<
  (fieldKey: string, context: FieldResolverContext) => ResolvedFieldValue | null
> = [
  resolveBuyerRepAgreementCheckboxFieldKey,
  resolveBuyerClientFieldKey,
  resolveContactRoleFieldKey,
  resolvePropertyHoaFieldKey,
  resolvePropertyFieldKey,
  resolveSettingsFieldKey,
];

export function registerFieldKeyHandler(
  handler: (
    fieldKey: string,
    context: FieldResolverContext,
  ) => ResolvedFieldValue | null,
  priority: "before" | "after" = "before",
): void {
  if (priority === "before") {
    CONTEXT_FIELD_KEY_HANDLERS.unshift(handler);
  } else {
    CONTEXT_FIELD_KEY_HANDLERS.push(handler);
  }
}

function resolveDefaultChain(params: {
  field: Field;
  mapping?: FormFieldMapping | null;
}): ResolvedFieldValue {
  const { field, mapping } = params;
  const fallback = field.fallback_value?.trim();

  if (fallback) {
    if (field.source_path?.trim().toLowerCase() === "default_checked") {
      const checked = fallback === "true" || fallback === "1";
      return {
        value: checked ? "true" : "false",
        value_json: { checked },
        source: "fallback",
      };
    }

    return {
      value: fallback,
      value_json: null,
      source: "fallback",
    };
  }

  const mappingOverride = mapping?.default_value_override?.trim();

  if (mappingOverride) {
    return {
      value: mappingOverride,
      value_json: null,
      source: "mapping_override",
    };
  }

  const fieldDefault = field.default_value?.trim();
  if (fieldDefault) {
    return {
      value: fieldDefault,
      value_json: null,
      source: "field_default",
    };
  }

  const widgetType =
    mapping?.field_widget_type ?? field.field_widget_type ?? null;

  if (isCheckboxWidgetType(widgetType) && field.default_checked === true) {
    return {
      value: "true",
      value_json: { checked: true },
      source: "field_default_checked",
    };
  }

  if (isBooleanField(field)) {
    return {
      value: "false",
      value_json: { checked: false },
      source: "empty",
    };
  }

  return {
    value: "",
    value_json: null,
    source: "empty",
  };
}

function finalizeResolvedValue(
  resolved: ResolvedFieldValue,
  field: Field,
): ResolvedFieldValue {
  if (isDateField(field)) {
    return {
      ...resolved,
      value: normalizeDateDisplay(resolved.value),
    };
  }

  if (isBooleanField(field)) {
    const checked =
      resolved.value === "true" ||
      resolved.value === "1" ||
      resolved.value_json?.checked === true;

    return {
      value: checked ? "true" : "false",
      value_json: { checked },
      source: resolved.source,
    };
  }

  return resolved;
}

export function resolveFieldValueFromContext(params: {
  field: Field;
  mapping?: FormFieldMapping | null;
  context: FieldResolverContext;
  existingInstance?: Pick<
    FieldInstance,
    "value" | "value_json" | "is_override" | "source"
  > | null;
}): ResolvedFieldValue {
  const { field, mapping, context, existingInstance } = params;

  if (existingInstance?.is_override) {
    return finalizeResolvedValue(
      {
        value: existingInstance.value ?? "",
        value_json: existingInstance.value_json,
        source: "manual_override",
      },
      field,
    );
  }

  if (field.source_type === "manual_only") {
    return finalizeResolvedValue(
      resolveDefaultChain({ field, mapping }),
      field,
    );
  }

  if (field.source_type === "packet_instance") {
    return finalizeResolvedValue(
      resolvePacketInstanceValue({ field, mapping, existingInstance }),
      field,
    );
  }

  if (field.source_type) {
    const mapped = resolveFromFieldSourceMapping(field, context);
    if (mapped) {
      return finalizeResolvedValue(mapped, field);
    }

    return finalizeResolvedValue(
      resolveDefaultChain({ field, mapping }),
      field,
    );
  }

  const fieldKey = normalizeFieldKey(field.field_key);

  for (const handler of CONTEXT_FIELD_KEY_HANDLERS) {
    const resolved = handler(fieldKey, context);
    if (resolved) {
      return finalizeResolvedValue(resolved, field);
    }
  }

  return finalizeResolvedValue(
    resolveDefaultChain({ field, mapping }),
    field,
  );
}

function normalizePropertyJoin(
  raw: Property | Property[] | null | undefined,
): Property | null {
  if (!raw) {
    return null;
  }

  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

async function loadActivePropertyById(
  supabase: SupabaseClient,
  propertyId: number,
): Promise<Property | null> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as Property) ?? null;
}

async function resolvePacketPropertyForContext(
  supabase: SupabaseClient,
  packetRow: {
    property_id: number | null;
    representation_agreement_id: number | null;
    properties?: Property | Property[] | null;
    representation_agreements?:
      | { property_id?: number | null }
      | Array<{ property_id?: number | null }>
      | null;
  },
): Promise<Property | null> {
  const joinedProperty = normalizePropertyJoin(packetRow.properties);
  if (joinedProperty) {
    return joinedProperty;
  }

  if (packetRow.property_id != null) {
    const property = await loadActivePropertyById(
      supabase,
      packetRow.property_id,
    );
    if (property) {
      logPropertyResolutionDebug("loaded property by packet.property_id", {
        property_id: packetRow.property_id,
      });
      return property;
    }
  }

  const agreement = normalizeRepresentationAgreementPropertyJoin(
    packetRow.representation_agreements,
  );
  if (agreement?.property_id != null) {
    const property = await loadActivePropertyById(
      supabase,
      agreement.property_id,
    );
    if (property) {
      logPropertyResolutionDebug(
        "loaded property by representation_agreement.property_id",
        {
          property_id: agreement.property_id,
          representation_agreement_id: packetRow.representation_agreement_id,
        },
      );
      return property;
    }
  }

  return null;
}

function normalizeRepresentationAgreementPropertyJoin(
  raw:
    | { property_id?: number | null }
    | Array<{ property_id?: number | null }>
    | null
    | undefined,
): { property_id: number | null } | null {
  if (!raw) {
    return null;
  }

  const agreement = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!agreement) {
    return null;
  }

  return {
    property_id: agreement.property_id ?? null,
  };
}

export function buildFieldResolutionDiagnostics(params: {
  context: FieldResolverContext;
  fields: Array<{
    mapping: FormFieldMapping;
    instance: FieldInstanceWithField;
  }>;
}): FieldResolutionDiagnostic[] {
  const packetPropertyExists = params.context.packet.properties != null;

  return params.fields.map(({ mapping, instance }) => {
    const field = instance.fields;
    const fieldKey = field?.field_key ?? mapping.field_id;

    if (!field) {
      return {
        field_key: fieldKey,
        source_type: null,
        source_path: null,
        resolved_value: instance.value ?? "",
        resolver_source: (instance.source as FieldResolverSource) ?? "empty",
        packet_property_exists: packetPropertyExists,
      };
    }

    const resolved = resolveFieldValueFromContext({
      field,
      mapping,
      context: params.context,
      existingInstance: null,
    });

    return {
      field_key: field.field_key,
      source_type: field.source_type,
      source_path: field.source_path,
      resolved_value: resolved.value,
      resolver_source: resolved.source,
      packet_property_exists: packetPropertyExists,
    };
  });
}

function normalizeContactJoin(
  raw: Contact | Contact[] | null | undefined,
): Contact | null {
  if (!raw) {
    return null;
  }

  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function normalizePacketContactsJoin(
  raw: PacketContact[] | null | undefined,
): PacketContact[] {
  if (!raw) {
    return [];
  }

  return raw.map((row) => ({
    ...row,
    contacts: normalizeContactJoin(
      row.contacts as Contact | Contact[] | null | undefined,
    ),
  }));
}

function normalizeRepresentationAgreementJoin(
  raw:
    | { effective_date: string | null; expiration_date: string | null }
    | Array<{ effective_date: string | null; expiration_date: string | null }>
    | null
    | undefined,
): FieldResolverContext["representationAgreement"] {
  if (!raw) {
    return null;
  }

  const agreement = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!agreement) {
    return null;
  }

  return {
    effective_date: agreement.effective_date,
    expiration_date: agreement.expiration_date,
  };
}

async function loadActivePropertyHoasForProperty(
  supabase: SupabaseClient,
  propertyId: number | null | undefined,
): Promise<PropertyHoa[]> {
  if (propertyId == null) {
    return [];
  }

  const { data, error } = await supabase
    .from("property_hoas")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "ACTIVE")
    .order("create_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as PropertyHoa[]) ?? [];
}

export async function loadFieldResolverContext(
  supabase: SupabaseClient,
  packetId: number,
  packetFormId?: number,
): Promise<FieldResolverContext> {
  const [packetResult, settings] = await Promise.all([
    supabase
      .from("packets")
      .select(PACKET_RESOLVER_SELECT)
      .eq("id", packetId)
      .eq("status", "ACTIVE")
      .single(),
    fetchActiveBrokerageSettings(supabase),
  ]);

  if (packetResult.error || !packetResult.data) {
    throw new Error(packetResult.error?.message ?? "Packet not found.");
  }

  const packetRow = packetResult.data as unknown as Pick<
    Packet,
    | "id"
    | "property_id"
    | "label"
    | "packet_type"
    | "create_date"
    | "representation_agreement_id"
  > & {
    properties?: Property | Property[] | null;
    packet_contacts?: PacketContact[] | null;
    representation_agreements?:
      | {
          effective_date: string | null;
          expiration_date: string | null;
          property_id?: number | null;
          buyer_rep_details?:
            | BuyerRepDetails
            | BuyerRepDetails[]
            | null;
          listing_agreement_details?:
            | ListingAgreementDetailsRow
            | ListingAgreementDetailsRow[]
            | null;
        }
      | Array<{
          effective_date: string | null;
          expiration_date: string | null;
          property_id?: number | null;
          buyer_rep_details?:
            | BuyerRepDetails
            | BuyerRepDetails[]
            | null;
          listing_agreement_details?:
            | ListingAgreementDetailsRow
            | ListingAgreementDetailsRow[]
            | null;
        }>
      | null;
  };

  const property = await resolvePacketPropertyForContext(supabase, packetRow);

  const propertyHoas = await loadActivePropertyHoasForProperty(
    supabase,
    property?.id ?? packetRow.property_id,
  );

  if (
    packetRow.property_id != null &&
    !property &&
    isPropertyResolverDebugEnabled
  ) {
    console.debug(
      "[field-resolver:property] packet has property_id but property record was not found",
      {
        packet_id: packetRow.id,
        property_id: packetRow.property_id,
      },
    );
  }

  return {
    packetId,
    packetFormId,
    packet: {
      id: packetRow.id,
      property_id: packetRow.property_id,
      label: packetRow.label,
      packet_type: packetRow.packet_type,
      create_date: packetRow.create_date,
      representation_agreement_id: packetRow.representation_agreement_id,
      properties: property,
    },
    packetContacts: normalizePacketContactsJoin(packetRow.packet_contacts),
    settings,
    representationAgreement: normalizeRepresentationAgreementJoin(
      packetRow.representation_agreements,
    ),
    buyerRepDetails: normalizeBuyerRepDetailsJoin(packetRow.representation_agreements),
    listingAgreementDetails: normalizeListingAgreementDetailsJoin(
      packetRow.representation_agreements,
    ),
    propertyHoas,
  };
}

function normalizeListingAgreementDetailsJoin(
  raw:
    | {
        listing_agreement_details?:
          | ListingAgreementDetailsRow
          | ListingAgreementDetailsRow[]
          | null;
      }
    | Array<{
        listing_agreement_details?:
          | ListingAgreementDetailsRow
          | ListingAgreementDetailsRow[]
          | null;
      }>
    | null
    | undefined,
): ListingAgreementDetailsRow | null {
  if (!raw) {
    return null;
  }

  const agreement = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!agreement) {
    return null;
  }

  const details = agreement.listing_agreement_details;
  if (!details) {
    return null;
  }

  if (Array.isArray(details)) {
    return details[0] ?? null;
  }

  return details;
}

function normalizeBuyerRepDetailsJoin(
  raw:
    | {
        buyer_rep_details?: BuyerRepDetails | BuyerRepDetails[] | null;
      }
    | Array<{
        buyer_rep_details?: BuyerRepDetails | BuyerRepDetails[] | null;
      }>
    | null
    | undefined,
): BuyerRepDetails | null {
  if (!raw) {
    return null;
  }

  const agreement = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!agreement) {
    return null;
  }

  const details = agreement.buyer_rep_details;
  if (!details) {
    return null;
  }

  if (Array.isArray(details)) {
    return details[0] ?? null;
  }

  return details;
}

async function loadFieldForResolution(
  supabase: SupabaseClient,
  field: Field | string,
): Promise<Field> {
  if (typeof field !== "string") {
    return field;
  }

  const trimmed = field.trim();

  const { data: byId, error: byIdError } = await supabase
    .from("fields")
    .select("*")
    .eq("id", trimmed)
    .maybeSingle();

  if (byIdError) {
    throw new Error(byIdError.message);
  }

  if (byId) {
    return byId as Field;
  }

  const byKey = await findActiveFieldByKey(supabase, trimmed);
  if (!byKey) {
    throw new Error(`Field not found for identifier "${trimmed}".`);
  }

  return byKey;
}

export async function resolveFieldValue(
  supabase: SupabaseClient,
  packetId: number,
  packetFormId: number,
  field: Field | string,
  mapping?: FormFieldMapping | null,
): Promise<ResolvedFieldValue> {
  const resolvedField = await loadFieldForResolution(supabase, field);
  const [context, instances] = await Promise.all([
    loadFieldResolverContext(supabase, packetId, packetFormId),
    loadActiveFieldInstancesForPacketForm(supabase, packetFormId),
  ]);

  const existingInstance =
    instances.find((instance) => instance.field_id === resolvedField.id) ?? null;

  let mappingForField = mapping ?? null;
  if (!mappingForField) {
    const packetForm = await getPacketFormFieldContext(supabase, packetFormId);
    if (packetForm.form_id != null) {
      const mappings = await loadActiveFormFieldMappingsForForm(
        supabase,
        packetForm.form_id,
      );
      mappingForField =
        mappings.find((row) => row.field_id === resolvedField.id) ?? null;
    }
  }

  return resolveFieldValueFromContext({
    field: resolvedField,
    mapping: mappingForField,
    context,
    existingInstance,
  });
}

export async function revertFieldInstanceToResolvedValue(
  supabase: SupabaseClient,
  params: {
    packetId: number;
    packetFormId: number;
    fieldInstanceId: string;
  },
): Promise<FieldInstanceWithField> {
  const { data: instanceData, error: instanceError } = await supabase
    .from("field_instances")
    .select(FIELD_INSTANCE_SELECT)
    .eq("id", params.fieldInstanceId)
    .eq("packet_form_id", params.packetFormId)
    .eq("packet_id", params.packetId)
    .eq("status", "ACTIVE")
    .single();

  if (instanceError || !instanceData) {
    throw new Error(instanceError?.message ?? "Field instance not found.");
  }

  const instance = instanceData as FieldInstanceWithField;
  const field = instance.fields;
  if (!field) {
    throw new Error("Field catalog record not found for this instance.");
  }

  const packetForm = await getPacketFormFieldContext(
    supabase,
    params.packetFormId,
  );
  let mapping: FormFieldMapping | null = null;
  if (packetForm.form_id != null) {
    const mappings = await loadActiveFormFieldMappingsForForm(
      supabase,
      packetForm.form_id,
    );
    mapping = mappings.find((row) => row.field_id === field.id) ?? null;
  }

  const context = await loadFieldResolverContext(
    supabase,
    params.packetId,
    params.packetFormId,
  );

  const resolved = resolveFieldValueFromContext({
    field,
    mapping,
    context,
    existingInstance: null,
  });

  const { data: updated, error: updateError } = await supabase
    .from("field_instances")
    .update({
      value: resolved.value || null,
      value_json: resolved.value_json,
      source: resolved.source,
      is_override: false,
    })
    .eq("id", params.fieldInstanceId)
    .eq("status", "ACTIVE")
    .select(FIELD_INSTANCE_SELECT)
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? "Failed to revert field value.");
  }

  return updated as FieldInstanceWithField;
}

function buildFieldInstancePersistenceRow(params: {
  packetId: number;
  packetFormId: number;
  fieldId: string;
  resolved: ResolvedFieldValue;
}) {
  return {
    packet_id: params.packetId,
    packet_form_id: params.packetFormId,
    field_id: params.fieldId,
    value: params.resolved.value || null,
    value_json: params.resolved.value_json,
    source: params.resolved.source,
    is_override: false,
    notes: null,
  };
}

function shouldRefreshInstance(
  instance: FieldInstanceWithField,
  resolved: ResolvedFieldValue,
): boolean {
  if (instance.is_override) {
    return false;
  }

  const storedValue = instance.value ?? "";
  const storedSource = instance.source ?? "";
  const storedJson = JSON.stringify(instance.value_json ?? null);
  const resolvedJson = JSON.stringify(resolved.value_json ?? null);

  return (
    storedValue !== resolved.value ||
    storedSource !== resolved.source ||
    storedJson !== resolvedJson
  );
}

function isUniqueFieldInstanceViolation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" ||
    (error.message?.includes("field_instances_packet_form_field_active_uidx") ?? false)
  );
}

async function insertFieldInstancesForPacketForm(
  supabase: SupabaseClient,
  packetFormId: number,
  inserts: ReturnType<typeof buildFieldInstancePersistenceRow>[],
): Promise<FieldInstanceWithField[]> {
  if (inserts.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("field_instances")
    .insert(inserts)
    .select(FIELD_INSTANCE_SELECT);

  if (!error) {
    return (data as FieldInstanceWithField[]) ?? [];
  }

  if (!isUniqueFieldInstanceViolation(error)) {
    throw new Error(error.message);
  }

  const inserted: FieldInstanceWithField[] = [];
  const missingInserts = [...inserts];

  for (const row of missingInserts) {
    const { data: rowData, error: rowError } = await supabase
      .from("field_instances")
      .insert(row)
      .select(FIELD_INSTANCE_SELECT)
      .maybeSingle();

    if (!rowError && rowData) {
      inserted.push(rowData as FieldInstanceWithField);
      continue;
    }

    if (rowError && !isUniqueFieldInstanceViolation(rowError)) {
      throw new Error(rowError.message);
    }

    const { data: existing, error: existingError } = await supabase
      .from("field_instances")
      .select(FIELD_INSTANCE_SELECT)
      .eq("packet_form_id", packetFormId)
      .eq("field_id", row.field_id)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing) {
      inserted.push(existing as FieldInstanceWithField);
    }
  }

  return inserted;
}

const syncFieldInstancesInFlight = new Map<
  number,
  Promise<FieldInstanceWithField[]>
>();

export async function resolvePacketFormFieldValues(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<FieldInstanceWithField[]> {
  const packetForm = await getPacketFormFieldContext(supabase, packetFormId);

  if (packetForm.status !== "ACTIVE") {
    throw new Error("Field values can only be resolved for active packet forms.");
  }

  if (packetForm.form_id == null) {
    return [];
  }

  const [context, mappings, existingInstances] = await Promise.all([
    loadFieldResolverContext(supabase, packetForm.packet_id, packetFormId),
    loadActiveFormFieldMappingsForForm(supabase, packetForm.form_id),
    loadActiveFieldInstancesForPacketForm(supabase, packetFormId),
  ]);

  const instancesByFieldId = new Map(
    existingInstances.map((instance) => [instance.field_id, instance]),
  );

  const fieldIds = [...new Set(mappings.map((mapping) => mapping.field_id))];
  const inserts: ReturnType<typeof buildFieldInstancePersistenceRow>[] = [];
  const updates: Array<{
    id: string;
    resolved: ResolvedFieldValue;
  }> = [];

  for (const fieldId of fieldIds) {
    const mapping = mappings.find((row) => row.field_id === fieldId);
    const field = mapping?.fields;
    if (!field || (mapping && isAuthentisignExcludedFormFieldMapping(mapping))) {
      continue;
    }

    const existingInstance = instancesByFieldId.get(fieldId) ?? null;
    const resolved = resolveFieldValueFromContext({
      field,
      mapping,
      context,
      existingInstance,
    });

    if (!existingInstance) {
      inserts.push(
        buildFieldInstancePersistenceRow({
          packetId: packetForm.packet_id,
          packetFormId,
          fieldId,
          resolved,
        }),
      );
      continue;
    }

    if (shouldRefreshInstance(existingInstance, resolved)) {
      updates.push({
        id: existingInstance.id,
        resolved,
      });
    }
  }

  if (inserts.length > 0) {
    const inserted = await insertFieldInstancesForPacketForm(
      supabase,
      packetFormId,
      inserts,
    );

    for (const instance of inserted) {
      instancesByFieldId.set(instance.field_id, instance);
    }
  }

  for (const update of updates) {
    const { data, error } = await supabase
      .from("field_instances")
      .update({
        value: update.resolved.value || null,
        value_json: update.resolved.value_json,
        source: update.resolved.source,
        is_override: false,
      })
      .eq("id", update.id)
      .eq("status", "ACTIVE")
      .eq("is_override", false)
      .select(FIELD_INSTANCE_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const updated = data as FieldInstanceWithField;
    instancesByFieldId.set(updated.field_id, updated);
  }

  return fieldIds
    .map((fieldId) => instancesByFieldId.get(fieldId))
    .filter((instance): instance is FieldInstanceWithField => instance != null);
}

export async function syncFieldInstancesForPacketForm(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<FieldInstanceWithField[]> {
  const inFlight = syncFieldInstancesInFlight.get(packetFormId);
  if (inFlight) {
    return inFlight;
  }

  const promise = resolvePacketFormFieldValues(supabase, packetFormId).finally(() => {
    syncFieldInstancesInFlight.delete(packetFormId);
  });

  syncFieldInstancesInFlight.set(packetFormId, promise);
  return promise;
}
