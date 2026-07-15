"use client";

import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldSourceFormFields } from "@/components/forms/field-source-form-fields";
import {
  FIELD_DATA_TYPES,
  FIELD_WIDGET_TYPES,
  type FieldAdminInput,
  type FieldWidgetType,
  formatFieldDataType,
  formatFieldWidgetType,
  isBooleanField,
} from "@/lib/types/field";
import { useMemo } from "react";

type FieldMergeCanonicalFormFieldsProps = {
  value: FieldAdminInput;
  onChange: (value: FieldAdminInput) => void;
};

export function FieldMergeCanonicalFormFields({
  value,
  onChange,
}: FieldMergeCanonicalFormFieldsProps) {
  const setField = <K extends keyof FieldAdminInput>(
    key: K,
    fieldValue: FieldAdminInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

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

  const showDefaultChecked = isBooleanField(value);

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
        Updating the canonical field affects this reusable field everywhere it
        is used across forms and packets.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="merge_field_key">Field key *</Label>
          <Input
            id="merge_field_key"
            value={value.field_key}
            onChange={(event) =>
              setField("field_key", event.target.value.toUpperCase())
            }
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="merge_field_name">Field name</Label>
          <Input
            id="merge_field_name"
            value={value.field_name}
            onChange={(event) => setField("field_name", event.target.value)}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="merge_field_label">Field label *</Label>
          <Input
            id="merge_field_label"
            value={value.field_label}
            onChange={(event) => setField("field_label", event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="merge_field_data_type">Data type *</Label>
          <Select
            id="merge_field_data_type"
            value={value.field_data_type}
            onChange={(event) =>
              setField("field_data_type", event.target.value)
            }
          >
            {FIELD_DATA_TYPES.map((dataType) => (
              <option key={dataType} value={dataType}>
                {formatFieldDataType(dataType)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="merge_field_widget_type">Widget type *</Label>
          <Select
            id="merge_field_widget_type"
            value={value.field_widget_type}
            onChange={(event) =>
              setField("field_widget_type", event.target.value)
            }
          >
            {widgetTypeOptions.map((widgetType) => (
              <option key={widgetType} value={widgetType}>
                {formatFieldWidgetType(widgetType)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="merge_default_value">Default value</Label>
          <Input
            id="merge_default_value"
            value={value.default_value}
            onChange={(event) => setField("default_value", event.target.value)}
          />
        </div>

        {showDefaultChecked && (
          <div className="flex items-center gap-2 sm:col-span-2">
            <AppCheckbox
              id="merge_default_checked"
              checked={value.default_checked}
              onCheckedChange={(checked) =>
                setField("default_checked", checked === true)
              }
            />
            <Label htmlFor="merge_default_checked" className="font-normal">
              Default checked
            </Label>
          </div>
        )}

        <div className="flex items-center gap-2 sm:col-span-2">
          <AppCheckbox
            id="merge_required"
            checked={value.required}
            onCheckedChange={(checked) =>
              setField("required", checked === true)
            }
          />
          <Label htmlFor="merge_required" className="font-normal">
            Required field
          </Label>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="merge_notes">Notes</Label>
          <Textarea
            id="merge_notes"
            rows={3}
            value={value.notes}
            onChange={(event) => setField("notes", event.target.value)}
          />
        </div>
      </div>

      <FieldSourceFormFields value={value} onChange={onChange} readOnly={false} />
    </div>
  );
}
