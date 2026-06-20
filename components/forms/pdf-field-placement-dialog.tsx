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
import type { PendingPdfPlacement } from "@/lib/types/template-pdf-field";

type PdfFieldPlacementDialogProps = {
  open: boolean;
  placement: PendingPdfPlacement | null;
  value: PdfMappingEditorInput;
  onChange: (value: PdfMappingEditorInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  catalogFields: Field[];
  pageWidth: number | null;
  pageHeight: number | null;
};

export function PdfFieldPlacementDialog({
  open,
  placement,
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  catalogFields,
  pageWidth,
  pageHeight,
}: PdfFieldPlacementDialogProps) {
  if (!open || !placement) {
    return null;
  }

  const validationError = validatePdfMappingEditorInput(value);

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
        disabled={isSubmitting}
        aria-label="Close placement dialog"
      />
      <Card className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-lg">
        <CardHeader>
          <CardTitle>Add template placement</CardTitle>
          <p className="text-sm text-muted-foreground">
            Page {placement.pageNumber} · position ({placement.xPosition},{" "}
            {placement.yPosition})
            {pageWidth != null && pageHeight != null
              ? ` · page ${pageWidth}×${pageHeight}`
              : ""}
          </p>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <PdfMappingFormFields
              value={value}
              onChange={onChange}
              catalogFields={catalogFields}
              showLayoutFields={false}
            />

            {(error || validationError) && (
              <p className="mt-4 text-sm text-destructive">
                {error ?? validationError}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !!validationError}>
              {isSubmitting ? "Saving..." : "Add placement"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
