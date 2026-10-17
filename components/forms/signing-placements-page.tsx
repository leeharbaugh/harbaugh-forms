"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { PlacementWorkspace } from "@/components/signings/signing-preview-dialog";
import {
  copyPlacementTemplateAction,
  createPlacementTemplateAction,
  deletePlacementTemplateAction,
  loadFormPlacementPageAction,
  loadPlacementTemplateEditorAction,
  removePlacementTemplateFieldAction,
  upsertPlacementTemplateFieldAction,
} from "@/lib/signing/placement-template-actions";
import {
  placementCountLabel,
  templateSourceLabel,
} from "@/lib/signing/placement-template-model";
import type {
  FormPlacementPageModel,
  PlacementCopySource,
  PlacementTemplateCopyResult,
  PlacementTemplateEditorModel,
  PlacementTemplateSummary,
} from "@/lib/signing/placement-templates";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/** pdf.js needs browser APIs (DOMMatrix, canvas, workers): never load it on the server. */
const SigningPreviewDialog = dynamic(
  () =>
    import("@/components/signings/signing-preview-dialog").then(
      (module) => module.SigningPreviewDialog,
    ),
  { ssr: false },
);

const TEMPLATE_PLACEMENT_HELP =
  "Choose a signer slot, then a field, then click the page once to place it. Signature, Initials, Date and Printed Name belong to the chosen slot; a Checkmark belongs to no one. A Signature also places its Date Signed. A Date links to the slot's nearest Signature or Initials on that page; to link it elsewhere, delete it and place it again. Drag or resize to adjust. Ctrl-click (⌘-click on Mac) selects several; Copy (Ctrl/⌘+C) then click the page to place the copy; Paste (Ctrl/⌘+V) places it again; Delete removes the selection.";

function templateWorkspace(options: {
  templateId: string;
  formId: number;
  formDisplay: string;
}): PlacementWorkspace {
  const { templateId, formId, formDisplay } = options;
  return {
    kind: "template",
    load: async () => {
      const result = await loadPlacementTemplateEditorAction({ templateId });
      if (!result.ok) return result;
      return { ok: true, data: (result.data as PlacementTemplateEditorModel).model };
    },
    documentPdfUrl: () => `/forms/${formId}/signing-placements/${templateId}/pdf`,
    savePlacement: ({ field, existingId, linkedSourceId, dateLinkMode }) =>
      upsertPlacementTemplateFieldAction({
        templateId,
        fieldId: existingId,
        slotKey: field.participantId || undefined,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        pageNumber: field.pageNumber,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        linkedTemplateFieldId: linkedSourceId,
        dateLinkMode,
      }),
    removePlacement: ({ id }) => removePlacementTemplateFieldAction({ templateId, fieldId: id }),
    copy: {
      prepareTitle: "Signing placements",
      prepareSubtitle: `${formDisplay} · Changes save to this template only.`,
      previewTitle: "Signing placements",
      previewSubtitle: `${formDisplay} · View only. An organization admin can change this template.`,
      participantLabel: "Signer slot",
      noParticipants: "No signer slots",
      chooseParticipantFirst: "Choose a signer slot before placing this field.",
      adoptionBoundary:
        "Place fields for signer slots such as Buyer 1 or Seller 2. When a Signing applies this template, each slot is matched to that Signing's participants by role and order.",
      placementHelp: TEMPLATE_PLACEMENT_HELP,
      noFieldsYet: "No placements yet. Choose a signer slot and a field, then click the page.",
      documentLoadError:
        "Could not load the PDF for this form version. Close the editor and try again; if it keeps failing, the form PDF is not available.",
    },
  };
}

type EditorTarget = {
  templateId: string;
  editable: boolean;
  warning: string | null;
};

type CopyTarget = {
  scopeLabel: string;
  sources: PlacementCopySource[];
};

