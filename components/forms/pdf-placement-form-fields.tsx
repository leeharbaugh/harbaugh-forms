"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAPPABLE_FIELD_WIDGET_TYPES,
  MAPPING_ALIGNMENT_OPTIONS,
  type PdfMappingEditorInput,
  applyWidgetTypeDefaults,
  formatFieldWidgetType,
} from "@/lib/types/pdf-field-mapping-editor";
import { cn } from "@/lib/utils";

type PdfPlacementFormFieldsProps = {
  value: PdfMappingEditorInput;
  onChange: (value: PdfMappingEditorInput) => void;
  readOnly?: boolean;
  showLayoutFields?: boolean;
  layoutReadOnly?: boolean;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export function PdfPlacementFormFields({
  value,
  onChange,
  readOnly = false,
  showLayoutFields = true,
  layoutReadOnly = false,
}: PdfPlacementFormFieldsProps) {
  const setField = <K extends keyof PdfMappingEditorInput>(
    key: K,
    fieldValue: PdfMappingEditorInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleWidgetTypeChange = (widgetType: string) => {
    onChange(applyWidgetTypeDefaults(value, widgetType));
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
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
          {MAPPABLE_FIELD_WIDGET_TYPES.map((widgetType) => (
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
