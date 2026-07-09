import { dedupeSourcePathOptions } from "@/lib/types/source-path-options";
import {
  formatContactDisplayName,
  formatContactDateOfBirth,
} from "@/lib/types/contact";
import {
  formatContactCityStateZip,
  formatContactMailingAddress,
} from "@/lib/types/buyer-rep-field-resolution";

/** Direct contact column suffixes for role-prefixed packet_contact paths. */
export const PACKET_CONTACT_DIRECT_FIELD_SUFFIXES = [
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "preferred_name",
  "title",
  "entity_name",
  "entity_type",
  "email",
  "email_secondary",
  "phone_primary",
  "phone_secondary",
  "phone",
  "mailing_address_line_1",
  "mailing_address_line_2",
  "mailing_city",
  "mailing_state",
  "mailing_zip",
  "street_address_line_1",
  "street_address_line_2",
  "street_city",
  "street_state",
  "street_zip",
  "county",
  "preferred_contact_method",
  "company_name",
  "brokerage_name",
  "trec_license_number",
  "date_of_birth",
  "occupation",
  "notes",
] as const;

export type PacketContactDirectFieldSuffix =
  (typeof PACKET_CONTACT_DIRECT_FIELD_SUFFIXES)[number];

/** Alias suffixes excluded from dropdown presets; resolution still accepts them. */
export const PACKET_CONTACT_DROPDOWN_DIRECT_FIELD_SUFFIXES =
  PACKET_CONTACT_DIRECT_FIELD_SUFFIXES.filter((suffix) => suffix !== "phone");

/** Resolved via formatter, not a DB column. */
export const PACKET_CONTACT_COMPUTED_FIELD_SUFFIXES = [
  "full_name",
  "address",
  "city_state_zip",
] as const;

export type PacketContactComputedFieldSuffix =
  (typeof PACKET_CONTACT_COMPUTED_FIELD_SUFFIXES)[number];

export type PacketContactResolvableFieldSuffix =
  | PacketContactDirectFieldSuffix
  | PacketContactComputedFieldSuffix;

export const PACKET_CONTACT_ROLE_PREFIXES = [
  "buyer",
  "seller",
  "tenant",
  "landlord",
] as const;

export const PACKET_CONTACT_ROLE_INDICES = [1, 2] as const;

const BUYER_CLIENT_INDICES = [1, 2] as const;

const BUYER_CLIENT_FIELD_SUFFIXES = [
  ...PACKET_CONTACT_COMPUTED_FIELD_SUFFIXES,
  ...PACKET_CONTACT_DROPDOWN_DIRECT_FIELD_SUFFIXES,
] as const;

export type PacketContactSourcePathMeta = {
  value: string;
  label: string;
  example: string;
};

const SUFFIX_LABELS: Record<string, string> = {
  first_name: "First name",
  middle_name: "Middle name",
  last_name: "Last name",
  suffix: "Suffix",
  preferred_name: "Preferred name",
  title: "Title",
  entity_name: "Entity name",
  entity_type: "Entity type",
  email: "Email",
  email_secondary: "Secondary email",
  phone: "Primary phone",
  phone_primary: "Primary phone",
  phone_secondary: "Secondary phone",
  mailing_address_line_1: "Mailing address line 1",
  mailing_address_line_2: "Mailing address line 2",
  mailing_city: "Mailing city",
  mailing_state: "Mailing state",
  mailing_zip: "Mailing ZIP",
  street_address_line_1: "Street address line 1",
  street_address_line_2: "Street address line 2",
  street_city: "Street city",
  street_state: "Street state",
  street_zip: "Street ZIP",
  county: "County",
  preferred_contact_method: "Preferred contact method",
  company_name: "Company name",
  brokerage_name: "Brokerage name",
  trec_license_number: "TREC license number",
  date_of_birth: "Date of birth",
  occupation: "Occupation",
  notes: "Notes",
  full_name: "Full name",
  address: "Mailing address (combined)",
  city_state_zip: "Mailing city/state/ZIP (combined)",
};

