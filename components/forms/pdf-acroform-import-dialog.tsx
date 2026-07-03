"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AUTHENTISIGN_EXCLUSION_MESSAGE } from "@/lib/types/authentisign-excluded-fields";

type PdfAcroformImportDialogProps = {
  open: boolean;
  detectedCount: number;
  importableCount: number;
  skippedSignatureCount: number;
  isImporting: boolean;
  onImport: () => void;
  onContinueManual: () => void;
};

export function PdfAcroformImportDialog({
  open,
  detectedCount,
  importableCount,
  skippedSignatureCount,
  isImporting,
  onImport,
  onContinueManual,
}: PdfAcroformImportDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onContinueManual}
        disabled={isImporting}
        aria-label="Close import dialog"
      />
      <Card className="relative z-10 w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Import AcroForm fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This PDF contains {detectedCount} fillable AcroForm field
            {detectedCount === 1 ? "" : "s"}. Import them as form-specific
            fields with coordinates from the PDF?
          </p>
          <p className="text-xs text-muted-foreground">
            Each field will be created with <strong>manual_only</strong> source.
            You can configure source mappings later using the Edit dialog.
          </p>
          {skippedSignatureCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {skippedSignatureCount} signature or initials field
              {skippedSignatureCount === 1 ? "" : "s"} will be excluded.{" "}
              {AUTHENTISIGN_EXCLUSION_MESSAGE}
            </p>
          )}
          {importableCount === 0 && (
            <p className="text-xs text-destructive">
              No importable fields remain after excluding signature and initials
              fields.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onContinueManual}
            disabled={isImporting}
          >
            Continue with Manual Mapping
          </Button>
          <Button
            type="button"
            onClick={onImport}
            disabled={isImporting || importableCount === 0}
          >
            {isImporting ? "Importing..." : "Import AcroForm Fields"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
