"use client";

import { FieldMergeCanonicalNameAdvicePanel } from "@/components/forms/field-merge-canonical-name-advice";
import { FieldMergeDialog } from "@/components/forms/field-merge-dialog";
import { FieldsNav } from "@/components/forms/fields-nav";
import { MergeFieldsCandidateTable } from "@/components/forms/merge-fields-candidate-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getBulkFieldUsageCounts,
  type FieldUsageCounts,
} from "@/lib/field-retire";
import type { FieldMergeResult } from "@/lib/field-merge";
import { FIELD_MERGE_REVIEW_WARNING } from "@/lib/field-merge-canonical-names";
import {
  buildFieldMergeCandidateGroups,
  emptyFieldMergeGroupSelection,
  type FieldMergeCandidateGroup,
  type FieldMergeGroupSelection,
} from "@/lib/field-merge-candidates";
import { createClient } from "@/lib/supabase/client";
import type { Field } from "@/lib/types/field";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ActiveMergePlan = {
  group: FieldMergeCandidateGroup;
  canonical: FieldMergeCandidateGroup["fields"][number];
  duplicates: FieldMergeCandidateGroup["fields"];
};

function defaultCanonicalFieldId(group: FieldMergeCandidateGroup): string | null {
  const withoutPrefix = group.fields.find(
    (entry) => entry.formSpecificPrefixes.length === 0,
  );
  return withoutPrefix?.field.id ?? group.fields[0]?.field.id ?? null;
}

function formatMergeSuccessMessage(result: FieldMergeResult): string {
  const parts = [
    `Merged ${result.mergedDuplicateFieldIds.length} field(s) into ${result.canonicalFieldKey}.`,
    `${result.remappedFormFieldMappings} form field mapping(s) remapped.`,
    `${result.remappedFieldInstances} field instance(s) remapped.`,
    `${result.remappedFieldInstanceMappings} field instance mapping(s) remapped.`,
  ];

  const inactivatedTotal =
    result.inactivatedFormFieldMappings +
    result.inactivatedFieldInstances +
    result.inactivatedFieldInstanceMappings;

  if (inactivatedTotal > 0) {
    parts.push(
      `${inactivatedTotal} conflicting record(s) left inactive for manual review.`,
    );
  }

  return parts.join(" ");
}