const SUFFIX_EXAMPLES: Record<string, string> = {
  first_name: "Jane",
  middle_name: "Q",
  last_name: "Agent",
  suffix: "Jr.",
  preferred_name: "Janie",
  title: "Broker Associate",
  entity_name: "Example Holdings LLC",
  entity_type: "LLC",
  email: "jane@example.com",
  email_secondary: "jane.alt@example.com",
  phone: "(817) 555-0100",
  phone_primary: "(817) 555-0100",
  phone_secondary: "(817) 555-0101",
  mailing_address_line_1: "123 Main St.",
  mailing_address_line_2: "Suite 200",
  mailing_city: "Arlington",
  mailing_state: "TX",
  mailing_zip: "76010",
  street_address_line_1: "456 Oak Ave.",
  street_address_line_2: "",
  street_city: "Fort Worth",
  street_state: "TX",
  street_zip: "76102",
  county: "Tarrant",
  preferred_contact_method: "Email",
  company_name: "Example Realty Group",
  brokerage_name: "Example Brokerage LLC",
  trec_license_number: "1234567",
  date_of_birth: "1980-05-15",
  occupation: "Real estate agent",
  notes: "VIP client",
  full_name: "Jane Q. Agent",
  address: "123 Main St., Suite 200",
  city_state_zip: "Arlington, TX 76010",
};

function roleLabel(prefix: string, index: number): string {
  const role =
    prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/_/g, " ");
  return `${role} ${index}`;
}

function suffixMeta(suffix: string): PacketContactSourcePathMeta["label"] {
  return SUFFIX_LABELS[suffix] ?? suffix.replace(/_/g, " ");
}

function buildRolePaths(
  prefix: string,
  index: number,
  suffixes: readonly string[],
): PacketContactSourcePathMeta[] {
  const role = `${prefix}_${index}`;
  return suffixes.map((suffix) => ({
    value: `${role}.${suffix}`,
    label: `${roleLabel(prefix, index)} · ${suffixMeta(suffix)}`,
    example: SUFFIX_EXAMPLES[suffix] ?? "—",
  }));
}

export const PACKET_CONTACT_ROLE_SOURCE_PATHS = [
  ...PACKET_CONTACT_ROLE_PREFIXES.flatMap((prefix) =>
    PACKET_CONTACT_ROLE_INDICES.flatMap((index) =>
      [
        ...PACKET_CONTACT_COMPUTED_FIELD_SUFFIXES,
        ...PACKET_CONTACT_DIRECT_FIELD_SUFFIXES,
      ].map((suffix) => `${prefix}_${index}.${suffix}`),
    ),
  ),
] as const;

export const BUYER_CLIENT_CONTACT_SOURCE_PATHS = [
  ...BUYER_CLIENT_INDICES.flatMap((index) =>
    BUYER_CLIENT_FIELD_SUFFIXES.map(
      (suffix) => `buyer_client_${index}.${suffix}` as const,
    ),
  ),
] as const;

export const PACKET_CONTACT_SOURCE_PATHS = [
  ...PACKET_CONTACT_ROLE_SOURCE_PATHS,
  ...BUYER_CLIENT_CONTACT_SOURCE_PATHS,
] as const;

export type PacketContactSourcePath =
  (typeof PACKET_CONTACT_SOURCE_PATHS)[number];

const DIRECT_SUFFIX_SET = new Set<string>(PACKET_CONTACT_DIRECT_FIELD_SUFFIXES);

const COMPUTED_SUFFIX_SET = new Set<string>(PACKET_CONTACT_COMPUTED_FIELD_SUFFIXES);

export function normalizePacketContactFieldSuffix(
  suffix: string,
): PacketContactResolvableFieldSuffix | null {
  const normalized = suffix.trim().toLowerCase();
  if (normalized === "phone") {
    return "phone_primary";
  }
  if (DIRECT_SUFFIX_SET.has(normalized)) {
    return normalized as PacketContactDirectFieldSuffix;
  }
  if (COMPUTED_SUFFIX_SET.has(normalized)) {
    return normalized as PacketContactComputedFieldSuffix;
  }
  return null;
}

export function canonicalizePacketContactSourcePath(sourcePath: string): string {
  const trimmed = sourcePath.trim().toLowerCase();
  const dotMatch = trimmed.match(/^([a-z0-9_]+)\.([a-z_]+)$/i);
  if (!dotMatch) {
    return trimmed;
  }

  const suffix = normalizePacketContactFieldSuffix(dotMatch[2]);
  if (!suffix) {
    return trimmed;
  }

  return `${dotMatch[1]}.${suffix}`;
}

export function isValidPacketContactSourcePath(sourcePath: string): boolean {
  const trimmed = sourcePath.trim();
  const dotMatch = trimmed.match(/^([a-z0-9_]+)\.([a-z_]+)$/i);
  if (!dotMatch) {
    return false;
  }
  return normalizePacketContactFieldSuffix(dotMatch[2]) != null;
}

