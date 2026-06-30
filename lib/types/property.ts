export type PropertyType =
  | "SINGLE_FAMILY"
  | "CONDO"
  | "TOWNHOME"
  | "MULTI_FAMILY"
  | "COMMERCIAL"
  | "LAND"
  | "OTHER";

export type PropertyBooleanField =
  | "pool"
  | "spa"
  | "fireplace"
  | "basement"
  | "sprinkler_system"
  | "waterfront"
  | "water_view"
  | "corner_lot"
  | "cul_de_sac"
  | "gated"
  | "new_construction"
  | "well"
  | "septic"
  | "solar"
  | "propane"
  | "has_hoa";

export const PROPERTY_BOOLEAN_FIELDS: PropertyBooleanField[] = [
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
  "has_hoa",
];

export const PROPERTY_BOOLEAN_FIELD_LABELS: Record<PropertyBooleanField, string> =
  {
    pool: "Pool",
    spa: "Spa",
    fireplace: "Fireplace",
    basement: "Basement",
    sprinkler_system: "Sprinkler system",
    waterfront: "Waterfront",
    water_view: "Water view",
    corner_lot: "Corner lot",
    cul_de_sac: "Cul-de-sac",
    gated: "Gated",
    new_construction: "New construction",
    well: "Well",
    septic: "Septic",
    solar: "Solar",
    propane: "Propane",
    has_hoa: "Has HOA",
  };

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
  lot: string | null;
  block: string | null;
  addition: string | null;
  tax_id: string | null;
  geo_id: string | null;
  school_district: string | null;
  municipality: string | null;
  etj: string | null;
  stories: number | null;
  garage_spaces: number | null;
  garage_type: string | null;
  pool: boolean;
  spa: boolean;
  fireplace: boolean;
  basement: boolean;
  sprinkler_system: boolean;
  waterfront: boolean;
  water_view: boolean;
  corner_lot: boolean;
  cul_de_sac: boolean;
  gated: boolean;
  new_construction: boolean;
  well: boolean;
  septic: boolean;
  solar: boolean;
  propane: boolean;
  electric_provider: string | null;
  gas_provider: string | null;
  water_provider: string | null;
  sewer_provider: string | null;
  has_hoa: boolean;
  hoa_name: string | null;
  hoa_management_company: string | null;
  hoa_contact_name: string | null;
  hoa_phone: string | null;
  hoa_email: string | null;
  hoa_website: string | null;
  hoa_dues_amount: number | null;
  hoa_dues_frequency: string | null;
  occupancy_status: string | null;
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
  lot: string;
  block: string;
  addition: string;
  tax_id: string;
  geo_id: string;
  school_district: string;
  municipality: string;
  etj: string;
  stories: string;
  garage_spaces: string;
  garage_type: string;
  pool: boolean;
  spa: boolean;
  fireplace: boolean;
  basement: boolean;
  sprinkler_system: boolean;
  waterfront: boolean;
  water_view: boolean;
  corner_lot: boolean;
  cul_de_sac: boolean;
  gated: boolean;
  new_construction: boolean;
  well: boolean;
  septic: boolean;
  solar: boolean;
  propane: boolean;
  electric_provider: string;
  gas_provider: string;
  water_provider: string;
  sewer_provider: string;
  has_hoa: boolean;
  hoa_name: string;
  hoa_management_company: string;
  hoa_contact_name: string;
  hoa_phone: string;
  hoa_email: string;
  hoa_website: string;
  hoa_dues_amount: string;
  hoa_dues_frequency: string;
  occupancy_status: string;
};

const DEFAULT_PROPERTY_BOOLEANS = (): Pick<
  PropertyInput,
  PropertyBooleanField
> => ({
  pool: false,
  spa: false,
  fireplace: false,
  basement: false,
  sprinkler_system: false,
  waterfront: false,
  water_view: false,
  corner_lot: false,
  cul_de_sac: false,
  gated: false,
  new_construction: false,
  well: false,
  septic: false,
  solar: false,
  propane: false,
  has_hoa: false,
});

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
  lot: "",
  block: "",
  addition: "",
  tax_id: "",
  geo_id: "",
  school_district: "",
  municipality: "",
  etj: "",
  stories: "",
  garage_spaces: "",
  garage_type: "",
  ...DEFAULT_PROPERTY_BOOLEANS(),
  electric_provider: "",
  gas_provider: "",
  water_provider: "",
  sewer_provider: "",
  hoa_name: "",
  hoa_management_company: "",
  hoa_contact_name: "",
  hoa_phone: "",
  hoa_email: "",
  hoa_website: "",
  hoa_dues_amount: "",
  hoa_dues_frequency: "",
  occupancy_status: "",
});

function optionalString(value: string | null | undefined): string {
  return value ?? "";
}

function optionalNumberString(value: number | null | undefined): string {
  return value != null ? String(value) : "";
}

function readPropertyBooleans(
  property: Property,
): Pick<PropertyInput, PropertyBooleanField> {
  const values = {} as Pick<PropertyInput, PropertyBooleanField>;
  for (const key of PROPERTY_BOOLEAN_FIELDS) {
    values[key] = property[key] ?? false;
  }
  return values;
}

