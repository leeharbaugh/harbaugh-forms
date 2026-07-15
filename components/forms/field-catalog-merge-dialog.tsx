"use client";

import { CatalogFieldPicker } from "@/components/forms/catalog-field-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Label } from "@/components/ui/label";
import {
  getBulkFieldUsageCounts,
  getFieldUsageCounts,
  type FieldUsageCounts,
} from "@/lib/field-retire";
import {
  buildFieldMergePreview,
  executeFieldMerge,
  validateFieldMergeRequest,
  type FieldMergePreview,
  type FieldMergeResult,
} from "@/lib/field-merge";
import { createClient } from "@/lib/supabase/client";
import {
  type Field,
  fieldToAdminInput,
  formatFieldReference,
} from "@/lib/types/field";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type FieldCatalogMergeDialogProps = {
  open: boolean;
  sourceField: Field | null;
  onClose: () => void;
  onMerged: (result: FieldMergeResult) => void;
};

type DialogStep = "select" | "confirm";

function UsageCountPanel({
  title,
  usage,
  isLoading,
}: {
  title: string;
  usage: FieldUsageCounts | null;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{title}</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading usage…</p>
      ) : usage ? (
        <dl className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Form template placements</dt>
            <dd className="font-medium tabular-nums">
              {usage.formFieldMappings}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Packet field values</dt>
            <dd className="font-medium tabular-nums">{usage.fieldInstances}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Packet placement overrides</dt>
            <dd className="font-medium tabular-nums">
              {usage.fieldInstanceMappings}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Usage unavailable.</p>
      )}
    </div>
  );
}

