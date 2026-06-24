import type { FieldUsageCounts } from "@/lib/field-retire";
import {
  suggestCanonicalFieldNames,
  type FieldMergeCanonicalNameAdvice,
} from "@/lib/field-merge-canonical-names";
import type { Field } from "@/lib/types/field";
import {
  fieldKeysAreSimilar,
  fieldLabelsAreSimilar,
} from "@/lib/types/field";
import { formatFieldSourceMappingCatalog } from "@/lib/types/field-source";

export const FORM_SPECIFIC_FIELD_PREFIXES = [
  "buyer_rep_",
  "listing_",
  "contract_",
  "hoa_",
  "addendum_",
  "trec_",
  "txr_",
] as const;

export type FieldMergeCandidateEntry = {
  field: Field;
  usage: FieldUsageCounts;
  strippedFieldKey: string;
  formSpecificPrefixes: string[];
  sourceMapping: string | null;
};

export type FieldMergeCandidateGroup = {
  id: string;
  matchSignals: string[];
  fields: FieldMergeCandidateEntry[];
  canonicalNameAdvice: FieldMergeCanonicalNameAdvice;
};

export type FieldMergeGroupSelection = {
  canonicalFieldId: string | null;
  duplicateFieldIds: string[];
};

function normalizeFieldKey(fieldKey: string): string {
  return fieldKey.trim().toLowerCase();
}

export function stripFormSpecificPrefixes(fieldKey: string): string {
  let key = normalizeFieldKey(fieldKey);
  let changed = true;

  while (changed) {
    changed = false;
    for (const prefix of FORM_SPECIFIC_FIELD_PREFIXES) {
      if (key.startsWith(prefix)) {
        key = key.slice(prefix.length);
        changed = true;
      }
    }
  }

  return key;
}

export function detectFormSpecificPrefixes(fieldKey: string): string[] {
  const key = normalizeFieldKey(fieldKey);
  return FORM_SPECIFIC_FIELD_PREFIXES.filter((prefix) => key.startsWith(prefix));
}

function fieldLabelValue(field: Field): string {
  return field.field_label?.trim() || field.field_name?.trim() || "";
}

function sourceSignature(field: Field): string {
  return [
    field.source_type?.trim() ?? "",
    field.source_path?.trim() ?? "",
    field.resolver_key?.trim() ?? "",
  ].join("|");
}

function typesMatch(left: Field, right: Field): boolean {
  return (
    left.field_data_type === right.field_data_type &&
    left.field_widget_type === right.field_widget_type
  );
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
    }
  }

  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent !== id) {
      const root = this.find(parent);
      this.parent.set(id, root);
      return root;
    }
    return id;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot);
    }
  }

  groups(): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      const bucket = grouped.get(root) ?? [];
      bucket.push(id);
      grouped.set(root, bucket);
    }
    return grouped;
  }
}

function fieldsAreMergeCandidates(left: Field, right: Field): string[] {
  if (!typesMatch(left, right)) {
    return [];
  }

  const signals: string[] = [];
  const leftStripped = stripFormSpecificPrefixes(left.field_key);
  const rightStripped = stripFormSpecificPrefixes(right.field_key);

  if (leftStripped && leftStripped === rightStripped) {
    signals.push(`Shared core key: ${leftStripped}`);
  } else if (fieldKeysAreSimilar(leftStripped, rightStripped)) {
    signals.push(`Similar core keys: ${leftStripped} ~ ${rightStripped}`);
  }

  const leftLabel = fieldLabelValue(left);
  const rightLabel = fieldLabelValue(right);
  if (
    leftLabel &&
    rightLabel &&
    fieldLabelsAreSimilar(leftLabel, rightLabel) &&
    sourceSignature(left) === sourceSignature(right)
  ) {
    signals.push("Similar labels and matching source mapping");
  }

  const leftPrefixes = detectFormSpecificPrefixes(left.field_key);
  const rightPrefixes = detectFormSpecificPrefixes(right.field_key);
  if (
    signals.length > 0 &&
    (leftPrefixes.length > 0 || rightPrefixes.length > 0)
  ) {
    signals.push("Contains form-specific field key prefix");
  }

  return signals;
}

function buildGroupSignals(entries: FieldMergeCandidateEntry[]): string[] {
  const signals = new Set<string>();
  for (const entry of entries) {
    for (const prefix of entry.formSpecificPrefixes) {
      signals.add(`Form-specific prefix: ${prefix}`);
    }
  }
  return [...signals];
}

