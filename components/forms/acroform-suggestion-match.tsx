"use client";

import { formatAcroformConfidence } from "@/lib/acroform-import-wizard";
import {
  isHighConfidenceAcroformSuggestion,
  isSuggestedAcroformMatch,
} from "@/lib/acroform-field-suggestions";
import type { AcroformFieldSuggestion } from "@/lib/acroform-field-suggestions";
import {
  buildAcroformSuggestionDetailLines,
  formatAcroformSuggestionConfidence,
  formatAcroformSuggestionSourceLine,
  getAcroformSourceTypeBadge,
  getAcroformSuggestionFieldLabel,
} from "@/lib/acroform-suggestion-display";
import { formatAcroformMatchSourceLabel } from "@/lib/acroform-match-preselect";
import { cn } from "@/lib/utils";

type AcroformSuggestionMatchProps = {
  suggestion: AcroformFieldSuggestion;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

function SourceTypeBadge({ suggestion }: { suggestion: AcroformFieldSuggestion }) {
  const badge = getAcroformSourceTypeBadge(suggestion.field);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        badge.className,
      )}
    >
      {badge.sourceType === "unmapped" ? "unmapped" : badge.sourceType}
    </span>
  );
}

export function AcroformSuggestionMatch({
  suggestion,
  selected,
  disabled = false,
  onSelect,
}: AcroformSuggestionMatchProps) {
  const field = suggestion.field;
  const label = getAcroformSuggestionFieldLabel(field);
  const sourceLine = formatAcroformSuggestionSourceLine(field);
  const detailLines = buildAcroformSuggestionDetailLines(suggestion);
  const autoPreselect = isHighConfidenceAcroformSuggestion(suggestion);
  const suggested = isSuggestedAcroformMatch(suggestion);
  const matchSourceLabel = formatAcroformMatchSourceLabel(suggestion.matchKind);
  const chipTitle = detailLines.map((line) => `${line.label}: ${line.value}`).join("\n");

  return (
    <div className="group relative max-w-full">
      <button
        type="button"
        disabled={disabled}
        title={chipTitle}
        aria-label={`Map to ${field.field_key}. ${label}. Source ${sourceLine}. Confidence ${formatAcroformSuggestionConfidence(suggestion.score)}.`}
        className={cn(
          "flex w-full min-w-[12rem] max-w-sm flex-col gap-1 rounded-md border px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/60",
          selected && "border-primary bg-muted/40 ring-1 ring-primary/30",
          !selected &&
            autoPreselect &&
            "border-emerald-400/50 bg-emerald-50/40 dark:bg-emerald-950/20",
          !selected &&
            !autoPreselect &&
            suggested &&
            "border-muted-foreground/20",
          disabled && "cursor-not-allowed opacity-60",
        )}
        onClick={onSelect}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceTypeBadge suggestion={suggestion} />
          <span className="font-mono font-medium">{field.field_key}</span>
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              autoPreselect
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-muted text-muted-foreground",
            )}
          >
            {formatAcroformConfidence(suggestion.score)}
          </span>
        </div>

        <span className="line-clamp-2 text-[11px] font-medium leading-snug text-foreground">
          {label}
        </span>

        <span className="text-[10px] text-muted-foreground">
          Match: {matchSourceLabel}
        </span>

        <span className="truncate font-mono text-[10px] text-muted-foreground">
          Source: {sourceLine}
        </span>

        <span className="line-clamp-2 text-[10px] text-muted-foreground">
          Reason: {suggestion.reason}
        </span>

        {field.resolver_key?.trim() && (
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            Resolver: {field.resolver_key.trim()}
          </span>
        )}
      </button>

      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md",
          "group-hover:block group-focus-within:block",
        )}
      >
        <dl className="space-y-2 text-xs">
          {detailLines.map((line) => (
            <div key={line.label}>
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className="mt-0.5 break-words font-medium">{line.value}</dd>
            </div>
          ))}
        </dl>
       </div>
    </div>
  );
}
