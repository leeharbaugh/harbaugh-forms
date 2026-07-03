import type { AcroformFieldSuggestion } from "@/lib/acroform-field-suggestions";
import { normalizeAcroformMatchText } from "@/lib/acroform-field-suggestions";

export const ACROFORM_AUTO_PRESELECT_MIN_SCORE = 0.95;

export const GENERIC_ACROFORM_MATCH_TERMS = [
  "loan",
  "years",
  "year",
  "interest",
  "amount",
  "percent",
  "pct",
  "financing",
  "property",
  "mortgage",
  "rate",
  "term",
  "month",
  "months",
  "principal",
  "balance",
  "sum",
] as const;

const FINANCING_AMOUNT_TERMS = [
  "amount",
  "principal",
  "balance",
  "sum",
  "dollar",
  "price",
] as const;

const FINANCING_TERM_TERMS = [
  "year",
  "years",
  "term",
  "month",
  "months",
  "exceed",
  "not_to_exceed",
  "nottoexceed",
] as const;

const FINANCING_RATE_TERMS = [
  "rate",
  "percent",
  "pct",
  "apr",
  "interest_rate",
] as const;

export type AcroformPreselectContext = {
  strictMode: boolean;
  formCode: string | null;
  formName: string | null;
  pdfFieldName: string;
  pdfLabel: string;
};

export type FinancingSemanticCategory = "amount" | "term" | "rate";

function tokenize(value: string): string[] {
  return normalizeAcroformMatchText(value)
    .split("_")
    .filter((token) => token.length >= 3);
}

function haystackIncludesTerm(haystack: string, term: string): boolean {
  const normalizedHaystack = normalizeAcroformMatchText(haystack);
  const normalizedTerm = normalizeAcroformMatchText(term);
  return normalizedHaystack.includes(normalizedTerm);
}

export function isThirdPartyFinancingAddendumForm(
  formCode: string | null | undefined,
  formName: string | null | undefined,
): boolean {
  const haystack = `${formCode ?? ""} ${formName ?? ""}`.toLowerCase();
  return (
    haystack.includes("third party financing") ||
    haystack.includes("third_party_financing") ||
    haystack.includes("third-party-financing") ||
    haystack.includes("trec-41") ||
    haystack.includes("trec_41") ||
    haystack.includes("txr-1904") ||
    haystack.includes("txr_1904")
  );
}

export function getFinancingSemanticCategories(
  text: string,
): Set<FinancingSemanticCategory> {
  const categories = new Set<FinancingSemanticCategory>();

  for (const term of FINANCING_AMOUNT_TERMS) {
    if (haystackIncludesTerm(text, term)) {
      categories.add("amount");
    }
  }

  for (const term of FINANCING_TERM_TERMS) {
    if (haystackIncludesTerm(text, term)) {
      categories.add("term");
    }
  }

  for (const term of FINANCING_RATE_TERMS) {
    if (haystackIncludesTerm(text, term)) {
      categories.add("rate");
    }
  }

  return categories;
}

export function financingCategoriesConflict(
  pdfCategories: Set<FinancingSemanticCategory>,
  fieldCategories: Set<FinancingSemanticCategory>,
): boolean {
  if (pdfCategories.size === 0 || fieldCategories.size === 0) {
    return false;
  }

  if (pdfCategories.has("amount") && fieldCategories.has("term")) {
    return true;
  }

  if (pdfCategories.has("term") && fieldCategories.has("amount")) {
    return true;
  }

  if (
    pdfCategories.has("amount") &&
    fieldCategories.has("rate") &&
    !pdfCategories.has("rate")
  ) {
    return true;
  }

  if (
    pdfCategories.has("rate") &&
    fieldCategories.has("amount") &&
    !pdfCategories.has("amount")
  ) {
    return true;
  }

  return false;
}

export function isFinancingCategoryMismatch(
  pdfFieldName: string,
  pdfLabel: string,
  fieldKey: string,
  fieldLabel: string,
): boolean {
  const pdfCategories = getFinancingSemanticCategories(
    `${pdfFieldName} ${pdfLabel}`,
  );
  const fieldCategories = getFinancingSemanticCategories(
    `${fieldKey} ${fieldLabel}`,
  );

  return financingCategoriesConflict(pdfCategories, fieldCategories);
}

function overlappingDistinctiveTokens(
  pdfFieldName: string,
  pdfLabel: string,
  fieldKey: string,
  fieldLabel: string,
): string[] {
  const pdfTokens = new Set(tokenize(`${pdfFieldName} ${pdfLabel}`));
  const fieldTokens = tokenize(`${fieldKey} ${fieldLabel}`);
  const genericTerms = new Set<string>(GENERIC_ACROFORM_MATCH_TERMS);

  return fieldTokens.filter(
    (token) => pdfTokens.has(token) && !genericTerms.has(token),
  );
}

