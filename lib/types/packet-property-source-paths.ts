import type { Property, PropertyBooleanField } from "@/lib/types/property";
import {
  formatPropertyAddress,
  formatPropertyAddressCity,
  formatPropertyBooleanValue,
  formatPropertyType,
} from "@/lib/types/property";

export const PACKET_PROPERTY_EXAMPLE_STREET = "123 Main St.";
export const PACKET_PROPERTY_EXAMPLE_FULL =
  "123 Main St., Arlington, TX 76010";
export const PACKET_PROPERTY_EXAMPLE_CITY = "Arlington";
export const PACKET_PROPERTY_EXAMPLE_STATE = "TX";
export const PACKET_PROPERTY_EXAMPLE_ZIP = "76010";
export const PACKET_PROPERTY_EXAMPLE_COUNTY = "Tarrant";
export const PACKET_PROPERTY_EXAMPLE_LEGAL =
  "Lot 1, Block A, Example Addition";

/** Derived packet property paths (not direct DB columns). */
export const PACKET_PROPERTY_COMPUTED_SOURCE_PATHS = [
  "full_address",
  "address_city_state_zip",
] as const;

export type PacketPropertyComputedSourcePath =
  (typeof PACKET_PROPERTY_COMPUTED_SOURCE_PATHS)[number];

/** Direct atomic property column source paths for field mapping. */
export const PACKET_PROPERTY_DIRECT_SOURCE_PATHS = [
  "street_address",
  "unit",
  "city",
  "state",
  "zip",
  "county",
  "parcel_id",
  "legal_description",
  "property_type",
  "bedrooms",
  "bathrooms",
  "sqft",
  "lot_sqft",
  "year_built",
  "mls_number",
  "notes",
  "lot",
  "block",
  "addition",
  "tax_id",
  "geo_id",
  "school_district",
  "municipality",
  "etj",
  "stories",
  "garage_spaces",
  "garage_type",
  "pool",
  "spa",
  "fireplace",
  "basement",
  "sprinkler_system",
  "waterfront",
  "water_view",
  "corner_lot",
  "cul_de_sac",
  "gated",
  "new_construction",
  "well",
  "septic",
  "solar",
  "propane",
  "electric_provider",
  "gas_provider",
  "water_provider",
  "sewer_provider",
  "has_hoa",
  "hoa_contact_name",
  "hoa_email",
  "hoa_website",
  "hoa_dues_amount",
  "hoa_dues_frequency",
  "occupancy_status",
] as const;

export type PacketPropertyDirectSourcePath =
  (typeof PACKET_PROPERTY_DIRECT_SOURCE_PATHS)[number];

export const PACKET_PROPERTY_CANONICAL_SOURCE_PATHS = [
  ...PACKET_PROPERTY_COMPUTED_SOURCE_PATHS,
  ...PACKET_PROPERTY_DIRECT_SOURCE_PATHS,
] as const;

export type PacketPropertyCanonicalSourcePath =
  (typeof PACKET_PROPERTY_CANONICAL_SOURCE_PATHS)[number];

export type PacketPropertySourcePathMeta = {
  value: string;
  label: string;
  example: string;
  legacy?: boolean;
};

type CanonicalMeta = Omit<PacketPropertySourcePathMeta, "value">;

const COMPUTED_META: Record<PacketPropertyComputedSourcePath, CanonicalMeta> = {
  full_address: {
    label: "Full Address",
    example: PACKET_PROPERTY_EXAMPLE_FULL,
  },
  address_city_state_zip: {
    label: "Address + City/State/Zip",
    example: PACKET_PROPERTY_EXAMPLE_FULL,
  },
};