export function FieldCatalogMergeDialog({
  open,
  sourceField,
  onClose,
  onMerged,
}: FieldCatalogMergeDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<DialogStep>("select");
  const [allFields, setAllFields] = useState<Field[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [targetFieldId, setTargetFieldId] = useState("");
  const [sourceUsage, setSourceUsage] = useState<FieldUsageCounts | null>(null);
  const [targetUsage, setTargetUsage] = useState<FieldUsageCounts | null>(null);
  const [isLoadingSourceUsage, setIsLoadingSourceUsage] = useState(false);
  const [isLoadingTargetUsage, setIsLoadingTargetUsage] = useState(false);
  const [preview, setPreview] = useState<FieldMergePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgeTypeMismatch, setAcknowledgeTypeMismatch] = useState(false);
  const [acknowledgeConflicts, setAcknowledgeConflicts] = useState(false);

  useEffect(() => {
    if (!open || !sourceField) {
      return;
    }

    setStep("select");
    setTargetFieldId("");
    setSourceUsage(null);
    setTargetUsage(null);
    setPreview(null);
    setError(null);
    setAcknowledgeTypeMismatch(false);
    setAcknowledgeConflicts(false);

    let cancelled = false;

    const load = async () => {
      setIsLoadingFields(true);
      setIsLoadingSourceUsage(true);

      try {
        const supabase = createClient();
        const [fieldsResult, usage] = await Promise.all([
          supabase
            .from("fields")
            .select("*")
            .in("status", ["ACTIVE", "INACTIVE"])
            .order("field_key", { ascending: true }),
          getFieldUsageCounts(supabase, sourceField.id),
        ]);

        if (cancelled) {
          return;
        }

        if (fieldsResult.error) {
          setError(fieldsResult.error.message);
          setAllFields([]);
        } else {
          setAllFields((fieldsResult.data as Field[]) ?? []);
        }

        setSourceUsage(usage);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load field catalog.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFields(false);
          setIsLoadingSourceUsage(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, sourceField?.id]);

  const targetField = useMemo(
    () => allFields.find((field) => field.id === targetFieldId) ?? null,
    [allFields, targetFieldId],
  );

  const pickerFields = useMemo(
    () =>
      allFields.filter(
        (field) =>
          field.status === "ACTIVE" && field.id !== sourceField?.id,
      ),
    [allFields, sourceField?.id],
  );

  const mergeGroupFieldIds = useMemo(
    () =>
      sourceField && targetField
        ? [sourceField.id, targetField.id]
        : sourceField
          ? [sourceField.id]
          : [],
    [sourceField, targetField],
  );

  const canonicalInput = useMemo(
    () => (targetField ? fieldToAdminInput(targetField) : null),
    [targetField],
  );

  const validation = useMemo(() => {
    if (!sourceField || !targetField || !canonicalInput) {
      return { error: null, warnings: [] };
    }

    return validateFieldMergeRequest({
      canonicalFieldId: targetField.id,
      duplicateFieldIds: [sourceField.id],
      canonicalInput,
      canonicalField: targetField,
      allFields,
      mergeGroupFieldIds,
    });
  }, [
    allFields,
    canonicalInput,
    mergeGroupFieldIds,
    sourceField,
    targetField,
  ]);

  useEffect(() => {
    if (!open || !targetField) {
      setTargetUsage(null);
      return;
    }

    let cancelled = false;
    setIsLoadingTargetUsage(true);
    setTargetUsage(null);

    const loadTargetUsage = async () => {
      try {
        const supabase = createClient();
        const usage = await getFieldUsageCounts(supabase, targetField.id);
        if (!cancelled) {
          setTargetUsage(usage);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load target field usage.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTargetUsage(false);
        }
      }
    };

    void loadTargetUsage();

    return () => {
      cancelled = true;
    };
  }, [open, targetField?.id]);

  const hasConflicts =
    (preview?.templateMappingConflicts.length ?? 0) > 0 ||
    (preview?.instanceConflicts.length ?? 0) > 0 ||
    (preview?.packetMappingConflicts.length ?? 0) > 0;

  const hasTypeMismatch = (preview?.typeMismatchWarnings.length ?? 0) > 0;

  if (!open || !sourceField) {
    return null;
  }

  const sourceLabel =
    sourceField.field_label?.trim() ||
    sourceField.field_name?.trim() ||
    sourceField.field_key;

  const handleContinueToConfirm = async () => {
    if (!targetField || !canonicalInput) {
      setError("Select a target field to merge into.");
      return;
    }

    if (validation.error) {
      setError(validation.error);
      return;
    }

    setIsLoadingPreview(true);
    setError(null);

    try {
      const supabase = createClient();
      const usageByFieldId = await getBulkFieldUsageCounts(supabase, [
        sourceField.id,
        targetField.id,
      ]);
      const nextPreview = await buildFieldMergePreview(supabase, {
        canonicalField: targetField,
        duplicateFields: [sourceField],
        canonicalInput,
        usageByFieldId,
        allFields,
        mergeGroupFieldIds,
      });
      setPreview(nextPreview);
      setStep("confirm");
      setAcknowledgeTypeMismatch(false);
      setAcknowledgeConflicts(false);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Failed to build merge preview.",
      );
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!preview || !targetField || !canonicalInput) {
      return;
    }

    if (hasTypeMismatch && !acknowledgeTypeMismatch) {
      setError("Confirm the data/widget type warnings before merging.");
      return;
    }

    if (hasConflicts && !acknowledgeConflicts) {
      setError("Review and acknowledge placement conflicts before merging.");
      return;
    }

    setIsMerging(true);
    setError(null);

    try {
      const supabase = createClient();
      const result = await executeFieldMerge(supabase, {
        canonicalFieldId: targetField.id,
        duplicateFieldIds: [sourceField.id],
        canonicalInput,
        canonicalField: targetField,
        allFields,
        mergeGroupFieldIds,
        preview,
      });
      onMerged(result);
      router.refresh();
      onClose();
    } catch (mergeError) {
      setError(
        mergeError instanceof Error
          ? mergeError.message
          : "Failed to merge fields.",
      );
    } finally {
      setIsMerging(false);
    }
  };

  const isBusy =
    isLoadingFields ||
    isLoadingPreview ||
    isMerging ||
    isLoadingSourceUsage ||
    isLoadingTargetUsage;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        disabled={isBusy}
        aria-label="Close merge field dialog"
      />
      <Card className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col shadow-lg">
        <CardHeader className="shrink-0">
          <CardTitle>
            {step === "select"
              ? "Merge this field into another field"
              : "Confirm field merge"}
          </CardTitle>
          {step === "select" && (
            <p className="text-sm text-muted-foreground">
              Reassign mappings and usage from{" "}
              <code className="text-xs">{sourceField.field_key}</code> to a
              canonical field, then retire the merged-away definition.
            </p>
          )}
        </CardHeader>

        <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {step === "select" && (
            <>
              <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm">
                <p className="font-medium">Field being merged away</p>
                <p className="mt-1">
                  {sourceLabel}{" "}
                  <span className="text-muted-foreground">
                    ({formatFieldReference(sourceField.id)})
                  </span>
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {sourceField.field_key}
                </p>
              </div>

              <UsageCountPanel
                title="Source field usage"
                usage={sourceUsage}
                isLoading={isLoadingSourceUsage}
              />

              <CatalogFieldPicker
                fields={pickerFields}
                value={targetFieldId}
                onChange={(fieldId) => {
                  setTargetFieldId(fieldId);
                  setError(null);
                }}
                disabled={isLoadingFields || isBusy}
                required
                label="Canonical target field"
              />

              {targetField && (
                <UsageCountPanel
                  title="Target field usage"
                  usage={targetUsage}
                  isLoading={isLoadingTargetUsage}
                />
              )}

              {validation.warnings.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                  <p className="font-medium text-warning">
                    Warnings
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {validation.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {step === "confirm" && preview && targetField && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border bg-muted/20 px-4 py-3">
                <p className="font-medium">Merge summary</p>
                <p className="mt-2">
                  <code className="text-xs">{sourceField.field_key}</code> will
                  be merged into{" "}
                  <code className="text-xs">{targetField.field_key}</code>. The
                  source field will be soft-deleted.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <UsageCountPanel
                  title="Source field usage"
                  usage={sourceUsage}
                  isLoading={false}
                />
                <UsageCountPanel
                  title="Target field usage"
                  usage={targetUsage}
                  isLoading={false}
                />
              </div>

              <div className="rounded-md border px-4 py-3">
                <p className="font-medium">Records to reassign</p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Form field mappings
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {preview.duplicateUsageTotals.formFieldMappings}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Field instances
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {preview.duplicateUsageTotals.fieldInstances}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Field instance mappings
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {preview.duplicateUsageTotals.fieldInstanceMappings}
                    </dd>
                  </div>
                </dl>
              </div>

              {hasTypeMismatch && (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3">
                  <p className="font-medium text-warning">
                    Data/widget type warnings
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {preview.typeMismatchWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-start gap-2">
                    <AppCheckbox
                      id="catalog_ack_type_mismatch"
                      checked={acknowledgeTypeMismatch}
                      onCheckedChange={(checked) =>
                        setAcknowledgeTypeMismatch(checked === true)
                      }
                    />
                    <Label
                      htmlFor="catalog_ack_type_mismatch"
                      className="font-normal"
                    >
                      I understand the field types differ between the source and
                      target fields.
                    </Label>
                  </div>
                </div>
              )}

              {hasConflicts && (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3">
                  <p className="font-medium text-warning">
                    Placement conflicts detected
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Conflicting source records will be set to INACTIVE for
                    manual review. They will not be remapped automatically.
                  </p>
                  <ul className="mt-3 space-y-2 text-xs">
                    {preview.templateMappingConflicts.map((conflict) => (
                      <li key={conflict.mappingId} className="break-words">
                        Template mapping on form {conflict.formId}, page{" "}
                        {conflict.pageNumber}
                        {conflict.occurrenceIndex != null
                          ? ` (#${conflict.occurrenceIndex})`
                          : ""}
                        : {conflict.reason}
                      </li>
                    ))}
                    {preview.instanceConflicts.map((conflict) => (
                      <li key={conflict.instanceId} className="break-words">
                        Packet value on packet form {conflict.packetFormId}:{" "}
                        {conflict.reason}
                      </li>
                    ))}
                    {preview.packetMappingConflicts.map((conflict) => (
                      <li key={conflict.mappingId} className="break-words">
                        Packet placement on packet form {conflict.packetFormId},
                        page {conflict.pageNumber}: {conflict.reason}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-start gap-2">
                    <AppCheckbox
                      id="catalog_ack_conflicts"
                      checked={acknowledgeConflicts}
                      onCheckedChange={(checked) =>
                        setAcknowledgeConflicts(checked === true)
                      }
                    />
                    <Label htmlFor="catalog_ack_conflicts" className="font-normal">
                      I have reviewed the conflicts and understand conflicting
                      records will remain inactive for manual cleanup.
                    </Label>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>

        <CardFooter className="shrink-0 flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <div className="flex flex-wrap gap-2">
            {step === "confirm" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("select");
                  setPreview(null);
                  setError(null);
                }}
                disabled={isBusy}
              >
                Back
              </Button>
            )}
            {step === "select" ? (
              <Button
                type="button"
                onClick={() => void handleContinueToConfirm()}
                disabled={
                  isBusy || !targetField || !!validation.error || isLoadingFields
                }
              >
                {isLoadingPreview ? "Preparing..." : "Review merge"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleConfirmMerge()}
                disabled={isBusy}
              >
                {isMerging ? "Merging..." : "Confirm merge"}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
