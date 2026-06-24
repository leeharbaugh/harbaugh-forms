export type PropertyType =
  | "SINGLE_FAMILY"
  | "CONDO"
  | "TOWNHOME"
  | "MULTI_FAMILY"
  | "COMMERCIAL"
  | "LAND"
  | "OTHER";

export type Property = {
  id: number;
  street_address: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  county: string | null;
  parcel_id: string | null;
  legal_description: string | null;
  property_type: PropertyType;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  mls_number: string | null;
  notes: string | null;
  create_date: string;
  update_date: string;
  status: string;
};

export type PropertySelectionMode = "existing" | "new";

export type PropertyInput = {
  street_address: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcel_id: string;
  legal_description: string;
  property_type: PropertyType;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  lot_sqft: string;
  year_built: string;
  mls_number: string;
  notes: string;
};

export const emptyPropertyInput = (): PropertyInput => ({
  street_address: "",
  unit: "",
  city: "",
  state: "TX",
  zip: "",
  county: "",
  parcel_id: "",
  legal_description: "",
  property_type: "SINGLE_FAMILY",
  bedrooms: "",
  bathrooms: "",
  sqft: "",
  lot_sqft: "",
  year_built: "",
  mls_number: "",
  notes: "",
});

export function propertyToInput(property: Property): PropertyInput {
  return {
    street_address: property.street_address,
    unit: property.unit ?? "",
    city: property.city,
    state: property.state ?? "TX",
    zip: property.zip,
    county: property.county ?? "",
    parcel_id: property.parcel_id ?? "",
    legal_description: property.legal_description ?? "",
    property_type: property.property_type,
    bedrooms: property.bedrooms != null ? String(property.bedrooms) : "",
    bathrooms: property.bathrooms != null ? String(property.bathrooms) : "",
    sqft: property.sqft != null ? String(property.sqft) : "",
    lot_sqft: property.lot_sqft != null ? String(property.lot_sqft) : "",
    year_built: property.year_built != null ? String(property.year_built) : "",
    mls_number: property.mls_number ?? "",
    notes: property.notes ?? "",
  };
}

export function formatPropertyReference(id: number): string {
  return `#${id}`;
}

export function formatPropertyType(type: PropertyType): string {
  return type
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatPropertyAddress(property: Property | PropertyInput): string {
  const line1 = [property.street_address, property.unit?.trim()]
    .filter(Boolean)
    .join(property.unit?.trim() ? " " : "");

  const line2 = [property.city, property.state, property.zip]
    .filter(Boolean)
    .join(", ")
    .replace(", ,", ",");

  return line2 ? `${line1}, ${line2}` : line1;
}

/** Street address, optional unit, and city only (no state/ZIP). */
export function formatPropertyAddressCity(
  property: Pick<Property, "street_address" | "unit" | "city">,
): string {
  const street = [property.street_address?.trim(), property.unit?.trim()]
    .filter(Boolean)
    .join(property.unit?.trim() ? " " : "");
  const city = property.city?.trim() ?? "";

  if (!street && !city) {
    return "";
  }

  if (!street) {
    return city;
  }

  if (!city) {
    return street;
  }

  return `${street}, ${city}`;
}

function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

export function validatePropertyInput(input: PropertyInput): string | null {
  if (!input.street_address.trim()) {
    return "Street address is required.";
  }
  if (!input.city.trim()) {
    return "City is required.";
  }
  if (!input.state.trim()) {
    return "State is required.";
  }
  if (!input.zip.trim()) {
    return "ZIP is required.";
  }
  if (!input.property_type) {
    return "Property type is required.";
  }

  if (input.bedrooms.trim()) {
    const bedrooms = parseOptionalInteger(input.bedrooms);
    if (bedrooms == null || bedrooms < 0) {
      return "Bedrooms must be a whole number of 0 or more.";
    }
  }

  if (input.bathrooms.trim()) {
    const bathrooms = parseOptionalNumber(input.bathrooms);
    if (bathrooms == null || bathrooms < 0) {
      return "Bathrooms must be a valid number of 0 or more.";
    }
  }

  if (input.sqft.trim()) {
    const sqft = parseOptionalInteger(input.sqft);
    if (sqft == null || sqft < 0) {
      return "Square feet must be a whole number of 0 or more.";
    }
  }

  if (input.lot_sqft.trim()) {
    const lotSqft = parseOptionalInteger(input.lot_sqft);
    if (lotSqft == null || lotSqft < 0) {
      return "Lot square feet must be a whole number of 0 or more.";
    }
  }

  if (input.year_built.trim()) {
    const yearBuilt = parseOptionalInteger(input.year_built);
    if (yearBuilt == null || yearBuilt < 0) {
      return "Year built must be a valid whole number.";
    }
  }

  return null;
}

export function normalizePropertyInput(input: PropertyInput) {
  const trim = (value: string) => value.trim();

  return {
    street_address: trim(input.street_address),
    unit: trim(input.unit) || null,
    city: trim(input.city),
    state: trim(input.state) || "TX",
    zip: trim(input.zip),
    county: trim(input.county) || null,
    parcel_id: trim(input.parcel_id) || null,
    legal_description: trim(input.legal_description) || null,
    property_type: input.property_type,
    bedrooms: parseOptionalInteger(input.bedrooms),
    bathrooms: parseOptionalNumber(input.bathrooms),
    sqft: parseOptionalInteger(input.sqft),
    lot_sqft: parseOptionalInteger(input.lot_sqft),
    year_built: parseOptionalInteger(input.year_built),
    mls_number: trim(input.mls_number) || null,
    notes: trim(input.notes) || null,
  };
}