const DIRECT_META: Record<PacketPropertyDirectSourcePath, CanonicalMeta> = {
  street_address: {
    label: "Street Address",
    example: PACKET_PROPERTY_EXAMPLE_STREET,
  },
  unit: { label: "Unit", example: "101" },
  city: { label: "City", example: PACKET_PROPERTY_EXAMPLE_CITY },
  state: { label: "State", example: PACKET_PROPERTY_EXAMPLE_STATE },
  zip: { label: "ZIP", example: PACKET_PROPERTY_EXAMPLE_ZIP },
  county: { label: "County", example: PACKET_PROPERTY_EXAMPLE_COUNTY },
  parcel_id: { label: "Parcel ID", example: "12345" },
  legal_description: {
    label: "Legal Description",
    example: PACKET_PROPERTY_EXAMPLE_LEGAL,
  },
  property_type: { label: "Property Type", example: "Single Family" },
  bedrooms: { label: "Bedrooms", example: "4" },
  bathrooms: { label: "Bathrooms", example: "2.5" },
  sqft: { label: "Square Feet", example: "2400" },
  lot_sqft: { label: "Lot Square Feet", example: "7200" },
  year_built: { label: "Year Built", example: "2005" },
  mls_number: { label: "MLS Number", example: "12345678" },
  notes: { label: "Notes", example: "Corner lot with mature trees" },
  lot: { label: "Lot", example: "1" },
  block: { label: "Block", example: "A" },
  addition: { label: "Addition", example: "Example Addition" },
  tax_id: { label: "Tax ID", example: "12345" },
  geo_id: { label: "Geo ID", example: "4811300123456" },
  school_district: { label: "School District", example: "Arlington ISD" },
  municipality: { label: "Municipality", example: "City of Arlington" },
  etj: { label: "ETJ", example: "Arlington ETJ" },
  stories: { label: "Stories", example: "2" },
  garage_spaces: { label: "Garage Spaces", example: "2" },
  garage_type: { label: "Garage Type", example: "Attached" },
  pool: { label: "Pool", example: "Yes" },
  spa: { label: "Spa", example: "No" },
  fireplace: { label: "Fireplace", example: "Yes" },
  basement: { label: "Basement", example: "No" },
  sprinkler_system: { label: "Sprinkler System", example: "Yes" },
  waterfront: { label: "Waterfront", example: "No" },
  water_view: { label: "Water View", example: "No" },
  corner_lot: { label: "Corner Lot", example: "Yes" },
  cul_de_sac: { label: "Cul-de-sac", example: "No" },
  gated: { label: "Gated", example: "Yes" },
  new_construction: { label: "New Construction", example: "No" },
  well: { label: "Well", example: "No" },
  septic: { label: "Septic", example: "No" },
  solar: { label: "Solar", example: "Yes" },
  propane: { label: "Propane", example: "No" },
  electric_provider: { label: "Electric Provider", example: "Oncor" },
  gas_provider: { label: "Gas Provider", example: "Atmos Energy" },
  water_provider: { label: "Water Provider", example: "City of Arlington" },
  sewer_provider: { label: "Sewer Provider", example: "City of Arlington" },
  has_hoa: { label: "Has HOA", example: "Yes" },
  hoa_contact_name: { label: "HOA Contact Name", example: "Jane Manager" },
  hoa_email: { label: "HOA Email", example: "hoa@example.com" },
  hoa_website: { label: "HOA Website", example: "https://example-hoa.com" },
  hoa_dues_amount: { label: "HOA Dues Amount", example: "250" },
  hoa_dues_frequency: { label: "HOA Dues Frequency", example: "Monthly" },
  occupancy_status: { label: "Occupancy Status", example: "Owner Occupied" },
};

const LEGACY_SOURCE_PATH_META: Record<string, CanonicalMeta> = {
  address: {
    label: "Legacy Full Address",
    example: PACKET_PROPERTY_EXAMPLE_FULL,
    legacy: true,
  },
  property_address: {
    label: "Legacy Full Address",
    example: PACKET_PROPERTY_EXAMPLE_FULL,
    legacy: true,
  },
  address_city: {
    label: "Legacy Street + City",
    example: "123 Main St., Arlington",
    legacy: true,
  },
  property_street_address: {
    label: "Street Address",
    example: PACKET_PROPERTY_EXAMPLE_STREET,
    legacy: true,
  },
  address_line_1: {
    label: "Street Address",
    example: PACKET_PROPERTY_EXAMPLE_STREET,
    legacy: true,
  },
  property_city: {
    label: "City",
    example: PACKET_PROPERTY_EXAMPLE_CITY,
    legacy: true,
  },
  property_state: {
    label: "State",
    example: PACKET_PROPERTY_EXAMPLE_STATE,
    legacy: true,
  },
  zipcode: {
    label: "ZIP",
    example: PACKET_PROPERTY_EXAMPLE_ZIP,
    legacy: true,
  },
  property_zip: {
    label: "ZIP",
    example: PACKET_PROPERTY_EXAMPLE_ZIP,
    legacy: true,
  },
  property_county: {
    label: "County",
    example: PACKET_PROPERTY_EXAMPLE_COUNTY,
    legacy: true,
  },
  subdivision: {
    label: "Legacy Subdivision (Addition)",
    example: "Example Addition",
    legacy: true,
  },
};

