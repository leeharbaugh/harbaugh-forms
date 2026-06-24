"use client";

import { PdfFieldDefinitionFormFields } from "@/components/forms/pdf-field-definition-form-fields";
import { PdfPlacementFormFields } from "@/components/forms/pdf-placement-form-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type FieldInput,
  validateFieldInput,
} from "@/lib/types/field";
import {
  type PdfMappingEditorInput,
  validatePdfPlacementInput,
} from "@/lib/types/pdf-field-mapping-editor";
import type { PlacedPdfField } from "@/lib/types/template-pdf-field";
import { formatFieldMappingReference } from "@/lib/types/form-field-mapping";

type PdfFieldEditDialogProps = {
  open: boolean;
  mapping: PlacedPdfField | null;
  placementValue: PdfMappingEditorInput;
  fieldValue: FieldInput;
  onPlacementChange: (value: PdfMappingEditorInput) => void;
  onFieldChange: (value: FieldInput) => void;
  onSubmit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  isDeleting: boolean;
  error: string | null;
};

export function PdfFieldEditDialog({
  open,
  mapping,
  placementValue,
  fieldValue,
  onPlacementChange,
  onFieldChange,
  onSubmit,
  onDelete,
  onCancel,
  isSubmitting,
  isDeleting,
  error,
}: PdfFieldEditDialogProps) {
  if (!open || !mapping) {
    return null;
  }

  const placementValidationError = validatePdfPlacementInput(placementValue);
  const fieldValidationError = validateFieldInput(fieldValue);
  const validationError = placementValidationError ?? fieldValidationError;
  const isBusy = isSubmitting || isDeleting;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (validationError) return;
    onSubmit();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onCancel}
        disabled={isBusy}
        aria-label="Close edit dialog"
      />
      <Card className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto shadow-lg">
        <CardHeader>
          <CardTitle>Edit field mapping</CardTitle>
          <p className="text-sm text-muted-foreground">
            Placement {formatFieldMappingReference(mapping.id)} ·{" "}
            {mapping.field_key}
          </p>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-8">
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">
                  Section A: Placement on this form
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  These settings apply only to this form template placement.
                </p>
              </div>
              <PdfPlacementFormFields
                value={placementValue}
                onChange={onPlacementChange}
                showLayoutFields
              />
            </section>

            <section className="space-y-4 border-t pt-6">
              <div>
                <h3 className="text-sm font-semibold">
                  Section B: Reusable field source mapping
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  These settings update the catalog field definition used across
                  all forms.
                </p>
              </div>
              <PdfFieldDefinitionFormFields
                value={fieldValue}
                onChange={onFieldChange}
              />
            </section>

            {(error || validationError) && (
              <p className="text-sm text-destructive">
                {error ?? validationError}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
              disabled={isBusy}
            >
              {isDeleting ? "Removing..." : "Remove from this form"}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy || !!validationError}>
                {isSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
