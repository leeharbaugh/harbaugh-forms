import type { Property } from "@/lib/types/property";
import {
  formatPropertyAddress,
  formatPropertyAddressCity,
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

export const PACKET_PROPERTY_CANONICAL_SOURCE_PATHS = [
  "street_address",
  "full_address",
  "address_city_state_zip",
  "city",
  "state",
  "zip",
  "county",
  "legal_description",
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

const CANONICAL_META: Record<PacketPropertyCanonicalSourcePath, CanonicalMeta> =
  {
    street_address: {
      label: "Street Address",
      example: PACKET_PROPERTY_EXAMPLE_STREET,
    },
    full_address: {
      label: "Full Address",
      example: PACKET_PROPERTY_EXAMPLE_FULL,
    },
    address_city_state_zip: {
      label: "Address + City/State/Zip",
      example: PACKET_PROPERTY_EXAMPLE_FULL,
    },
    city: {
      label: "City",
      example: PACKET_PROPERTY_EXAMPLE_CITY,
    },
    state: {
      label: "State",
      example: PACKET_PROPERTY_EXAMPLE_STATE,
    },
    zip: {
      label: "ZIP",
      example: PACKET_PROPERTY_EXAMPLE_ZIP,
    },
    county: {
      label: "County",
      example: PACKET_PROPERTY_EXAMPLE_COUNTY,
    },
    legal_description: {
      label: "Legal Description",
      example: PACKET_PROPERTY_EXAMPLE_LEGAL,
    },
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
    label: "Subdivision",
    example: "Example Addition",
    legacy: true,
  },
  lot: {
    label: "Lot",
    example: "1",
    legacy: true,
  },
  block: {
    label: "Block",
    example: "A",
    legacy: true,
  },
  tax_id: {
    label: "Tax / Parcel ID",
    example: "12345",
    legacy: true,
  },
  mls_number: {
    label: "MLS Number",
    example: "12345678",
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
  | keyof Property
  | "full_address"
  | "address_city";

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
  tax_id: "parcel_id",
  legal_description: "legal_description",
  mls_number: "mls_number",
  property_type: "property_type",
  bedrooms: "bedrooms",
  bathrooms: "bathrooms",
  sqft: "sqft",
  lot_sqft: "lot_sqft",
  year_built: "year_built",
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

  const canonical = PACKET_PROPERTY_CANONICAL_SOURCE_PATHS.find(
    (path) => path === normalized,
  );
  if (canonical) {
    return {
      value: canonical,
      ...CANONICAL_META[canonical],
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
    PACKET_PROPERTY_CANONICAL_SOURCE_PATHS.map((path) => ({
      value: path,
      ...CANONICAL_META[path],
    }));

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

  const value = property[fieldName];
  if (value == null) {
    return "";
  }

  return String(value);
}
