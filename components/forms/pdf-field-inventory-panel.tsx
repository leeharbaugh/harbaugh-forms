"use client";

import { Button } from "@/components/ui/button";
import {
  AUTHENTISIGN_EXCLUSION_MESSAGE,
  type PdfFieldInventoryItem,
  type PdfFieldInventoryResult,
  type PdfFieldInventorySkippedItem,
} from "@/lib/pdf-field-extract";
import type {
  ApplyPdfFieldInventoryDetailItem,
  ApplyPdfFieldInventoryResult,
} from "@/lib/pdf-field-inventory";
import { cn } from "@/lib/utils";
import { ChevronDown, X } from "lucide-react";
import { useId, useState } from "react";

type PdfFieldInventoryPanelProps = {
  inventory: PdfFieldInventoryResult | null;
  applyResult: ApplyPdfFieldInventoryResult | null;
  importReportDismissed: boolean;
  importReportKey: number;
  isExtracting: boolean;
  isApplying: boolean;
  error: string | null;
  onExtract: () => void;
  onImportReview: () => void;
  onDismissImportReport: () => void;
};

type CollapsibleSectionProps = {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  tone?: "default" | "warning";
};

function detailItemKey(item: ApplyPdfFieldInventoryDetailItem): string {
  return `${item.pdfFieldName}:${item.pageNumber}:${item.occurrenceIndex}`;
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
  tone = "default",
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  if (count === 0) {
    return null;
  }

  return (
    <div className="rounded-md border bg-background/80">
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs",
          tone === "warning" && "text-amber-900 dark:text-amber-200",
        )}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="font-medium">
          {title} ({count})
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div id={contentId} className="border-t px-3 py-2">
          {children}
        </div>
      )}
    </div>
  );
}

function FieldNameList({
  items,
  emptyMessage,
}: {
  items: ApplyPdfFieldInventoryDetailItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return emptyMessage ? (
      <p className="text-xs text-muted-foreground">{emptyMessage}</p>
    ) : null;
  }

  return (
    <ul className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
      {items.slice(0, 20).map((item) => (
        <li key={detailItemKey(item)}>
          {item.pdfFieldName} · page {item.pageNumber}
          {item.occurrenceIndex > 0 ? ` · #${item.occurrenceIndex}` : ""}
        </li>
      ))}
      {items.length > 20 && (
        <li className="font-sans">+ {items.length - 20} more</li>
      )}
    </ul>
  );
}

function SkippedFieldList({ skipped }: { skipped: PdfFieldInventorySkippedItem[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{AUTHENTISIGN_EXCLUSION_MESSAGE}</p>
      <ul className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
        {skipped.slice(0, 20).map((item) => (
          <li key={`${item.pdfFieldName}-${item.pageNumber}`}>
            {item.pdfFieldName} · page {item.pageNumber}
          </li>
        ))}
        {skipped.length > 20 && (
          <li className="font-sans">+ {skipped.length - 20} more</li>
        )}
      </ul>
    </div>
  );
}

function ExtractPreviewSection({
  inventory,
  defaultOpen,
}: {
  inventory: PdfFieldInventoryResult;
  defaultOpen: boolean;
}) {
  const importableCount = inventory.items.length;
  const detectedCount = inventory.detectedCount;

  return (
    <CollapsibleSection
      title="Extract preview"
      count={detectedCount}
      defaultOpen={defaultOpen}
    >
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {importableCount} importable · {inventory.skipped.length} skipped
        </p>
        {importableCount === 0 ? (
          <p className="text-xs text-muted-foreground">
            No importable AcroForm fields were found on this PDF.
          </p>
        ) : (
          <ul className="max-h-28 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
            {inventory.items.slice(0, 10).map((item: PdfFieldInventoryItem) => (
              <li
                key={`${item.pdfFieldName}-${item.pageNumber}-${item.occurrenceIndex}`}
              >
                {item.pdfFieldName} · page {item.pageNumber}
              </li>
            ))}
            {importableCount > 10 && (
              <li className="font-sans">+ {importableCount - 10} more</li>
            )}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}

function ImportReportCard({
  result,
  skipped,
  error,
  onDismiss,
}: {
  result: ApplyPdfFieldInventoryResult;
  skipped: PdfFieldInventorySkippedItem[];
  error: string | null;
  onDismiss: () => void;
}) {
  const hasWarning =
    Boolean(error) ||
    (result.importedCount === 0 && result.updatedCount === 0);

  return (
    <div className="rounded-md border bg-muted/30">
      <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Import complete</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Detected {result.detectedCount} · Imported {result.importedCount} ·
            Updated {result.updatedCount} · Already existed{" "}
            {result.alreadyExistedCount} · Skipped {result.skippedSignatureFields}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Dismiss import report"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 px-3 py-2">
        <CollapsibleSection
          title="Fields imported"
          count={result.importedCount}
          defaultOpen
        >
          <FieldNameList items={result.importedItems} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Fields skipped"
          count={result.skippedSignatureFields}
          defaultOpen={hasWarning && result.skippedSignatureFields > 0}
          tone={hasWarning ? "warning" : "default"}
        >
          <SkippedFieldList skipped={skipped} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Fields updated"
          count={result.updatedCount}
          defaultOpen={hasWarning && result.updatedCount > 0}
        >
          <FieldNameList items={result.updatedItems} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Already existing"
          count={result.alreadyExistedCount}
          defaultOpen={false}
        >
          <FieldNameList items={result.alreadyExistedItems} />
        </CollapsibleSection>

        {result.createdFields > 0 && (
          <p className="text-xs text-muted-foreground">
            New catalog fields: {result.createdFields} · reused:{" "}
            {result.reusedFields}
          </p>
        )}
      </div>
    </div>
  );
}

export function PdfFieldInventoryPanel({
  inventory,
  applyResult,
  importReportDismissed,
  importReportKey,
  isExtracting,
  isApplying,
  error,
  onExtract,
  onImportReview,
  onDismissImportReport,
}: PdfFieldInventoryPanelProps) {
  const importableCount = inventory?.items.length ?? 0;
  const showImportReport = applyResult != null && !importReportDismissed;
  const showExtractPreview = inventory != null && !showImportReport;

  return (
    <div className="shrink-0 space-y-3 border-b px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">PDF field inventory</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Extract AcroForm fields from the template PDF, then use Import &
          Review to map them before adding to the field inventory. Signature and
          initials fields are excluded by default.
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
          onClick={onImportReview}
        >
          {isApplying ? "Opening..." : `Import & Review (${importableCount})`}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {showExtractPreview && inventory && (
        <ExtractPreviewSection
          inventory={inventory}
          defaultOpen={importableCount > 0}
        />
      )}

      {showImportReport && applyResult && (
        <ImportReportCard
          key={importReportKey}
          result={applyResult}
          skipped={inventory?.skipped ?? []}
          error={error}
          onDismiss={onDismissImportReport}
        />
      )}
    </div>
  );
}
