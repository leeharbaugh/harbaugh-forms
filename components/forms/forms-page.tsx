"use client";

import { FormForm } from "@/components/forms/form-form";
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

type FormMode = "hidden" | "create" | "edit" | "view";

const LIST_COLUMNS =
  "grid grid-cols-[minmax(0,0.5fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.5fr)_minmax(0,1.2fr)] gap-3";

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

  const openTemplateForm = (template: Form, mode: "edit" | "view") => {
    setFormMode(mode);
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
    formMode === "create"
      ? "Add form template"
      : formMode === "edit"
        ? "Edit form template"
        : "View form template";

  const formDescription =
    formMode === "create"
      ? "Upload a blank PDF and register it as a reusable form template."
      : formMode === "edit"
        ? "Update template details or replace the stored PDF."
        : "Read-only view of the form template.";

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
              mode={formMode === "view" ? "view" : formMode}
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
              <div className="min-w-[960px]">
                <div
                  className={`${LIST_COLUMNS} border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground`}
                >
                  <span>ID</span>
                  <span>Template name</span>
                  <span>Template code</span>
                  <span>Category</span>
                  <span>Version</span>
                  <span>State</span>
                  <span>Storage path</span>
                </div>
                <div className="divide-y">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex flex-col gap-3 p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4"
                    >
                      <div
                        className={`${LIST_COLUMNS} items-center px-0 text-sm`}
                      >
                        <span className="text-muted-foreground">
                          {formatFormReference(template.id)}
                        </span>
                        <span className="font-medium">
                          <Link
                            href={`/forms/${template.id}`}
                            className="hover:underline"
                          >
                            {template.form_name}
                          </Link>
                        </span>
                        <span>{template.form_code}</span>
                        <span>
                          {formatFormCategory(template.form_category)}
                        </span>
                        <span>{template.version_label ?? "—"}</span>
                        <span>{template.state_code}</span>
                        <span className="truncate">
                          {template.source_storage_path}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/forms/${template.id}/editor`}>
                            Map fields
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/forms/${template.id}`}>View</Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openTemplateForm(template, "edit")}
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
