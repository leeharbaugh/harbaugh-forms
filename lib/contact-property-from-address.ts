import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactInput } from "@/lib/types/contact";
import {
  emptyPropertyInput,
  normalizePropertyInput,
  type PropertyInput,
  validatePropertyInput,
} from "@/lib/types/property";

export const CONTACT_PO_BOX_PROPERTY_MESSAGE =
  "This appears to be a mailing address or PO Box. Properties should use a physical street address.";

const PO_BOX_PATTERNS = [
  /\bP\.?\s*O\.?\s*Box\b/i,
  /\bPost\s+Office\s+Box\b/i,
  /\bP\s+O\s+Box\b/i,
] as const;

export type ContactAddressParts = {
  street_address: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  source: "street" | "mailing";
};

function normalizeAddressComponent(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function contactHasAddressInfo(contact: ContactInput): boolean {
  return (
    hasText(contact.mailing_address_line_1) ||
    hasText(contact.mailing_address_line_2) ||
    hasText(contact.mailing_city) ||
    hasText(contact.mailing_zip) ||
    hasText(contact.street_address_line_1) ||
    hasText(contact.street_address_line_2) ||
    hasText(contact.street_city) ||
    hasText(contact.street_zip)
  );
}

function startsWithMailingBoxNumber(line: string): boolean {
  return /^\s*(?:#|No\.?\s*)?Box\s+\d+\b/i.test(line.trim());
}

export function isPoBoxAddress(
  ...lines: Array<string | null | undefined>
): boolean {
  const normalizedLines = lines
    .map((line) => normalizeAddressComponent(line))
    .filter(Boolean);

  if (normalizedLines.length === 0) {
    return false;
  }

  const combined = normalizedLines.join(" ");
  for (const pattern of PO_BOX_PATTERNS) {
    if (pattern.test(combined)) {
      return true;
    }
  }

  const primaryLine = normalizedLines[0] ?? "";
  return startsWithMailingBoxNumber(primaryLine);
}

export function resolveContactAddressForProperty(
  contact: ContactInput,
): ContactAddressParts | null {
  if (hasText(contact.street_address_line_1)) {
    return {
      street_address: normalizeAddressComponent(contact.street_address_line_1),
      unit: normalizeAddressComponent(contact.street_address_line_2),
      city: normalizeAddressComponent(contact.street_city),
      state: normalizeAddressComponent(contact.street_state) || "TX",
      zip: normalizeAddressComponent(contact.street_zip),
      county: normalizeAddressComponent(contact.county),
      source: "street",
    };
  }

  if (hasText(contact.mailing_address_line_1)) {
    return {
      street_address: normalizeAddressComponent(contact.mailing_address_line_1),
      unit: normalizeAddressComponent(contact.mailing_address_line_2),
      city: normalizeAddressComponent(contact.mailing_city),
      state: normalizeAddressComponent(contact.mailing_state) || "TX",
      zip: normalizeAddressComponent(contact.mailing_zip),
      county: normalizeAddressComponent(contact.county),
      source: "mailing",
    };
  }

  return null;
}

export function buildPropertyInputFromContactAddress(
  contact: ContactInput,
): PropertyInput | null {
  const address = resolveContactAddressForProperty(contact);
  if (!address) {
    return null;
  }

  return {
    ...emptyPropertyInput(),
    street_address: address.street_address,
    unit: address.unit,
    city: address.city,
    state: address.state || "TX",
    zip: address.zip,
    county: address.county,
  };
}

export function validateContactPropertyCreation(
  contact: ContactInput,
): string | null {
  const propertyInput = buildPropertyInputFromContactAddress(contact);
  if (!propertyInput) {
    return "Enter an address before adding it as a property.";
  }

  const address = resolveContactAddressForProperty(contact);
  if (
    address &&
    isPoBoxAddress(address.street_address, address.unit || null)
  ) {
    return CONTACT_PO_BOX_PROPERTY_MESSAGE;
  }

  return validatePropertyInput(propertyInput);
}

function propertyAddressKeyFromParts(parts: {
  street_address: string;
  unit: string | null | undefined;
  city: string;
  state: string;
  zip: string;
}): string {
  return [
    parts.street_address.trim().toLowerCase(),
    (parts.unit ?? "").trim().toLowerCase(),
    parts.city.trim().toLowerCase(),
    parts.state.trim().toUpperCase(),
    parts.zip.trim().toLowerCase(),
  ].join("|");
}

export async function findExistingActivePropertyByAddress(
  supabase: SupabaseClient,
  propertyInput: PropertyInput,
  ownerUserId?: string | null,
): Promise<number | null> {
  const normalized = normalizePropertyInput(propertyInput);
  const targetKey = propertyAddressKeyFromParts(normalized);

  let query = supabase
    .from("properties")
    .select("id, street_address, unit, city, state, zip, owner_user_id")
    .eq("status", "ACTIVE")
    .ilike("street_address", normalized.street_address)
    .ilike("city", normalized.city)
    .eq("state", normalized.state)
    .ilike("zip", normalized.zip);

  if (ownerUserId) {
    query = query.eq("owner_user_id", ownerUserId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const match = (data ?? []).find(
    (row) => propertyAddressKeyFromParts(row) === targetKey,
  );

  return match?.id ?? null;
}

export async function ensurePropertyFromContactAddress(
  supabase: SupabaseClient,
  contact: ContactInput,
): Promise<{ propertyId: number; created: boolean }> {
  const validationError = validateContactPropertyCreation(contact);
  if (validationError) {
    throw new Error(validationError);
  }

  const propertyInput = buildPropertyInputFromContactAddress(contact);
  if (!propertyInput) {
    throw new Error("Enter an address before adding it as a property.");
  }

  const normalized = normalizePropertyInput(propertyInput);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("properties")
    .insert({
      ...normalized,
      owner_user_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create property.");
  }

  return { propertyId: data.id as number, created: true };
}
