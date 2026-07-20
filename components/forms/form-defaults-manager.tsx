"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  clearOrganizationFormDefault,
  clearPrivateFormDefault,
  loadFormDefaultsPage,
  saveOrganizationFormDefault,
  savePrivateFormDefault,
  type FormDefaultsFieldRow,
  type FormDefaultsPageData,
} from "@/lib/field-defaults-management";
import {
  DEFAULTS_PRECEDENCE_NOTICE,
  type DefaultsFieldValueDraft,
} from "@/lib/types/field-default-management";
import { formatFieldDataType, formatFieldWidgetType } from "@/lib/types/field";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListPageHeader } from "@/components/list-page-header";
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
import { cn } from "@/lib/utils";

type FormDefaultsManagerProps = {
  initialData: FormDefaultsPageData;
};

type ClearTarget = {
  fieldId: string;
  fieldLabel: string;
  scope: "PRIVATE" | "ORGANIZATION";
};

function DefaultValueEditor({
  fieldId,
  scope,
  kind,
  draft,
  disabled,
  onChange,
}: {
  fieldId: string;
  scope: "PRIVATE" | "ORGANIZATION";
  kind: FormDefaultsFieldRow["editorKind"];
  draft: DefaultsFieldValueDraft;
  disabled: boolean;
  onChange: (next: DefaultsFieldValueDraft) => void;
}) {
  const id = `${scope.toLowerCase()}-${fieldId}`;

  if (kind === "unsupported") {
    return (
      <p className="text-xs text-muted-foreground">
        Preference defaults are not supported for this field type.
      </p>
    );
  }

  if (kind === "checkbox") {
    const selectValue =
      draft.checked === true
        ? "checked"
        : draft.checked === false
          ? "unchecked"
          : "";
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>Checkbox default</Label>
        <select
          id={id}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectValue}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            onChange({
              textValue: "",
              checked:
                value === "checked"
                  ? true
                  : value === "unchecked"
                    ? false
                    : null,
            });
          }}
        >
          <option value="">Choose checked or unchecked…</option>
          <option value="checked">Checked</option>
          <option value="unchecked">Unchecked</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Unchecked is a stored preference. Use Clear to remove the default
          entirely.
        </p>
      </div>
    );
  }

  const inputType =
    kind === "date" ? "date" : kind === "number" || kind === "currency" ? "text" : "text";

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="sr-only">
        {scope === "PRIVATE" ? "Private default value" : "Organization default value"}
      </Label>
      <Input
        id={id}
        type={inputType}
        inputMode={kind === "number" || kind === "currency" ? "decimal" : undefined}
        value={draft.textValue}
        disabled={disabled}
        onChange={(event) =>
          onChange({ textValue: event.target.value, checked: null })
        }
        placeholder={
          kind === "currency" || kind === "number"
            ? "e.g. 0 or 1500"
            : kind === "date"
              ? "YYYY-MM-DD"
              : "Default value"
        }
        autoComplete="off"
      />
      {(kind === "number" || kind === "currency") && (
        <p className="text-xs text-muted-foreground">
          Zero is a stored value. Use Clear to remove the default instead of leaving it blank.
        </p>
      )}
    </div>
  );
}

