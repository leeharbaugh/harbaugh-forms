"use client";

import { CatalogFieldPicker } from "@/components/forms/catalog-field-picker";
import { PdfPlacementFormFields } from "@/components/forms/pdf-placement-form-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Field } from "@/lib/types/field";
import {
  FIELD_DATA_TYPES,
  MAPPABLE_FIELD_WIDGET_TYPES,
  type FieldSelectionMode,
  type PdfMappingEditorInput,
  formatFieldDataType,
  formatFieldWidgetType,
} from "@/lib/types/pdf-field-mapping-editor";

type PdfMappingFormFieldsProps = {
  value: PdfMappingEditorInput;
  onChange: (value: PdfMappingEditorInput) => void;
  catalogFields: Field[];
  readOnly?: boolean;
  showLayoutFields?: boolean;
  layoutReadOnly?: boolean;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export function PdfMappingFormFields({
  value,
  onChange,
  catalogFields,
  readOnly = false,
  showLayoutFields = true,
  layoutReadOnly = false,
}: PdfMappingFormFieldsProps) {
  const setQuickCreateField = <
    K extends keyof PdfMappingEditorInput["quick_create"],
  >(
    key: K,
    fieldValue: PdfMappingEditorInput["quick_create"][K],
  ) => {
    onChange({
      ...value,
      quick_create: { ...value.quick_create, [key]: fieldValue },
    });
  };

  const handleSelectionModeChange = (mode: FieldSelectionMode) => {
    onChange({ ...value, field_selection_mode: mode });
  };

  const selectedField = catalogFields.find((field) => field.id === value.field_id);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Label>Catalog field</Label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="field_selection_mode"
              checked={value.field_selection_mode === "existing"}
              onChange={() => handleSelectionModeChange("existing")}
              disabled={readOnly}
            />
            Existing field
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="field_selection_mode"
              checked={value.field_selection_mode === "quick_create"}
              onChange={() => handleSelectionModeChange("quick_create")}
              disabled={readOnly}
            />
            Quick-create field
          </label>
        </div>
      </div>

      {value.field_selection_mode === "existing" ? (
        <div className="space-y-2">
          <CatalogFieldPicker
            id="mapping_field_id"
            fields={catalogFields}
            value={value.field_id}
            onChange={(fieldId, field) => {
              onChange({
                ...value,
                field_id: fieldId,
                field_widget_type:
                  field?.field_widget_type ?? value.field_widget_type,
              });
            }}
            disabled={readOnly}
            required
            label="Catalog field"
          />
          {selectedField && (
            <p className="text-xs text-muted-foreground">
              {formatFieldDataType(selectedField.field_data_type)} ·{" "}
              {formatFieldWidgetType(selectedField.field_widget_type)}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="quick_field_key">Field key *</Label>
            <Input
              id="quick_field_key"
              value={value.quick_create.field_key}
              onChange={(event) =>
                setQuickCreateField(
                  "field_key",
                  event.target.value.toUpperCase(),
                )
              }
              disabled={readOnly}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick_field_name">Field name</Label>
            <Input
              id="quick_field_name"
              value={value.quick_create.field_name}
              onChange={(event) =>
                setQuickCreateField("field_name", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="quick_field_label">Field label *</Label>
            <Input
              id="quick_field_label"
              value={value.quick_create.field_label}
              onChange={(event) =>
                setQuickCreateField("field_label", event.target.value)
              }
              disabled={readOnly}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick_field_data_type">Data type *</Label>
            <select
              id="quick_field_data_type"
              className={fieldClassName}
              value={value.quick_create.field_data_type}
              onChange={(event) =>
                setQuickCreateField("field_data_type", event.target.value)
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
            <Label htmlFor="quick_field_widget_type">Widget type *</Label>
            <select
              id="quick_field_widget_type"
              className={fieldClassName}
              value={value.quick_create.field_widget_type}
              onChange={(event) =>
                setQuickCreateField("field_widget_type", event.target.value)
              }
              disabled={readOnly}
            >
              {MAPPABLE_FIELD_WIDGET_TYPES.map((widgetType) => (
                <option key={widgetType} value={widgetType}>
                  {formatFieldWidgetType(widgetType)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <PdfPlacementFormFields
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        showLayoutFields={showLayoutFields}
        layoutReadOnly={layoutReadOnly}
      />
    </div>
  );
}
