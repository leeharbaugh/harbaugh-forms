export type ListingAgreementDetailsRow = {
  compensation_model?: string | null;
  listing_commission_percent?: number | string | null;
  listing_flat_fee?: number | string | null;
  listing_compensation_other?: string | null;
  seller_is_foreign_person?: boolean | null;
  listing_begin_date?: string | null;
  listing_end_date?: string | null;
  lease_listing_begin_date?: string | null;
  lease_listing_end_date?: string | null;
  late_charges_incurred_day?: number | string | null;
  list_price?: number | string | null;
  keybox_authorized?: boolean | null;
  seller_authorizes_buyer_expense_disclosure?: boolean | null;
  protection_period_days?: number | string | null;
  payment_county?: string | null;
  other_fees_reimbursable_expenses?: string | null;
  scheduling_company?: string | null;
  exclusions?: string | null;
  special_provisions?: string | null;
  financing_conventional?: boolean | null;
  financing_va?: boolean | null;
  financing_fha?: boolean | null;
  financing_cash?: boolean | null;
  financing_texas_veterans?: boolean | null;
  financing_owner_finance?: boolean | null;
  financing_other?: boolean | null;
  financing_other_description?: string | null;
  known_financial_obligations_exception?: string | null;
  known_liens_exception?: string | null;
  employer_relocation_company?: string | null;
  known_districts?: string | null;
  mls_filing_option?: string | null;
  mls_delayed_days?: number | string | null;
  mls_delayed_purpose?: string | null;
  internet_display_option?: string | null;
  intermediary_allowed?: boolean | null;
  add_iabs?: boolean | null;
  add_sellers_disclosure?: boolean | null;
  add_lead_paint?: boolean | null;
  add_t47?: boolean | null;
  add_mud_notice?: boolean | null;
  add_pid_notice?: boolean | null;
  add_hoa_request?: boolean | null;
  add_mortgage_info_request?: boolean | null;
  add_mineral_info?: boolean | null;
  add_onsite_sewer_info?: boolean | null;
  add_property_insurance?: boolean | null;
  add_flood_hazard?: boolean | null;
  add_condo_addendum?: boolean | null;
  add_keybox_tenant?: boolean | null;
  add_authorization_to_advertise?: boolean | null;
  add_other_document?: boolean | null;
  add_other_document_description?: string | null;
  [key: string]: unknown;
};

const LISTING_BOOLEAN_SOURCE_PATHS = new Set<string>([
  "seller_is_foreign_person",
  "keybox_authorized",
  "seller_authorizes_buyer_expense_disclosure",
  "financing_conventional",
  "financing_va",
  "financing_fha",
  "financing_cash",
  "financing_texas_veterans",
  "financing_owner_finance",
  "financing_other",
  "intermediary_allowed",
  "add_iabs",
  "add_sellers_disclosure",
  "add_lead_paint",
  "add_t47",
  "add_mud_notice",
  "add_pid_notice",
  "add_hoa_request",
  "add_mortgage_info_request",
  "add_mineral_info",
  "add_onsite_sewer_info",
  "add_property_insurance",
  "add_flood_hazard",
  "add_condo_addendum",
  "add_keybox_tenant",
  "add_authorization_to_advertise",
  "add_other_document",
]);

const LISTING_DATE_SOURCE_PATHS = new Set<string>([
  "listing_begin_date",
  "listing_end_date",
  "lease_listing_begin_date",
  "lease_listing_end_date",
]);

const LISTING_SCALAR_SOURCE_PATHS = new Set<string>([
  "compensation_model",
  "listing_commission_percent",
  "listing_flat_fee",
  "listing_compensation_other",
  "buyer_broker_comp_percent",
  "buyer_broker_comp_flat_fee",
  "other_fees_reimbursable_expenses",
  "protection_period_days",
  "payment_county",
  "scheduling_company",
  "exclusions",
  "special_provisions",
  "financing_other_description",
  "known_financial_obligations_exception",
  "known_liens_exception",
  "employer_relocation_company",
  "known_districts",
  "mls_filing_option",
  "mls_delayed_days",
  "mls_delayed_purpose",
  "internet_display_option",
  "add_other_document_description",
  "list_price",
  "late_charges_incurred_day",
]);

export function isListingAgreementDetailsSourcePath(value: string): boolean {
  const path = value.trim().toLowerCase();
  if (!path) {
    return false;
  }

  return (
    LISTING_BOOLEAN_SOURCE_PATHS.has(path) ||
    LISTING_DATE_SOURCE_PATHS.has(path) ||
    LISTING_SCALAR_SOURCE_PATHS.has(path)
  );
}

export function isBooleanListingAgreementDetailsSourcePath(
  sourcePath: string,
): boolean {
  return LISTING_BOOLEAN_SOURCE_PATHS.has(sourcePath.trim().toLowerCase());
}

export function isMeaningfulListingText(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 && stringValue.toUpperCase() !== "NA";
}

export function resolveListingAgreementDetailsFieldValue(
  details: ListingAgreementDetailsRow,
  sourcePath: string,
): string | null {
  const path = sourcePath.trim().toLowerCase();
  if (!isListingAgreementDetailsSourcePath(path)) {
    return null;
  }

  const value = details[path];

  if (value == null) {
    return isBooleanListingAgreementDetailsSourcePath(path) ? "false" : null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const stringValue = String(value).trim();
  if (!stringValue) {
    return isBooleanListingAgreementDetailsSourcePath(path) ? "false" : null;
  }

  return stringValue;
}

export function resolveListingBrokerNoCoopPercentOrFlatFeeSelected(
  details: ListingAgreementDetailsRow,
): boolean {
  if (details.compensation_model !== "BROKER_NO_COOP") {
    return false;
  }

  const percent = Number(details.listing_commission_percent ?? 0);
  const flatFee = Number(details.listing_flat_fee ?? 0);

  return (
    (Number.isFinite(percent) && percent > 0) ||
    (Number.isFinite(flatFee) && flatFee > 0)
  );
}

export function resolveListingBrokerNoCoopOtherSelected(
  details: ListingAgreementDetailsRow,
): boolean {
  if (details.compensation_model !== "BROKER_NO_COOP") {
    return false;
  }

  return isMeaningfulListingText(details.listing_compensation_other);
}

export function resolveSellerIsNotForeignPerson(
  details: ListingAgreementDetailsRow,
): boolean {
  return details.seller_is_foreign_person === false;
}