export function FormDefaultsManager({ initialData }: FormDefaultsManagerProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [drafts, setDrafts] = useState(() => {
    const map = new Map<
      string,
      { private: DefaultsFieldValueDraft; organization: DefaultsFieldValueDraft }
    >();
    for (const field of initialData.fields) {
      map.set(field.fieldId, {
        private: field.privateDraft,
        organization: field.organizationDraft,
      });
    }
    return map;
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [clearTarget, setClearTarget] = useState<ClearTarget | null>(null);
  const [isPending, startTransition] = useTransition();

  const fieldCountLabel = useMemo(() => {
    const n = data.fields.length;
    return n === 1 ? "1 mapped field" : `${n} mapped fields`;
  }, [data.fields.length]);

  async function reload(organizationId?: string | null) {
    const result = await loadFormDefaultsPage({
      formId: data.formId,
      organizationId:
        organizationId === undefined
          ? data.selectedOrganizationId
          : organizationId,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
    const next = new Map<
      string,
      { private: DefaultsFieldValueDraft; organization: DefaultsFieldValueDraft }
    >();
    for (const field of result.data.fields) {
      next.set(field.fieldId, {
        private: field.privateDraft,
        organization: field.organizationDraft,
      });
    }
    setDrafts(next);
  }

  function updateDraft(
    fieldId: string,
    scope: "PRIVATE" | "ORGANIZATION",
    next: DefaultsFieldValueDraft,
  ) {
    setDrafts((prev) => {
      const copy = new Map(prev);
      const current = copy.get(fieldId) ?? {
        private: { textValue: "", checked: null },
        organization: { textValue: "", checked: null },
      };
      copy.set(fieldId, {
        private: scope === "PRIVATE" ? next : current.private,
        organization: scope === "ORGANIZATION" ? next : current.organization,
      });
      return copy;
    });
  }

  async function handleSave(
    field: FormDefaultsFieldRow,
    scope: "PRIVATE" | "ORGANIZATION",
  ) {
    setError(null);
    setMessage(null);
    const key = `${scope}:${field.fieldId}`;
    setSavingKey(key);
    const draft = drafts.get(field.fieldId);
    if (!draft) {
      setSavingKey(null);
      return;
    }

    const result =
      scope === "PRIVATE"
        ? await savePrivateFormDefault({
            formId: data.formId,
            fieldId: field.fieldId,
            draft: draft.private,
          })
        : await saveOrganizationFormDefault({
            formId: data.formId,
            fieldId: field.fieldId,
            organizationId: data.selectedOrganizationId!,
            draft: draft.organization,
          });

    setSavingKey(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(
      scope === "PRIVATE"
        ? `Saved Private default for ${field.fieldLabel}.`
        : `Saved Organization default for ${field.fieldLabel}.`,
    );
    await reload();
  }

  async function confirmClear() {
    if (!clearTarget) {
      return;
    }
    setError(null);
    setMessage(null);
    const target = clearTarget;
    setClearTarget(null);
    setSavingKey(`clear:${target.scope}:${target.fieldId}`);

    const result =
      target.scope === "PRIVATE"
        ? await clearPrivateFormDefault({
            formId: data.formId,
            fieldId: target.fieldId,
          })
        : await clearOrganizationFormDefault({
            formId: data.formId,
            fieldId: target.fieldId,
            organizationId: data.selectedOrganizationId!,
          });

    setSavingKey(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(
      result.data.cleared
        ? `Cleared ${target.scope === "PRIVATE" ? "Private" : "Organization"} default for ${target.fieldLabel}.`
        : `No active ${target.scope === "PRIVATE" ? "Private" : "Organization"} default to clear.`,
    );
    await reload();
  }

  function onOrganizationChange(nextOrgId: string) {
    setError(null);
    setMessage(null);
    startTransition(() => {
      const params = new URLSearchParams();
      if (nextOrgId) {
        params.set("organizationId", nextOrgId);
      }
      const query = params.toString();
      router.replace(
        `/forms/${data.formId}/defaults${query ? `?${query}` : ""}`,
      );
      void reload(nextOrgId || null);
    });
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title="Form defaults"
        description={`${data.formName} (${data.formCode})`}
        action={
          <Button variant="outline" asChild>
            <Link href="/forms">Back to templates</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">How defaults work</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            {DEFAULTS_PRECEDENCE_NOTICE}
          </CardDescription>
          <p className="text-sm text-muted-foreground">
            A Private default overrides an Organization default for the same
            field. Mapped transaction data and packet overrides still win over
            both.
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Organization context</CardTitle>
            <CardDescription>
              {data.selectedOrganizationName
                ? `Viewing defaults for ${data.selectedOrganizationName}.`
                : "No organization is available for Organization defaults."}
            </CardDescription>
          </div>
          {data.canSelectOrganization ? (
            <div className="w-full max-w-sm space-y-1.5">
              <Label htmlFor="defaults-org-select">Organization</Label>
              <select
                id="defaults-org-select"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={data.selectedOrganizationId ?? ""}
                disabled={isPending}
                onChange={(event) => onOrganizationChange(event.target.value)}
              >
                {data.organizationOptions.length === 0 ? (
                  <option value="">No organizations</option>
                ) : (
                  data.organizationOptions.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {!data.canEditOrganization && data.selectedOrganizationId ? (
            <p>
              Organization defaults are read-only for your role. Organization
              Admins and application Admins can edit them.
            </p>
          ) : null}
          {data.canEditOrganization ? (
            <p>
              You can create, edit, and clear Organization defaults for the
              selected organization.
            </p>
          ) : null}
          <p>{fieldCountLabel} on this Global form.</p>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-foreground" role="status">
          {message}
        </p>
      ) : null}

      {data.fields.length === 0 ? (
        <ListEmptyState
          title="No mapped fields"
          description="Map fields on this Global form before managing defaults."
        />
      ) : (
        <div className="space-y-4">
          {data.fields.map((field) => {
            const draft = drafts.get(field.fieldId) ?? {
              private: field.privateDraft,
              organization: field.organizationDraft,
            };
            const privateSaving = savingKey === `PRIVATE:${field.fieldId}`;
            const orgSaving = savingKey === `ORGANIZATION:${field.fieldId}`;
            const editable = field.editorKind !== "unsupported";

            return (
              <Card key={field.fieldId}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="text-base">
                        {field.fieldLabel}
                      </CardTitle>
                      <p className="font-mono text-xs text-muted-foreground">
                        {field.fieldKey}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-medium",
                        field.effectiveWinner === "Private" &&
                          "border-foreground/20 bg-muted",
                        field.effectiveWinner === "Organization" &&
                          "border-foreground/20 bg-muted",
                        field.effectiveWinner === "None" &&
                          "border-dashed text-muted-foreground",
                      )}
                    >
                      Effective scoped default: {field.effectiveWinner}
                    </span>
                  </div>
                  <CardDescription className="space-y-1">
                    <span className="block">
                      {formatFieldWidgetType(field.fieldWidgetType)} ·{" "}
                      {formatFieldDataType(field.fieldDataType)}
                    </span>
                    <span className="block">{field.mappingSummary}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <section className="space-y-3" aria-labelledby={`private-${field.fieldId}`}>
                    <div className="space-y-1">
                      <h3
                        id={`private-${field.fieldId}`}
                        className="text-sm font-medium"
                      >
                        My default (Private)
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Current: {field.privateDisplay}
                        {field.effectiveWinner === "Private"
                          ? " · wins over Organization"
                          : ""}
                      </p>
                    </div>
                    <DefaultValueEditor
                      fieldId={field.fieldId}
                      scope="PRIVATE"
                      kind={field.editorKind}
                      draft={draft.private}
                      disabled={!data.canEditPrivate || !editable || privateSaving}
                      onChange={(next) =>
                        updateDraft(field.fieldId, "PRIVATE", next)
                      }
                    />
                    {data.canEditPrivate && editable ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={privateSaving}
                          onClick={() => void handleSave(field, "PRIVATE")}
                        >
                          {privateSaving ? "Saving…" : "Save Private"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={privateSaving || !field.privateDefault}
                          onClick={() =>
                            setClearTarget({
                              fieldId: field.fieldId,
                              fieldLabel: field.fieldLabel,
                              scope: "PRIVATE",
                            })
                          }
                        >
                          Clear Private
                        </Button>
                      </div>
                    ) : null}
                  </section>

                  <section
                    className="space-y-3"
                    aria-labelledby={`org-${field.fieldId}`}
                  >
                    <div className="space-y-1">
                      <h3
                        id={`org-${field.fieldId}`}
                        className="text-sm font-medium"
                      >
                        Organization default
                        {data.selectedOrganizationName
                          ? ` · ${data.selectedOrganizationName}`
                          : ""}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Current: {field.organizationDisplay}
                        {!data.selectedOrganizationId
                          ? " · no organization selected"
                          : ""}
                      </p>
                    </div>
                    <DefaultValueEditor
                      fieldId={field.fieldId}
                      scope="ORGANIZATION"
                      kind={field.editorKind}
                      draft={draft.organization}
                      disabled={
                        !data.canEditOrganization ||
                        !editable ||
                        !data.selectedOrganizationId ||
                        orgSaving
                      }
                      onChange={(next) =>
                        updateDraft(field.fieldId, "ORGANIZATION", next)
                      }
                    />
                    {data.canEditOrganization &&
                    editable &&
                    data.selectedOrganizationId ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={orgSaving}
                          onClick={() =>
                            void handleSave(field, "ORGANIZATION")
                          }
                        >
                          {orgSaving ? "Saving…" : "Save Organization"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={orgSaving || !field.organizationDefault}
                          onClick={() =>
                            setClearTarget({
                              fieldId: field.fieldId,
                              fieldLabel: field.fieldLabel,
                              scope: "ORGANIZATION",
                            })
                          }
                        >
                          Clear Organization
                        </Button>
                      </div>
                    ) : null}
                  </section>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={clearTarget != null}
        title={
          clearTarget?.scope === "PRIVATE"
            ? "Clear Private default?"
            : "Clear Organization default?"
        }
        message={
          clearTarget
            ? `This removes the ${
                clearTarget.scope === "PRIVATE" ? "Private" : "Organization"
              } preference for “${clearTarget.fieldLabel}”. Existing packet forms are not changed. The row is soft-deleted for auditability.`
            : undefined
        }
        confirmLabel="Clear default"
        variant="destructive"
        onConfirm={() => void confirmClear()}
        onCancel={() => setClearTarget(null)}
      />
    </div>
  );
}
