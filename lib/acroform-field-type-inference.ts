/**
 * Infer whether an AcroForm / catalog field name represents a dollar amount.
 * Used when field_data_type was not explicitly set to "currency" (common for
 * AcroForm imports that default every text widget to text/text).
 *
 * Does NOT add a "$" — callers only use this to gate comma formatting.
 */

/** Official TREC 40-11 / TXR 1901 dollar blanks (poor native AcroForm names). */
export const TREC_40_11_CURRENCY_PDF_FIELD_NAMES = [
  // Conventional first mortgage principal $
  "years with interest not to exceed",
  // Conventional second mortgage principal $
  "excluding",
  // Texas Veterans Land Board loan $
  "for a period in the total amount of",
  // FHA insured loan $
  "excluding any financed MIP amortizable monthly for not less",
  // VA / USDA loan $ (misnamed from nearby "excluding…" / origination text)
  "excluding_2",
  "Charges as shown on Buyers Loan Estimate for the loan not to exceed",
  // Reverse mortgage original principal $
  "per annum for the first_4",
  "Conversion Mortgage loan in the original principal amount of",
  // Other financing principal $
  "excluding_2-1",
  // FHA/VA Paragraph 4 appraised value $
  "value of the Property established by the Department of Veterans Affairs",
] as const;

const TREC_40_11_CURRENCY_NAME_SET = new Set(
  TREC_40_11_CURRENCY_PDF_FIELD_NAMES.map((name) => normalizeFieldNameKey(name)),
);

/** Positive cues that a name is a dollar amount (not a rate/term). */
const CURRENCY_NAME_INCLUDE =
  /\b(amount|principal|sales[_\s-]?price|list[_\s-]?price|purchase[_\s-]?price|loan[_\s-]?amount|down[_\s-]?payment|cash[_\s-]?portion|financed[_\s-]?(amount|portion)|appraised[_\s-]?value|earnest|option[_\s-]?fee|contribution|reimbursement|retainer|dues)\b/i;

/**
 * Negative cues — percentages, terms, phones, IDs, etc. must not get commas.
 * Checked after the TREC 40-11 exact-name allowlist.
 */
const CURRENCY_NAME_EXCLUDE =
  /\b(percent|percentage|interest|rate|apr|origination|year|years|month|months|day|days|term|section|phone|zip|postal|license|mls|email|date|checkbox)\b/i;

export function normalizeFieldNameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

/**
 * True when the given PDF field name / field key / label looks like a
 * dollar-amount blank that should be comma-formatted (no "$").
 */
export function looksLikeCurrencyAmountFieldName(
  ...candidates: Array<string | null | undefined>
): boolean {
  for (const raw of candidates) {
    if (!raw?.trim()) {
      continue;
    }

    const normalized = normalizeFieldNameKey(raw);
    if (!normalized) {
      continue;
    }

    if (TREC_40_11_CURRENCY_NAME_SET.has(normalized)) {
      return true;
    }

    // Form-prefixed keys: txr_1901_excluding → excluding
    const withoutFormPrefix = normalized.replace(
      /^(txr_1901|trec_40_11|txr1901|trec4011)_/i,
      "",
    );
    if (
      withoutFormPrefix !== normalized &&
      TREC_40_11_CURRENCY_NAME_SET.has(withoutFormPrefix)
    ) {
      return true;
    }

    // Underscores are word chars for \b, so also test a spaced form of the key.
    const spaced = normalized.replace(/_/g, " ");
    const haystacks = [raw, normalized, spaced];

    if (haystacks.some((value) => CURRENCY_NAME_EXCLUDE.test(value))) {
      continue;
    }

    if (haystacks.some((value) => CURRENCY_NAME_INCLUDE.test(value))) {
      return true;
    }
  }

  return false;
}

export function inferAcroformCatalogTypes(input: {
  pdfFieldType?: string | null;
  checkBox?: boolean;
  radioButton?: boolean;
  pdfFieldName?: string | null;
}): { fieldWidgetType: string; fieldDataType: string } {
  const pdfFieldType = (input.pdfFieldType ?? "").trim();

  if (pdfFieldType === "Btn") {
    if (input.checkBox || input.radioButton) {
      return { fieldWidgetType: "checkbox", fieldDataType: "boolean" };
    }
  }

  if (looksLikeCurrencyAmountFieldName(input.pdfFieldName)) {
    // Match seeded currency fields: data type currency, widget stays text.
    return { fieldWidgetType: "text", fieldDataType: "currency" };
  }

  if (pdfFieldType === "Ch") {
    return { fieldWidgetType: "text", fieldDataType: "text" };
  }

  return { fieldWidgetType: "text", fieldDataType: "text" };
}

export function isCurrencyAmountField(field: {
  field_data_type?: string | null;
  field_widget_type?: string | null;
  field_key?: string | null;
  field_label?: string | null;
  pdf_field_name?: string | null;
  mapping_name?: string | null;
} | null | undefined): boolean {
  if (!field) {
    return false;
  }

  const dataType = (field.field_data_type ?? "").toLowerCase();
  const widgetType = (field.field_widget_type ?? "").toLowerCase();
  if (dataType === "currency" || widgetType === "currency") {
    return true;
  }

  // AcroForm imports often leave dollar blanks as plain text. Fall back to
  // name heuristics (TREC 40-11 allowlist + amount-like labels) so PDF fill
  // and editors still comma-format without a "$".
  return looksLikeCurrencyAmountFieldName(
    field.pdf_field_name,
    field.field_key,
    field.field_label,
    field.mapping_name,
  );
}
