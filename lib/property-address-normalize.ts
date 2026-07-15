/**
 * Shared property-address normalization for uniqueness (app + DB parity).
 * Keep in sync with public.normalize_property_* SQL functions.
 */

const STREET_SUFFIX_MAP: Record<string, string> = {
  court: "ct",
  courts: "ct",
  street: "st",
  streets: "st",
  avenue: "ave",
  avenues: "ave",
  drive: "dr",
  road: "rd",
  boulevard: "blvd",
  lane: "ln",
  place: "pl",
  circle: "cir",
  trail: "trl",
  parkway: "pkwy",
  highway: "hwy",
  terrace: "ter",
};

export function normalizePropertyStreet(street: string | null | undefined): string {
  let value = (street ?? "").trim().toLowerCase();
  value = value.replace(/[\p{P}\p{S}]+/gu, " ");
  value = value.replace(/\s+/g, " ").trim();
  if (!value) {
    return "";
  }

  const parts = value.split(" ");
  const last = parts[parts.length - 1] ?? "";
  if (STREET_SUFFIX_MAP[last]) {
    parts[parts.length - 1] = STREET_SUFFIX_MAP[last];
  }
  return parts.join(" ");
}

export function normalizePropertyUnit(unit: string | null | undefined): string {
  if (!unit?.trim()) {
    return "";
  }
  return unit.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizePropertyCity(city: string | null | undefined): string {
  if (!city?.trim()) {
    return "";
  }
  return city.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizePropertyState(state: string | null | undefined): string {
  const trimmed = (state ?? "").trim().toUpperCase();
  if (trimmed === "TEXAS" || trimmed === "TX") {
    return "TX";
  }
  return trimmed;
}

/** First five digits only; ZIP+4 collapses to ZIP5. */
export function normalizePropertyZip5(zip: string | null | undefined): string {
  const digits = (zip ?? "").replace(/\D/g, "");
  return digits.slice(0, 5);
}

export type PropertyAddressParts = {
  street_address: string;
  unit?: string | null;
  city: string;
  state: string;
  zip: string;
};

export function propertyAddressIdentityKey(parts: PropertyAddressParts): string {
  return [
    normalizePropertyStreet(parts.street_address),
    normalizePropertyUnit(parts.unit),
    normalizePropertyCity(parts.city),
    normalizePropertyState(parts.state),
    normalizePropertyZip5(parts.zip),
  ].join("|");
}

export const PROPERTY_DUPLICATE_ADDRESS_MESSAGE =
  "You already have a property at this address.";

export const PROPERTY_RESTORE_ADDRESS_CONFLICT_MESSAGE =
  "A non-deleted property already exists at this address. Restore is not allowed.";

/** Postgres unique-violation SQLSTATE. */
export function isUniqueViolationError(error: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  if (!error) {
    return false;
  }
  if (error.code === "23505") {
    return true;
  }
  return /duplicate key|unique constraint|properties_owner_address/i.test(
    error.message ?? "",
  );
}
