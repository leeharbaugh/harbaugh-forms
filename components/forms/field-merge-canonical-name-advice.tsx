"use client";

import { Button } from "@/components/ui/button";
import {
  FIELD_MERGE_REVIEW_WARNING,
  type FieldMergeCanonicalNameAdvice,
  type FieldMergeCanonicalNameSuggestion,
} from "@/lib/field-merge-canonical-names";
import { cn } from "@/lib/utils";

function ConfidenceBadge({
  confidence,
}: {
  confidence: FieldMergeCanonicalNameSuggestion["confidence"];
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        confidence === "high" &&
          "border-success/40 bg-success/10 text-success",
        confidence === "medium" &&
          "border-warning/40 bg-warning/10 text-warning",
        confidence === "low" &&
          "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
      )}
    >
      {confidence}
    </span>
  );
}

function SuggestionBlock({
  suggestion,
  title,
}: {
  suggestion: FieldMergeCanonicalNameSuggestion;
  title: string;
}) {
  return (
    <div className="space-y-1 rounded-md border bg-background px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <ConfidenceBadge confidence={suggestion.confidence} />
      </div>
      <p className="break-all font-mono text-sm">{suggestion.fieldKey}</p>
      <p className="text-sm">{suggestion.fieldLabel}</p>
      <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
    </div>
  );
}

type FieldMergeCanonicalNameAdvicePanelProps = {
  advice: FieldMergeCanonicalNameAdvice;
  compact?: boolean;
  onApplySuggestion?: (suggestion: FieldMergeCanonicalNameSuggestion) => void;
};

export function FieldMergeCanonicalNameAdvicePanel({
  advice,
  compact = false,
  onApplySuggestion,
}: FieldMergeCanonicalNameAdvicePanelProps) {
  const displayText =
    advice.primary?.fieldKey ??
    advice.alternatives.map((suggestion) => suggestion.fieldKey).join(" | ") ??
    "—";

  if (compact) {
    return (
      <div className="space-y-1">
        <p className="break-all font-mono text-xs">{displayText}</p>
        {advice.primary && (
          <ConfidenceBadge confidence={advice.primary.confidence} />
        )}
        {!advice.primary && advice.alternatives.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {advice.alternatives.length} alternative
            {advice.alternatives.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
      <p className="font-medium text-warning">{FIELD_MERGE_REVIEW_WARNING}</p>

      {advice.primary ? (
        <SuggestionBlock suggestion={advice.primary} title="Suggested canonical name" />
      ) : (
        <p className="text-sm">
          No single canonical name is recommended. Review the alternatives below.
        </p>
      )}

      {advice.alternatives.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {advice.primary ? "Alternatives" : "Possible names"}
          </p>
          {advice.alternatives.map((suggestion) => (
            <SuggestionBlock
              key={suggestion.fieldKey}
              suggestion={suggestion}
              title="Alternative"
            />
          ))}
        </div>
      )}

      {advice.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {advice.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {onApplySuggestion && (
        <div className="flex flex-wrap gap-2 pt-1">
          {advice.primary && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onApplySuggestion(advice.primary!)}
            >
              Use suggested key
            </Button>
          )}
          {advice.alternatives.map((suggestion) => (
            <Button
              key={suggestion.fieldKey}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onApplySuggestion(suggestion)}
            >
              Use {suggestion.fieldKey}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
