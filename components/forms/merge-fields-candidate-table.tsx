"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { FieldMergeCandidateEntry, FieldMergeGroupSelection } from "@/lib/field-merge-candidates";
import {
  setCanonicalFieldSelection,
  toggleDuplicateSelection,
} from "@/lib/field-merge-candidates";
import { FieldMergeCanonicalNameAdvicePanel } from "@/components/forms/field-merge-canonical-name-advice";
import type { FieldMergeCanonicalNameAdvice } from "@/lib/field-merge-canonical-names";
import { formatCanonicalNameAdvice } from "@/lib/field-merge-canonical-names";
import type { Field } from "@/lib/types/field";
import {
  formatFieldDataType,
  formatFieldWidgetType,
} from "@/lib/types/field";
import { formatFieldSourceStatusDisplay } from "@/lib/types/field-source";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const COLUMN_WIDTHS_STORAGE_KEY = "harbaugh-merge-fields-column-widths";

export const MERGE_FIELDS_TABLE_COLUMNS = {
  expand: "expand",
  canonical: "canonical",
  duplicate: "duplicate",
  fieldKey: "fieldKey",
  fieldLabel: "fieldLabel",
  dataType: "dataType",
  widget: "widget",
  sourceMapping: "sourceMapping",
  suggestedCanonical: "suggestedCanonical",
  ffm: "ffm",
  fi: "fi",
  fim: "fim",
} as const;

type MergeFieldsColumnKey = keyof typeof MERGE_FIELDS_TABLE_COLUMNS;

const DEFAULT_COLUMN_WIDTHS: Record<MergeFieldsColumnKey, number> = {
  expand: 44,
  canonical: 92,
  duplicate: 92,
  fieldKey: 240,
  fieldLabel: 200,
  dataType: 108,
  widget: 108,
  sourceMapping: 260,
  suggestedCanonical: 220,
  ffm: 76,
  fi: 76,
  fim: 76,
};

const MIN_COLUMN_WIDTH = 56;
const MAX_COLUMN_WIDTH = 640;

function formatSourceDisplay(field: Field): string {
  const status = formatFieldSourceStatusDisplay(field);
  if (status.status === "globally_mapped" && status.detail) {
    return status.detail;
  }
  return status.label;
}

function loadStoredColumnWidths(): Record<MergeFieldsColumnKey, number> {
  if (typeof window === "undefined") {
    return DEFAULT_COLUMN_WIDTHS;
  }

  try {
    const raw = sessionStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_COLUMN_WIDTHS;
    }

    const parsed = JSON.parse(raw) as Partial<Record<MergeFieldsColumnKey, number>>;
    return {
      ...DEFAULT_COLUMN_WIDTHS,
      ...Object.fromEntries(
        Object.entries(parsed).filter(
          ([, width]) => typeof width === "number" && Number.isFinite(width),
        ),
      ),
    } as Record<MergeFieldsColumnKey, number>;
  } catch {
    return DEFAULT_COLUMN_WIDTHS;
  }
}

function useResizableColumnWidths() {
  const [widths, setWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const resizeState = useRef<{
    column: MergeFieldsColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    setWidths(loadStoredColumnWidths());
  }, []);

  useEffect(() => {
    sessionStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  }, [widths]);

  const startResize = useCallback(
    (column: MergeFieldsColumnKey, clientX: number) => {
      resizeState.current = {
        column,
        startX: clientX,
        startWidth: widths[column],
      };
    },
    [widths],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeState.current) {
        return;
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const { column, startX, startWidth } = resizeState.current;
      const nextWidth = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, startWidth + (event.clientX - startX)),
      );

      setWidths((current) => ({
        ...current,
        [column]: nextWidth,
      }));
    };

    const handleMouseUp = () => {
      resizeState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return { widths, startResize };
}

function TooltipCell({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 break-words whitespace-normal", className)} title={value}>
      {children}
    </div>
  );
}

function ResizableHeaderCell({
  column,
  width,
  label,
  align = "left",
  onResizeStart,
  resizable = true,
}: {
  column: MergeFieldsColumnKey;
  width: number;
  label: string;
  align?: "left" | "right" | "center";
  onResizeStart: (column: MergeFieldsColumnKey, clientX: number) => void;
  resizable?: boolean;
}) {
  return (
    <th
      scope="col"
      style={{ width, minWidth: width }}
      className={cn(
        "relative select-none px-3 py-3 align-bottom",
        align === "right" && "text-right",
        align === "center" && "text-center",
      )}
    >
      <span className="block pr-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {resizable && (
        <button
          type="button"
          aria-label={`Resize ${label} column`}
          className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize border-r border-transparent hover:border-border"
          onMouseDown={(event) => {
            event.preventDefault();
            onResizeStart(column, event.clientX);
          }}
        />
      )}
    </th>
  );
}