export function FieldCleanupPage() {
  const [fields, setFields] = useState<Field[]>([]);
  const [usageByFieldId, setUsageByFieldId] = useState<
    Record<string, FieldUsageCounts>
  >({});
  const [groups, setGroups] = useState<FieldMergeCandidateGroup[]>([]);
  const [selections, setSelections] = useState<
    Record<string, FieldMergeGroupSelection>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeMergePlan, setActiveMergePlan] = useState<ActiveMergePlan | null>(
    null,
  );

  const loadCandidates = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from("fields")
      .select("*")
      .in("status", ["ACTIVE", "INACTIVE"])
      .order("field_key", { ascending: true });

    if (error) {
      setLoadError(error.message);
      setFields([]);
      setGroups([]);
      setUsageByFieldId({});
      setIsLoading(false);
      return;
    }

    const catalogFields = (data as Field[]) ?? [];
    setFields(catalogFields);

    try {
      const usage = await getBulkFieldUsageCounts(
        supabase,
        catalogFields.map((field) => field.id),
      );
      setUsageByFieldId(usage);
      const candidateGroups = buildFieldMergeCandidateGroups(
        catalogFields,
        usage,
      );
      setGroups(candidateGroups);
      setSelections(
        Object.fromEntries(
          candidateGroups.map((group) => [
            group.id,
            {
              ...emptyFieldMergeGroupSelection(),
              canonicalFieldId: defaultCanonicalFieldId(group),
            },
          ]),
        ),
      );
    } catch (usageError) {
      setLoadError(
        usageError instanceof Error
          ? usageError.message
          : "Failed to load field usage counts.",
      );
      setGroups([]);
      setUsageByFieldId({});
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const plannedMerges = useMemo(() => {
    return groups
      .map((group) => {
        const selection = selections[group.id];
        if (!selection?.canonicalFieldId || selection.duplicateFieldIds.length === 0) {
          return null;
        }

        const canonical = group.fields.find(
          (entry) => entry.field.id === selection.canonicalFieldId,
        );
        const duplicates = group.fields.filter((entry) =>
          selection.duplicateFieldIds.includes(entry.field.id),
        );

        if (!canonical || duplicates.length === 0) {
          return null;
        }

        return { group, canonical, duplicates, selection };
      })
      .filter((plan) => plan != null);
  }, [groups, selections]);

  const handleMerged = async (result: FieldMergeResult) => {
    setSuccessMessage(formatMergeSuccessMessage(result));
    setActiveMergePlan(null);
    await loadCandidates();
  };

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-6">
      <div className="space-y-4">
        <FieldsNav active="cleanup" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Merge Fields</h1>
          <p className="text-sm text-muted-foreground">
            Review likely duplicate or form-specific fields, edit the canonical
            reusable field, and merge duplicates after explicit confirmation.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100">
          {successMessage}
        </div>
      )}

      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
        {FIELD_MERGE_REVIEW_WARNING} Suggested canonical names are advisory only
        and are not applied automatically.
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Merge candidates</CardTitle>
          <CardDescription>
            Groups are suggested from shared core field keys, similar labels,
            matching data/widget types, and form-specific prefixes such as{" "}
            <code className="text-xs">buyer_rep_</code>,{" "}
            <code className="text-xs">listing_</code>, and{" "}
            <code className="text-xs">txr_</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          {loadError && <p className="text-sm text-destructive">{loadError}</p>}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Scanning active fields for merge candidates...
            </p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No merge candidate groups were found across {fields.length} active
              fields.
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => {
                const selection =
                  selections[group.id] ?? emptyFieldMergeGroupSelection();

                return (
                  <section
                    key={group.id}
                    className="min-w-0 overflow-hidden rounded-md border bg-card"
                  >
                    <div className="space-y-2 border-b px-4 py-3">
                      <h2 className="text-sm font-semibold">
                        Candidate group ({group.fields.length} fields)
                      </h2>
                      <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {group.matchSignals.map((signal) => (
                          <li
                            key={signal}
                            className="rounded-full border bg-muted/30 px-2 py-0.5"
                          >
                            {signal}
                          </li>
                        ))}
                      </ul>
                      <FieldMergeCanonicalNameAdvicePanel
                        advice={group.canonicalNameAdvice}
                      />
                    </div>

                    <MergeFieldsCandidateTable
                      groupId={group.id}
                      fields={group.fields}
                      selection={selection}
                      canonicalNameAdvice={group.canonicalNameAdvice}
                      onSelectionChange={(nextSelection) =>
                        setSelections((current) => ({
                          ...current,
                          [group.id]: nextSelection,
                        }))
                      }
                    />
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Merge plan</CardTitle>
          <CardDescription>
            Select a canonical field and duplicates in a group, then review and
            confirm the merge. Renaming the canonical field updates it everywhere
            it is used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {plannedMerges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Select a canonical field and one or more duplicates in a candidate
              group to build a merge plan.
            </p>
          ) : (
            <div className="space-y-4">
              {plannedMerges.map(({ group, canonical, duplicates }) => (
                <div
                  key={group.id}
                  className="space-y-4 rounded-md border bg-muted/20 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      Keep{" "}
                      <code className="break-all text-xs">{canonical.field.field_key}</code>
                    </p>
                    <p className="mt-2 text-muted-foreground">
                      Merge duplicates into the canonical field:
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
                      {duplicates.map((entry) => (
                        <li key={entry.field.id} className="break-all">
                          {entry.field.field_key}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <FieldMergeCanonicalNameAdvicePanel
                    advice={group.canonicalNameAdvice}
                  />

                  <div>
                    <Button
                      onClick={() =>
                        setActiveMergePlan({ group, canonical, duplicates })
                      }
                    >
                      Review and merge...
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            FFM = form_field_mappings, FI = field_instances, FIM =
            field_instance_mappings. Merges are explicit and require confirmation.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/forms/fields">Back to catalog</Link>
            </Button>
            <Button variant="outline" onClick={() => void loadCandidates()}>
              Rescan fields
            </Button>
          </div>
        </CardContent>
      </Card>

      <FieldMergeDialog
        open={activeMergePlan != null}
        group={activeMergePlan?.group ?? null}
        canonicalField={activeMergePlan?.canonical.field ?? null}
        duplicateFields={
          activeMergePlan?.duplicates.map((entry) => entry.field) ?? []
        }
        allFields={fields}
        usageByFieldId={usageByFieldId}
        onClose={() => setActiveMergePlan(null)}
        onMerged={(result) => void handleMerged(result)}
      />
    </div>
  );
}