export function isGenericOnlyAcroformMatch(
  suggestion: AcroformFieldSuggestion,
  pdfFieldName: string,
  pdfLabel: string,
): boolean {
  if (
    suggestion.matchKind === "memory_form" ||
    suggestion.matchKind === "memory_global" ||
    suggestion.matchKind === "exact_field_key" ||
    suggestion.matchKind === "near_exact_field_key"
  ) {
    return false;
  }

  const field = suggestion.field;
  const fieldLabel =
    field.field_label?.trim() || field.field_name?.trim() || "";

  if (
    overlappingDistinctiveTokens(
      pdfFieldName,
      pdfLabel,
      field.field_key,
      fieldLabel,
    ).length > 0
  ) {
    return false;
  }

  const pdfHaystack = normalizeAcroformMatchText(`${pdfFieldName} ${pdfLabel}`);
  const fieldHaystack = normalizeAcroformMatchText(
    `${field.field_key} ${fieldLabel}`,
  );

  const hasGenericOverlap = GENERIC_ACROFORM_MATCH_TERMS.some(
    (term) =>
      haystackIncludesTerm(pdfHaystack, term) &&
      haystackIncludesTerm(fieldHaystack, term),
  );

  if (!hasGenericOverlap) {
    return suggestion.matchKind === "heuristic";
  }

  return (
    suggestion.matchKind === "label_similarity" ||
    suggestion.matchKind === "heuristic" ||
    suggestion.matchKind === "memory_normalized"
  );
}

export function formatAcroformMatchSourceLabel(
  matchKind: AcroformFieldSuggestion["matchKind"],
): string {
  switch (matchKind) {
    case "memory_form":
      return "Remembered (this form)";
    case "memory_global":
      return "Remembered (global)";
    case "memory_normalized":
      return "Remembered (normalized PDF name)";
    case "exact_field_key":
      return "Exact field key";
    case "near_exact_field_key":
      return "Near-exact field key";
    case "label_similarity":
      return "Label similarity";
    case "heuristic":
    default:
      return "Heuristic";
  }
}

function sourceCategoryMakesSense(
  suggestion: AcroformFieldSuggestion,
  context: AcroformPreselectContext,
): boolean {
  const field = suggestion.field;
  const fieldLabel =
    field.field_label?.trim() || field.field_name?.trim() || "";

  if (
    isFinancingCategoryMismatch(
      context.pdfFieldName,
      context.pdfLabel,
      field.field_key,
      fieldLabel,
    )
  ) {
    return false;
  }

  if (
    isThirdPartyFinancingAddendumForm(context.formCode, context.formName) &&
    suggestion.matchKind !== "memory_form" &&
    suggestion.matchKind !== "memory_global" &&
    suggestion.matchKind !== "exact_field_key" &&
    suggestion.matchKind !== "near_exact_field_key"
  ) {
    return false;
  }

  return true;
}

export function canAutoPreselectAcroformSuggestion(
  suggestion: AcroformFieldSuggestion,
  context: AcroformPreselectContext,
): boolean {
  if (!sourceCategoryMakesSense(suggestion, context)) {
    return false;
  }

  if (isGenericOnlyAcroformMatch(suggestion, context.pdfFieldName, context.pdfLabel)) {
    return false;
  }

  if (
    suggestion.matchKind === "memory_form" ||
    suggestion.matchKind === "memory_global"
  ) {
    return true;
  }

  if (context.strictMode) {
    if (
      suggestion.matchKind === "exact_field_key" ||
      suggestion.matchKind === "near_exact_field_key"
    ) {
      return suggestion.score >= ACROFORM_AUTO_PRESELECT_MIN_SCORE;
    }

    return false;
  }

  if (
    suggestion.matchKind === "exact_field_key" ||
    suggestion.matchKind === "near_exact_field_key"
  ) {
    return suggestion.score >= ACROFORM_AUTO_PRESELECT_MIN_SCORE;
  }

  return (
    suggestion.score >= ACROFORM_AUTO_PRESELECT_MIN_SCORE &&
    suggestion.matchKind !== "memory_normalized" &&
    suggestion.matchKind !== "label_similarity" &&
    suggestion.matchKind !== "heuristic"
  );
}

export function shouldShowAcroformSuggestion(
  suggestion: AcroformFieldSuggestion,
  context: Pick<
    AcroformPreselectContext,
    "formCode" | "formName" | "pdfFieldName" | "pdfLabel"
  >,
): boolean {
  const field = suggestion.field;
  const fieldLabel =
    field.field_label?.trim() || field.field_name?.trim() || "";

  if (
    isThirdPartyFinancingAddendumForm(context.formCode, context.formName) &&
    isFinancingCategoryMismatch(
      context.pdfFieldName,
      context.pdfLabel,
      field.field_key,
      fieldLabel,
    )
  ) {
    return false;
  }

  return true;
}

export function findAutoPreselectSuggestion(
  suggestions: AcroformFieldSuggestion[],
  context: AcroformPreselectContext,
): AcroformFieldSuggestion | null {
  for (const suggestion of suggestions) {
    if (canAutoPreselectAcroformSuggestion(suggestion, context)) {
      return suggestion;
    }
  }

  return null;
}

export function isAutoPreselectableAcroformSuggestion(
  suggestion: AcroformFieldSuggestion,
  context: AcroformPreselectContext,
): boolean {
  return canAutoPreselectAcroformSuggestion(suggestion, context);
}
