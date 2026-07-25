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
import { AppCheckbox } from "@/components/ui/app-checkbox";
import {
  FormPublicationBadge,
  LibraryScopeBadge,
} from "@/components/ui/list-badges";
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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  copyFormToGlobalLibrary,
  previewCopyFormToGlobalLibrary,
  type CopyToGlobalPreview,
} from "@/lib/admin/copy-form-to-global";
import { useScrollEditorIntoView } from "@/lib/ui/use-scroll-editor-into-view";
import {
  findPublishedFamilyConflict,
  listFormStateEvents,
  previewPublishForm,
  publishFormTemplate,
  restoreFormTemplate,
  retireFormTemplate,
  unpublishFormTemplate,
  type FormStateEventListItem,
} from "@/lib/forms/form-lifecycle-actions";
import {
  canOfferCopyToGlobalLibrary,
  presentFormOwnership,
  resolveFormOwnerDisplayName,
  type FormOwnerProfile,
} from "@/lib/form-owner-display";
import { canOfferFormDefaultsManagement, mapFieldsEditorPath } from "@/lib/types/field-default-management";
import {
  buildFormStoragePath,
  buildPendingFormStoragePath,
  removeFormStorageObject,
  uploadFormPdfToPath,
} from "@/lib/form-storage";
import {
  assertCanEditForm,
  canCreateFormScope,
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
import {
  FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE,
  FORM_RETIRED_READONLY_MESSAGE,
  canPublishForm,
  canRestoreForm,
  canRetireForm,
  canStructurallyEditForm,
  canUnpublishForm,
  formatFormStateEventType,
  formatLifecycleTransitionLabel,
  isFormPublished,
  isFormRetired,
  structuralEditBlockedMessage,
  type PublishConflict,
} from "@/lib/types/form-lifecycle";
import { useLibraryActor } from "@/lib/use-library-actor";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
  { id: "publication", label: "Publication", defaultWidth: 110, minWidth: 90 },
  { id: "storage_path", label: "Storage path", defaultWidth: 180 },
  {
    id: "actions",
    label: "Actions",
    defaultWidth: 520,
    minWidth: 360,
    maxWidth: 720,
    isActions: true,
  },
];

