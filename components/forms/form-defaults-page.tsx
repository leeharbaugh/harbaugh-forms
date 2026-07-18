"use client";

import {
  loadFormDefaultsEditorAction,
  softRemoveFieldLevelDefaultAction,
  upsertFieldLevelDefaultAction,
} from "@/lib/field-defaults-actions";
import type { FormDefaultsEditorDto } from "@/lib/field-defaults-editor";
import {
  DEFAULTS_PAGE_EXPLANATION,
  draftFromDisplay,
  filterDefaultsEditorRows,
  formatSharedFieldWarning,
  REMOVE_ORGANIZATION_DEFAULT_MESSAGE,
  REMOVE_ORGANIZATION_DEFAULT_TITLE,
  REMOVE_PRIVATE_DEFAULT_MESSAGE,
  REMOVE_PRIVATE_DEFAULT_TITLE,
  SOURCE_PRIORITY_NOTE,
  UNMAPPED_DEFAULTS_EXPLANATION,
  UNMAPPED_DEFAULTS_TITLE,
  type DefaultsEditorFieldRow,
  type DefaultsEditorScopeTab,
  type ScopedDefaultDraft,
  type UnmappedExistingDefaultRow,
} from "@/lib/types/field-defaults-manage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LibraryScopeBadge } from "@/components/ui/list-badges";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type FormDefaultsPageProps = {
  formId: number;
};

type RowDraftState = {
  draft: ScopedDefaultDraft;
  valueText: string;
  message: string | null;
  error: string | null;
  isSaving: boolean;
};

function emptyRowState(row: DefaultsEditorFieldRow): RowDraftState {
  const draft = draftFromDisplay(row.selectedScopeDefault, row.isCheckbox);
  return {
    draft,
    valueText:
      draft.kind === "text" && draft.mode === "value" ? draft.value : "",
    message: null,
    error: null,
    isSaving: false,
  };
}

