import type { AcroformFieldSuggestion } from "@/lib/acroform-field-suggestions";
import { formatAcroformMatchSourceLabel } from "@/lib/acroform-match-preselect";
import {
  formatFieldSourceMappingCatalog,
  formatFieldSourceType,
  type FieldSourceType,
} from "@/lib/types/field-source";
import type { Field } from "@/lib/types/field";

export type AcroformSourceTypeBadge = {
  sourceType: string;
  label: string;
  className: string;
};

const SOURCE_TYPE_BADGE_CLASS: Record<string, string> = {
  packet_property:
    "border-sky-300/70 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  packet_contact:
    "border-violet-300/70 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100",
  contract_details:
    "border-amber-300/70 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  listing_agreement_details:
    "border-orange-300/70 bg-orange-100 text-orange-950 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100",
  buyer_rep_details:
    "border-teal-300/70 bg-teal-100 text-teal-950 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-100",
  representation_agreement:
    "border-cyan-300/70 bg-cyan-100 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-100",
  settings_brokerage:
    "border-slate-300/70 bg-slate-200 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
  settings_agent:
    "border-zinc-300/70 bg-zinc-200 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
  manual_only:
    "border-neutral-300/70 bg-neutral-100 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200",
  custom_resolver:
    "border-purple-300/70 bg-purple-100 text-purple-950 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-100",
  packet:
    "border-indigo-300/70 bg-indigo-100 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100",
  static_default:
    "border-stone-300/70 bg-stone-100 text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100",
  packet_instance:
    "border-rose-300/70 bg-rose-100 text-rose-950 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100",
};

const DEFAULT_SOURCE_BADGE_CLASS =
  "border-muted-foreground/30 bg-muted text-muted-foreground";

export function getAcroformSuggestionFieldLabel(field: Field): string {
  return (
    field.field_label?.trim() ||
    field.field_name?.trim() ||
    field.field_key.trim()
  );
}

export function formatAcroformSuggestionSourceLine(field: Field): string {
  const mapping = formatFieldSourceMappingCatalog(field);
  if (mapping) {
    return mapping;
  }

  const sourceType = field.source_type?.trim();
  if (!sourceType) {
    return "No source configured";
  }

  return formatFieldSourceType(sourceType);
}

export function getAcroformSourceTypeBadge(field: Field): AcroformSourceTypeBadge {
  const sourceType = field.source_type?.trim() || "unmapped";
  const label =
    sourceType === "unmapped"
      ? "Unmapped"
      : formatFieldSourceType(sourceType as FieldSourceType);

  return {
    sourceType,
    label,
    className: SOURCE_TYPE_BADGE_CLASS[sourceType] ?? DEFAULT_SOURCE_BADGE_CLASS,
  };
}

export function formatAcroformSuggestionConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function buildAcroformSuggestionDetailLines(
  suggestion: AcroformFieldSuggestion,
): Array<{ label: string; value: string }> {
  const field = suggestion.field;
  const lines: Array<{ label: string; value: string }> = [
    {
      label: "Label",
      value: getAcroformSuggestionFieldLabel(field),
    },
    {
      label: "Field key",
      value: field.field_key,
    },
    {
      label: "Source type",
      value: field.source_type
        ? formatFieldSourceType(field.source_type)
        : "—",
    },
    {
      label: "Source",
      value: formatAcroformSuggestionSourceLine(field),
    },
  ];

  if (field.source_path?.trim()) {
    lines.push({
      label: "Source path",
      value: field.source_path.trim(),
    });
  }

  if (field.resolver_key?.trim()) {
    lines.push({
      label: "Resolver",
      value: field.resolver_key.trim(),
    });
  }

  lines.push({
    label: "Match source",
    value: formatAcroformMatchSourceLabel(suggestion.matchKind),
  });

  lines.push({
    label: "Confidence",
    value: formatAcroformSuggestionConfidence(suggestion.score),
  });

  lines.push({
    label: "Reason",
    value: suggestion.reason,
  });

  if (field.notes?.trim()) {
    lines.push({
      label: "Field notes",
      value: field.notes.trim(),
    });
  }

  return lines;
}
