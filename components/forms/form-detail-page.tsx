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
import { uploadFormPdf } from "@/lib/form-storage";
import { loadActiveFormFieldMappingsForForm } from "@/lib/field-instances";
import { createClient } from "@/lib/supabase/client";
import {
  type Form,
  emptyFormInput,
  formatFormReference,
  formToInput,
  normalizeFormInput,
  validateFormInput,
} from "@/lib/types/form";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type FormDetailPageProps = {
  formId: number;
};

type PageMode = "view" | "edit";

export function FormDetailPage({ formId }: FormDetailPageProps) {
  const [template, setTemplate] = useState<Form | null>(null);
  const [mappingCount, setMappingCount] = useState(0);
  const [mode, setMode] = useState<PageMode>("view");
  const [formValue, setFormValue] = useState(emptyFormInput());
  const [existingStoragePath, setExistingStoragePath] = useState<string | null>(
    null,
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [replacePdf, setReplacePdf] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const supabase = createClient();

    const { data, error } = await supabase
      .from("forms")
      .select("*")
      .eq("id", formId)
      .eq("status", "ACTIVE")
      .single();

    if (error || !data) {
      setLoadError(error?.message ?? "Form template not found.");
      setTemplate(null);
      setMappingCount(0);
      setIsLoading(false);
      return;
    }

    const nextTemplate = data as Form;
    setTemplate(nextTemplate);
    setFormValue(formToInput(nextTemplate));
    setExistingStoragePath(nextTemplate.source_storage_path);

    try {
      const mappings = await loadActiveFormFieldMappingsForForm(
        supabase,
        formId,
      );
      setMappingCount(mappings.length);
    } catch (mappingError) {
      setLoadError(
        mappingError instanceof Error
          ? mappingError.message
          : "Failed to load template placements.",
      );
      setMappingCount(0);
    }

    setIsLoading(false);
  }, [formId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetEditState = () => {
    if (!template) return;
    setFormValue(formToInput(template));
    setExistingStoragePath(template.source_storage_path);
    setPdfFile(null);
    setReplacePdf(false);
    setFormError(null);
  };

  const openEditMode = () => {
    resetEditState();
    setMode("edit");
  };

  const closeEditMode = () => {
    resetEditState();
    setMode("view");
  };

  const resolveStoragePath = async (
    normalized: ReturnType<typeof normalizeFormInput>,
  ) => {
    const supabase = createClient();
    const folderKey = normalized.form_code || String(formId);

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
      mode: "edit",
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
      const sourceStoragePath = await resolveStoragePath(normalized);

      const { error } = await supabase
        .from("forms")
        .update({
          ...normalized,
          source_storage_path: sourceStoragePath,
        })
        .eq("id", formId)
        .eq("status", "ACTIVE");

      if (error) {
        setFormError(error.message);
        setIsSubmitting(false);
        return;
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
    setMode("view");
    await loadData();
  };

  if (!Number.isFinite(formId)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Invalid form ID.</p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to forms</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading form template...</p>
    );
  }

  if (loadError || !template) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          {loadError ?? "Form template not found."}
        </p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to forms</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {template.form_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Form template {formatFormReference(template.id)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/forms/${formId}/editor`}>
              Open PDF Field Mapping Editor
            </Link>
          </Button>
          {mode === "view" ? (
            <Button variant="outline" onClick={openEditMode}>
              Edit template
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href="/forms">Back to forms</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template field mappings</CardTitle>
          <CardDescription>
            Default placement of reusable fields on this blank PDF template.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {mappingCount} active placement{mappingCount === 1 ? "" : "s"} on
            this form.
          </p>
          <Button variant="secondary" asChild>
            <Link href={`/forms/${formId}/editor`}>Map fields on PDF</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "edit" ? "Edit form template" : "Template details"}
          </CardTitle>
          <CardDescription>
            {mode === "edit"
              ? "Update template details or replace the stored PDF."
              : "Read-only view of the form template metadata."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormForm
            value={formValue}
            onChange={setFormValue}
            onSubmit={() => void handleSave()}
            onCancel={mode === "edit" ? closeEditMode : () => {}}
            isSubmitting={isSubmitting}
            error={formError}
            mode={mode}
            templateId={formId}
            existingStoragePath={existingStoragePath}
            pdfFile={pdfFile}
            onPdfFileChange={setPdfFile}
            replacePdf={replacePdf}
            onReplacePdfChange={setReplacePdf}
            hideFooterActions={mode === "view"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