export function buildFieldMergeCandidateGroups(
  fields: Field[],
  usageByFieldId: Record<string, FieldUsageCounts>,
): FieldMergeCandidateGroup[] {
  const activeFields = fields.filter((field) => field.status !== "DELETED");
  const unionFind = new UnionFind();
  const pairSignals = new Map<string, Set<string>>();

  for (const field of activeFields) {
    unionFind.add(field.id);
  }

  for (let index = 0; index < activeFields.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < activeFields.length; compareIndex += 1) {
      const left = activeFields[index];
      const right = activeFields[compareIndex];
      const signals = fieldsAreMergeCandidates(left, right);

      if (signals.length === 0) {
        continue;
      }

      unionFind.union(left.id, right.id);
      const pairKey = [left.id, right.id].sort().join(":");
      pairSignals.set(pairKey, new Set(signals));
    }
  }

  const grouped = unionFind.groups();
  const candidateGroups: FieldMergeCandidateGroup[] = [];

  for (const memberIds of grouped.values()) {
    if (memberIds.length < 2) {
      continue;
    }

    const members = memberIds
      .map((fieldId) => activeFields.find((field) => field.id === fieldId))
      .filter((field): field is Field => field != null)
      .sort((left, right) => left.field_key.localeCompare(right.field_key));

    const entries: FieldMergeCandidateEntry[] = members.map((field) => ({
      field,
      usage: usageByFieldId[field.id] ?? {
        formFieldMappings: 0,
        fieldInstances: 0,
        fieldInstanceMappings: 0,
      },
      strippedFieldKey: stripFormSpecificPrefixes(field.field_key),
      formSpecificPrefixes: detectFormSpecificPrefixes(field.field_key),
      sourceMapping: formatFieldSourceMappingCatalog(field),
    }));

    const signals = buildGroupSignals(entries);
    const coreKeys = new Set(entries.map((entry) => entry.strippedFieldKey));
    if (coreKeys.size === 1) {
      signals.push(`Shared core key: ${[...coreKeys][0]}`);
    }

    for (let index = 0; index < members.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < members.length; compareIndex += 1) {
        const pairKey = [members[index].id, members[compareIndex].id]
          .sort()
          .join(":");
        const pair = pairSignals.get(pairKey);
        if (pair) {
          for (const signal of pair) {
            signals.push(signal);
          }
        }
      }
    }

    candidateGroups.push({
      id: `group-${members.map((field) => field.id).sort().join("-")}`,
      matchSignals: [...new Set(signals)],
      fields: entries,
      canonicalNameAdvice: suggestCanonicalFieldNames(
        entries.map((entry) => ({
          fieldKey: entry.field.field_key,
          formSpecificPrefixes: entry.formSpecificPrefixes,
        })),
      ),
    });
  }

  return candidateGroups.sort((left, right) => {
    const leftPrefixCount = left.fields.filter(
      (entry) => entry.formSpecificPrefixes.length > 0,
    ).length;
    const rightPrefixCount = right.fields.filter(
      (entry) => entry.formSpecificPrefixes.length > 0,
    ).length;

    if (leftPrefixCount !== rightPrefixCount) {
      return rightPrefixCount - leftPrefixCount;
    }

    return right.fields.length - left.fields.length;
  });
}

export function emptyFieldMergeGroupSelection(): FieldMergeGroupSelection {
  return {
    canonicalFieldId: null,
    duplicateFieldIds: [],
  };
}

export function toggleDuplicateSelection(
  selection: FieldMergeGroupSelection,
  fieldId: string,
): FieldMergeGroupSelection {
  if (selection.canonicalFieldId === fieldId) {
    return selection;
  }

  const isSelected = selection.duplicateFieldIds.includes(fieldId);
  return {
    ...selection,
    duplicateFieldIds: isSelected
      ? selection.duplicateFieldIds.filter((id) => id !== fieldId)
      : [...selection.duplicateFieldIds, fieldId],
  };
}

export function setCanonicalFieldSelection(
  selection: FieldMergeGroupSelection,
  fieldId: string,
): FieldMergeGroupSelection {
  return {
    canonicalFieldId: fieldId,
    duplicateFieldIds: selection.duplicateFieldIds.filter((id) => id !== fieldId),
  };
}
