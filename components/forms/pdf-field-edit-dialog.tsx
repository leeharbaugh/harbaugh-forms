"use client";

import { PdfMappingFormFields } from "@/components/forms/pdf-mapping-form-fields";
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
  type PdfMappingEditorInput,
  validatePdfMappingEditorInput,
} from "@/lib/types/pdf-field-mapping-editor";
import type { PlacedPdfField } from "@/lib/types/template-pdf-field";
import { formatFieldMappingReference } from "@/lib/types/form-field-mapping";

type PdfFieldEditDialogProps = {
  open: boolean;
  mapping: PlacedPdfField | null;
  value: PdfMappingEditorInput;
  onChange: (value: PdfMappingEditorInput) => void;
  onSubmit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  isDeleting: boolean;
  error: string | null;
  catalogFields: Field[];
};

export function PdfFieldEditDialog({
  open,
  mapping,
  value,
  onChange,
  onSubmit,
  onDelete,
  onCancel,
  isSubmitting,
  isDeleting,
  error,
  catalogFields,
}: PdfFieldEditDialogProps) {
  if (!open || !mapping) {
    return null;
  }

  const validationError = validatePdfMappingEditorInput(value);
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
      <Card className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-lg">
        <CardHeader>
          <CardTitle>Edit template placement</CardTitle>
          <p className="text-sm text-muted-foreground">
            Placement {formatFieldMappingReference(mapping.id)} ·{" "}
            {mapping.field_key}
          </p>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <PdfMappingFormFields
              value={value}
              onChange={onChange}
              catalogFields={catalogFields}
              showLayoutFields
            />

            {(error || validationError) && (
              <p className="mt-4 text-sm text-destructive">
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
