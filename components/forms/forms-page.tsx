"use client";

import { FormForm } from "@/components/forms/form-form";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListPageHeader } from "@/components/list-page-header";
import { ListRowActions } from "@/components/list-row-actions";
import {
  ResizableDataTable,
  ResizableDataTableActionsCell,
  ResizableDataTableCell,
  ResizableDataTableRow,
  type ResizableDataTableColumn,
} from "@/components/resizable-data-table";
import { Button } from "@/components/ui/button";
import { LibraryScopeBadge } from "@/components/ui/list-badges";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { copyFormToGlobalLibrary } from "@/lib/admin/copy-form-to-global";
import {
  canOfferCopyToGlobalLibrary,
  presentFormOwnership,
  resolveFormOwnerDisplayName,
  type FormOwnerProfile,
} from "@/lib/form-owner-display";
import {
  buildFormStoragePath,
  buildPendingFormStoragePath,
  removeFormStorageObject,
  uploadFormPdfToPath,
} from "@/lib/form-storage";
import {
  assertCanEditForm,
  canDeleteForm,
  canEditForm,
  canMapFormFields,
  LIBRARY_PERMISSION_DENIED,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/client";
import {
  type Form,
  emptyFormInput,
  formatFormCategory,
  formatFormReference,
  formToInput,
  normalizeFormInput,
  validateFormInput,
} from "@/lib/types/form";
import { useLibraryActor } from "@/lib/use-library-actor";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type FormMode = "hidden" | "create" | "edit";

type FormListItem = Form & {
  ownerDisplayName?: string | null;
};

const FORM_TABLE_COLUMNS: ResizableDataTableColumn[] = [
  { id: "id", label: "ID", defaultWidth: 72, minWidth: 48 },
  { id: "form_name", label: "Template name", defaultWidth: 220 },
  { id: "form_code", label: "Template code", defaultWidth: 140 },
  { id: "category", label: "Category", defaultWidth: 120 },
  { id: "version", label: "Version", defaultWidth: 100, minWidth: 72 },
  { id: "storage_path", label: "Storage path", defaultWidth: 200 },
  {
    id: "actions",
    label: "Actions",
    defaultWidth: 360,
    minWidth: 280,
    maxWidth: 480,
    isActions: true,
  },
];

export function FormsPage() {
  const { actor } = useLibraryActor();
  const router = useRouter();
  const [templates, setTemplates] = useState<FormListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(
    null,
  );
  const [editingOwnerLabel, setEditingOwnerLabel] = useState<string | null>(
    null,
  );
  const [formValue, setFormValue] = useState(emptyFormInput());
  const [existingStoragePath, setExistingStoragePath] = useState<string | null>(
    null,
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [replacePdf, setReplacePdf] = useState(false);
  const [templatePendingDelete, setTemplatePendingDelete] =
    useState<Form | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copyTarget, setCopyTarget] = useState<FormListItem | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  const loadTemplates = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    let query = supabase
      .from("forms")
      .select("*")
      .eq("status", "ACTIVE")
      .order("form_name", { ascending: true });

    const trimmedSearch = searchQuery.trim();
    if (trimmedSearch) {
      const term = `%${trimmedSearch}%`;
      query = query.or(
        [
          `form_name.ilike.${term}`,
          `form_code.ilike.${term}`,
          `form_category.ilike.${term}`,
          `version_label.ilike.${term}`,
        ].join(","),
      );
    }

    const { data, error } = await query;

    if (error) {
      setListError(error.message);
      setTemplates([]);
      setIsLoading(false);
      return;
    }

    const rows = (data as Form[]) ?? [];
    let enriched: FormListItem[] = rows;

    if (actor?.isActiveAdmin) {
      const ownerIds = [
        ...new Set(
          rows
            .map((row) => row.owner_user_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select(
            "id, display_name, preferred_name, first_name, last_name, email, status, onboarding_status",
          )
          .in("id", ownerIds);

        const byId = new Map(
          ((profiles ?? []) as (FormOwnerProfile & { id: string })[]).map(
            (profile) => [profile.id, profile],
          ),
        );

        enriched = rows.map((row) => {
          if (!row.owner_user_id) {
            return row;
          }
          const profile = byId.get(row.owner_user_id);
          return {
            ...row,
            ownerDisplayName: resolveFormOwnerDisplayName(profile, {
              authEmail: profile?.email,
            }),
          };
        });
      }
    }

    setTemplates(enriched);
    setIsLoading(false);
  }, [searchQuery, actor?.isActiveAdmin]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadTemplates();
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadTemplates]);

  const resetFormState = () => {
    setFormValue(emptyFormInput());
    setExistingStoragePath(null);
    setPdfFile(null);
    setReplacePdf(false);
    setFormError(null);
    setEditingOwnerLabel(null);
  };

  const closeForm = () => {
    setFormMode("hidden");
    setEditingTemplateId(null);
    resetFormState();
  };

  const openCreateForm = () => {
    setFormMode("create");
    setEditingTemplateId(null);
    resetFormState();
  };

  const openEditForm = (template: FormListItem) => {
    if (!canEditForm(actor, template)) {
      setListError(LIBRARY_PERMISSION_DENIED);
      return;
    }
    setFormMode("edit");
    setEditingTemplateId(template.id);
    setFormValue(formToInput(template));
    setExistingStoragePath(template.source_storage_path);
    setPdfFile(null);
    setReplacePdf(false);
    setFormError(null);

    const ownership = presentFormOwnership({
      scope: template.scope,
      ownerUserId: template.owner_user_id,
      viewerUserId: actor?.userId ?? null,
      isActiveAdmin: Boolean(actor?.isActiveAdmin),
      ownerDisplayName: template.ownerDisplayName,
    });
    setEditingOwnerLabel(ownership.detailLine);
  };

  const ownershipFor = useCallback(
    (template: FormListItem) =>
      presentFormOwnership({
        scope: template.scope,
        ownerUserId: template.owner_user_id,
        viewerUserId: actor?.userId ?? null,
        isActiveAdmin: Boolean(actor?.isActiveAdmin),
        ownerDisplayName: template.ownerDisplayName,
      }),
    [actor?.isActiveAdmin, actor?.userId],
  );

  const openCopyDialog = (template: FormListItem) => {
    if (
      !canOfferCopyToGlobalLibrary({
        isActiveAdmin: Boolean(actor?.isActiveAdmin),
        scope: template.scope,
        status: template.status,
        ownerUserId: template.owner_user_id,
        sourceStoragePath: template.source_storage_path,
      })
    ) {
      setListError("You do not have permission to copy this form.");
      return;
    }
    setCopyTarget(template);
    setListError(null);
    setListMessage(null);
  };

  const closeCopyDialog = () => {
    if (isCopying) {
      return;
    }
    setCopyTarget(null);
  };

  const handleConfirmCopy = async () => {
    if (!copyTarget) {
      return;
    }
    setIsCopying(true);
    setListError(null);
    setListMessage(null);

    const result = await copyFormToGlobalLibrary(copyTarget.id);
    setIsCopying(false);

    if (!result.ok) {
      setListError(result.error);
      setCopyTarget(null);
      return;
    }

    setCopyTarget(null);
    setListMessage(result.message);
    await loadTemplates();
    router.push(`/forms/${result.newFormId}/editor`);
  };

  const handleSave = async () => {
    const validationError = validateFormInput(formValue, {
      mode: formMode === "create" ? "create" : "edit",
      pdfFile,
      replacePdf,
      existingStoragePath,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalized = normalizeFormInput(formValue);
    setIsSubmitting(true);
    setFormError(null);

    const supabase = createClient();

    try {
      if (formMode === "create") {
        if (!pdfFile) {
          throw new Error("A PDF file is required when creating a form template.");
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          throw new Error("You must be signed in to create a form.");
        }

        const pendingPath = buildPendingFormStoragePath(
          globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
        );

        const { data: created, error: insertError } = await supabase
          .from("forms")
          .insert({
            ...normalized,
            source_storage_path: pendingPath,
            scope: "PRIVATE",
            owner_user_id: user.id,
          })
          .select("id")
          .single();

        if (insertError || !created?.id) {
          setFormError(insertError?.message ?? "Failed to create form.");
          setIsSubmitting(false);
          return;
        }

        const formId = created.id as number;
        let uploadedPath: string | null = null;
        try {
          const storagePath = buildFormStoragePath({
            scope: "PRIVATE",
            formId,
            fileName: pdfFile.name,
            ownerUserId: user.id,
          });
          uploadedPath = await uploadFormPdfToPath(supabase, pdfFile, storagePath);
          const { error: updateError } = await supabase
            .from("forms")
            .update({ source_storage_path: uploadedPath })
            .eq("id", formId);

          if (updateError) {
            throw new Error(updateError.message);
          }
        } catch (uploadError) {
          if (uploadedPath) {
            try {
              await removeFormStorageObject(supabase, uploadedPath);
            } catch (cleanupError) {
              console.error(
                "[forms-page] Failed to remove orphan form PDF after create error",
                cleanupError,
              );
            }
          }
          await supabase
            .from("forms")
            .update({ status: "DELETED" })
            .eq("id", formId);
          throw uploadError;
        }
      }

      if (formMode === "edit" && editingTemplateId !== null) {
        const { data: existingForm, error: existingError } = await supabase
          .from("forms")
          .select("id, scope, owner_user_id, status")
          .eq("id", editingTemplateId)
          .eq("status", "ACTIVE")
          .single();

        if (existingError || !existingForm) {
          throw new Error(existingError?.message ?? "Form not found.");
        }

        assertCanEditForm(actor, existingForm);

        let sourceStoragePath = existingStoragePath?.trim() || "";

        if (replacePdf) {
          if (!pdfFile) {
            throw new Error("Select a PDF file to replace the current template.");
          }

          const storagePath = buildFormStoragePath({
            scope: (existingForm.scope as "GLOBAL" | "PRIVATE" | "ORGANIZATION") ?? "PRIVATE",
            formId: editingTemplateId,
            fileName: pdfFile.name,
            ownerUserId: existingForm.owner_user_id,
          });

          sourceStoragePath = await uploadFormPdfToPath(
            supabase,
            pdfFile,
            storagePath,
            { upsert: true },
          );
        }

        if (!sourceStoragePath) {
          throw new Error("A stored PDF is required for this form template.");
        }

        const { data: updatedRows, error } = await supabase
          .from("forms")
          .update({
            ...normalized,
            source_storage_path: sourceStoragePath,
          })
          .eq("id", editingTemplateId)
          .eq("status", "ACTIVE")
          .select("id");

        if (error) {
          setFormError(error.message);
          setIsSubmitting(false);
          return;
        }

        if (!updatedRows?.length) {
          setFormError(LIBRARY_PERMISSION_DENIED);
          setIsSubmitting(false);
          return;
        }
      }
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save form template.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    closeForm();
    await loadTemplates();
  };

  const openDeleteDialog = (template: Form) => {
    if (!canDeleteForm(actor, template)) {
      setListError(LIBRARY_PERMISSION_DENIED);
      return;
    }
    setTemplatePendingDelete(template);
    setListError(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setTemplatePendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!templatePendingDelete) {
      return;
    }

    setIsDeleting(true);
    setListError(null);
    const supabase = createClient();

    try {
      assertCanEditForm(actor, templatePendingDelete);
      const { data: deletedRows, error } = await supabase
        .from("forms")
        .update({ status: "DELETED" })
        .eq("id", templatePendingDelete.id)
        .eq("status", "ACTIVE")
        .select("id");

      if (error) {
        throw new Error(error.message);
      }

      if (!deletedRows?.length) {
        throw new Error(LIBRARY_PERMISSION_DENIED);
      }
    } catch (deleteError) {
      setIsDeleting(false);
      setListError(
        deleteError instanceof Error
          ? deleteError.message
          : LIBRARY_PERMISSION_DENIED,
      );
      return;
    }

    setIsDeleting(false);

    if (editingTemplateId === templatePendingDelete.id) {
      closeForm();
    }

    setTemplatePendingDelete(null);
    await loadTemplates();
  };

  const formTitle =
    formMode === "create" ? "Add form template" : "Edit form template";

  const formDescription =
    formMode === "create"
      ? "Upload a blank PDF and register it as a reusable form template."
      : editingOwnerLabel
        ? editingOwnerLabel
        : "Update template details or replace the stored PDF.";

  const copyOwnerName =
    copyTarget?.ownerDisplayName?.trim() || "this user";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <ConfirmDeleteDialog
        open={templatePendingDelete != null}
        objectType="form template"
        itemName={
          templatePendingDelete
            ? `${templatePendingDelete.form_name} (${formatFormReference(templatePendingDelete.id)})`
            : null
        }
        canRestore
        isConfirming={isDeleting}
        confirmingLabel="Deleting…"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={closeDeleteDialog}
      />
      <ConfirmDialog
        open={copyTarget != null}
        title="Copy to Global Library?"
        message={
          copyTarget
            ? `This will create a separate Global copy of “${copyTarget.form_name}.” The original private form owned by ${copyOwnerName} will remain unchanged.`
            : undefined
        }
        confirmLabel="Copy to Global Library"
        cancelLabel="Cancel"
        isConfirming={isCopying}
        confirmingLabel="Copying…"
        onConfirm={() => void handleConfirmCopy()}
        onCancel={closeCopyDialog}
        variant="default"
        initialFocus="confirm"
      />
      <ListPageHeader
        title="Form Templates"
        description="Manage blank PDF form templates for future document packets."
        action={
          formMode === "hidden" ? (
            <Button onClick={openCreateForm}>Add form template</Button>
          ) : undefined
        }
      />

      {formMode !== "hidden" && (
        <Card>
          <CardHeader>
            <CardTitle>{formTitle}</CardTitle>
            <CardDescription>{formDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <FormForm
              value={formValue}
              onChange={setFormValue}
              onSubmit={() => void handleSave()}
              onCancel={closeForm}
              isSubmitting={isSubmitting}
              error={formError}
              mode={formMode}
              templateId={editingTemplateId}
              existingStoragePath={existingStoragePath}
              pdfFile={pdfFile}
              onPdfFileChange={setPdfFile}
              replacePdf={replacePdf}
              onReplacePdfChange={setReplacePdf}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active form templates</CardTitle>
          <CardDescription>
            Search by template name, code, category, or version label.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search form templates..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          {listError && <p className="text-sm text-destructive">{listError}</p>}
          {listMessage && (
            <p className="text-sm text-muted-foreground">{listMessage}</p>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading form templates…
            </p>
          ) : templates.length === 0 ? (
            <ListEmptyState
              title="No private forms"
              description="Upload a private form when you need a custom template."
              action={
                formMode === "hidden" ? (
                  <Button size="sm" onClick={openCreateForm}>
                    Add form template
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ResizableDataTable
              storageKey="harbaugh-forms-list-column-widths"
              tablePreferencesKey="forms_list"
              columns={FORM_TABLE_COLUMNS}
            >
              {templates.map((template) => {
                const ownership = ownershipFor(template);
                const showCopy = canOfferCopyToGlobalLibrary({
                  isActiveAdmin: Boolean(actor?.isActiveAdmin),
                  scope: template.scope,
                  status: template.status,
                  ownerUserId: template.owner_user_id,
                  sourceStoragePath: template.source_storage_path,
                });

                return (
                  <ResizableDataTableRow key={template.id}>
                    <ResizableDataTableCell className="text-muted-foreground">
                      {formatFormReference(template.id)}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell>
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="line-clamp-2 font-medium leading-snug"
                            title={template.form_name}
                          >
                            {template.form_name}
                          </span>
                          {ownership.isOtherUserPrivate ? (
                            <span
                              className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                              title={ownership.detailLine ?? undefined}
                            >
                              {ownership.primaryLabel}
                            </span>
                          ) : (
                            <LibraryScopeBadge scope={template.scope} />
                          )}
                        </div>
                      </div>
                    </ResizableDataTableCell>
                    <ResizableDataTableCell>
                      <span
                        className="line-clamp-2 break-all font-mono text-xs leading-snug"
                        title={template.form_code}
                      >
                        {template.form_code}
                      </span>
                    </ResizableDataTableCell>
                    <ResizableDataTableCell truncate>
                      {formatFormCategory(template.form_category)}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell truncate>
                      {template.version_label ?? "—"}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell>
                      <span
                        className="line-clamp-2 break-all font-mono text-xs leading-snug text-muted-foreground"
                        title={template.source_storage_path}
                      >
                        {template.source_storage_path}
                      </span>
                    </ResizableDataTableCell>
                    <ResizableDataTableActionsCell>
                      <ListRowActions>
                        {canMapFormFields(actor, template) ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/forms/${template.id}/editor`}>
                              Map fields
                            </Link>
                          </Button>
                        ) : null}
                        {showCopy ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCopyDialog(template)}
                          >
                            Copy to Global Library
                          </Button>
                        ) : null}
                        {canEditForm(actor, template) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditForm(template)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {canDeleteForm(actor, template) ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteDialog(template)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </ListRowActions>
                    </ResizableDataTableActionsCell>
                  </ResizableDataTableRow>
                );
              })}
            </ResizableDataTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
