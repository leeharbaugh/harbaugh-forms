import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filterSuggestibleAcroformCatalogFields,
  resolveSuggestibleAcroformFieldId,
} from "@/lib/acroform-catalog-field-filter";
import {
  canAutoPreselectAcroformSuggestion,
  findAutoPreselectSuggestion,
  type AcroformPreselectContext,
} from "@/lib/acroform-match-preselect";
import { upsertAcroformFieldMappingMemory } from "@/lib/acroform-field-mapping-memory";
import {
  isHighConfidenceAcroformSuggestion,
  suggestAcroformFieldMatchesWithMemory,
  type AcroformFieldSuggestion,
} from "@/lib/acroform-field-suggestions";
import { createActiveField } from "@/lib/field-catalog";
import { loadActiveFormFieldMappingsForForm } from "@/lib/field-instances";
import type { PdfFieldInventoryItem } from "@/lib/pdf-field-extract";
import {
  type ApplyPdfFieldInventoryResult,
  applyPdfFieldInventory,
} from "@/lib/pdf-field-inventory";
import type { AcroformFieldMappingMemory } from "@/lib/types/acroform-field-mapping-memory";
import { emptyFieldSourceInput } from "@/lib/types/field-source";
import type { Field } from "@/lib/types/field";
import type { FormFieldMapping } from "@/lib/types/form-field-mapping";

export type AcroformWizardRowStatus = "map" | "unmapped" | "skip";

export type AcroformWizardRow = {
  item: PdfFieldInventoryItem;
  status: AcroformWizardRowStatus;
  selectedFieldId: string | null;
  rememberMapping: boolean;
  suggestions: AcroformFieldSuggestion[];
  existingMapping: FormFieldMapping | null;
  isHighConfidence: boolean;
  userSelected: boolean;
};

export type AcroformWizardSummary = {
  detectedCount: number;
  excludedSignatureCount: number;
  availableCount: number;
  alreadyImportedCount: number;
  highConfidenceCount: number;
  needsReviewCount: number;
};

export type AcroformWizardNewFieldInput = {
  field_key: string;
  field_label: string;
  field_data_type: string;
  field_widget_type: string;
};

function acroFormMappingKey(
  pdfFieldName: string,
  occurrenceIndex: number,
): string {
  return `${pdfFieldName.trim().toLowerCase()}:${occurrenceIndex}`;
}

function itemLabel(item: PdfFieldInventoryItem): string {
  return item.fieldLabel || item.pdfFieldName;
}

export function buildAcroformWizardSummary(params: {
  detectedCount: number;
  excludedSignatureCount: number;
  rows: AcroformWizardRow[];
}): AcroformWizardSummary {
  const availableCount = params.rows.filter((row) => row.status !== "skip").length;
  const alreadyImportedCount = params.rows.filter(
    (row) => row.existingMapping != null,
  ).length;
  const highConfidenceCount = params.rows.filter(
    (row) =>
      row.status !== "skip" &&
      row.isHighConfidence &&
      row.selectedFieldId != null,
  ).length;
  const needsReviewCount = params.rows.filter(
    (row) =>
      row.status !== "skip" &&
      !row.existingMapping &&
      (!row.isHighConfidence || row.selectedFieldId == null),
  ).length;

  return {
    detectedCount: params.detectedCount,
    excludedSignatureCount: params.excludedSignatureCount,
    availableCount,
    alreadyImportedCount,
    highConfidenceCount,
    needsReviewCount,
  };
}

function buildPreselectContext(params: {
  strictMode: boolean;
  formCode: string | null;
  formName: string | null;
  item: PdfFieldInventoryItem;
}): AcroformPreselectContext {
  return {
    strictMode: params.strictMode,
    formCode: params.formCode,
    formName: params.formName,
    pdfFieldName: params.item.pdfFieldName,
    pdfLabel: itemLabel(params.item),
  };
}

function deriveRowPreselection(params: {
  item: PdfFieldInventoryItem;
  suggestions: AcroformFieldSuggestion[];
  existingMapping: FormFieldMapping | null;
  catalogFields: Field[];
  strictMode: boolean;
  formCode: string | null;
  formName: string | null;
  preserveUserSelection?: boolean;
  userSelected?: boolean;
  selectedFieldId?: string | null;
}): Pick<
  AcroformWizardRow,
  "selectedFieldId" | "status" | "rememberMapping" | "isHighConfidence" | "userSelected"
