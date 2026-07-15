"use client";

import { Button } from "@/components/ui/button";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FORM_CATEGORIES,
  type FormCategory,
  type FormInput,
  formatFormCategory,
  formatFormReference,
  validateFormInput,
} from "@/lib/types/form";

type FormFormProps = {
  value: FormInput;
  onChange: (value: FormInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  mode: "create" | "edit" | "view";
  templateId?: number | null;
  existingStoragePath?: string | null;
  pdfFile: File | null;
  onPdfFileChange: (file: File | null) => void;
  replacePdf: boolean;
  onReplacePdfChange: (replacePdf: boolean) => void;
  hideFooterActions?: boolean;
};

export function FormForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  mode,
  templateId = null,
  existingStoragePath = null,
  pdfFile,
  onPdfFileChange,
  replacePdf,
  onReplacePdfChange,
  hideFooterActions = false,
}: FormFormProps) {
  const readOnly = mode === "view";

  const setField = <K extends keyof FormInput>(
    key: K,
    fieldValue: FormInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;

    const validationError = validateFormInput(value, {
      mode: mode === "create" ? "create" : "edit",
      pdfFile,
      replacePdf,
      existingStoragePath,
    });

    if (validationError) return;
    onSubmit();
  };

  const validationError = readOnly
    ? null
    : validateFormInput(value, {
        mode: mode === "create" ? "create" : "edit",
        pdfFile,
        replacePdf,
        existingStoragePath,
      });

  const showPdfUpload =
    !readOnly && (mode === "create" || (mode === "edit" && replacePdf));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {templateId != null && (
          <div className="space-y-2">
            <Label htmlFor="template_reference_id">ID</Label>
            <Input
              id="template_reference_id"
              value={formatFormReference(templateId)}
              disabled
              readOnly
            />
          </div>
        )}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="form_name">Template name *</Label>
          <Input
            id="form_name"
            value={value.form_name}
            onChange={(event) => setField("form_name", event.target.value)}
            disabled={readOnly}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="form_code">Template code</Label>
          <Input
            id="form_code"
            value={value.form_code}
            onChange={(event) => setField("form_code", event.target.value)}
            disabled={readOnly}
            placeholder="Recommended for organization"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="form_category">Form category *</Label>
          <Select
            id="form_category"
            value={value.form_category}
            onChange={(event) =>
              setField("form_category", event.target.value as FormCategory)
            }
            disabled={readOnly}
            required
          >
            {FORM_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {formatFormCategory(category)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="state_code">State code *</Label>
          <Input
            id="state_code"
            value={value.state_code}
            onChange={(event) => setField("state_code", event.target.value)}
            disabled={readOnly}
            maxLength={2}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="version_label">Version label</Label>
          <Input
            id="version_label"
            value={value.version_label}
            onChange={(event) => setField("version_label", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={3}
            value={value.description}
            onChange={(event) => setField("description", event.target.value)}
            disabled={readOnly}
          />
        </div>

        {(existingStoragePath || readOnly) && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="source_storage_path">Storage path</Label>
            <Input
              id="source_storage_path"
              value={existingStoragePath ?? ""}
              disabled
              readOnly
            />
          </div>
        )}

        {mode === "edit" && !readOnly && existingStoragePath && (
          <div className="flex items-center gap-2 sm:col-span-2">
            <AppCheckbox
              id="replace_pdf"
              checked={replacePdf}
              onCheckedChange={(checked) =>
                onReplacePdfChange(checked === true)
              }
            />
            <Label htmlFor="replace_pdf" className="font-normal">
              Replace PDF file
            </Label>
          </div>
        )}

        {showPdfUpload && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pdf_file">
              PDF file{mode === "create" ? " *" : ""}
            </Label>
            <Input
              id="pdf_file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) =>
                onPdfFileChange(event.target.files?.[0] ?? null)
              }
            />
            {pdfFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {pdfFile.name}
              </p>
            )}
          </div>
        )}
      </div>

      {(error || validationError) && (
        <p className="text-sm text-destructive">{error ?? validationError}</p>
      )}

      <FormActions>
        {!hideFooterActions && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {readOnly ? "Close" : "Cancel"}
          </Button>
        )}
        {!readOnly && (
          <Button
            type="submit"
            disabled={isSubmitting || !!validationError}
          >
            {isSubmitting
              ? "Saving..."
              : mode === "create"
                ? "Add form template"
                : "Save changes"}
          </Button>
        )}
      </FormActions>
    </form>
  );
}
