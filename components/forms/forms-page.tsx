"use client";

import { FormForm } from "@/components/forms/form-form";
import { ListRowActions, listTableActionsCellClass, listTableActionsHeaderClass } from "@/components/list-row-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { uploadFormPdf } from "@/lib/form-storage";
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
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type FormMode = "hidden" | "create" | "edit";

export function FormsPage() {
  const [templates, setTemplates] = useState<Form[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(
    null,
  );
  const [formValue, setFormValue] = useState(emptyFormInput());
  const [existingStoragePath, setExistingStoragePath] = useState<string | null>(
    null,
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [replacePdf, setReplacePdf] = useState(false);

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
    } else {
      setTemplates((data as Form[]) ?? []);
    }

    setIsLoading(false);
  }, [searchQuery]);

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

  const openEditForm = (template: Form) => {
    setFormMode("edit");
    setEditingTemplateId(template.id);
    setFormValue(formToInput(template));
    setExistingStoragePath(template.source_storage_path);
    setPdfFile(null);
    setReplacePdf(false);
    setFormError(null);
  };

  const resolveStoragePath = async (
    normalized: ReturnType<typeof normalizeFormInput>,
    templateId: number | null,
  ) => {
    const supabase = createClient();
    const folderKey = normalized.form_code || String(templateId ?? "template");

    if (formMode === "create") {
      if (!pdfFile) {
        throw new Error("A PDF file is required when creating a form template.");
      }
      return uploadFormPdf(supabase, pdfFile, folderKey);
    }

    if (replacePdf) {
      if (!pdfFile) {
        throw new Error("Select a PDF file to replace the current template.");
      }
      return uploadFormPdf(supabase, pdfFile, folderKey);
    }

    if (!existingStoragePath?.trim()) {
      throw new Error("A stored PDF is required for this form template.");
    }

    return existingStoragePath;
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
        const sourceStoragePath = await resolveStoragePath(normalized, null);

        const { error } = await supabase.from("forms").insert({
          ...normalized,
          source_storage_path: sourceStoragePath,
        });

        if (error) {
          setFormError(error.message);
          setIsSubmitting(false);
          return;
        }
      }

      if (formMode === "edit" && editingTemplateId !== null) {
        const sourceStoragePath = await resolveStoragePath(
          normalized,
          editingTemplateId,
        );

        const { error } = await supabase
          .from("forms")
          .update({
            ...normalized,
            source_storage_path: sourceStoragePath,
          })
          .eq("id", editingTemplateId)
          .eq("status", "ACTIVE");

        if (error) {
          setFormError(error.message);
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

  const handleDelete = async (template: Form) => {
    const confirmed = window.confirm(
      `Delete form template ${template.form_name} (${formatFormReference(template.id)})? This will mark the template as deleted.`,
    );

    if (!confirmed) {
      return;
    }

    setListError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("forms")
      .update({ status: "DELETED" })
      .eq("id", template.id)
      .eq("status", "ACTIVE");

    if (error) {
      setListError(error.message);
      return;
    }

    if (editingTemplateId === template.id) {
      closeForm();
    }

    await loadTemplates();
  };

  const formTitle =
    formMode === "create" ? "Add form template" : "Edit form template";

  const formDescription =
    formMode === "create"
      ? "Upload a blank PDF and register it as a reusable form template."
      : "Update template details or replace the stored PDF.";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Form Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage blank PDF form templates for future document packets.
          </p>
        </div>
        {formMode === "hidden" && (
          <Button onClick={openCreateForm}>Add form template</Button>
        )}
      </div>

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

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading form templates...
            </p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active form templates found.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full table-auto border-collapse">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">ID</th>
                    <th className="min-w-[8rem] px-4 py-3">Template name</th>
                    <th className="min-w-[6rem] px-4 py-3">Template code</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="min-w-[8rem] px-4 py-3">Storage path</th>
                    <th className={listTableActionsHeaderClass}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {templates.map((template) => (
                    <tr key={template.id} className="text-sm">
                      <td className="px-4 py-3 align-middle text-muted-foreground">
                        {formatFormReference(template.id)}
                      </td>
                      <td className="min-w-0 px-4 py-3 align-middle">
                        <span
                          className="line-clamp-2 font-medium leading-snug"
                          title={template.form_name}
                        >
                          {template.form_name}
                        </span>
                      </td>
                      <td className="min-w-0 px-4 py-3 align-middle">
                        <span
                          className="line-clamp-2 break-all font-mono text-xs leading-snug"
                          title={template.form_code}
                        >
                          {template.form_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {formatFormCategory(template.form_category)}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {template.version_label ?? "—"}
                      </td>
                      <td className="min-w-0 px-4 py-3 align-middle">
                        <span
                          className="line-clamp-2 break-all font-mono text-xs leading-snug text-muted-foreground"
                          title={template.source_storage_path}
                        >
                          {template.source_storage_path}
                        </span>
                      </td>
                      <td className={listTableActionsCellClass}>
                        <ListRowActions>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/forms/${template.id}/editor`}>
                              Map fields
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditForm(template)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleDelete(template)}
                          >
                            Delete
                          </Button>
                        </ListRowActions>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