export function getPacketContactSourcePathMeta(
  sourcePath: string,
): PacketContactSourcePathMeta | null {
  const trimmed = sourcePath.trim().toLowerCase();
  const dotMatch = trimmed.match(/^([a-z0-9_]+)\.([a-z_]+)$/i);
  if (!dotMatch) {
    return null;
  }

  const suffix = normalizePacketContactFieldSuffix(dotMatch[2]);
  if (!suffix) {
    return null;
  }

  const roleSlug = dotMatch[1];
  const roleMatch = roleSlug.match(
    /^(buyer|seller|tenant|landlord)_(\d+)$/,
  );
  const buyerClientMatch = roleSlug.match(/^buyer_client_(\d+)$/);

  let labelPrefix = roleSlug;
  if (roleMatch) {
    labelPrefix = roleLabel(roleMatch[1], Number(roleMatch[2]));
  } else if (buyerClientMatch) {
    labelPrefix = `Buyer client ${buyerClientMatch[1]}`;
  }

  return {
    value: `${roleSlug}.${suffix}`,
    label: `${labelPrefix} · ${suffixMeta(suffix)}`,
    example: SUFFIX_EXAMPLES[suffix] ?? "—",
  };
}

export function formatPacketContactSourcePathOptionLabel(
  meta: PacketContactSourcePathMeta,
): string {
  return `${meta.label} — ${meta.example}`;
}

export function formatPacketContactSourcePathMappingLabel(
  sourcePath: string,
): string {
  const meta = getPacketContactSourcePathMeta(sourcePath);
  return meta?.label ?? sourcePath.trim();
}

export function getPacketContactSourcePathOptions(
  currentValue?: string | null,
): PacketContactSourcePathMeta[] {
  const options: PacketContactSourcePathMeta[] = [];

  for (const prefix of PACKET_CONTACT_ROLE_PREFIXES) {
    for (const index of PACKET_CONTACT_ROLE_INDICES) {
      options.push(
        ...buildRolePaths(prefix, index, [
          ...PACKET_CONTACT_COMPUTED_FIELD_SUFFIXES,
          ...PACKET_CONTACT_DROPDOWN_DIRECT_FIELD_SUFFIXES,
        ]),
      );
    }
  }

  for (const index of BUYER_CLIENT_INDICES) {
    options.push(
      ...buildRolePaths("buyer_client", index, BUYER_CLIENT_FIELD_SUFFIXES),
    );
  }

  const normalizedCurrent = currentValue?.trim().toLowerCase() ?? "";
  const canonicalCurrent = normalizedCurrent
    ? canonicalizePacketContactSourcePath(normalizedCurrent)
    : "";

  const deduped = dedupeSourcePathOptions(
    options.map((option) => ({
      value: option.value,
      label: formatPacketContactSourcePathOptionLabel(option),
    })),
    {
      canonicalize: canonicalizePacketContactSourcePath,
      preferValue: (values, canonicalValue) =>
        values.find((value) => value.toLowerCase() === canonicalValue) ??
        values[0],
    },
  );

  const dedupedMeta = deduped.map((option) => {
    const meta = getPacketContactSourcePathMeta(option.value);
    return meta ?? { value: option.value, label: option.label, example: "—" };
  });

  if (
    normalizedCurrent &&
    isValidPacketContactSourcePath(normalizedCurrent) &&
    !dedupedMeta.some(
      (option) =>
        canonicalizePacketContactSourcePath(option.value) === canonicalCurrent,
    )
  ) {
    const meta = getPacketContactSourcePathMeta(normalizedCurrent);
    if (meta) {
      dedupedMeta.push(meta);
    }
  }

  return dedupedMeta;
}

export function formatPacketContactResolvedFieldValue(
  contact: Contact,
  fieldSuffix: PacketContactResolvableFieldSuffix,
): string {
  if (fieldSuffix === "full_name") {
    return formatContactDisplayName(contact);
  }

  if (fieldSuffix === "address") {
    return formatContactMailingAddress(contact);
  }

  if (fieldSuffix === "city_state_zip") {
    return formatContactCityStateZip(contact);
  }

  if (fieldSuffix === "date_of_birth") {
    return formatContactDateOfBirth(contact.date_of_birth);
  }

  const value = contact[fieldSuffix as keyof Contact];
  if (value == null) {
    return "";
  }

  return String(value);
}

export function isPacketContactDirectFieldSuffix(
  suffix: string,
): suffix is PacketContactDirectFieldSuffix {
  return DIRECT_SUFFIX_SET.has(suffix);
}
