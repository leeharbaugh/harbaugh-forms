"use client";

import { FieldDetailDialog } from "@/components/forms/field-detail-dialog";
import { FieldFormDialog } from "@/components/forms/field-form-dialog";
import { FieldRetireConfirmDialog } from "@/components/forms/field-retire-confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { getFieldUsageCounts, type FieldUsageCounts } from "@/lib/field-retire";
import {
  type Field,
  deleteField,
  emptyFieldAdminInput,
  fieldToAdminInput,
  formatFieldDataType,
  formatFieldStatus,
  formatFieldWidgetType,
  isFieldDeleted,
  normalizeFieldAdminInput,
  restoreField,
  validateFieldAdminInput,
} from "@/lib/types/field";
import {
  formatFieldSourceMappingCatalog,
  formatFieldSourceSaveError,
  formatFieldSourceStatusDisplay,
} from "@/lib/types/field-source";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

type FormPanelMode = "hidden" | "create" | "edit";

function formatFieldDisplayLabel(field: Field): string {
  return (
    field.field_label?.trim() ||
    field.field_name?.trim() ||
    field.field_key
  );
}

export function FieldsPage() {
  const [fields, setFields] = useState<Field[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formPanelMode, setFormPanelMode] = useState<FormPanelMode>("hidden");
  const [viewField, setViewField] = useState<Field | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [formValue, setFormValue] = useState(emptyFieldAdminInput());
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);
  const [fieldToRetire, setFieldToRetire] = useState<Field | null>(null);
  const [retireUsage, setRetireUsage] = useState<FieldUsageCounts | null>(null);
  const [isLoadingRetireUsage, setIsLoadingRetireUsage] = useState(false);

  const loadFields = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    let query = supabase
      .from("fields")
      .select("*")
      .order("field_key", { ascending: true });

    if (showDeleted) {
      query = query.in("status", ["ACTIVE", "INACTIVE", "DELETED"]);
    } else {
      query = query.in("status", ["ACTIVE", "INACTIVE"]);
    }

    const trimmedSearch = searchQuery.trim();
    if (trimmedSearch) {
      const term = `%${trimmedSearch}%`;
      query = query.or(
        [
          `field_key.ilike.${term}`,
          `field_name.ilike.${term}`,
          `field_label.ilike.${term}`,
          `notes.ilike.${term}`,
          `source_path.ilike.${term}`,
          `resolver_key.ilike.${term}`,
        ].join(","),
      );
    }

    const { data, error } = await query;

    if (error) {
      setListError(error.message);
      setFields([]);
    } else {
      setFields((data as Field[]) ?? []);
    }

    setIsLoading(false);
  }, [searchQuery, showDeleted]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadFields();
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadFields]);

  const resetFormState = () => {
    setFormValue(emptyFieldAdminInput());
    setFormError(null);
  };

  const closeFormPanel = () => {
    setFormPanelMode("hidden");
    setEditingFieldId(null);
    resetFormState();
  };

  const openCreateForm = () => {
    setViewField(null);
    setFormPanelMode("create");
    setEditingFieldId(null);
    resetFormState();
    setListError(null);
  };

  const openViewField = (field: Field) => {
    setViewField(field);
  };

  const closeViewField = () => {
    setViewField(null);
  };

  const openEditField = (field: Field) => {
    setViewField(null);
    setFormPanelMode("edit");
    setEditingFieldId(field.id);
    setFormValue(fieldToAdminInput(field));
    setFormError(null);
  };

  const handleSave = async () => {
    const validationError = validateFieldAdminInput(formValue);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalized = normalizeFieldAdminInput(formValue);
    setIsSubmitting(true);
    setFormError(null);

    const supabase = createClient();

    if (formPanelMode === "create") {
      const { error } = await supabase.from("fields").insert({
        ...(normalized as Record<string, unknown>),
        status: "ACTIVE",
      });

      if (error) {
        setFormError(formatFieldSourceSaveError(error.message));
        setIsSubmitting(false);
        return;
      }
    }

    if (formPanelMode === "edit" && editingFieldId !== null) {
      const { error } = await supabase
        .from("fields")
        .update(normalized as Record<string, unknown>)
        .eq("id", editingFieldId);

      if (error) {
        setFormError(formatFieldSourceSaveError(error.message));
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(false);
    closeFormPanel();
    await loadFields();
  };

  const closeRetireDialog = () => {
    if (isDeleting) {
      return;
    }

    setRetireDialogOpen(false);
    setFieldToRetire(null);
    setRetireUsage(null);
    setIsLoadingRetireUsage(false);
  };

  const openRetireDialog = async (field: Field) => {
    setListError(null);
    setFieldToRetire(field);
    setRetireUsage(null);
    setRetireDialogOpen(true);
    setIsLoadingRetireUsage(true);

    try {
      const supabase = createClient();
      const usage = await getFieldUsageCounts(supabase, field.id);
      setRetireUsage(usage);
    } catch (usageError) {
      closeRetireDialog();
      setListError(
        usageError instanceof Error
          ? usageError.message
          : "Failed to check field usage.",
      );
    } finally {
      setIsLoadingRetireUsage(false);
    }
  };

  const handleConfirmRetire = async () => {
    if (!fieldToRetire) {
      return;
    }

    setListError(null);
    setIsDeleting(true);

    try {
      const supabase = createClient();
      await deleteField(supabase, fieldToRetire.id);

      if (editingFieldId === fieldToRetire.id) {
        closeFormPanel();
      }

      if (viewField?.id === fieldToRetire.id) {
        closeViewField();
      }

      closeRetireDialog();
      await loadFields();
    } catch (deleteError) {
      setListError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to retire field.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async (field: Field) => {
    setListError(null);
    setIsRestoring(true);

    try {
      const supabase = createClient();
      await restoreField(supabase, field.id);
      await loadFields();
    } catch (restoreError) {
      setListError(
        restoreError instanceof Error
          ? restoreError.message
          : "Failed to restore field.",
      );
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fields</h1>
          <p className="text-sm text-muted-foreground">
            Reusable business field definitions used across forms and packets.
          </p>
        </div>
        <Button onClick={openCreateForm}>Add field</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Field catalog</CardTitle>
          <CardDescription>
            Generic field definitions without form placement or coordinates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search fields..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id="show_deleted_fields"
              checked={showDeleted}
              onCheckedChange={(checked) => setShowDeleted(checked === true)}
            />
            <Label htmlFor="show_deleted_fields" className="font-normal">
              Show deleted fields
            </Label>
          </div>

          {listError && <p className="text-sm text-destructive">{listError}</p>}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading fields...</p>
          ) : fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fields found. Add a field to build your catalog.
            </p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="min-w-0 px-4 py-3">Field</th>
                    <th className="hidden px-4 py-3 sm:table-cell sm:w-[6.5rem]">
                      Data type
                    </th>
                    <th className="hidden px-4 py-3 sm:table-cell sm:w-[6.5rem]">
                      Widget type
                    </th>
                    <th className="hidden min-w-0 max-w-[14rem] px-4 py-3 sm:table-cell">
                      Source mapping
                    </th>
                    <th className="sticky right-0 min-w-[12.5rem] whitespace-nowrap bg-muted/40 px-4 py-3 text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fields.map((field) => {
                    const deleted = isFieldDeleted(field);
                    const displayLabel = formatFieldDisplayLabel(field);
                    const sourceStatus = formatFieldSourceStatusDisplay(field);
                    const sourceMapping = formatFieldSourceMappingCatalog(field);

                    return (
                      <tr
                        key={field.id}
                        className={cn(deleted && "bg-muted/20")}
                      >
                        <td className="min-w-0 px-4 py-3 align-middle">
                          <div className="min-w-0 space-y-1">
                            <div
                              className="break-words font-medium leading-snug"
                              title={displayLabel}
                            >
                              {displayLabel}
                            </div>
                            <div
                              className="truncate font-mono text-xs text-muted-foreground"
                              title={field.field_key}
                            >
                              {field.field_key}
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground sm:hidden">
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                <span>
                                  {formatFieldDataType(field.field_data_type)}
                                </span>
                                <span>
                                  {formatFieldWidgetType(field.field_widget_type)}
                                </span>
                              </div>
                              {sourceStatus.status === "globally_mapped" &&
                              sourceMapping ? (
                                <div
                                  className="break-words font-mono leading-snug"
                                  title={sourceMapping}
                                >
                                  {sourceMapping}
                                </div>
                              ) : (
                                <div className="text-muted-foreground/80">
                                  {sourceStatus.label}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 align-middle text-sm sm:table-cell sm:w-[6.5rem]">
                          {formatFieldDataType(field.field_data_type)}
                        </td>
                        <td className="hidden px-4 py-3 align-middle text-sm sm:table-cell sm:w-[6.5rem]">
                          {formatFieldWidgetType(field.field_widget_type)}
                        </td>
                        <td className="hidden min-w-0 max-w-[14rem] px-4 py-3 align-middle sm:table-cell">
                          {sourceStatus.status === "globally_mapped" &&
                          sourceMapping ? (
                            <div
                              className="line-clamp-2 break-words font-mono text-xs leading-snug"
                              title={sourceMapping}
                            >
                              {sourceMapping}
                            </div>
                          ) : (
                            <span
                              className="text-xs text-muted-foreground"
                              title={sourceStatus.helperText ?? undefined}
                            >
                              {sourceStatus.label}
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "sticky right-0 min-w-[12.5rem] whitespace-nowrap px-4 py-3 align-middle shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]",
                            deleted ? "bg-muted/20" : "bg-background",
                          )}
                        >
                          <div className="flex flex-row flex-nowrap items-center justify-end gap-2 max-sm:flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openViewField(field)}
                            >
                              View
                            </Button>
                            {!deleted && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditField(field)}
                              >
                                Edit
                              </Button>
                            )}
                            {deleted ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isRestoring}
                                onClick={() => void handleRestore(field)}
                              >
                                Restore
                              </Button>
                            ) : (
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={isDeleting}
                                onClick={() => void openRetireDialog(field)}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {showDeleted && (
            <p className="text-xs text-muted-foreground">
              Deleted fields show status {formatFieldStatus("DELETED")} in the
              detail view.
            </p>
          )}
        </CardContent>
      </Card>

      <FieldDetailDialog
        open={viewField != null}
        field={viewField}
        onClose={closeViewField}
        onEdit={(field) => {
          closeViewField();
          openEditField(field);
        }}
      />

      <FieldFormDialog
        open={formPanelMode !== "hidden"}
        mode={formPanelMode === "create" ? "create" : "edit"}
        title={formPanelMode === "create" ? "Add field" : "Edit field"}
        description={
          formPanelMode === "create"
            ? "Create a reusable business field definition."
            : "Update the field definition."
        }
        value={formValue}
        onChange={setFormValue}
        onSubmit={() => void handleSave()}
        onCancel={closeFormPanel}
        isSubmitting={isSubmitting}
        error={formError}
        fieldId={editingFieldId}
      />

      <FieldRetireConfirmDialog
        open={retireDialogOpen}
        field={fieldToRetire}
        usage={retireUsage}
        isLoadingUsage={isLoadingRetireUsage}
        isConfirming={isDeleting}
        onConfirm={() => void handleConfirmRetire()}
        onCancel={closeRetireDialog}
      />
    </div>
  );
}
