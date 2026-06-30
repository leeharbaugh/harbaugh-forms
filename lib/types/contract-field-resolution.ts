import type { Contact } from "@/lib/types/contact";
import {
  formatContactMailingAddress,
  formatContactCityStateZip,
} from "@/lib/types/buyer-rep-field-resolution";

export type ContractDetailsRow = {
  contract_type?: string | null;
  effective_date?: string | null;
  closing_date?: string | null;
  sales_price_cash?: number | string | null;
  sales_price_financing?: number | string | null;
  sales_price_total?: number | string | null;
  financing_third_party?: boolean | null;
  financing_loan_assumption?: boolean | null;
  financing_seller_financing?: boolean | null;
  lease_residential?: boolean | null;
  lease_fixture?: boolean | null;
  lease_natural_resource?: boolean | null;
  natural_resource_leases_delivered?: boolean | null;
  natural_resource_leases_not_delivered?: boolean | null;
  natural_resource_lease_termination_days?: number | string | null;
  escrow_agent_name?: string | null;
  escrow_agent_address?: string | null;
  earnest_money_amount?: number | string | null;
  option_fee_amount?: number | string | null;
  additional_earnest_money_amount?: number | string | null;
  additional_earnest_money_days?: number | string | null;
  option_period_days?: number | string | null;
  title_policy_paid_by_seller?: boolean | null;
  title_policy_paid_by_buyer?: boolean | null;
  title_company_name?: string | null;
  title_exception_not_amended?: boolean | null;
  title_exception_amended?: boolean | null;
  title_exception_amended_paid_by_buyer?: boolean | null;
  title_exception_amended_paid_by_seller?: boolean | null;
  survey_option?: string | null;
  survey_option_1_days?: number | string | null;
  survey_option_2_days?: number | string | null;
  survey_option_3_days?: number | string | null;
  survey_new_paid_by_seller?: boolean | null;
  survey_new_paid_by_buyer?: boolean | null;
  title_objection_use_activity?: string | null;
  title_objection_days?: number | string | null;
  hoa_is_subject?: boolean | null;
  hoa_is_not_subject?: boolean | null;
  seller_disclosure_received?: boolean | null;
  seller_disclosure_not_received?: boolean | null;
  seller_disclosure_delivery_days?: number | string | null;
  seller_disclosure_not_required?: boolean | null;
  property_as_is?: boolean | null;
  property_as_is_with_repairs?: boolean | null;
  specific_repairs?: string | null;
  service_contract_reimbursement_amount?: number | string | null;
  water_disclosure_received?: boolean | null;
  water_disclosure_not_received?: boolean | null;
  water_disclosure_delivery_days?: number | string | null;
  water_disclosure_not_required?: boolean | null;
  water_provider_name?: string | null;
  broker_disclosure_text?: string | null;
  buyer_possession_at_closing?: boolean | null;
  buyer_possession_by_lease?: boolean | null;
  special_provisions?: string | null;
  seller_expense_contribution_amount?: number | string | null;
  seller_contributes_to_buyer_broker_comp?: boolean | null;
  seller_contribution_dollar_selected?: boolean | null;
  seller_contribution_amount?: number | string | null;
  seller_contribution_percent_selected?: boolean | null;
  seller_contribution_percent?: number | string | null;
  buyer_contributes_to_seller_broker_comp?: boolean | null;
  buyer_contribution_dollar_selected?: boolean | null;
  buyer_contribution_amount?: number | string | null;
  buyer_contribution_percent_selected?: boolean | null;
  buyer_contribution_percent?: number | string | null;
  effective_day?: number | string | null;
  effective_month?: string | null;
  effective_year?: number | string | null;
  [key: string]: unknown;
};

export const CONTRACT_SURVEY_OPTIONS = [
  "SELLER_EXISTING_SURVEY",
  "BUYER_NEW_SURVEY",
  "SELLER_NEW_SURVEY",
] as const;

export type ContractSurveyOption = (typeof CONTRACT_SURVEY_OPTIONS)[number];

export const CONTRACT_DETAILS_SOURCE_PATHS = [
  "sales_price_cash",
  "sales_price_financing",
  "sales_price_total",
  "financing_third_party",
  "financing_loan_assumption",
  "financing_seller_financing",
  "lease_residential",
  "lease_fixture",
  "lease_natural_resource",
  "natural_resource_leases_delivered",
  "natural_resource_leases_not_delivered",
  "natural_resource_lease_termination_days",
  "escrow_agent_name",
  "escrow_agent_address",
  "earnest_money_amount",
  "option_fee_amount",
  "additional_earnest_money_amount",
  "additional_earnest_money_days",
  "option_period_days",
  "title_policy_paid_by_seller",
  "title_policy_paid_by_buyer",
  "title_company_name",
  "title_exception_not_amended",
  "title_exception_amended",
  "title_exception_amended_paid_by_buyer",
  "title_exception_amended_paid_by_seller",
  "survey_option_1_days",
  "survey_option_2_days",
  "survey_option_3_days",
  "survey_new_paid_by_seller",
  "survey_new_paid_by_buyer",
  "title_objection_use_activity",
  "title_objection_days",
  "hoa_is_subject",
  "hoa_is_not_subject",
  "seller_disclosure_received",
  "seller_disclosure_not_received",
  "seller_disclosure_delivery_days",
  "seller_disclosure_not_required",
  "property_as_is",
  "property_as_is_with_repairs",
  "specific_repairs",
  "service_contract_reimbursement_amount",
  "water_disclosure_received",
  "water_disclosure_not_received",
  "water_disclosure_delivery_days",
  "water_disclosure_not_required",
  "water_provider_name",
  "broker_disclosure_text",
  "closing_date",
  "effective_date",
  "buyer_possession_at_closing",
  "buyer_possession_by_lease",
  "special_provisions",
  "seller_expense_contribution_amount",
  "seller_contributes_to_buyer_broker_comp",
  "seller_contribution_dollar_selected",
  "seller_contribution_amount",
  "seller_contribution_percent_selected",
  "seller_contribution_percent",
  "buyer_contributes_to_seller_broker_comp",
  "buyer_contribution_dollar_selected",
  "buyer_contribution_amount",
  "buyer_contribution_percent_selected",
  "buyer_contribution_percent",
] as const;

