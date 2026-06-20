"use client";

import { FormPicker } from "@/components/collections/form-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COLLECTION_TYPES,
  type CollectionInput,
  type CollectionType,
  formatCollectionReference,
  formatCollectionStatus,
  formatCollectionType,
  isCollectionDeleted,
  validateCollectionInput,
} from "@/lib/types/collection";
import { cn } from "@/lib/utils";

type CollectionFormProps = {
  value: CollectionInput;
  onChange: (value: CollectionInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  mode: "create" | "edit" | "view";
  packetTemplateId?: number | null;
  status?: string;
  onDelete?: () => void;
  onRestore?: () => void;
  isDeleting?: boolean;
  isRestoring?: boolean;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export function CollectionForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  mode,
  packetTemplateId = null,
  status = "ACTIVE",
  onDelete,
  onRestore,
  isDeleting = false,
  isRestoring = false,
}: CollectionFormProps) {
  const readOnly = mode === "view";
  const isDeleted = isCollectionDeleted({ status });

  const setField = <K extends keyof CollectionInput>(
    key: K,
    fieldValue: CollectionInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;

    const validationError = validateCollectionInput(value);
    if (validationError) return;
    onSubmit();
  };

  const validationError = readOnly
    ? null
    : validateCollectionInput(value);

  const formsValidationError =
    validationError &&
    (validationError.includes("form template") ||
      validationError.includes("form templates"))
      ? validationError
      : null;

  const generalValidationError =
    validationError && !formsValidationError ? validationError : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {packetTemplateId != null && (
          <div className="space-y-2">
            <Label htmlFor="packet_template_reference_id">ID</Label>
            <Input
              id="packet_template_reference_id"
              value={formatCollectionReference(packetTemplateId)}
              disabled
              readOnly
            />
          </div>
        )}

        {readOnly && isDeleted && (
          <div className="space-y-2">
            <Label>Status</Label>
            <div>
              <Badge variant="destructive">
                {formatCollectionStatus(status)}
              </Badge>
            </div>
          </div>
        )}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="collection_name">Packet name *</Label>
          <Input
            id="collection_name"
            value={value.collection_name}
            onChange={(event) => setField("collection_name", event.target.value)}
            disabled={readOnly}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="collection_type">Collection type *</Label>
          <select
            id="collection_type"
            className={fieldClassName}
            value={value.collection_type}
            onChange={(event) =>
              setField("collection_type", event.target.value as CollectionType)
            }
            disabled={readOnly}
            required
          >
            {COLLECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatCollectionType(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            rows={3}
            className={cn(fieldClassName, "min-h-24 py-2")}
            value={value.description}
            onChange={(event) => setField("description", event.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      <FormPicker
        selectedForms={value.forms}
        onChange={(forms) => setField("forms", forms)}
        disabled={readOnly}
        error={formsValidationError}
      />

      {(error || generalValidationError) && (
        <p className="text-sm text-destructive">
          {error ?? generalValidationError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!readOnly && (
          <Button
            type="submit"
            disabled={isSubmitting || !!validationError}
          >
            {isSubmitting
              ? "Saving..."
              : mode === "create"
                ? "Add packet template"
                : "Save changes"}
          </Button>
        )}
        {readOnly && !isDeleted && onDelete && (
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={isDeleting || isRestoring}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        )}
        {readOnly && isDeleted && onRestore && (
          <Button
            type="button"
            onClick={onRestore}
            disabled={isDeleting || isRestoring}
          >
            {isRestoring ? "Restoring..." : "Restore"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting || isDeleting || isRestoring}
        >
          {readOnly ? "Close" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}