function ExpandedFieldDetails({
  entry,
  isCanonical,
  isDuplicate,
  canonicalNameAdvice,
}: {
  entry: FieldMergeCandidateEntry;
  isCanonical: boolean;
  isDuplicate: boolean;
  canonicalNameAdvice: FieldMergeCanonicalNameAdvice;
}) {
  const field = entry.field;
  const displayLabel =
    field.field_label?.trim() || field.field_name?.trim() || "—";
  const sourceStatus = formatFieldSourceStatusDisplay(field);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Field details</h3>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Field key</dt>
            <dd className="break-all font-mono text-xs">{field.field_key}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Field label</dt>
            <dd className="break-words">{displayLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Field name</dt>
            <dd className="break-words">{field.field_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Stripped core key</dt>
            <dd className="break-all font-mono text-xs">{entry.strippedFieldKey}</dd>
          </div>
          {entry.formSpecificPrefixes.length > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Form-specific prefixes</dt>
              <dd>{entry.formSpecificPrefixes.join(", ")}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Source mapping</h3>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Value source</dt>
            <dd>{sourceStatus.label}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Source type</dt>
            <dd className="break-words">{field.source_type ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Source path</dt>
            <dd className="break-all font-mono text-xs">{field.source_path ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Resolver key</dt>
            <dd className="break-all font-mono text-xs">{field.resolver_key ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Catalog mapping</dt>
            <dd className="break-words">{formatSourceDisplay(field)}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-3 sm:col-span-2">
        <h3 className="text-sm font-semibold">Usage counts</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border bg-background px-3 py-2">
            <dt className="text-xs text-muted-foreground">Form field mappings</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {entry.usage.formFieldMappings}
            </dd>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <dt className="text-xs text-muted-foreground">Field instances</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {entry.usage.fieldInstances}
            </dd>
          </div>
          <div className="rounded-md border bg-background px-3 py-2">
            <dt className="text-xs text-muted-foreground">Field instance mappings</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {entry.usage.fieldInstanceMappings}
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-3 sm:col-span-2">
        <h3 className="text-sm font-semibold">Suggested canonical names</h3>
        <FieldMergeCanonicalNameAdvicePanel advice={canonicalNameAdvice} />
      </div>

      <div className="text-sm sm:col-span-2">
        <p className="text-xs text-muted-foreground">Merge selection</p>
        <p>
          {isCanonical
            ? "Selected as canonical field for this group."
            : isDuplicate
              ? "Marked as duplicate to merge into the canonical field."
              : "Not currently selected for merge."}
        </p>
      </div>
    </div>
  );
}

type MergeFieldsCandidateTableProps = {
  groupId: string;
  fields: FieldMergeCandidateEntry[];
  selection: FieldMergeGroupSelection;
  canonicalNameAdvice: FieldMergeCanonicalNameAdvice;
  onSelectionChange: (selection: FieldMergeGroupSelection) => void;
};

export function MergeFieldsCandidateTable({
  groupId,
  fields,
  selection,
  canonicalNameAdvice,
  onSelectionChange,
}: MergeFieldsCandidateTableProps) {
  const { widths, startResize } = useResizableColumnWidths();
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, width) => sum + width, 0),
    [widths],
  );

  const toggleExpanded = (rowId: string) => {
    setExpandedRowIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  return (
    <div className="max-w-full overflow-x-auto">
      <table
        className="border-collapse text-sm"
        style={{ width: tableMinWidth, minWidth: "100%" }}
      >
        <colgroup>
          {(Object.keys(MERGE_FIELDS_TABLE_COLUMNS) as MergeFieldsColumnKey[]).map(
            (column) => (
              <col key={column} style={{ width: widths[column] }} />
            ),
          )}
        </colgroup>
        <thead>
          <tr className="border-b bg-muted/30 text-left">
            <ResizableHeaderCell
              column="expand"
              width={widths.expand}
              label=""
              align="center"
              onResizeStart={startResize}
              resizable={false}
            />
            <ResizableHeaderCell
              column="canonical"
              width={widths.canonical}
              label="Canonical"
              align="center"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="duplicate"
              width={widths.duplicate}
              label="Duplicate"
              align="center"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="fieldKey"
              width={widths.fieldKey}
              label="Field key"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="fieldLabel"
              width={widths.fieldLabel}
              label="Field label"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="dataType"
              width={widths.dataType}
              label="Data type"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="widget"
              width={widths.widget}
              label="Widget"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="sourceMapping"
              width={widths.sourceMapping}
              label="Source mapping"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="suggestedCanonical"
              width={widths.suggestedCanonical}
              label="Suggested canonical"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="ffm"
              width={widths.ffm}
              label="FFM"
              align="right"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="fi"
              width={widths.fi}
              label="FI"
              align="right"
              onResizeStart={startResize}
            />
            <ResizableHeaderCell
              column="fim"
              width={widths.fim}
              label="FIM"
              align="right"
              onResizeStart={startResize}
            />
          </tr>
        </thead>
        <tbody className="divide-y">
          {fields.map((entry) => {
            const rowId = `${groupId}:${entry.field.id}`;
            const isExpanded = expandedRowIds.has(rowId);
            const displayLabel =
              entry.field.field_label?.trim() ||
              entry.field.field_name?.trim() ||
              "—";
            const sourceDisplay = formatSourceDisplay(entry.field);
            const isCanonical = selection.canonicalFieldId === entry.field.id;
            const isDuplicate = selection.duplicateFieldIds.includes(entry.field.id);
            const suggestedCanonicalText = formatCanonicalNameAdvice(canonicalNameAdvice);

            return (
              <Fragment key={rowId}>
                <tr
                  className={cn(
                    entry.formSpecificPrefixes.length > 0 && "bg-amber-500/5",
                  )}
                >
                  <td className="px-3 py-3 text-center align-middle">
                    <ButtonExpand
                      expanded={isExpanded}
                      onClick={() => toggleExpanded(rowId)}
                      label={entry.field.field_key}
                    />
                  </td>
                  <td className="px-3 py-3 text-center align-middle">
                    <input
                      type="radio"
                      name={`canonical-${groupId}`}
                      checked={isCanonical}
                      onChange={() =>
                        onSelectionChange(
                          setCanonicalFieldSelection(selection, entry.field.id),
                        )
                      }
                      aria-label={`Use ${entry.field.field_key} as canonical field`}
                    />
                  </td>
                  <td className="px-3 py-3 text-center align-middle">
                    <Checkbox
                      checked={isDuplicate}
                      disabled={isCanonical}
                      onCheckedChange={() =>
                        onSelectionChange(
                          toggleDuplicateSelection(selection, entry.field.id),
                        )
                      }
                      aria-label={`Mark ${entry.field.field_key} as duplicate`}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <TooltipCell value={entry.field.field_key} className="font-mono text-xs">
                      {entry.field.field_key}
                    </TooltipCell>
                    {entry.formSpecificPrefixes.length > 0 && (
                      <p
                        className="mt-1 break-words text-xs text-amber-700 dark:text-amber-300"
                        title={`Form-specific prefixes: ${entry.formSpecificPrefixes.join(", ")}`}
                      >
                        Prefix: {entry.formSpecificPrefixes.join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <TooltipCell value={displayLabel}>{displayLabel}</TooltipCell>
                  </td>
                  <td className="px-3 py-3 align-top text-xs">
                    <TooltipCell value={formatFieldDataType(entry.field.field_data_type)}>
                      {formatFieldDataType(entry.field.field_data_type)}
                    </TooltipCell>
                  </td>
                  <td className="px-3 py-3 align-top text-xs">
                    <TooltipCell value={formatFieldWidgetType(entry.field.field_widget_type)}>
                      {formatFieldWidgetType(entry.field.field_widget_type)}
                    </TooltipCell>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <TooltipCell
                      value={sourceDisplay}
                      className="text-xs text-muted-foreground"
                    >
                      {sourceDisplay}
                    </TooltipCell>
                    {entry.field.source_path && (
                      <p
                        className="mt-1 break-all font-mono text-xs text-muted-foreground"
                        title={entry.field.source_path}
                      >
                        {entry.field.source_path}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <TooltipCell
                      value={
                        canonicalNameAdvice.primary
                          ? `${suggestedCanonicalText} (${canonicalNameAdvice.primary.confidence})`
                          : suggestedCanonicalText
                      }
                      className="font-mono text-xs"
                    >
                      {suggestedCanonicalText}
                    </TooltipCell>
                    {canonicalNameAdvice.primary && (
                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {canonicalNameAdvice.primary.confidence} confidence
                      </p>
                    )}
                    {!canonicalNameAdvice.primary &&
                      canonicalNameAdvice.alternatives.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {canonicalNameAdvice.alternatives.length} alternatives
                        </p>
                      )}
                  </td>
                  <td className="px-3 py-3 text-right align-top tabular-nums">
                    {entry.usage.formFieldMappings}
                  </td>
                  <td className="px-3 py-3 text-right align-top tabular-nums">
                    {entry.usage.fieldInstances}
                  </td>
                  <td className="px-3 py-3 text-right align-top tabular-nums">
                    {entry.usage.fieldInstanceMappings}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-muted/20">
                    <td colSpan={13} className="px-4 py-4">
                      <ExpandedFieldDetails
                        entry={entry}
                        isCanonical={isCanonical}
                        isDuplicate={isDuplicate}
                        canonicalNameAdvice={canonicalNameAdvice}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ButtonExpand({
  expanded,
  onClick,
  label,
}: {
  expanded: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent hover:border-border hover:bg-muted/60"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse details for ${label}` : `Expand details for ${label}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