export const PACKET_PROPERTY_LEGACY_SOURCE_PATHS = Object.keys(
  LEGACY_SOURCE_PATH_META,
) as (keyof typeof LEGACY_SOURCE_PATH_META)[];

export const PACKET_PROPERTY_SOURCE_PATHS = [
  ...PACKET_PROPERTY_CANONICAL_SOURCE_PATHS,
  ...PACKET_PROPERTY_LEGACY_SOURCE_PATHS,
] as const;

export type PropertyResolvedField =
  | PacketPropertyDirectSourcePath
  | PacketPropertyComputedSourcePath
  | "address_city";

const DIRECT_PATH_SET = new Set<string>(PACKET_PROPERTY_DIRECT_SOURCE_PATHS);

const RESOLVER_ALIASES: Record<string, PropertyResolvedField> = {
  street_address: "street_address",
  full_address: "full_address",
  address_city_state_zip: "full_address",
  address: "full_address",
  property_address: "full_address",
  address_city: "address_city",
  property_street_address: "street_address",
  address_line_1: "street_address",
  unit: "unit",
  city: "city",
  property_city: "city",
  state: "state",
  property_state: "state",
  zip: "zip",
  zipcode: "zip",
  property_zip: "zip",
  county: "county",
  property_county: "county",
  parcel_id: "parcel_id",
  tax_id: "tax_id",
  legal_description: "legal_description",
  mls_number: "mls_number",
  property_type: "property_type",
  bedrooms: "bedrooms",
  bathrooms: "bathrooms",
  sqft: "sqft",
  lot_sqft: "lot_sqft",
  year_built: "year_built",
  notes: "notes",
  lot: "lot",
  block: "block",
  addition: "addition",
  subdivision: "addition",
  geo_id: "geo_id",
  school_district: "school_district",
  municipality: "municipality",
  etj: "etj",
  stories: "stories",
  garage_spaces: "garage_spaces",
  garage_type: "garage_type",
  pool: "pool",
  spa: "spa",
  fireplace: "fireplace",
  basement: "basement",
  sprinkler_system: "sprinkler_system",
  waterfront: "waterfront",
  water_view: "water_view",
  corner_lot: "corner_lot",
  cul_de_sac: "cul_de_sac",
  gated: "gated",
  new_construction: "new_construction",
  well: "well",
  septic: "septic",
  solar: "solar",
  propane: "propane",
  electric_provider: "electric_provider",
  gas_provider: "gas_provider",
  water_provider: "water_provider",
  sewer_provider: "sewer_provider",
  has_hoa: "has_hoa",
  hoa_contact_name: "hoa_contact_name",
  hoa_email: "hoa_email",
  hoa_website: "hoa_website",
  hoa_dues_amount: "hoa_dues_amount",
  hoa_dues_frequency: "hoa_dues_frequency",
  occupancy_status: "occupancy_status",
};

export function normalizePacketPropertySourcePath(
  sourcePath: string,
): PropertyResolvedField | null {
  const normalized = sourcePath.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const direct = RESOLVER_ALIASES[normalized];
  if (direct) {
    return direct;
  }

  if (normalized.startsWith("property_")) {
    const stripped = normalized.slice("property_".length);
    const fromStripped = RESOLVER_ALIASES[stripped];
    if (fromStripped) {
      return fromStripped;
    }
  }

  return null;
}

export function isValidPacketPropertySourcePath(sourcePath: string): boolean {
  return normalizePacketPropertySourcePath(sourcePath) != null;
}

