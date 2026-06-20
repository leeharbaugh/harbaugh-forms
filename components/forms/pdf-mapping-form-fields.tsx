"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Field } from "@/lib/types/field";
import {
  FIELD_DATA_TYPES,
  FIELD_WIDGET_TYPES,
  MAPPING_ALIGNMENT_OPTIONS,
  type FieldSelectionMode,
  type PdfMappingEditorInput,
  applyWidgetTypeDefaults,
  fieldOptionLabel,
  formatFieldDataType,
  formatFieldWidgetType,
} from "@/lib/types/pdf-field-mapping-editor";
import { cn } from "@/lib/utils";

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
  const setField = <K extends keyof PdfMappingEditorInput>(
    key: K,
    fieldValue: PdfMappingEditorInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

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

  const handleWidgetTypeChange = (widgetType: string) => {
    onChange(applyWidgetTypeDefaults(value, widgetType));
  };

  const selectedField = catalogFields.find((field) => field.id === value.field_id);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-3 sm:col-span-2">
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
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mapping_field_id">Catalog field *</Label>
          <select
            id="mapping_field_id"
            className={fieldClassName}
            value={value.field_id}
            onChange={(event) => {
              const fieldId = event.target.value;
              const field = catalogFields.find((item) => item.id === fieldId);
              onChange({
                ...value,
                field_id: fieldId,
                field_widget_type:
                  field?.field_widget_type ?? value.field_widget_type,
              });
            }}
            disabled={readOnly}
            required
          >
            <option value="">Select a field...</option>
            {catalogFields.map((field) => (
              <option key={field.id} value={field.id}>
                {fieldOptionLabel(field)}
              </option>
            ))}
          </select>
          {selectedField && (
            <p className="text-xs text-muted-foreground">
              {formatFieldDataType(selectedField.field_data_type)} ·{" "}
              {formatFieldWidgetType(selectedField.field_widget_type)}
            </p>
          )}
        </div>
      ) : (
        <>
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
              {FIELD_WIDGET_TYPES.map((widgetType) => (
                <option key={widgetType} value={widgetType}>
                  {formatFieldWidgetType(widgetType)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="mapping_name">Placement label</Label>
        <Input
          id="mapping_name"
          value={value.mapping_name}
          onChange={(event) => setField("mapping_name", event.target.value)}
          disabled={readOnly}
          placeholder="Optional placement label"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="occurrence_index">Occurrence index</Label>
        <Input
          id="occurrence_index"
          type="number"
          min={0}
          value={value.occurrence_index}
          onChange={(event) => setField("occurrence_index", event.target.value)}
          disabled={readOnly}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mapping_widget_type">Placement widget type *</Label>
        <select
          id="mapping_widget_type"
          className={fieldClassName}
          value={value.field_widget_type}
          onChange={(event) => handleWidgetTypeChange(event.target.value)}
          disabled={readOnly}
        >
          {FIELD_WIDGET_TYPES.map((widgetType) => (
            <option key={widgetType} value={widgetType}>
              {formatFieldWidgetType(widgetType)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="default_value_override">Default value override</Label>
        <Input
          id="default_value_override"
          value={value.default_value_override}
          onChange={(event) =>
            setField("default_value_override", event.target.value)
          }
          disabled={readOnly}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mapping_alignment">Alignment</Label>
        <select
          id="mapping_alignment"
          className={fieldClassName}
          value={value.alignment}
          onChange={(event) => setField("alignment", event.target.value)}
          disabled={readOnly}
        >
          {MAPPING_ALIGNMENT_OPTIONS.map((alignment) => (
            <option key={alignment} value={alignment}>
              {alignment.charAt(0).toUpperCase() + alignment.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {showLayoutFields && (
        <>
          <div className="space-y-2">
            <Label htmlFor="mapping_page_number">Page number *</Label>
            <Input
              id="mapping_page_number"
              type="number"
              min={1}
              value={value.page_number}
              onChange={(event) => setField("page_number", event.target.value)}
              disabled={readOnly || layoutReadOnly}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mapping_x">X *</Label>
            <Input
              id="mapping_x"
              value={value.x}
              onChange={(event) => setField("x", event.target.value)}
              disabled={readOnly || layoutReadOnly}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mapping_y">Y *</Label>
            <Input
              id="mapping_y"
              value={value.y}
              onChange={(event) => setField("y", event.target.value)}
              disabled={readOnly || layoutReadOnly}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mapping_width">Width *</Label>
            <Input
              id="mapping_width"
              value={value.width}
              onChange={(event) => setField("width", event.target.value)}
              disabled={readOnly || layoutReadOnly}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mapping_height">Height *</Label>
            <Input
              id="mapping_height"
              value={value.height}
              onChange={(event) => setField("height", event.target.value)}
              disabled={readOnly || layoutReadOnly}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mapping_font_size">Font size *</Label>
            <Input
              id="mapping_font_size"
              value={value.font_size}
              onChange={(event) => setField("font_size", event.target.value)}
              disabled={readOnly || layoutReadOnly}
              required
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          id="mapping_required"
          checked={value.required}
          onCheckedChange={(checked) => setField("required", checked === true)}
          disabled={readOnly}
        />
        <Label htmlFor="mapping_required" className="font-normal">
          Required on this form
        </Label>
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="mapping_notes">Notes</Label>
        <textarea
          id="mapping_notes"
          rows={3}
          className={cn(fieldClassName, "min-h-24 py-2")}
          value={value.notes}
          onChange={(event) => setField("notes", event.target.value)}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