export function SigningPlacementsPage({ formId }: { formId: number }) {
  const [page, setPage] = useState<FormPlacementPageModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [copySourceId, setCopySourceId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ templateId: string; label: string } | null>(
    null,
  );

  const reload = useCallback(async () => {
    const result = await loadFormPlacementPageAction({ formId });
    if (!result.ok) {
      setError(result.error);
      setPage(null);
    } else {
      setPage(result.data as FormPlacementPageModel);
    }
    setLoading(false);
  }, [formId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const editorTemplateId = editor?.templateId ?? null;
  const formDisplay = page?.form.display ?? null;
  const workspace = useMemo(
    () =>
      editorTemplateId && formDisplay
        ? templateWorkspace({ templateId: editorTemplateId, formId, formDisplay })
        : undefined,
    [editorTemplateId, formId, formDisplay],
  );

  async function createTemplate(scope: "PERSONAL" | "ORGANIZATION", organizationId?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await createPlacementTemplateAction({ formId, scope, organizationId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { templateId } = result.data as { templateId: string };
    await reload();
    setEditor({ templateId, editable: true, warning: null });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    const result = await deletePlacementTemplateAction({ templateId: deleteTarget.templateId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(`${deleteTarget.label} placement template deleted. Signings that already used it keep their placements.`);
    setDeleteTarget(null);
    await reload();
  }

  async function confirmCopy() {
    if (!copySourceId || !page) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await copyPlacementTemplateAction({
      sourceTemplateId: copySourceId,
      targetFormId: page.form.id,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const copied = result.data as PlacementTemplateCopyResult;
    setCopyTarget(null);
    setCopySourceId("");
    setNotice(
      `Copied ${placementCountLabel(copied.copied)}.${
        copied.skipped > 0
          ? ` ${placementCountLabel(copied.skipped)} on page${copied.skippedPages.length === 1 ? "" : "s"} ${copied.skippedPages.join(", ")} ${copied.skipped === 1 ? "was" : "were"} not copied because this version has fewer pages.`
          : ""
      }`,
    );
    await reload();
    setEditor({ templateId: copied.templateId, editable: true, warning: copied.warning });
  }

  function templateActions(options: {
    summary: PlacementTemplateSummary;
    label: string;
    canEdit: boolean;
  }) {
    const { summary, label, canEdit } = options;
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            setEditor({ templateId: summary.templateId, editable: canEdit, warning: null })
          }
        >
          {canEdit ? "Edit placements" : "View placements"}
        </Button>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setDeleteTarget({ templateId: summary.templateId, label })}
          >
            Delete template
          </Button>
        ) : null}
      </div>
    );
  }

  function emptyActions(options: {
    scope: "PERSONAL" | "ORGANIZATION";
    organizationId?: string;
    scopeLabel: string;
    sources: PlacementCopySource[];
  }) {
    if (!page?.eligibility.ok) return null;
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void createTemplate(options.scope, options.organizationId)}
        >
          Create {options.scope === "PERSONAL" ? "Personal" : "Organization"} template
        </Button>
        {options.sources.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setCopyTarget({ scopeLabel: options.scopeLabel, sources: options.sources });
              setCopySourceId(options.sources[0]?.templateId ?? "");
            }}
          >
            Copy from another version…
          </Button>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Signing placements…</p>;
  }
  if (!page) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error ?? "Form not found."}</p>
        <Link href="/forms" className="text-sm underline">
          Back to Forms
        </Link>
      </div>
    );
  }

  const personalLabel = templateSourceLabel({
    scope: "PERSONAL",
    ownerFirstName: page.ownerFirstName,
  });
  const anyOrganizationTemplate = page.organizations.some((org) => org.template);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/forms" className="text-sm text-muted-foreground underline">
          Back to Forms
        </Link>
        <h1 className="text-2xl font-semibold">Signing placements</h1>
        <p className="text-sm font-medium" data-testid="placement-form-version">
          {page.form.display}
        </p>
        {page.managingPersonalOnBehalf && page.personalOwnerDisplayName ? (
          <p
            className="text-sm font-medium text-amber-900"
            data-testid="placement-admin-on-behalf"
          >
            Managing {page.personalOwnerDisplayName}&apos;s Personal template
            (not a Global template). Edits are attributed to you as
            administrator; ownership stays with {page.personalOwnerDisplayName}.
          </p>
        ) : null}
        <p className="max-w-3xl text-sm text-muted-foreground">
          A placement template is an optional starting point for this exact form
          version only. It is used only when a manager chooses Apply in Prepare
          Documents, and applied placements become ordinary Draft placements:
          editing the template later never changes a Signing. A Personal
          template, when you have one, is used instead of your
          organization&apos;s template; they are never combined.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-emerald-700" role="status" data-testid="placement-page-notice">
          {notice}
        </p>
      ) : null}
      {!page.eligibility.ok ? (
        <p className="text-sm text-amber-800" data-testid="placement-form-ineligible">
          {page.eligibility.reason}
        </p>
      ) : null}

      <Card data-testid="placement-personal-card">
        <CardHeader>
          <CardTitle className="text-lg" data-testid="placement-personal-card-title">
            {page.personalCardTitle}
          </CardTitle>
          <CardDescription>
            {page.managingPersonalOnBehalf
              ? "This is that individual's Personal template. It is not a Global or Organization template."
              : "Only you can see, edit, or apply your Personal template (unless an application admin manages it on your behalf)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {page.personal ? (
            <>
              <p className="text-sm" data-testid="placement-personal-summary">
                Placement template available · {personalLabel} ·{" "}
                {placementCountLabel(page.personal.placementCount)}
              </p>
              {anyOrganizationTemplate && !page.managingPersonalOnBehalf ? (
                <p className="text-xs text-muted-foreground">
                  Your Personal template is used for your Signings instead of the
                  Organization template.
                </p>
              ) : null}
              {templateActions({
                summary: page.personal,
                label: personalLabel,
                canEdit: true,
              })}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No Personal template.</p>
              {emptyActions({
                scope: "PERSONAL",
                scopeLabel: personalLabel,
                sources: page.personalCopySources,
              })}
            </>
          )}
        </CardContent>
      </Card>

      {page.organizations.map((org) => {
        const label = templateSourceLabel({
          scope: "ORGANIZATION",
          organizationName: org.name,
        });
        return (
          <Card key={org.organizationId} data-testid="placement-organization-card">
            <CardHeader>
              <CardTitle className="text-lg">{label}</CardTitle>
              <CardDescription>
                {org.isOrgAdmin
                  ? "Organization admins edit this template; every member can apply it."
                  : "Members can apply this template. Only an organization admin can change it."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {org.template ? (
                <>
                  <p className="text-sm" data-testid="placement-organization-summary">
                    Placement template available · {label} ·{" "}
                    {placementCountLabel(org.template.placementCount)}
                  </p>
                  {page.personal ? (
                    <p className="text-xs text-muted-foreground">
                      Not used for your Signings while you have a Personal template.
                    </p>
                  ) : null}
                  {templateActions({
                    summary: org.template,
                    label,
                    canEdit: org.isOrgAdmin,
                  })}
                </>
              ) : !org.formUsable ? (
                <p className="text-sm text-muted-foreground">
                  Organization templates are available on Global forms and on this
                  organization&apos;s forms.
                </p>
              ) : org.isOrgAdmin ? (
                <>
                  <p className="text-sm text-muted-foreground">No Organization template.</p>
                  {emptyActions({
                    scope: "ORGANIZATION",
                    organizationId: org.organizationId,
                    scopeLabel: label,
                    sources: org.copySources,
                  })}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No Organization template.</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {copyTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="placement-copy-title"
          data-testid="placement-copy-dialog"
        >
          <div className="w-full max-w-lg space-y-3 rounded-lg border bg-background p-5 shadow-lg">
            <h2 id="placement-copy-title" className="text-base font-semibold">
              Copy placements from another version
            </h2>
            <p className="text-sm text-muted-foreground">
              Creates a new, independent {copyTarget.scopeLabel} template for{" "}
              {page.form.display}. The source template is not changed and the two
              are never linked.
            </p>
            <div className="space-y-1">
              <Label htmlFor="placement-copy-source">Copy from</Label>
              <select
                id="placement-copy-source"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={copySourceId}
                onChange={(event) => setCopySourceId(event.target.value)}
              >
                {copyTarget.sources.map((source) => (
                  <option key={source.templateId} value={source.templateId}>
                    {source.sameFamily ? "Same form family · " : ""}
                    {source.formDisplay} · {placementCountLabel(source.placementCount)}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-amber-800" data-testid="placement-copy-warning">
              {page.copyWarning}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setCopyTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || !copySourceId}
                onClick={() => void confirmCopy()}
                data-testid="placement-copy-confirm"
              >
                Copy and review
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="placement-delete-title"
        >
          <div className="w-full max-w-md space-y-3 rounded-lg border bg-background p-5 shadow-lg">
            <h2 id="placement-delete-title" className="text-base font-semibold">
              Delete placement template?
            </h2>
            <p className="text-sm text-muted-foreground">
              The {deleteTarget.label} template for {page.form.display} will no longer
              be offered in Prepare Documents. Signings that already applied it keep
              their placements.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                Delete template
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editor && workspace ? (
        <>
          {editor.warning ? (
            <div
              className="fixed inset-x-0 bottom-0 z-[55] border-t border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
              role="status"
              data-testid="placement-copy-review-warning"
            >
              {editor.warning}
            </div>
          ) : null}
          <SigningPreviewDialog
            open
            signingId={editor.templateId}
            mode={editor.editable ? "prepare" : "preview"}
            workspace={workspace}
            onClose={() => setEditor(null)}
            onChanged={reload}
          />
        </>
      ) : null}
    </div>
  );
}
