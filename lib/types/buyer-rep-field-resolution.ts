import type { BuyerRepDetails } from "@/lib/types/buyer-rep-agreement";
import type { Contact } from "@/lib/types/contact";
import type { BrokerageSettings } from "@/lib/types/brokerage-settings";

export const BUYER_REP_DETAILS_SOURCE_PATHS = [
  "market_area",
  "compensation_percent",
  "purchase_flat_fee",
  "lease_one_month_rent_percent",
  "lease_all_rents_percent",
  "lease_flat_fee",
  "retainer_amount",
  "retainer_applies_to_fee",
  "construction_compensation",
  "other_compensation",
  "protection_period_days",
  "county_for_payment",
  "employer_relocation",
  "intermediary_allowed",
  "special_provisions",
  "add_iabs",
  "add_lead_based_paint",
  "add_mold_remediation",
  "add_flood_hazard",
  "add_property_insurance",
  "add_home_inspection",
  "add_general_information_notice",
  "add_wire_fraud",
  "add_other_document",
  "add_other_document_description",
] as const;

export type BuyerRepDetailsSourcePath =
  (typeof BUYER_REP_DETAILS_SOURCE_PATHS)[number];

export const REPRESENTATION_AGREEMENT_SOURCE_PATHS = [
  "effective_date",
  "expiration_date",
] as const;

export type RepresentationAgreementSourcePath =
  (typeof REPRESENTATION_AGREEMENT_SOURCE_PATHS)[number];

const BOOLEAN_BUYER_REP_PATHS = new Set<string>([
  "retainer_applies_to_fee",
  "intermediary_allowed",
  "add_iabs",
  "add_lead_based_paint",
  "add_mold_remediation",
  "add_flood_hazard",
  "add_property_insurance",
  "add_home_inspection",
  "add_general_information_notice",
  "add_wire_fraud",
  "add_other_document",
]);

export function isBuyerRepDetailsSourcePath(
  value: string,
): value is BuyerRepDetailsSourcePath {
  return BUYER_REP_DETAILS_SOURCE_PATHS.includes(
    value as BuyerRepDetailsSourcePath,
  );
}

export function isRepresentationAgreementSourcePath(
  value: string,
): value is RepresentationAgreementSourcePath {
  return REPRESENTATION_AGREEMENT_SOURCE_PATHS.includes(
    value as RepresentationAgreementSourcePath,
  );
}

export function formatContactMailingAddress(contact: Contact): string {
  const parts = [
    contact.mailing_address_line_1?.trim(),
    contact.mailing_address_line_2?.trim(),
  ].filter(Boolean);

  return parts.join(", ");
}

export function formatContactCityStateZip(contact: Contact): string {
  const city = contact.mailing_city?.trim();
  const state = contact.mailing_state?.trim();
  const zip = contact.mailing_zip?.trim();

  const cityState = [city, state].filter(Boolean).join(", ");
  if (!cityState && !zip) {
    return "";
  }

  if (!zip) {
    return cityState;
  }

  return cityState ? `${cityState} ${zip}` : zip;
}

export function formatBrokerageCityStateZip(
  settings: BrokerageSettings,
): string {
  const city = settings.brokerage_city?.trim();
  const state = settings.brokerage_state?.trim();
  const zip = settings.brokerage_zip?.trim();

  const cityState = [city, state].filter(Boolean).join(", ");
  if (!cityState && !zip) {
    return "";
  }

  if (!zip) {
    return cityState;
  }

  return cityState ? `${cityState} ${zip}` : zip;
}

export function resolveBuyerRepDetailsFieldValue(
  details: BuyerRepDetails,
  sourcePath: string,
): string | null {
  const path = sourcePath.trim().toLowerCase() as BuyerRepDetailsSourcePath;

  if (!isBuyerRepDetailsSourcePath(path)) {
    return null;
  }

  const value = details[path];

  if (value == null) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

export function isBooleanBuyerRepDetailsSourcePath(sourcePath: string): boolean {
  return BOOLEAN_BUYER_REP_PATHS.has(sourcePath.trim().toLowerCase());
}

export function resolveBuyerRepCheckboxMatches(
  details: BuyerRepDetails,
  field: "retainer_applies_to_fee" | "intermediary_allowed",
  matches: boolean,
): boolean {
  return details[field] === matches;
}

/** Join buyer/client display names for the TXR-1501 agreement-between line. */
export function joinBuyerClientNamesForAgreement(names: string[]): string {
  const filtered = names.map((name) => name.trim()).filter(Boolean);

  if (filtered.length === 0) {
    return "";
  }

  if (filtered.length === 1) {
    return filtered[0];
  }

  if (filtered.length === 2) {
    return `${filtered[0]} and ${filtered[1]}`;
  }

  const last = filtered[filtered.length - 1];
  const rest = filtered.slice(0, -1);
  return `${rest.join(", ")}, and ${last}`;
}

export function formatBuyerRepAgreementBetween(
  buyerNames: string[],
  brokerageName: string | null | undefined,
): string {
  const namesPart = joinBuyerClientNamesForAgreement(buyerNames);
  const broker = brokerageName?.trim() ?? "";

  if (!namesPart && !broker) {
    return "";
  }

  if (!namesPart) {
    return broker;
  }

  if (!broker) {
    return namesPart;
  }

  return `${namesPart} and ${broker}`;
}