export function FormDefaultsPage({ formId }: FormDefaultsPageProps) {
  const [scope, setScope] = useState<DefaultsEditorScopeTab>("PRIVATE");
  const [dto, setDto] = useState<FormDefaultsEditorDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowDraftState>>({});
  const [removeTarget, setRemoveTarget] = useState<{
    fieldId: string;
    defaultId: string | null;
    label: string;
  } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const refresh = useCallback(
    async (nextScope: DefaultsEditorScopeTab = scope) => {
      setIsLoading(true);
      setLoadError(null);
      const result = await loadFormDefaultsEditorAction({
        formId,
        selectedScope: nextScope,
      });
      if (!result.ok) {
        setDto(null);
        setLoadError(result.error);
        setIsLoading(false);
        return null;
      }
      setDto(result.data);
      const nextState: Record<string, RowDraftState> = {};
      for (const row of result.data.fields) {
        nextState[row.fieldId] = emptyRowState(row);
      }
      for (const row of result.data.unmappedExistingDefaults) {
        nextState[`unmapped:${row.fieldId}`] = {
          draft: draftFromDisplay(row.display, row.isCheckbox),
          valueText:
            row.display.mode === "value" ? (row.display.displayValue ?? "") : "",
          message: null,
          error: null,
          isSaving: false,
        };
      }
      setRowState(nextState);
      setIsLoading(false);
      return result.data;
    },
    [formId, scope],
  );

  useEffect(() => {
    void refresh(scope);
  }, [refresh, scope]);

  const filteredRows = useMemo(() => {
    if (!dto) {
      return [];
    }
    return filterDefaultsEditorRows(dto.fields, searchQuery, typeFilter);
  }, [dto, searchQuery, typeFilter]);

  const updateRowDraft = (fieldId: string, patch: Partial<RowDraftState>) => {
    setRowState((current) => ({
      ...current,
      [fieldId]: {
        ...(current[fieldId] ?? {
          draft: { kind: "text", mode: "inherit" } as ScopedDefaultDraft,
          valueText: "",
          message: null,
          error: null,
          isSaving: false,
        }),
        ...patch,
      },
    }));
  };

  const handleSave = async (row: DefaultsEditorFieldRow) => {
    const state = rowState[row.fieldId];
    if (!state || !dto) {
      return;
    }

    let draft = state.draft;
    if (draft.kind === "text" && draft.mode === "value") {
      draft = { kind: "text", mode: "value", value: state.valueText };
    }
    if (draft.mode === "inherit") {
      updateRowDraft(row.fieldId, {
        error:
          "Choose Inherit only by removing an existing default, or pick Use value / Use blank.",
      });
      return;
    }

    updateRowDraft(row.fieldId, { isSaving: true, error: null, message: null });
    const result = await upsertFieldLevelDefaultAction({
      formId,
      fieldId: row.fieldId,
      scope: dto.selectedScope,
      draft,
    });

    if (!result.ok) {
      updateRowDraft(row.fieldId, { isSaving: false, error: result.error });
      return;
    }

    await refresh(dto.selectedScope);
    setRowState((current) => ({
      ...current,
      [row.fieldId]: {
        ...(current[row.fieldId] ?? emptyRowState(row)),
        message: "Saved.",
        error: null,
        isSaving: false,
      },
    }));
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget || !dto) {
      return;
    }
    const fieldId = removeTarget.fieldId;
    setIsRemoving(true);
    const result = await softRemoveFieldLevelDefaultAction({
      formId,
      fieldId,
      scope: dto.selectedScope,
      defaultId: removeTarget.defaultId,
    });
    setIsRemoving(false);
    setRemoveTarget(null);
    if (!result.ok) {
      updateRowDraft(fieldId, { error: result.error });
      return;
    }
    await refresh(dto.selectedScope);
    setRowState((current) => ({
      ...current,
      [fieldId]: {
        ...(current[fieldId] ?? {
          draft: { kind: "text", mode: "inherit" } as ScopedDefaultDraft,
          valueText: "",
          message: null,
          error: null,
          isSaving: false,
        }),
        message: "Returned to inherited.",
        error: null,
      },
    }));
  };

  const handleUnmappedRemove = (row: UnmappedExistingDefaultRow) => {
    setRemoveTarget({
      fieldId: row.fieldId,
      defaultId: row.defaultId,
      label: row.fieldLabel,
    });
  };

  if (isLoading && !dto) {
    return (
      <p className="text-sm text-muted-foreground">Loading defaults…</p>
    );
  }

  if (loadError && !dto) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to Forms</Link>
        </Button>
      </div>
    );
  }

  if (!dto) {
    return null;
  }

  const canShowOrgTab = Boolean(
    dto.organization.organizationId && dto.organization.canManageOrganization,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {dto.form.form_name}
            </h1>
            <LibraryScopeBadge scope="GLOBAL" />
            <Badge variant="outline">Manage Defaults</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {DEFAULTS_PAGE_EXPLANATION}
          </p>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {SOURCE_PRIORITY_NOTE}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to Forms</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Default scope</CardTitle>
          <CardDescription>
            My Defaults are private to you. Organization Defaults apply for your
            primary organization
            {dto.organization.organizationName
              ? ` (${dto.organization.organizationName})`
              : ""}
            .
          </CardDescription>
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Default scope"
          >
            <Button
              type="button"
              size="sm"
              variant={scope === "PRIVATE" ? "default" : "outline"}
              role="tab"
              aria-selected={scope === "PRIVATE"}
              onClick={() => setScope("PRIVATE")}
            >
              My Defaults
            </Button>
            {canShowOrgTab ? (
              <Button
                type="button"
                size="sm"
                variant={scope === "ORGANIZATION" ? "default" : "outline"}
                role="tab"
                aria-selected={scope === "ORGANIZATION"}
                onClick={() => setScope("ORGANIZATION")}
              >
                Organization Defaults
                {dto.organization.organizationName
                  ? ` · ${dto.organization.organizationName}`
                  : ""}
              </Button>
            ) : null}
          </div>
          {dto.organization.primaryOrgWarning ? (
            <p className="text-sm text-warning" role="status">
              {dto.organization.primaryOrgWarning}
            </p>
          ) : null}
          {scope === "PRIVATE" &&
          !dto.organization.canManageOrganization &&
          dto.organization.canViewInherited ? (
            <p className="text-sm text-muted-foreground">
              You can see inherited Organization values below. Only organization
              admins can edit Organization Defaults.
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="defaults-search">Search fields</Label>
              <Input
                id="defaults-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Label or field key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaults-type-filter">Type</Label>
              <select
                id="defaults-type-filter"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-40"
                value={typeFilter ?? ""}
                onChange={(event) =>
                  setTypeFilter(event.target.value || null)
                }
              >
                <option value="">All</option>
                <option value="text">Text / number / date</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>
          </div>

          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Refreshing…</p>
          ) : null}

          {filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No mapped fields match this filter.
            </p>
          ) : (
            <ul className="space-y-4">
              {filteredRows.map((row) => {
                const state = rowState[row.fieldId] ?? emptyRowState(row);
                const sharedWarning = formatSharedFieldWarning(
                  row.sharedFormNames,
                );
                const hasExisting =
                  row.selectedScopeDefault.mode !== "inherit";

                return (
                  <li
                    key={row.fieldId}
                    className="rounded-md border p-4"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{row.fieldLabel}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {row.fieldKey}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {row.pageNumber != null ? (
                            <Badge variant="outline">Page {row.pageNumber}</Badge>
                          ) : null}
                          <Badge variant="secondary">
                            {row.fieldWidgetType || row.fieldDataType}
                          </Badge>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        Source: {row.sourcePriorityNote}
                      </p>

                      {sharedWarning ? (
                        <p className="text-sm text-warning" role="status">
                          {sharedWarning}
                        </p>
                      ) : null}

                      {scope === "PRIVATE" &&
                      row.inheritedOrganizationDefault ? (
                        <p className="text-sm">
                          <span className="text-muted-foreground">
                            Inherited Organization:{" "}
                          </span>
                          {row.inheritedOrganizationDefault.mode === "inherit"
                            ? "None"
                            : row.inheritedOrganizationDefault.isBlankOverride
                              ? "Blank override"
                              : (row.inheritedOrganizationDefault.displayValue ??
                                "—")}
                        </p>
                      ) : null}

                      <p className="text-sm">
                        <span className="text-muted-foreground">
                          Effective fallback:{" "}
                        </span>
                        {row.effectiveFallback.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.effectiveFallback.detail}
                      </p>

                      {row.isCheckbox ? (
                        <fieldset className="space-y-2">
                          <legend className="text-sm font-medium">
                            Checkbox default
                          </legend>
                          <div className="flex flex-wrap gap-3">
                            {(
                              [
                                ["inherit", "Inherit"],
                                ["checked", "Checked"],
                                ["unchecked", "Unchecked"],
                              ] as const
                            ).map(([mode, label]) => (
                              <label
                                key={mode}
                                className="flex items-center gap-2 text-sm"
                              >
                                <input
                                  type="radio"
                                  name={`cb-${row.fieldId}`}
                                  checked={
                                    state.draft.kind === "checkbox" &&
                                    state.draft.mode === mode
                                  }
                                  onChange={() =>
                                    updateRowDraft(row.fieldId, {
                                      draft: { kind: "checkbox", mode },
                                      error: null,
                                      message: null,
                                    })
                                  }
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ) : (
                        <fieldset className="space-y-2">
                          <legend className="text-sm font-medium">
                            Value default
                          </legend>
                          <div className="flex flex-wrap gap-3">
                            {(
                              [
                                ["inherit", "Inherit"],
                                ["value", "Use value"],
                                ["blank", "Use blank"],
                              ] as const
                            ).map(([mode, label]) => (
                              <label
                                key={mode}
                                className="flex items-center gap-2 text-sm"
                              >
                                <input
                                  type="radio"
                                  name={`tx-${row.fieldId}`}
                                  checked={
                                    state.draft.kind === "text" &&
                                    state.draft.mode === mode
                                  }
                                  onChange={() =>
                                    updateRowDraft(row.fieldId, {
                                      draft:
                                        mode === "value"
                                          ? {
                                              kind: "text",
                                              mode: "value",
                                              value: state.valueText,
                                            }
                                          : { kind: "text", mode },
                                      error: null,
                                      message: null,
                                    })
                                  }
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                          {state.draft.kind === "text" &&
                          state.draft.mode === "value" ? (
                            <div className="space-y-1">
                              <Label htmlFor={`value-${row.fieldId}`}>
                                Value
                              </Label>
                              <Input
                                id={`value-${row.fieldId}`}
                                value={state.valueText}
                                onChange={(event) =>
                                  updateRowDraft(row.fieldId, {
                                    valueText: event.target.value,
                                    draft: {
                                      kind: "text",
                                      mode: "value",
                                      value: event.target.value,
                                    },
                                  })
                                }
                              />
                            </div>
                          ) : null}
                          {state.draft.kind === "text" &&
                          state.draft.mode === "blank" ? (
                            <p className="text-sm text-muted-foreground">
                              Blank override — intentional empty preference that
                              still loses to linked transaction data.
                            </p>
                          ) : null}
                        </fieldset>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            state.isSaving || state.draft.mode === "inherit"
                          }
                          onClick={() => void handleSave(row)}
                        >
                          {state.isSaving ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!hasExisting || state.isSaving}
                          onClick={() =>
                            setRemoveTarget({
                              fieldId: row.fieldId,
                              defaultId: row.selectedScopeDefault.defaultId,
                              label: row.fieldLabel,
                            })
                          }
                        >
                          {scope === "PRIVATE"
                            ? "Return to Inherited"
                            : "Remove Default"}
                        </Button>
                      </div>
                      {state.message ? (
                        <p className="text-sm text-success" role="status">
                          {state.message}
                        </p>
                      ) : null}
                      {state.error ? (
                        <p className="text-sm text-destructive" role="alert">
                          {state.error}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {dto.unmappedExistingDefaults.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{UNMAPPED_DEFAULTS_TITLE}</CardTitle>
            <CardDescription>{UNMAPPED_DEFAULTS_EXPLANATION}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dto.unmappedExistingDefaults.map((row) => (
              <div
                key={row.defaultId}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{row.fieldLabel}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {row.fieldKey}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {row.display.isBlankOverride
                      ? "Blank override"
                      : (row.display.displayValue ?? "—")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleUnmappedRemove(row)}
                >
                  Remove Default
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={removeTarget != null}
        title={
          scope === "PRIVATE"
            ? REMOVE_PRIVATE_DEFAULT_TITLE
            : REMOVE_ORGANIZATION_DEFAULT_TITLE
        }
        message={
          scope === "PRIVATE"
            ? REMOVE_PRIVATE_DEFAULT_MESSAGE
            : REMOVE_ORGANIZATION_DEFAULT_MESSAGE
        }
        confirmLabel="Remove Default"
        variant="destructive"
        isConfirming={isRemoving}
        onConfirm={() => void handleRemoveConfirm()}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
