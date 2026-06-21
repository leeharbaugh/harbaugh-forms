"use client";

import { Button } from "@/components/ui/button";
import {
  AUTHENTISIGN_EXCLUSION_MESSAGE,
  type PdfFieldInventoryItem,
  type PdfFieldInventoryResult,
  type PdfFieldInventorySkippedItem,
} from "@/lib/pdf-field-extract";
import type { ApplyPdfFieldInventoryResult } from "@/lib/pdf-field-inventory";

type PdfFieldInventoryPanelProps = {
  inventory: PdfFieldInventoryResult | null;
  applyResult: ApplyPdfFieldInventoryResult | null;
  isExtracting: boolean;
  isApplying: boolean;
  error: string | null;
  onExtract: () => void;
  onApply: () => void;
};

function SkippedList({ skipped }: { skipped: PdfFieldInventorySkippedItem[] }) {
  if (skipped.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">
        Skipped {skipped.length} Authentisign field
        {skipped.length === 1 ? "" : "s"}
      </p>
      <p className="mt-1">{AUTHENTISIGN_EXCLUSION_MESSAGE}</p>
      <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto font-mono">
        {skipped.slice(0, 8).map((item) => (
          <li key={`${item.fieldKey}-${item.pageNumber}`}>
            {item.fieldKey} · page {item.pageNumber}
          </li>
        ))}
        {skipped.length > 8 && (
          <li>+ {skipped.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}

function InventoryPreview({ items }: { items: PdfFieldInventoryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No importable AcroForm fields were found on this PDF.
      </p>
    );
  }

  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border px-3 py-2 text-xs">
      {items.slice(0, 12).map((item) => (
        <li key={`${item.fieldKey}-${item.pageNumber}-${item.occurrenceIndex}`}>
          <span className="font-mono">{item.fieldKey}</span>
          <span className="text-muted-foreground">
            {" "}
            · page {item.pageNumber}
            {item.occurrenceIndex > 0 ? ` · #${item.occurrenceIndex}` : ""}
          </span>
        </li>
      ))}
      {items.length > 12 && (
        <li className="text-muted-foreground">+ {items.length - 12} more</li>
      )}
    </ul>
  );
}

export function PdfFieldInventoryPanel({
  inventory,
  applyResult,
  isExtracting,
  isApplying,
  error,
  onExtract,
  onApply,
}: PdfFieldInventoryPanelProps) {
  const importableCount = inventory?.items.length ?? 0;

  return (
    <div className="space-y-3 border-b px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">PDF field inventory</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Extract AcroForm fields from the template PDF. Initials and signatures
          are ignored.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isExtracting || isApplying}
          onClick={onExtract}
        >
          {isExtracting ? "Extracting..." : "Extract PDF fields"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={
            isExtracting || isApplying || !inventory || importableCount === 0
          }
          onClick={onApply}
        >
          {isApplying ? "Applying..." : `Apply inventory (${importableCount})`}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {inventory && (
        <>
          <InventoryPreview items={inventory.items} />
          <SkippedList skipped={inventory.skipped} />
        </>
      )}

      {applyResult && (
        <p className="text-xs text-muted-foreground">
          Applied {applyResult.createdMappings} mapping
          {applyResult.createdMappings === 1 ? "" : "s"} ·{" "}
          {applyResult.createdFields} new field
          {applyResult.createdFields === 1 ? "" : "s"} ·{" "}
          {applyResult.reusedFields} reused ·{" "}
          {applyResult.skippedAuthentisign} Authentisign skipped ·{" "}
          {applyResult.skippedExistingMappings} already mapped
        </p>
      )}
    </div>
  );
}
