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
import type { Field } from "@/lib/types/field";
import {
  type FieldInput,
  validateFieldInput,
} from "@/lib/types/field";
import {
  type PdfMappingEditorInput,
  validatePdfPlacementInput,
} from "@/lib/types/pdf-field-mapping-editor";
import { formatFieldMappingReference } from "@/lib/types/form-field-mapping";
import {
  isAcroformImportedMapping,
  type PlacedPdfField,
} from "@/lib/types/template-pdf-field";

type PdfFieldEditDialogProps = {
  open: boolean;
  mapping: PlacedPdfField | null;
  placementValue: PdfMappingEditorInput;
  fieldValue: FieldInput;
  catalogFields: Field[];
  onPlacementChange: (value: PdfMappingEditorInput) => void;
  onFieldChange: (value: FieldInput) => void;
  onSubmit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  isDeleting: boolean;
  error: string | null;
};

function NativePdfFieldPanel({ mapping }: { mapping: PlacedPdfField }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Native PDF field
      </h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <dt className="text-muted-foreground">PDF field name</dt>
        <dd className="font-mono">{mapping.pdf_field_name ?? "—"}</dd>
        <dt className="text-muted-foreground">PDF field type</dt>
        <dd className="font-mono">{mapping.pdf_field_type ?? "—"}</dd>
        <dt className="text-muted-foreground">Export value</dt>
        <dd className="font-mono">{mapping.pdf_export_value ?? "—"}</dd>
        <dt className="text-muted-foreground">Imported from AcroForm</dt>
        <dd>Yes</dd>
      </dl>
    </div>
  );
}

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

  const isAcroform = isAcroformImportedMapping(mapping);
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
            Placement {formatFieldMappingReference(mapping.id)}
            {mapping.field_key ? ` · ${mapping.field_key}` : ""}
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
                  {isAcroform
                    ? "Placement label, required flag, and notes for this template. Coordinates come from the PDF."
                    : "These settings apply only to this form template placement."}
                </p>
              </div>
              {isAcroform && <NativePdfFieldPanel mapping={mapping} />}
              <PdfPlacementFormFields
                value={placementValue}
                onChange={onPlacementChange}
                showLayoutFields
                layoutReadOnly={isAcroform}
              />
            </section>

            <section className="space-y-4 border-t pt-6">
              <div>
                <h3 className="text-sm font-semibold">
                  Section B: Reusable field source mapping
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  These settings update the field definition. Configure source
                  type, source path, and resolver to control how this field gets
                  its value.
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