export function propertyToInput(property: Property): PropertyInput {
  return {
    street_address: property.street_address,
    unit: optionalString(property.unit),
    city: property.city,
    state: property.state ?? "TX",
    zip: property.zip,
    county: optionalString(property.county),
    parcel_id: optionalString(property.parcel_id),
    legal_description: optionalString(property.legal_description),
    property_type: property.property_type,
    bedrooms: optionalNumberString(property.bedrooms),
    bathrooms: optionalNumberString(property.bathrooms),
    sqft: optionalNumberString(property.sqft),
    lot_sqft: optionalNumberString(property.lot_sqft),
    year_built: optionalNumberString(property.year_built),
    mls_number: optionalString(property.mls_number),
    notes: optionalString(property.notes),
    lot: optionalString(property.lot),
    block: optionalString(property.block),
    addition: optionalString(property.addition),
    tax_id: optionalString(property.tax_id),
    geo_id: optionalString(property.geo_id),
    school_district: optionalString(property.school_district),
    municipality: optionalString(property.municipality),
    etj: optionalString(property.etj),
    stories: optionalNumberString(property.stories),
    garage_spaces: optionalNumberString(property.garage_spaces),
    garage_type: optionalString(property.garage_type),
    ...readPropertyBooleans(property),
    electric_provider: optionalString(property.electric_provider),
    gas_provider: optionalString(property.gas_provider),
    water_provider: optionalString(property.water_provider),
    sewer_provider: optionalString(property.sewer_provider),
    hoa_name: optionalString(property.hoa_name),
    hoa_management_company: optionalString(property.hoa_management_company),
    hoa_contact_name: optionalString(property.hoa_contact_name),
    hoa_phone: optionalString(property.hoa_phone),
    hoa_email: optionalString(property.hoa_email),
    hoa_website: optionalString(property.hoa_website),
    hoa_dues_amount: optionalNumberString(property.hoa_dues_amount),
    hoa_dues_frequency: optionalString(property.hoa_dues_frequency),
    occupancy_status: optionalString(property.occupancy_status),
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

export function formatPropertyBooleanValue(value: boolean): string {
  return value ? "Yes" : "No";
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

function validateOptionalNonNegativeInteger(
  value: string,
  label: string,
): string | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = parseOptionalInteger(value);
  if (parsed == null || parsed < 0) {
    return `${label} must be a whole number of 0 or more.`;
  }
  return null;
}

function validateOptionalNonNegativeNumber(
  value: string,
  label: string,
): string | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = parseOptionalNumber(value);
  if (parsed == null || parsed < 0) {
    return `${label} must be a valid number of 0 or more.`;
  }
  return null;
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

  return (
    validateOptionalNonNegativeInteger(input.bedrooms, "Bedrooms") ??
    validateOptionalNonNegativeNumber(input.bathrooms, "Bathrooms") ??
    validateOptionalNonNegativeInteger(input.sqft, "Square feet") ??
    validateOptionalNonNegativeInteger(input.lot_sqft, "Lot square feet") ??
    validateOptionalNonNegativeInteger(input.year_built, "Year built") ??
    validateOptionalNonNegativeNumber(input.stories, "Stories") ??
    validateOptionalNonNegativeNumber(input.garage_spaces, "Garage spaces") ??
    validateOptionalNonNegativeNumber(input.hoa_dues_amount, "HOA dues amount")
  );
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
    lot: trim(input.lot) || null,
    block: trim(input.block) || null,
    addition: trim(input.addition) || null,
    tax_id: trim(input.tax_id) || null,
    geo_id: trim(input.geo_id) || null,
    school_district: trim(input.school_district) || null,
    municipality: trim(input.municipality) || null,
    etj: trim(input.etj) || null,
    stories: parseOptionalNumber(input.stories),
    garage_spaces: parseOptionalNumber(input.garage_spaces),
    garage_type: trim(input.garage_type) || null,
    pool: input.pool,
    spa: input.spa,
    fireplace: input.fireplace,
    basement: input.basement,
    sprinkler_system: input.sprinkler_system,
    waterfront: input.waterfront,
    water_view: input.water_view,
    corner_lot: input.corner_lot,
    cul_de_sac: input.cul_de_sac,
    gated: input.gated,
    new_construction: input.new_construction,
    well: input.well,
    septic: input.septic,
    solar: input.solar,
    propane: input.propane,
    electric_provider: trim(input.electric_provider) || null,
    gas_provider: trim(input.gas_provider) || null,
    water_provider: trim(input.water_provider) || null,
    sewer_provider: trim(input.sewer_provider) || null,
    has_hoa: input.has_hoa,
    hoa_name: trim(input.hoa_name) || null,
    hoa_management_company: trim(input.hoa_management_company) || null,
    hoa_contact_name: trim(input.hoa_contact_name) || null,
    hoa_phone: trim(input.hoa_phone) || null,
    hoa_email: trim(input.hoa_email) || null,
    hoa_website: trim(input.hoa_website) || null,
    hoa_dues_amount: parseOptionalNumber(input.hoa_dues_amount),
    hoa_dues_frequency: trim(input.hoa_dues_frequency) || null,
    occupancy_status: trim(input.occupancy_status) || null,
  };
}

/** MLS feed column names mapped to canonical property fields (future import). */
export const MLS_PROPERTY_FIELD_ALIASES: Record<string, keyof PropertyInput> = {
  Subdivision: "addition",
  subdivision: "addition",
  Addition: "addition",
  addition: "addition",
};