export type ContractDetailsSourcePath =
  (typeof CONTRACT_DETAILS_SOURCE_PATHS)[number];

export function formatJoinedContactMailingAddresses(
  contacts: Contact[],
): string {
  return contacts
    .map((contact) => formatContactMailingAddress(contact))
    .filter(Boolean)
    .join(", ");
}

export function getFirstContactPhone(contacts: Contact[]): string | null {
  for (const contact of contacts) {
    const phone =
      contact.phone_primary?.trim() || contact.phone_secondary?.trim();
    if (phone) {
      return phone;
    }
  }

  return null;
}

export function getFirstContactEmail(contacts: Contact[]): string | null {
  for (const contact of contacts) {
    const email =
      contact.email?.trim() || contact.email_secondary?.trim();
    if (email) {
      return email;
    }
  }

  return null;
}

export function formatJoinedContactCityStateZip(contacts: Contact[]): string {
  return contacts
    .map((contact) => formatContactCityStateZip(contact))
    .filter(Boolean)
    .join(", ");
}

const CONTRACT_BOOLEAN_SOURCE_PATHS = new Set<string>([
  "financing_third_party",
  "financing_loan_assumption",
  "financing_seller_financing",
  "lease_residential",
  "lease_fixture",
  "lease_natural_resource",
  "natural_resource_leases_delivered",
  "natural_resource_leases_not_delivered",
  "title_policy_paid_by_seller",
  "title_policy_paid_by_buyer",
  "title_exception_not_amended",
  "title_exception_amended",
  "title_exception_amended_paid_by_buyer",
  "title_exception_amended_paid_by_seller",
  "survey_new_paid_by_seller",
  "survey_new_paid_by_buyer",
  "hoa_is_subject",
  "hoa_is_not_subject",
  "seller_disclosure_received",
  "seller_disclosure_not_received",
  "seller_disclosure_not_required",
  "property_as_is",
  "property_as_is_with_repairs",
  "water_disclosure_received",
  "water_disclosure_not_received",
  "water_disclosure_not_required",
  "buyer_possession_at_closing",
  "buyer_possession_by_lease",
  "seller_contributes_to_buyer_broker_comp",
  "seller_contribution_dollar_selected",
  "seller_contribution_percent_selected",
  "buyer_contributes_to_seller_broker_comp",
  "buyer_contribution_dollar_selected",
  "buyer_contribution_percent_selected",
]);

const CONTRACT_DATE_SOURCE_PATHS = new Set<string>([
  "closing_date",
  "effective_date",
]);

export function isContractDetailsSourcePath(
  value: string,
): value is ContractDetailsSourcePath {
  return CONTRACT_DETAILS_SOURCE_PATHS.includes(
    value as ContractDetailsSourcePath,
  );
}

export function isBooleanContractDetailsSourcePath(
  sourcePath: string,
): boolean {
  return CONTRACT_BOOLEAN_SOURCE_PATHS.has(sourcePath.trim().toLowerCase());
}

export function isDateContractDetailsSourcePath(sourcePath: string): boolean {
  return CONTRACT_DATE_SOURCE_PATHS.has(sourcePath.trim().toLowerCase());
}

export function isMeaningfulContractText(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 && stringValue.toUpperCase() !== "NA";
}

export function resolveContractDetailsFieldValue(
  details: ContractDetailsRow,
  sourcePath: string,
): string | null {
  const path = sourcePath.trim().toLowerCase();
  if (!isContractDetailsSourcePath(path)) {
    return null;
  }

  const value = details[path];

  if (value == null) {
    return isBooleanContractDetailsSourcePath(path) ? "false" : null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const stringValue = String(value).trim();
  if (!stringValue) {
    return isBooleanContractDetailsSourcePath(path) ? "false" : null;
  }

  return stringValue;
}

export function resolveContractSurveyOptionSelected(
  details: ContractDetailsRow,
  option: ContractSurveyOption,
): boolean {
  return details.survey_option?.trim().toUpperCase() === option;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parseIsoDateParts(
  value: string | null | undefined,
): { day: number; month: number; year: number } | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const date = new Date(parsed);
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

export function resolveContractEffectiveDay(
  details: ContractDetailsRow,
): string | null {
  if (details.effective_day != null && String(details.effective_day).trim()) {
    return String(details.effective_day).trim();
  }

  const parts = parseIsoDateParts(details.effective_date);
  return parts ? String(parts.day) : null;
}

export function resolveContractEffectiveMonth(
  details: ContractDetailsRow,
): string | null {
  if (isMeaningfulContractText(details.effective_month)) {
    return String(details.effective_month).trim();
  }

  const parts = parseIsoDateParts(details.effective_date);
  if (!parts) {
    return null;
  }

  return MONTH_NAMES[parts.month - 1] ?? String(parts.month);
}

export function resolveContractEffectiveYear(
  details: ContractDetailsRow,
): string | null {
  if (details.effective_year != null && String(details.effective_year).trim()) {
    return String(details.effective_year).trim();
  }

  const parts = parseIsoDateParts(details.effective_date);
  return parts ? String(parts.year) : null;
}