> {
  const preselectContext = buildPreselectContext({
    strictMode: params.strictMode,
    formCode: params.formCode,
    formName: params.formName,
    item: params.item,
  });

  if (params.preserveUserSelection && params.userSelected) {
    const selectedFieldId = params.selectedFieldId ?? null;
    return {
      selectedFieldId,
      status: selectedFieldId != null ? "map" : "unmapped",
      rememberMapping: false,
      isHighConfidence: false,
      userSelected: true,
    };
  }

  let selectedFieldId = resolveSuggestibleAcroformFieldId(
    params.existingMapping?.field_id,
    params.catalogFields,
    { pdfFieldName: params.item.pdfFieldName },
  );

  const autoSuggestion = findAutoPreselectSuggestion(
    params.suggestions,
    preselectContext,
  );

  if (!selectedFieldId && autoSuggestion) {
    selectedFieldId = autoSuggestion.field.id;
  }

  const bestSuggestion = autoSuggestion ?? params.suggestions[0] ?? null;
  const isHighConfidence = bestSuggestion
    ? isHighConfidenceAcroformSuggestion(bestSuggestion) &&
      canAutoPreselectAcroformSuggestion(bestSuggestion, preselectContext)
    : false;

  return {
    selectedFieldId,
    status: selectedFieldId != null ? "map" : "unmapped",
    rememberMapping:
      selectedFieldId != null &&
      autoSuggestion != null &&
      canAutoPreselectAcroformSuggestion(autoSuggestion, preselectContext),
    isHighConfidence,
    userSelected: false,
  };
}

export function buildAcroformWizardRows(params: {
  items: PdfFieldInventoryItem[];
  catalogFields: Field[];
  memoryEntries: AcroformFieldMappingMemory[];
  existingMappings: FormFieldMapping[];
  formCode: string | null;
  formName?: string | null;
  strictMode?: boolean;
}): AcroformWizardRow[] {
  const existingByAcroKey = new Map<string, FormFieldMapping>();
  for (const mapping of params.existingMappings) {
    const pdfFieldName = mapping.pdf_field_name?.trim();
    if (!pdfFieldName) {
      continue;
    }

    existingByAcroKey.set(
      acroFormMappingKey(pdfFieldName, mapping.occurrence_index ?? 0),
      mapping,
    );
  }

  const strictMode = params.strictMode ?? true;
  const formName = params.formName ?? null;

  return params.items.map((item) => {
    const acroKey = acroFormMappingKey(item.pdfFieldName, item.occurrenceIndex);
    const existingMapping = existingByAcroKey.get(acroKey) ?? null;
    const suggestions = suggestAcroformFieldMatchesWithMemory(
      item.pdfFieldName,
      itemLabel(item),
      params.catalogFields,
      params.memoryEntries,
      {
        formCode: params.formCode,
        formName,
        limit: 5,
      },
    );
    const preselection = deriveRowPreselection({
      item,
      suggestions,
      existingMapping,
      catalogFields: params.catalogFields,
      strictMode,
      formCode: params.formCode,
      formName,
    });

    return {
      item,
      suggestions,
      existingMapping,
      ...preselection,
    };
  });
}

export function applyAcroformStrictModeToRows(
  rows: AcroformWizardRow[],
  params: {
    strictMode: boolean;
    formCode: string | null;
    formName: string | null;
    catalogFields: Field[];
  },
): AcroformWizardRow[] {
  return rows.map((row) => {
    if (row.status === "skip") {
      return row;
    }

    const preselection = deriveRowPreselection({
      item: row.item,
      suggestions: row.suggestions,
      existingMapping: row.existingMapping,
      catalogFields: params.catalogFields,
      strictMode: params.strictMode,
      formCode: params.formCode,
      formName: params.formName,
      preserveUserSelection: true,
      userSelected: row.userSelected,
      selectedFieldId: row.selectedFieldId,
    });

    return {
      ...row,
      ...preselection,
    };
  });
}

export function acceptAllHighConfidenceRows(
  rows: AcroformWizardRow[],
  params: {
    strictMode: boolean;
    formCode: string | null;
    formName: string | null;
  },
): AcroformWizardRow[] {
  return rows.map((row) => {
    if (row.status === "skip") {
      return row;
    }

    const preselectContext = buildPreselectContext({
      strictMode: params.strictMode,
      formCode: params.formCode,
      formName: params.formName,
      item: row.item,
    });

    const autoSuggestion = findAutoPreselectSuggestion(
      row.suggestions,
      preselectContext,
    );

    if (!autoSuggestion) {
      return row;
    }

    return {
      ...row,
      status: "map",
      selectedFieldId: autoSuggestion.field.id,
      rememberMapping: canAutoPreselectAcroformSuggestion(
        autoSuggestion,
        preselectContext,
      ),
      isHighConfidence: true,
      userSelected: true,
    };
  });
}