type PublishPreviewState = {
  mappingCount: number;
  requiresEmptyMappingsConfirmation: boolean;
  conflict: PublishConflict | null;
  issues: Array<{ code: string; message: string; blocking: boolean }>;
};

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
  const [editingLifecycle, setEditingLifecycle] = useState<{
    status: string;
    publication_state: string;
  } | null>(null);
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
  const [copyPreview, setCopyPreview] = useState<CopyToGlobalPreview | null>(
    null,
  );
  const [isCopyPreviewLoading, setIsCopyPreviewLoading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const copyPreviewFormIdRef = useRef<number | null>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const allowGlobalScope = Boolean(actor?.isActiveAdmin);

  const [lifecycleTarget, setLifecycleTarget] = useState<FormListItem | null>(
    null,
  );
  const [lifecycleAction, setLifecycleAction] = useState<
    "publish" | "unpublish" | "retire" | "restore" | "history" | null
  >(null);
  const [isLifecycleWorking, setIsLifecycleWorking] = useState(false);
  const [publishPreview, setPublishPreview] =
    useState<PublishPreviewState | null>(null);
  const [isPublishPreviewLoading, setIsPublishPreviewLoading] = useState(false);
  const [allowEmptyMappings, setAllowEmptyMappings] = useState(false);
  const [retirePreviousConfirmed, setRetirePreviousConfirmed] = useState(false);
  const [restoreReason, setRestoreReason] = useState("");
  const [restoreConflict, setRestoreConflict] = useState<PublishConflict | null>(
    null,
  );
  const [confirmNewerPublished, setConfirmNewerPublished] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<FormStateEventListItem[]>(
    [],
  );
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useScrollEditorIntoView(formPanelRef, formMode, editingTemplateId);

  const loadTemplates = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    let query = supabase
      .from("forms")
      .select("*")
      .in("status", ["ACTIVE", "INACTIVE"])
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
    setEditingLifecycle(null);
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
    setEditingLifecycle({
      status: template.status,
      publication_state: template.publication_state,
    });
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
    setCopyPreview(null);
    setIsCopyPreviewLoading(true);
    setListError(null);
    setListMessage(null);
    copyPreviewFormIdRef.current = template.id;

    void previewCopyFormToGlobalLibrary(template.id).then((result) => {
      if (copyPreviewFormIdRef.current !== template.id) {
        return;
      }
      setIsCopyPreviewLoading(false);
      if (result.ok) {
        setCopyPreview(result.preview);
        return;
      }
      setCopyPreview(null);
      setListError(result.error);
    });
  };

  const closeCopyDialog = () => {
    if (isCopying) {
      return;
    }
    copyPreviewFormIdRef.current = null;
    setCopyTarget(null);
    setCopyPreview(null);
    setIsCopyPreviewLoading(false);
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
      setCopyPreview(null);
      return;
    }

    setCopyTarget(null);
    setCopyPreview(null);
    setListMessage(result.message);
    await loadTemplates();
    router.push(`/forms/${result.newFormId}/editor`);
  };

  const closeLifecycleDialog = (options?: { force?: boolean }) => {
    if (isLifecycleWorking && !options?.force) {
      return;
    }
    setLifecycleTarget(null);
    setLifecycleAction(null);
    setPublishPreview(null);
    setIsPublishPreviewLoading(false);
    setAllowEmptyMappings(false);
    setRetirePreviousConfirmed(false);
    setRestoreReason("");
    setRestoreConflict(null);
    setConfirmNewerPublished(false);
    setHistoryEvents([]);
    setIsHistoryLoading(false);
    setIsLifecycleWorking(false);
  };

  const openPublishDialog = (template: FormListItem) => {
    if (!canEditForm(actor, template) || !canPublishForm(template)) {
      setListError(LIBRARY_PERMISSION_DENIED);
      return;
    }
    setLifecycleTarget(template);
    setLifecycleAction("publish");
    setPublishPreview(null);
    setAllowEmptyMappings(false);
    setRetirePreviousConfirmed(false);
    setIsPublishPreviewLoading(true);
    setListError(null);
    setListMessage(null);

    void previewPublishForm(template.id).then((result) => {
      setIsPublishPreviewLoading(false);
      if (!result.ok) {
        setListError(result.error);
        setLifecycleTarget(null);
        setLifecycleAction(null);
        return;
      }
      setPublishPreview({
        mappingCount: result.mappingCount,
        requiresEmptyMappingsConfirmation:
          result.requiresEmptyMappingsConfirmation,
        conflict: result.conflict,
        issues: result.issues,
      });
    });
  };

  const openUnpublishDialog = (template: FormListItem) => {
    if (!canEditForm(actor, template) || !canUnpublishForm(template)) {
      setListError(LIBRARY_PERMISSION_DENIED);
      return;
    }
    setLifecycleTarget(template);
    setLifecycleAction("unpublish");
    setListError(null);
  };

  const openRetireDialog = (template: FormListItem) => {
    if (!canEditForm(actor, template) || !canRetireForm(template)) {
      setListError(LIBRARY_PERMISSION_DENIED);
      return;
    }
    setLifecycleTarget(template);
    setLifecycleAction("retire");
    setListError(null);
  };

  const openRestoreDialog = (template: FormListItem) => {
    if (!actor?.isActiveAdmin || !canRestoreForm(template)) {
      setListError("Only application admins can restore retired forms.");
      return;
    }
    setLifecycleTarget(template);
    setLifecycleAction("restore");
    setRestoreReason("");
    setRestoreConflict(null);
    setConfirmNewerPublished(false);
    setListError(null);

    void findPublishedFamilyConflict(template.id).then((result) => {
      if (result.ok && result.conflict) {
        setRestoreConflict(result.conflict);
      }
    });
  };

  const openHistoryDialog = (template: FormListItem) => {
    if (!actor?.isActiveAdmin) {
      setListError("Only application admins can view lifecycle history.");
      return;
    }
    setLifecycleTarget(template);
    setLifecycleAction("history");
    setHistoryEvents([]);
    setIsHistoryLoading(true);
    setListError(null);

    void listFormStateEvents(template.id).then((result) => {
      setIsHistoryLoading(false);
      if (!result.ok) {
        setListError(result.error);
        setLifecycleTarget(null);
        setLifecycleAction(null);
        return;
      }
      setHistoryEvents(result.events);
    });
  };

  const handleConfirmLifecycle = async () => {
    if (!lifecycleTarget || !lifecycleAction || lifecycleAction === "history") {
      return;
    }

    setIsLifecycleWorking(true);
    setListError(null);
    setListMessage(null);

    try {
      if (lifecycleAction === "publish") {
        if (
          publishPreview?.requiresEmptyMappingsConfirmation &&
          !allowEmptyMappings
        ) {
          throw new Error(
            "Confirm that you want to publish with no field mappings.",
          );
        }
        if (publishPreview?.conflict && !retirePreviousConfirmed) {
          throw new Error(
            "Choose Publish and retire previous, or cancel.",
          );
        }
        const blocking = (publishPreview?.issues ?? []).filter(
          (issue) => issue.blocking,
        );
        if (blocking.length > 0 && !allowEmptyMappings) {
          // Blocking issues other than empty mappings still block.
          const nonEmpty = blocking.filter(
            (issue) => issue.code !== "EMPTY_MAPPINGS",
          );
          if (nonEmpty.length > 0) {
            throw new Error(nonEmpty[0]!.message);
          }
        }

        const result = await publishFormTemplate({
          formId: lifecycleTarget.id,
          retirePreviousFormId: publishPreview?.conflict
            ? publishPreview.conflict.publishedFormId
            : null,
          allowEmptyMappings,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        setListMessage(result.message);
      }

      if (lifecycleAction === "unpublish") {
        const result = await unpublishFormTemplate({
          formId: lifecycleTarget.id,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        setListMessage(result.message);
      }

      if (lifecycleAction === "retire") {
        const result = await retireFormTemplate({
          formId: lifecycleTarget.id,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        setListMessage(result.message);
      }

      if (lifecycleAction === "restore") {
        if (!restoreReason.trim()) {
          throw new Error("A written reason is required to restore.");
        }
        if (restoreConflict && !confirmNewerPublished) {
          throw new Error(
            "Confirm that you want to restore despite a newer published version.",
          );
        }
        const result = await restoreFormTemplate({
          formId: lifecycleTarget.id,
          reason: restoreReason,
          confirmNewerPublished,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        setListMessage(result.message);
      }

      if (editingTemplateId === lifecycleTarget.id) {
        if (lifecycleAction === "publish") {
          setEditingLifecycle({
            status: "ACTIVE",
            publication_state: "PUBLISHED",
          });
        } else if (
          lifecycleAction === "unpublish" ||
          lifecycleAction === "restore"
        ) {
          setEditingLifecycle({
            status: "ACTIVE",
            publication_state: "DRAFT",
          });
        } else if (lifecycleAction === "retire") {
          setEditingLifecycle({
            status: "INACTIVE",
            publication_state: "DRAFT",
          });
        }
      }

      setIsLifecycleWorking(false);
      closeLifecycleDialog({ force: true });
      await loadTemplates();
    } catch (error) {
      setIsLifecycleWorking(false);
      setListError(
        error instanceof Error ? error.message : "Lifecycle action failed.",
      );
    }
  };

  const handleSave = async () => {
    const validationError = validateFormInput(formValue, {
      mode: formMode === "create" ? "create" : "edit",
      pdfFile,
      replacePdf,
      existingStoragePath,
      allowGlobalScope,
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

        const requestedScope =
          formValue.scope === "GLOBAL" ? "GLOBAL" : "PRIVATE";
        if (!canCreateFormScope(actor, requestedScope)) {
          throw new Error(
            "Only application admins can create Global forms.",
          );
        }

        const pendingPath = buildPendingFormStoragePath(
          globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
        );

        const { data: created, error: insertError } = await supabase
          .from("forms")
          .insert({
            ...normalized,
            publication_state: "DRAFT",
            source_storage_path: pendingPath,
            scope: requestedScope,
            owner_user_id: requestedScope === "GLOBAL" ? null : user.id,
            organization_id: null,
          })
          .select("id, scope")
          .single();

        if (insertError || !created?.id) {
          setFormError(insertError?.message ?? "Failed to create form.");
          setIsSubmitting(false);
          return;
        }

        // Defense in depth: DB trigger demotes non-admin GLOBAL attempts.
        if (
          requestedScope === "GLOBAL" &&
          String(created.scope) !== "GLOBAL"
        ) {
          await supabase
            .from("forms")
            .update({ status: "DELETED" })
            .eq("id", created.id);
          throw new Error(
            "Only application admins can create Global forms.",
          );
        }

        const formId = created.id as number;
        let uploadedPath: string | null = null;
        try {
          const storagePath = buildFormStoragePath({
            scope: requestedScope,
            formId,
            fileName: pdfFile.name,
            ownerUserId:
              requestedScope === "PRIVATE" ? user.id : undefined,
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
          .select(
            "id, scope, owner_user_id, status, publication_state",
          )
          .eq("id", editingTemplateId)
          .in("status", ["ACTIVE", "INACTIVE"])
          .single();

        if (existingError || !existingForm) {
          throw new Error(existingError?.message ?? "Form not found.");
        }

        assertCanEditForm(actor, existingForm);

        if (isFormRetired(existingForm)) {
          throw new Error(FORM_RETIRED_READONLY_MESSAGE);
        }

        let sourceStoragePath = existingStoragePath?.trim() || "";

        if (replacePdf) {
          if (!canStructurallyEditForm(existingForm)) {
            throw new Error(
              structuralEditBlockedMessage(existingForm) ??
                FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE,
            );
          }
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
      const deletableStatuses = ["ACTIVE", "INACTIVE"] as const;
      const { data: deletedRows, error } = await supabase
        .from("forms")
        .update({ status: "DELETED" })
        .eq("id", templatePendingDelete.id)
        .in("status", [...deletableStatuses])
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

  const editingIsRetired =
    editingLifecycle != null && isFormRetired(editingLifecycle);
  const editingIsPublished =
    editingLifecycle != null && isFormPublished(editingLifecycle);
  const editingTemplate =
    editingTemplateId == null
      ? null
      : (templates.find((row) => row.id === editingTemplateId) ?? null);
  const formLifecycleBanner = editingIsRetired
    ? FORM_RETIRED_READONLY_MESSAGE
    : editingIsPublished
      ? FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE
      : null;
  const showEditorLifecycle =
    formMode === "edit" &&
    editingTemplate != null &&
    canEditForm(actor, editingTemplate);

  const formDescription =
    formMode === "create"
      ? "Upload a blank PDF and register it as a reusable form template."
      : editingIsRetired
        ? FORM_RETIRED_READONLY_MESSAGE
        : editingOwnerLabel
          ? editingOwnerLabel
          : "Update template details or replace the stored PDF.";

  const copyOwnerName =
    copyTarget?.ownerDisplayName?.trim() || "this user";

  const copyPreviewSummary = (() => {
    if (!copyPreview) {
      return isCopyPreviewLoading ? " Loading field preview…" : "";
    }
    const parts = [
      `${copyPreview.reusableGlobalFieldKeys.length} global field(s) reused`,
      `${copyPreview.privateFieldsToCreateAsGlobal.length} created`,
    ];
    if (copyPreview.blockedFields.length > 0) {
      parts.push(
        `${copyPreview.blockedFields.length} blocked (${copyPreview.blockedFields
          .map((row) => row.fieldKey)
          .join(", ")})`,
      );
    }
    return ` ${parts.join("; ")}.`;
  })();

  const publishBlockingIssues =
    publishPreview?.issues.filter((issue) => issue.blocking) ?? [];
  const publishConfirmDisabled =
    isPublishPreviewLoading ||
    publishPreview == null ||
    (publishPreview.requiresEmptyMappingsConfirmation && !allowEmptyMappings) ||
    (publishPreview.conflict != null && !retirePreviousConfirmed) ||
    publishBlockingIssues.some(
      (issue) =>
        issue.code !== "EMPTY_MAPPINGS" || !allowEmptyMappings,
    );

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
            ? `This will create a separate Global copy of “${copyTarget.form_name}.” The original private form owned by ${copyOwnerName} will remain unchanged. Preference defaults will not be copied.${copyPreviewSummary}`
            : undefined
        }
        confirmLabel="Copy to Global Library"
        cancelLabel="Cancel"
        isConfirming={isCopying}
        confirmingLabel="Copying…"
        confirmDisabled={
          isCopyPreviewLoading ||
          (copyPreview != null && copyPreview.blockedFields.length > 0)
        }
        onConfirm={() => void handleConfirmCopy()}
        onCancel={closeCopyDialog}
        variant="default"
        initialFocus="confirm"
      />

      <ConfirmDialog
        open={lifecycleAction === "publish" && lifecycleTarget != null}
        title="Publish form?"
        confirmLabel={
          publishPreview?.conflict
            ? "Publish and retire previous"
            : "Publish Form"
        }
        cancelLabel="Cancel"
        isConfirming={isLifecycleWorking}
        confirmingLabel="Publishing…"
        confirmDisabled={publishConfirmDisabled}
        onConfirm={() => void handleConfirmLifecycle()}
        onCancel={() => closeLifecycleDialog()}
        className="max-h-[90vh] max-w-lg overflow-y-auto"
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Publish “{lifecycleTarget?.form_name}” so it can be used in
            collections and new packets.
          </p>
          {isPublishPreviewLoading ? (
            <p className="text-muted-foreground">Checking publish readiness…</p>
          ) : publishPreview ? (
            <>
              <p className="text-muted-foreground">
                {publishPreview.mappingCount} active field mapping
                {publishPreview.mappingCount === 1 ? "" : "s"}.
              </p>
              {publishPreview.issues.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {publishPreview.issues.map((issue) => (
                    <li
                      key={`${issue.code}-${issue.message}`}
                      className={
                        issue.blocking ? "text-destructive" : undefined
                      }
                    >
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No publish issues found.</p>
              )}
              {publishPreview.requiresEmptyMappingsConfirmation ? (
                <div className="flex items-start gap-2">
                  <AppCheckbox
                    id="allow_empty_mappings"
                    checked={allowEmptyMappings}
                    onCheckedChange={(checked) =>
                      setAllowEmptyMappings(checked === true)
                    }
                  />
                  <Label
                    htmlFor="allow_empty_mappings"
                    className="font-normal leading-snug"
                  >
                    Publish anyway with no field mappings
                  </Label>
                </div>
              ) : null}
              {publishPreview.conflict ? (
                <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
                  <p className="font-medium text-warning">
                    A published version already exists
                  </p>
                  <p className="text-muted-foreground">
                    Currently published: {publishPreview.conflict.formName}
                    {publishPreview.conflict.versionLabel
                      ? ` (${publishPreview.conflict.versionLabel})`
                      : ""}
                  </p>
                  <div className="flex items-start gap-2">
                    <AppCheckbox
                      id="retire_previous_published"
                      checked={retirePreviousConfirmed}
                      onCheckedChange={(checked) =>
                        setRetirePreviousConfirmed(checked === true)
                      }
                    />
                    <Label
                      htmlFor="retire_previous_published"
                      className="font-normal leading-snug"
                    >
                      Publish and retire the previous published version
                    </Label>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={lifecycleAction === "unpublish" && lifecycleTarget != null}
        title="Unpublish form?"
        message={
          lifecycleTarget
            ? `Unpublish “${lifecycleTarget.form_name}”? It will return to Draft. Existing packet forms remain available.`
            : undefined
        }
        confirmLabel="Unpublish Form"
        cancelLabel="Cancel"
        isConfirming={isLifecycleWorking}
        confirmingLabel="Unpublishing…"
        onConfirm={() => void handleConfirmLifecycle()}
        onCancel={() => closeLifecycleDialog()}
      />

      <ConfirmDialog
        open={lifecycleAction === "retire" && lifecycleTarget != null}
        title="Retire form version?"
        message={
          lifecycleTarget
            ? `Retire “${lifecycleTarget.form_name}”? Retired versions are read-only.`
            : undefined
        }
        confirmLabel="Retire Version"
        cancelLabel="Cancel"
        variant="destructive"
        isConfirming={isLifecycleWorking}
        confirmingLabel="Retiring…"
        onConfirm={() => void handleConfirmLifecycle()}
        onCancel={() => closeLifecycleDialog()}
      />

      <ConfirmDialog
        open={lifecycleAction === "restore" && lifecycleTarget != null}
        title="Restore retired version?"
        confirmLabel="Restore Retired Version"
        cancelLabel="Cancel"
        isConfirming={isLifecycleWorking}
        confirmingLabel="Restoring…"
        confirmDisabled={
          !restoreReason.trim() ||
          (restoreConflict != null && !confirmNewerPublished)
        }
        onConfirm={() => void handleConfirmLifecycle()}
        onCancel={() => closeLifecycleDialog()}
        className="max-h-[90vh] max-w-lg overflow-y-auto"
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Restore “{lifecycleTarget?.form_name}” as an ACTIVE Draft. It will
            not be published.
          </p>
          <div className="space-y-2">
            <Label htmlFor="restore_reason">Reason *</Label>
            <Textarea
              id="restore_reason"
              rows={3}
              value={restoreReason}
              onChange={(event) => setRestoreReason(event.target.value)}
              placeholder="Why is this version being restored?"
            />
          </div>
          {restoreConflict ? (
            <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
              <p className="font-medium text-warning">
                A newer published version exists
              </p>
              <p className="text-muted-foreground">
                {restoreConflict.formName}
                {restoreConflict.versionLabel
                  ? ` (${restoreConflict.versionLabel})`
                  : ""}{" "}
                is currently published in this family.
              </p>
              <div className="flex items-start gap-2">
                <AppCheckbox
                  id="confirm_newer_published"
                  checked={confirmNewerPublished}
                  onCheckedChange={(checked) =>
                    setConfirmNewerPublished(checked === true)
                  }
                />
                <Label
                  htmlFor="confirm_newer_published"
                  className="font-normal leading-snug"
                >
                  Restore this version as Draft anyway
                </Label>
              </div>
            </div>
          ) : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={lifecycleAction === "history" && lifecycleTarget != null}
        title="Lifecycle history"
        confirmLabel="Close"
        cancelLabel="Cancel"
        onConfirm={() => closeLifecycleDialog()}
        onCancel={() => closeLifecycleDialog()}
        className="max-h-[90vh] max-w-lg overflow-y-auto"
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {lifecycleTarget?.form_name}
          </p>
          {isHistoryLoading ? (
            <p className="text-muted-foreground">Loading history…</p>
          ) : historyEvents.length === 0 ? (
            <p className="text-muted-foreground">No lifecycle events yet.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {historyEvents.map((event) => (
                <div key={event.id} className="space-y-1 p-3">
                  <p className="font-medium">
                    {formatFormStateEventType(event.event_type)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.create_date).toLocaleString()}
                    {event.actor_display_name
                      ? ` · ${event.actor_display_name}`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatLifecycleTransitionLabel(
                      event.from_status,
                      event.from_publication_state,
                      event.to_status,
                      event.to_publication_state,
                    )}
                  </p>
                  {event.reason ? (
                    <p className="text-xs text-muted-foreground">
                      Reason: {event.reason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </ConfirmDialog>
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
        <Card ref={formPanelRef} className="scroll-mt-6">
          <CardHeader>
            <CardTitle>{formTitle}</CardTitle>
            <CardDescription>{formDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormForm
              value={formValue}
              onChange={setFormValue}
              onSubmit={() => void handleSave()}
              onCancel={closeForm}
              isSubmitting={isSubmitting}
              error={formError}
              mode={editingIsRetired ? "view" : formMode === "create" ? "create" : "edit"}
              templateId={editingTemplateId}
              existingStoragePath={existingStoragePath}
              pdfFile={pdfFile}
              onPdfFileChange={setPdfFile}
              replacePdf={replacePdf}
              onReplacePdfChange={setReplacePdf}
              allowGlobalScope={allowGlobalScope}
              lifecycleBanner={formLifecycleBanner}
              allowReplacePdf={
                editingLifecycle == null ||
                canStructurallyEditForm(editingLifecycle)
              }
            />

            {showEditorLifecycle && editingTemplate ? (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold tracking-tight">
                    Form lifecycle
                  </h3>
                  <FormPublicationBadge
                    status={editingLifecycle?.status}
                    publication_state={editingLifecycle?.publication_state}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {editingIsRetired
                    ? "Retired versions are read-only. Restore to Draft before making structural edits."
                    : editingIsPublished
                      ? "Unpublish to return this form to Draft before structural edits, or retire this version."
                      : "Publish when mappings are ready, or retire this draft version."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {canPublishForm(editingTemplate) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openPublishDialog(editingTemplate)}
                    >
                      Publish Form
                    </Button>
                  ) : null}
                  {canUnpublishForm(editingTemplate) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openUnpublishDialog(editingTemplate)}
                    >
                      Unpublish Form
                    </Button>
                  ) : null}
                  {canRetireForm(editingTemplate) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openRetireDialog(editingTemplate)}
                    >
                      Retire Version
                    </Button>
                  ) : null}
                  {actor?.isActiveAdmin && canRestoreForm(editingTemplate) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openRestoreDialog(editingTemplate)}
                    >
                      Restore Retired Version
                    </Button>
                  ) : null}
                  {actor?.isActiveAdmin ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openHistoryDialog(editingTemplate)}
                    >
                      View History
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Form templates</CardTitle>
          <CardDescription>
            Search by template name, code, category, or version label. Includes
            draft, published, and retired versions.
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
                      <FormPublicationBadge
                        status={template.status}
                        publication_state={template.publication_state}
                      />
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
                        {canMapFormFields(actor, template) ||
                        canOfferFormDefaultsManagement(template) ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={mapFieldsEditorPath(template.id)}>
                              Map Fields
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
                            {isFormRetired(template) ? "View" : "Edit"}
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
