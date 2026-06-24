"use client";

import { FieldMergeCanonicalFormFields } from "@/components/forms/field-merge-canonical-form-fields";
import { FieldMergeCanonicalNameAdvicePanel } from "@/components/forms/field-merge-canonical-name-advice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { FieldUsageCounts } from "@/lib/field-retire";
import {
  buildFieldMergePreview,
  executeFieldMerge,
  validateFieldMergeRequest,
  type FieldMergePreview,
  type FieldMergeResult,
} from "@/lib/field-merge";
import type { FieldMergeCandidateGroup } from "@/lib/field-merge-candidates";
import type { FieldMergeCanonicalNameSuggestion } from "@/lib/field-merge-canonical-names";
import { createClient } from "@/lib/supabase/client";
import {
  type Field,
  type FieldAdminInput,
  fieldToAdminInput,
} from "@/lib/types/field";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type FieldMergeDialogProps = {
  open: boolean;
  group: FieldMergeCandidateGroup | null;
  canonicalField: Field | null;
  duplicateFields: Field[];
  allFields: Field[];
  usageByFieldId: Record<string, FieldUsageCounts>;
  onClose: () => void;
  onMerged: (result: FieldMergeResult) => void;
};

type DialogStep = "edit" | "confirm";

export function FieldMergeDialog({
  open,
  group,
  canonicalField,
  duplicateFields,
  allFields,
  usageByFieldId,
  onClose,
  onMerged,
}: FieldMergeDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<DialogStep>("edit");
  const [canonicalInput, setCanonicalInput] = useState<FieldAdminInput | null>(
    null,
  );
  const [preview, setPreview] = useState<FieldMergePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgeTypeMismatch, setAcknowledgeTypeMismatch] = useState(false);
  const [acknowledgeConflicts, setAcknowledgeConflicts] = useState(false);

  useEffect(() => {
    if (!open || !canonicalField) {
      return;
    }

    setStep("edit");
    setCanonicalInput(fieldToAdminInput(canonicalField));
    setPreview(null);
    setError(null);
    setAcknowledgeTypeMismatch(false);
    setAcknowledgeConflicts(false);
  }, [open, canonicalField?.id]);

  const mergeGroupFieldIds = useMemo(
    () =>
      group?.fields.map((entry) => entry.field.id) ??
      (canonicalField
        ? [canonicalField.id, ...duplicateFields.map((field) => field.id)]
        : []),
    [canonicalField, duplicateFields, group],
  );

  const validation = useMemo(() => {
    if (!canonicalField || !canonicalInput) {
      return { error: null, warnings: [] };
    }

    return validateFieldMergeRequest({
      canonicalFieldId: canonicalField.id,
      duplicateFieldIds: duplicateFields.map((field) => field.id),
      canonicalInput,
      canonicalField,
      allFields,
      mergeGroupFieldIds,
    });
  }, [
    allFields,
    canonicalField,
    canonicalInput,
    duplicateFields,
    mergeGroupFieldIds,
  ]);

  const hasConflicts =
    (preview?.templateMappingConflicts.length ?? 0) > 0 ||
    (preview?.instanceConflicts.length ?? 0) > 0 ||
    (preview?.packetMappingConflicts.length ?? 0) > 0;

  const hasTypeMismatch = (preview?.typeMismatchWarnings.length ?? 0) > 0;

  const handleApplySuggestion = (suggestion: FieldMergeCanonicalNameSuggestion) => {
    if (!canonicalInput) {
      return;
    }

    setCanonicalInput({
      ...canonicalInput,
      field_key: suggestion.fieldKey.toUpperCase(),
      field_label: suggestion.fieldLabel,
      field_name: suggestion.fieldLabel,
    });
    setError(null);
  };

  if (!open || !group || !canonicalField || !canonicalInput) {
    return null;
  }

  const handleContinueToConfirm = async () => {
    if (validation.error) {
      setError(validation.error);
      return;
    }

    setIsLoadingPreview(true);
    setError(null);

    try {
      const supabase = createClient();
      const nextPreview = await buildFieldMergePreview(supabase, {
        canonicalField,
        duplicateFields,
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
    if (!preview) {
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
        canonicalFieldId: canonicalField.id,
        duplicateFieldIds: duplicateFields.map((field) => field.id),
        canonicalInput,
        canonicalField,
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

  const isBusy = isLoadingPreview || isMerging;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        disabled={isBusy}
        aria-label="Close merge dialog"
      />
      <Card className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col shadow-lg">
        <CardHeader className="shrink-0">
          <CardTitle>
            {step === "edit" ? "Prepare field merge" : "Confirm field merge"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Merge {duplicateFields.length} duplicate field
            {duplicateFields.length === 1 ? "" : "s"} into{" "}
            <code className="text-xs">{canonicalField.field_key}</code>.
          </p>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-6">
          {step === "edit" && (
            <>
              <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm">
                <p className="font-medium">Duplicate fields to merge</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
                  {duplicateFields.map((field) => (
                    <li key={field.id} className="break-all">
                      {field.field_key}
                    </li>
                  ))}
                </ul>
              </div>

              <FieldMergeCanonicalNameAdvicePanel
                advice={group.canonicalNameAdvice}
                onApplySuggestion={handleApplySuggestion}
              />

              <FieldMergeCanonicalFormFields
                value={canonicalInput}
                onChange={setCanonicalInput}
              />
            </>
          )}

          {step === "confirm" && preview && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border bg-muted/20 px-4 py-3">
                <p className="font-medium">Canonical target</p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Current key</dt>
                    <dd className="break-all font-mono text-xs">
                      {canonicalField.field_key}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Proposed key</dt>
                    <dd className="break-all font-mono text-xs">
                      {preview.proposedCanonicalKey}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Proposed label</dt>
                    <dd>{preview.proposedCanonicalLabel}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-md border px-4 py-3">
                <p className="font-medium">Duplicates being merged</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
                  {duplicateFields.map((field) => (
                    <li key={field.id} className="break-all">
                      {field.field_key}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md border px-4 py-3">
                <p className="font-medium">Affected records</p>
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
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <p className="font-medium text-amber-950 dark:text-amber-100">
                    Data/widget type warnings
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {preview.typeMismatchWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-start gap-2">
                    <Checkbox
                      id="ack_type_mismatch"
                      checked={acknowledgeTypeMismatch}
                      onCheckedChange={(checked) =>
                        setAcknowledgeTypeMismatch(checked === true)
                      }
                    />
                    <Label htmlFor="ack_type_mismatch" className="font-normal">
                      I understand the canonical field types differ from one or
                      more duplicate fields.
                    </Label>
                  </div>
                </div>
              )}

              {hasConflicts && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <p className="font-medium text-amber-950 dark:text-amber-100">
                    Placement conflicts detected
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Conflicting duplicate records will be set to INACTIVE for
                    manual review. They will not be remapped automatically.
                  </p>
                  <ul className="mt-3 space-y-2 text-xs">
                    {preview.templateMappingConflicts.map((conflict) => (
                      <li key={conflict.mappingId} className="break-words">
                        Template mapping for {conflict.duplicateFieldKey} on form{" "}
                        {conflict.formId}, page {conflict.pageNumber}
                        {conflict.occurrenceIndex != null
                          ? ` (#${conflict.occurrenceIndex})`
                          : ""}
                        : {conflict.reason}
                      </li>
                    ))}
                    {preview.instanceConflicts.map((conflict) => (
                      <li key={conflict.instanceId} className="break-words">
                        Packet value for {conflict.duplicateFieldKey} on packet
                        form {conflict.packetFormId}: {conflict.reason}
                      </li>
                    ))}
                    {preview.packetMappingConflicts.map((conflict) => (
                      <li key={conflict.mappingId} className="break-words">
                        Packet placement for {conflict.duplicateFieldKey} on
                        packet form {conflict.packetFormId}, page{" "}
                        {conflict.pageNumber}: {conflict.reason}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-start gap-2">
                    <Checkbox
                      id="ack_conflicts"
                      checked={acknowledgeConflicts}
                      onCheckedChange={(checked) =>
                        setAcknowledgeConflicts(checked === true)
                      }
                    />
                    <Label htmlFor="ack_conflicts" className="font-normal">
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
                onClick={() => setStep("edit")}
                disabled={isBusy}
              >
                Back
              </Button>
            )}
            {step === "edit" ? (
              <Button
                type="button"
                onClick={() => void handleContinueToConfirm()}
                disabled={isBusy || !!validation.error}
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