export async function applyAcroformImportWizard(
  supabase: SupabaseClient,
  params: {
    formId: number;
    formCode: string | null;
    formName: string | null;
    rows: AcroformWizardRow[];
    detectedCount: number;
    skippedSignatureFields: number;
    newFields?: Array<{
      rowKey: string;
      input: AcroformWizardNewFieldInput;
    }>;
  },
): Promise<ApplyPdfFieldInventoryResult> {
  const rowKey = (item: PdfFieldInventoryItem) =>
    acroFormMappingKey(item.pdfFieldName, item.occurrenceIndex);

  const newFieldByRowKey = new Map(
    (params.newFields ?? []).map((entry) => [entry.rowKey, entry.input]),
  );

  const resolvedRows = params.rows.map((row) => ({ ...row }));

  for (const row of resolvedRows) {
    if (row.status === "skip") {
      continue;
    }

    const key = rowKey(row.item);
    const newFieldInput = newFieldByRowKey.get(key);
    if (newFieldInput && !row.selectedFieldId) {
      const created = await createActiveField(supabase, {
        field_key: newFieldInput.field_key,
        field_name: newFieldInput.field_key,
        field_label: newFieldInput.field_label,
        field_data_type: newFieldInput.field_data_type,
        field_widget_type: newFieldInput.field_widget_type,
        default_value: "",
        default_checked: false,
        required: false,
        notes: "Created during AcroForm import review.",
        ...emptyFieldSourceInput(),
      });
      row.selectedFieldId = created.id;
      row.status = "map";
    }
  }

  const importItems: PdfFieldInventoryItem[] = [];
  const fieldIdByRowKey = new Map<string, string | null>();
  const rememberByRowKey = new Map<string, boolean>();

  for (const row of resolvedRows) {
    const key = rowKey(row.item);

    if (row.status === "skip") {
      continue;
    }

    importItems.push(row.item);

    if (row.status === "unmapped") {
      fieldIdByRowKey.set(key, null);
      rememberByRowKey.set(key, false);
      continue;
    }

    fieldIdByRowKey.set(key, row.selectedFieldId);
    rememberByRowKey.set(key, row.rememberMapping);
  }

  const result = await applyPdfFieldInventory(
    supabase,
    params.formId,
    importItems,
    {
      detectedCount: params.detectedCount,
      skippedSignatureFields: params.skippedSignatureFields,
      fieldIdResolver: (item, existingMapping) => {
        const key = rowKey(item);
        if (fieldIdByRowKey.has(key)) {
          return fieldIdByRowKey.get(key) ?? null;
        }

        return existingMapping?.field_id ?? null;
      },
      updateFieldId: true,
    },
  );

  for (const row of resolvedRows) {
    if (row.status !== "map" || !row.rememberMapping || !row.selectedFieldId) {
      continue;
    }

    const best = row.suggestions.find(
      (suggestion) => suggestion.field.id === row.selectedFieldId,
    );

    await upsertAcroformFieldMappingMemory(supabase, {
      pdfFieldName: row.item.pdfFieldName,
      pdfFieldType: row.item.pdfFieldType,
      fieldId: row.selectedFieldId,
      formCode: params.formCode,
      formName: params.formName,
      confidence: best?.score ?? null,
      notes: best?.reason ?? null,
    });
  }

  return result;
}

export async function loadAcroformWizardContext(
  supabase: SupabaseClient,
  formId: number,
): Promise<{
  existingMappings: FormFieldMapping[];
  catalogFields: Field[];
}> {
  const existingMappings = await loadActiveFormFieldMappingsForForm(
    supabase,
    formId,
  );
  const { data, error } = await supabase
    .from("fields")
    .select("*")
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }

  const catalogFields = filterSuggestibleAcroformCatalogFields(
    (data as Field[]) ?? [],
  );

  return {
    existingMappings,
    catalogFields,
  };
}

export function formatAcroformConfidence(score: number | null | undefined): string {
  if (score == null) {
    return "—";
  }

  return `${Math.round(score * 100)}%`;
}

export { acroFormMappingKey as acroformWizardRowKey };
