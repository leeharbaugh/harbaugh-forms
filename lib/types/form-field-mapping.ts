import type { Field } from "@/lib/types/field";

/** Template-level PDF placement: links a form template to a catalog field at x/y on a page. */
export type FormFieldMapping = {
  id: string;
  form_id: number;
  field_id: string | null;
  mapping_name: string | null;
  occurrence_index: number | null;
  page_number: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  page_width: number | null;
  page_height: number | null;
  font_size: number | null;
  alignment: string | null;
  field_widget_type: string | null;
  /** Wrap text within the placement box (Fill Form + generated PDF). */
  is_multiline: boolean;
  /** Opaque white fill under typed text to cover preprinted writing lines. */
  mask_background: boolean;
  default_value_override: string | null;
  required: boolean;
  notes: string | null;
  pdf_field_name: string | null;
  pdf_field_type: string | null;
  pdf_export_value: string | null;
  create_date: string;
  update_date: string;
  status: string;
  fields: Field | null;
};

export const FORM_FIELD_MAPPING_SELECT = "*, fields(*)";

export function formatFieldMappingReference(id: string): string {
  return id.slice(0, 8);
}
