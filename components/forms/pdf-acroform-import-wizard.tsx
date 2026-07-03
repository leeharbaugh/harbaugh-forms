"use client";

import { AcroformSuggestionMatch } from "@/components/forms/acroform-suggestion-match";
import { CatalogFieldPicker } from "@/components/forms/catalog-field-picker";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acceptAllHighConfidenceRows,
  acroformWizardRowKey,
  applyAcroformImportWizard,
  applyAcroformStrictModeToRows,
  buildAcroformWizardRows,
  buildAcroformWizardSummary,
  formatAcroformConfidence,
  loadAcroformWizardContext,
  type AcroformWizardRow,
  type AcroformWizardSummary,
} from "@/lib/acroform-import-wizard";
import { isThirdPartyFinancingAddendumForm } from "@/lib/acroform-match-preselect";
import {
  humanizePdfFieldName,
  suggestCatalogKeyFromPdfFieldName,
} from "@/lib/acroform-catalog-field-filter";
import { loadActiveAcroformFieldMappingMemory } from "@/lib/acroform-field-mapping-memory";
import { isHighConfidenceAcroformSuggestion } from "@/lib/acroform-field-suggestions";
import { createActiveField } from "@/lib/field-catalog";
import type { ApplyPdfFieldInventoryResult } from "@/lib/pdf-field-inventory";
import type { PdfFieldInventoryResult } from "@/lib/pdf-field-extract";
import { createClient } from "@/lib/supabase/client";
import type { Field } from "@/lib/types/field";
import type { Form } from "@/lib/types/form";
import { AUTHENTISIGN_EXCLUSION_MESSAGE } from "@/lib/types/authentisign-excluded-fields";
import { emptyFieldSourceInput } from "@/lib/types/field-source";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PdfAcroformImportWizardProps = {
  open: boolean;
  form: Form;
  inventory: PdfFieldInventoryResult;
  catalogFields: Field[];
  onFinish: (result: ApplyPdfFieldInventoryResult) => void;
  onCancel: () => void;
};

function SummaryPanel({ summary }: { summary: AcroformWizardSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-muted-foreground">Detected</dt>
        <dd className="font-medium tabular-nums">{summary.detectedCount}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Excluded (signatures)</dt>
        <dd className="font-medium tabular-nums">{summary.excludedSignatureCount}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Available</dt>
        <dd className="font-medium tabular-nums">{summary.availableCount}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Already imported</dt>
        <dd className="font-medium tabular-nums">{summary.alreadyImportedCount}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">High confidence</dt>
        <dd className="font-medium tabular-nums">{summary.highConfidenceCount}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Needs review</dt>
        <dd className="font-medium tabular-nums">{summary.needsReviewCount}</dd>
      </div>
    </dl>
  );
}

