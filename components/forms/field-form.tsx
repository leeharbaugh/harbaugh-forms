"use client";

import { Button } from "@/components/ui/button";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FIELD_DATA_TYPES,
  FIELD_STATUSES,
  FIELD_WIDGET_TYPES,
  type Field,
  type FieldAdminInput,
  type FieldStatus,
  type FieldWidgetType,
  findSimilarCatalogFields,
  formatFieldReference,
  formatFieldDataType,
  formatFieldStatus,
  formatFieldWidgetType,
  isBooleanField,
  SIMILAR_FIELD_WARNING,
  validateFieldAdminInput,
} from "@/lib/types/field";
import { FieldSourceFormFields } from "@/components/forms/field-source-form-fields";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

type FieldFormProps = {
  value: FieldAdminInput;
  onChange: (value: FieldAdminInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  mode: "create" | "edit" | "view";
  fieldId?: string | null;
  existingFields?: Pick<
    Field,
    "id" | "field_key" | "field_label" | "field_name" | "status"
  >[];
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export function FieldForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  mode,
  fieldId = null,
  existingFields = [],
}: FieldFormProps) {
  const readOnly = mode === "view";

  const widgetTypeOptions = useMemo(() => {
    const options = new Set<FieldWidgetType>(FIELD_WIDGET_TYPES);
    const currentWidgetType = value.field_widget_type.trim().toLowerCase();

    if (
      currentWidgetType &&
      !options.has(currentWidgetType as FieldWidgetType)
    ) {
      options.add(currentWidgetType as FieldWidgetType);
    }

    return [...options];
  }, [value.field_widget_type]);

  const similarFields = useMemo(() => {
    if (mode !== "create") {
      return [];
    }

    return findSimilarCatalogFields(value, existingFields);
  }, [existingFields, mode, value.field_key, value.field_label]);

  const setField = <K extends keyof FieldAdminInput>(
    key: K,
    fieldValue: FieldAdminInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    if (validateFieldAdminInput(value)) return;
    onSubmit();
  };

  const validationError = readOnly ? null : validateFieldAdminInput(value);
  const showDefaultChecked = isBooleanField(value);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Fields represent reusable business concepts and may be used on multiple
        forms. Prefer generic field keys (for example{" "}
        <code className="text-xs">broker_signs_in_lieu_checkbox</code>) over
        form-specific names (for example{" "}
        <code className="text-xs">listing_broker_signature_checkbox</code>).
        Template PDF placement is managed in each form&apos;s PDF Field Editor.
      </p>

      {mode === "create" && similarFields.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p>{SIMILAR_FIELD_WARNING}</p>
          <ul className="mt-2 space-y-1 text-xs">
            {similarFields.slice(0, 5).map((field) => (
              <li key={field.id} className="font-mono">
                {field.field_key}
                {field.field_label?.trim() || field.field_name?.trim()
                  ? ` · ${field.field_label?.trim() || field.field_name?.trim()}`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {fieldId != null && (
          <div className="space-y-2">
            <Label htmlFor="field_reference_id">ID</Label>
            <Input
              id="field_reference_id"
              value={formatFieldReference(fieldId)}
              disabled
              readOnly
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="field_key">Field key *</Label>
          <Input
            id="field_key"
            value={value.field_key}
            onChange={(event) =>
              setField("field_key", event.target.value.toUpperCase())
            }
            disabled={readOnly}
            required
            placeholder="CLIENT_NAME"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="field_name">Field name</Label>
          <Input
            id="field_name"
            value={value.field_name}
            onChange={(event) => setField("field_name", event.target.value)}
            disabled={readOnly}
            placeholder="Defaults to field key"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="field_label">Field label *</Label>
          <Input
            id="field_label"
            value={value.field_label}
            onChange={(event) => setField("field_label", event.target.value)}
            disabled={readOnly}
            required
            placeholder="Contact name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="field_data_type">Data type *</Label>
          <select
            id="field_data_type"
            className={fieldClassName}
            value={value.field_data_type}
            onChange={(event) =>
              setField("field_data_type", event.target.value)
            }
            disabled={readOnly}
            required
          >
            {FIELD_DATA_TYPES.map((dataType) => (
              <option key={dataType} value={dataType}>
                {formatFieldDataType(dataType)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="field_widget_type">Widget type *</Label>
          <select
            id="field_widget_type"
            className={fieldClassName}
            value={value.field_widget_type}
            onChange={(event) =>
              setField("field_widget_type", event.target.value)
            }
            disabled={readOnly}
            required
          >
            {widgetTypeOptions.map((widgetType) => (
              <option key={widgetType} value={widgetType}>
                {formatFieldWidgetType(widgetType)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="default_value">Default value</Label>
          <Input
            id="default_value"
            value={value.default_value}
            onChange={(event) => setField("default_value", event.target.value)}
            disabled={readOnly}
          />
        </div>

        {showDefaultChecked && (
          <div className="flex items-center gap-2 sm:col-span-2">
            <AppCheckbox
              id="default_checked"
              checked={value.default_checked}
              onCheckedChange={(checked) =>
                setField("default_checked", checked === true)
              }
              disabled={readOnly}
            />
            <Label htmlFor="default_checked" className="font-normal">
              Default checked
            </Label>
          </div>
        )}

        {mode !== "create" && (
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className={fieldClassName}
              value={value.status}
              onChange={(event) =>
                setField("status", event.target.value as FieldStatus)
              }
              disabled={readOnly}
            >
              {FIELD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatFieldStatus(status)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 sm:col-span-2">
          <AppCheckbox
            id="required"
            checked={value.required}
            onCheckedChange={(checked) =>
              setField("required", checked === true)
            }
            disabled={readOnly}
          />
          <Label htmlFor="required" className="font-normal">
            Required field
          </Label>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            rows={3}
            className={cn(fieldClassName, "min-h-24 py-2")}
            value={value.notes}
            onChange={(event) => setField("notes", event.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      <FieldSourceFormFields
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        showValueMappingGuidance={false}
      />

      {(error || validationError) && (
        <p className="text-sm text-destructive">{error ?? validationError}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!readOnly && (
          <Button type="submit" disabled={isSubmitting || !!validationError}>
            {isSubmitting
              ? "Saving..."
              : mode === "create"
                ? "Add field"
                : "Save changes"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {readOnly ? "Close" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}
