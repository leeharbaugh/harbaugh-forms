"use client";

import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSourceFormFields } from "@/components/forms/field-source-form-fields";
import {
  FIELD_DATA_TYPES,
  FIELD_WIDGET_TYPES,
  type FieldInput,
  formatFieldDataType,
  formatFieldWidgetType,
  isBooleanField,
} from "@/lib/types/field";

type PdfFieldDefinitionFormFieldsProps = {
  value: FieldInput;
  onChange: (value: FieldInput) => void;
  readOnly?: boolean;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export function PdfFieldDefinitionFormFields({
  value,
  onChange,
  readOnly = false,
}: PdfFieldDefinitionFormFieldsProps) {
  const setField = <K extends keyof FieldInput>(
    key: K,
    fieldValue: FieldInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const showDefaultChecked = isBooleanField(value);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Changes in this section affect this reusable field everywhere it is used.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit_field_key">Field key *</Label>
          <Input
            id="edit_field_key"
            value={value.field_key}
            onChange={(event) =>
              setField("field_key", event.target.value.toUpperCase())
            }
            disabled={readOnly}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit_field_label">Field label *</Label>
          <Input
            id="edit_field_label"
            value={value.field_label}
            onChange={(event) => setField("field_label", event.target.value)}
            disabled={readOnly}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit_field_data_type">Data type *</Label>
          <select
            id="edit_field_data_type"
            className={fieldClassName}
            value={value.field_data_type}
            onChange={(event) =>
              setField("field_data_type", event.target.value)
            }
            disabled={readOnly}
          >
            {FIELD_DATA_TYPES.map((dataType) => (
              <option key={dataType} value={dataType}>
                {formatFieldDataType(dataType)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit_field_widget_type">Widget type *</Label>
          <select
            id="edit_field_widget_type"
            className={fieldClassName}
            value={value.field_widget_type}
            onChange={(event) =>
              setField("field_widget_type", event.target.value)
            }
            disabled={readOnly}
          >
            {FIELD_WIDGET_TYPES.map((widgetType) => (
              <option key={widgetType} value={widgetType}>
                {formatFieldWidgetType(widgetType)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit_default_value">Default value</Label>
          <Input
            id="edit_default_value"
            value={value.default_value}
            onChange={(event) => setField("default_value", event.target.value)}
            disabled={readOnly}
          />
        </div>

        {showDefaultChecked && (
          <div className="flex items-center gap-2 sm:col-span-2">
            <AppCheckbox
              id="edit_default_checked"
              checked={value.default_checked}
              onCheckedChange={(checked) =>
                setField("default_checked", checked === true)
              }
              disabled={readOnly}
            />
            <Label htmlFor="edit_default_checked" className="font-normal">
              Default checked
            </Label>
          </div>
        )}
      </div>

      <FieldSourceFormFields
        value={{ ...value, status: "ACTIVE" }}
        onChange={(nextValue) => {
          const { status: _status, ...fieldInput } = nextValue;
          onChange(fieldInput);
        }}
        readOnly={readOnly}
      />
    </div>
  );
}