function WizardFieldRow({
  row,
  rowIndex,
  catalogFields,
  onChange,
  onCatalogFieldCreated,
}: {
  row: AcroformWizardRow;
  rowIndex: number;
  catalogFields: Field[];
  onChange: (index: number, patch: Partial<AcroformWizardRow>) => void;
  onCatalogFieldCreated: (field: Field) => void;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createKey, setCreateKey] = useState(
    suggestCatalogKeyFromPdfFieldName(row.item.pdfFieldName),
  );
  const [createLabel, setCreateLabel] = useState(
    humanizePdfFieldName(row.item.pdfFieldName),
  );

  const bestSuggestion = row.suggestions[0] ?? null;

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border p-3",
        row.status === "skip" && "opacity-60",
        row.existingMapping && "border-emerald-300/60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-medium">{row.item.pdfFieldName}</p>
          <p className="text-xs text-muted-foreground">
            {row.item.pdfFieldType ?? "Unknown type"} · page {row.item.pageNumber}
            {row.existingMapping ? " · already imported" : ""}
          </p>
        </div>
        {bestSuggestion && (
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-medium",
              isHighConfidenceAcroformSuggestion(bestSuggestion)
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-muted text-muted-foreground",
            )}
          >
            {formatAcroformConfidence(bestSuggestion.score)}
          </span>
        )}
      </div>

      {row.suggestions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium">Suggested matches</p>
          <div className="flex flex-wrap gap-2">
            {row.suggestions.map((suggestion) => (
              <AcroformSuggestionMatch
                key={suggestion.field.id}
                suggestion={suggestion}
                selected={row.selectedFieldId === suggestion.field.id}
                disabled={row.status === "skip"}
                onSelect={() =>
                  onChange(rowIndex, {
                    status: "map",
                    selectedFieldId: suggestion.field.id,
                    userSelected: true,
                    rememberMapping: false,
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No reusable field match found.
        </p>
      )}

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Native PDF field:{" "}
          <span className="font-mono text-foreground">{row.item.pdfFieldName}</span>
        </p>
        <CatalogFieldPicker
          id={`wizard-field-${rowIndex}`}
          fields={catalogFields}
          value={row.selectedFieldId ?? ""}
          onChange={(fieldId) =>
            onChange(rowIndex, {
              selectedFieldId: fieldId || null,
              status: fieldId ? "map" : "unmapped",
              userSelected: true,
              rememberMapping: false,
            })
          }
          disabled={row.status === "skip"}
          label="Map to field"
          placeholder="Search reusable catalog fields..."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            checked={row.status === "map"}
            disabled={row.status === "skip"}
            onChange={() =>
              onChange(rowIndex, {
                status: "map",
                userSelected: true,
              })
            }
          />
          Map field
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            checked={row.status === "unmapped"}
            onChange={() =>
              onChange(rowIndex, {
                status: "unmapped",
                selectedFieldId: null,
                userSelected: true,
                rememberMapping: false,
              })
            }
          />
          Leave unmapped
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            checked={row.status === "skip"}
            onChange={() =>
              onChange(rowIndex, {
                status: "skip",
                selectedFieldId: null,
                userSelected: true,
                rememberMapping: false,
              })
            }
          />
          Skip field
        </label>
      </div>

      <div className="flex items-center gap-2">
        <AppCheckbox
          id={`remember-${rowIndex}`}
          checked={row.rememberMapping}
          disabled={row.status !== "map" || !row.selectedFieldId}
          onCheckedChange={(checked) =>
            onChange(rowIndex, { rememberMapping: checked === true })
          }
        />
        <Label htmlFor={`remember-${rowIndex}`} className="text-xs font-normal">
          Remember this mapping for future imports
        </Label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={row.status === "skip"}
          onClick={() => setShowCreateForm((current) => !current)}
        >
          {showCreateForm ? "Hide create field" : "Create new reusable field"}
        </Button>
      </div>

      {showCreateForm && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div className="space-y-1">
            <Label htmlFor={`create-key-${rowIndex}`}>Field key</Label>
            <Input
              id={`create-key-${rowIndex}`}
              value={createKey}
              onChange={(event) => setCreateKey(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`create-label-${rowIndex}`}>Label</Label>
            <Input
              id={`create-label-${rowIndex}`}
              value={createLabel}
              onChange={(event) => setCreateLabel(event.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void (async () => {
                const supabase = createClient();
                const created = await createActiveField(supabase, {
                  field_key: createKey,
                  field_name: createKey,
                  field_label: createLabel,
                  field_data_type: "text",
                  field_widget_type: row.item.fieldWidgetType,
                  default_value: "",
                  default_checked: false,
                  required: false,
                  notes: "Created during AcroForm import review.",
                  ...emptyFieldSourceInput(),
                });
                onCatalogFieldCreated(created);
                onChange(rowIndex, {
                  status: "map",
                  selectedFieldId: created.id,
                  userSelected: true,
                  rememberMapping: false,
                });
                setShowCreateForm(false);
              })();
            }}
          >
            Create & select field
          </Button>
        </div>
      )}
    </div>
  );
}

export function PdfAcroformImportWizard({
  open,
  form,
  inventory,
  catalogFields: initialCatalogFields,
  onFinish,
  onCancel,
}: PdfAcroformImportWizardProps) {
  const [rows, setRows] = useState<AcroformWizardRow[]>([]);
  const [catalogFields, setCatalogFields] = useState(initialCatalogFields);
  const [strictMode, setStrictMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCatalogFields(initialCatalogFields);
  }, [initialCatalogFields]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setStrictMode(true);

    void (async () => {
      try {
        const supabase = createClient();
        const [memoryEntries, context] = await Promise.all([
          loadActiveAcroformFieldMappingMemory(supabase),
          loadAcroformWizardContext(supabase, form.id),
        ]);

        setCatalogFields(context.catalogFields);
        setRows(
          buildAcroformWizardRows({
            items: inventory.items,
            catalogFields: context.catalogFields,
            memoryEntries,
            existingMappings: context.existingMappings,
            formCode: form.form_code,
            formName: form.form_name,
            strictMode: true,
          }),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to prepare AcroForm import review.",
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [open, form.id, form.form_code, inventory.items]);

  const summary = useMemo(
    () =>
      buildAcroformWizardSummary({
        detectedCount: inventory.detectedCount,
        excludedSignatureCount: inventory.skipped.length,
        rows,
      }),
    [inventory.detectedCount, inventory.skipped.length, rows],
  );

  const updateRow = (index: number, patch: Partial<AcroformWizardRow>) => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const handleStrictModeChange = (checked: boolean) => {
    setStrictMode(checked);
    setRows((current) =>
      applyAcroformStrictModeToRows(current, {
        strictMode: checked,
        formCode: form.form_code,
        formName: form.form_name,
        catalogFields,
      }),
    );
  };

  const handleAcceptAllHighConfidence = () => {
    setRows((current) =>
      acceptAllHighConfidenceRows(current, {
        strictMode,
        formCode: form.form_code,
        formName: form.form_name,
      }),
    );
  };

  const handleCatalogFieldCreated = (field: Field) => {
    setCatalogFields((current) =>
      current.some((entry) => entry.id === field.id)
        ? current
        : [...current, field],
    );
  };

  const handleFinish = async () => {
    setIsFinishing(true);
    setError(null);

    try {
      const supabase = createClient();
      const result = await applyAcroformImportWizard(supabase, {
        formId: form.id,
        formCode: form.form_code,
        formName: form.form_name,
        rows,
        detectedCount: inventory.detectedCount,
        skippedSignatureFields: inventory.skipped.length,
      });
      onFinish(result);
    } catch (finishError) {
      setError(
        finishError instanceof Error
          ? finishError.message
          : "Failed to finish AcroForm import.",
      );
    } finally {
      setIsFinishing(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onCancel}
        disabled={isFinishing}
        aria-label="Close import wizard"
      />
      <Card className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col shadow-lg">
        <CardHeader className="shrink-0">
          <CardTitle>AcroForm Import & Review</CardTitle>
          <p className="text-sm text-muted-foreground">
            {form.form_name} ({form.form_code}) · review field mappings before
            importing into the template editor.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <AppCheckbox
                id="acroform-strict-mode"
                checked={strictMode}
                onCheckedChange={(checked) =>
                  handleStrictModeChange(checked === true)
                }
              />
              <span>
                Strict mode (only remembered and exact matches are preselected)
              </span>
            </label>
            {isThirdPartyFinancingAddendumForm(form.form_code, form.form_name) && (
              <span className="rounded border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                Financing addendum: ambiguous fields stay unmapped by default
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <SummaryPanel summary={summary} />
          {inventory.skipped.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {inventory.skipped.length} signature or initials field
              {inventory.skipped.length === 1 ? "" : "s"} excluded.{" "}
              {AUTHENTISIGN_EXCLUSION_MESSAGE}
            </p>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading suggestions...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No importable AcroForm fields found.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => (
                <WizardFieldRow
                  key={acroformWizardRowKey(
                    row.item.pdfFieldName,
                    row.item.occurrenceIndex,
                  )}
                  row={row}
                  rowIndex={index}
                  catalogFields={catalogFields}
                  onChange={updateRow}
                  onCatalogFieldCreated={handleCatalogFieldCreated}
                />
              ))}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="shrink-0 flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isFinishing || isLoading}
            onClick={handleAcceptAllHighConfidence}
          >
            Accept all recommended
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isFinishing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleFinish()}
              disabled={isFinishing || isLoading || rows.length === 0}
            >
              {isFinishing ? "Finishing..." : "Finish Import"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