export function getPacketPropertySourcePathMeta(
  sourcePath: string,
): PacketPropertySourcePathMeta | null {
  const normalized = sourcePath.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const computed = PACKET_PROPERTY_COMPUTED_SOURCE_PATHS.find(
    (path) => path === normalized,
  );
  if (computed) {
    return {
      value: computed,
      ...COMPUTED_META[computed],
    };
  }

  const direct = PACKET_PROPERTY_DIRECT_SOURCE_PATHS.find(
    (path) => path === normalized,
  );
  if (direct) {
    return {
      value: direct,
      ...DIRECT_META[direct],
    };
  }

  const legacy = LEGACY_SOURCE_PATH_META[normalized];
  if (legacy) {
    return {
      value: normalized,
      ...legacy,
    };
  }

  return null;
}

export function formatPacketPropertySourcePathLabel(
  sourcePath: string,
): string {
  const meta = getPacketPropertySourcePathMeta(sourcePath);
  if (!meta) {
    return sourcePath.trim();
  }

  if (meta.legacy && meta.value === "address") {
    return "Legacy Full Address";
  }

  return meta.label;
}

export function formatPacketPropertySourcePathMappingLabel(
  sourcePath: string,
): string {
  const normalized = sourcePath.trim().toLowerCase();
  if (normalized === "address") {
    return "Legacy Full Address";
  }

  return formatPacketPropertySourcePathLabel(sourcePath);
}

export function formatPacketPropertySourcePathOptionLabel(
  meta: PacketPropertySourcePathMeta,
): string {
  if (meta.legacy && meta.value === "address") {
    return `address — Legacy Full Address — ${meta.example}`;
  }

  return `${meta.label} — ${meta.example}`;
}

export function getPacketPropertySourcePathOptions(
  currentValue?: string | null,
): PacketPropertySourcePathMeta[] {
  const options: PacketPropertySourcePathMeta[] =
    PACKET_PROPERTY_CANONICAL_SOURCE_PATHS.map((path) => {
      if (
        (PACKET_PROPERTY_COMPUTED_SOURCE_PATHS as readonly string[]).includes(
          path,
        )
      ) {
        return {
          value: path,
          ...COMPUTED_META[path as PacketPropertyComputedSourcePath],
        };
      }

      return {
        value: path,
        ...DIRECT_META[path as PacketPropertyDirectSourcePath],
      };
    });

  options.push({
    value: "address",
    ...LEGACY_SOURCE_PATH_META.address,
  });

  const normalizedCurrent = currentValue?.trim().toLowerCase() ?? "";
  if (
    normalizedCurrent &&
    !options.some((option) => option.value === normalizedCurrent)
  ) {
    const legacyMeta = LEGACY_SOURCE_PATH_META[normalizedCurrent];
    if (legacyMeta) {
      options.push({
        value: normalizedCurrent,
        ...legacyMeta,
      });
    } else if (isValidPacketPropertySourcePath(normalizedCurrent)) {
      options.push({
        value: normalizedCurrent,
        label: normalizedCurrent,
        example: "—",
        legacy: true,
      });
    }
  }

  return options;
}

function isPropertyBooleanField(
  fieldName: PropertyResolvedField,
): fieldName is PacketPropertyDirectSourcePath {
  if (!DIRECT_PATH_SET.has(fieldName)) {
    return false;
  }

  const value = fieldName as PacketPropertyDirectSourcePath;
  return (
    value === "pool" ||
    value === "spa" ||
    value === "fireplace" ||
    value === "basement" ||
    value === "sprinkler_system" ||
    value === "waterfront" ||
    value === "water_view" ||
    value === "corner_lot" ||
    value === "cul_de_sac" ||
    value === "gated" ||
    value === "new_construction" ||
    value === "well" ||
    value === "septic" ||
    value === "solar" ||
    value === "propane" ||
    value === "has_hoa"
  );
}

export function formatPropertyResolvedFieldValue(
  property: Property,
  fieldName: PropertyResolvedField,
): string {
  if (fieldName === "full_address") {
    return formatPropertyAddress(property);
  }

  if (fieldName === "address_city") {
    return formatPropertyAddressCity(property);
  }

  if (fieldName === "property_type") {
    return formatPropertyType(property.property_type);
  }

  if (isPropertyBooleanField(fieldName)) {
    return formatPropertyBooleanValue(
      property[fieldName as PropertyBooleanField],
    );
  }

  const value = property[fieldName as keyof Property];
  if (value == null) {
    return "";
  }

  return String(value);
}
