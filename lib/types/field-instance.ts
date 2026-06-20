import type { Field } from "@/lib/types/field";

export type FieldInstanceValueSource =
  | "existing"
  | "manual_override"
  | "contact_role"
  | "property"
  | "packet"
  | "settings"
  | "mapping_override"
  | "fallback"
  | "field_default"
  | "field_default_checked"
  | "empty";

export type FieldInstance = {
  id: string;
  packet_id: number;
  packet_form_id: number;
  field_id: string;
  value: string | null;
  value_json: Record<string, unknown> | null;
  source: string | null;
  is_override: boolean;
  notes: string | null;
  create_date: string;
  update_date: string;
  status: string;
  fields?: Field | null;
};

export type FieldInstanceWithField = FieldInstance & {
  fields: Field | null;
};

export type FieldInstanceMapping = {
  id: string;
  field_instance_id: string | null;
  packet_id: number;
  packet_form_id: number;
  field_id: string;
  form_field_mapping_id: string | null;
  page_number: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  page_width: number | null;
  page_height: number | null;
  font_size: number | null;
  alignment: string | null;
  notes: string | null;
  create_date: string;
  update_date: string;
  status: string;
};

export type FieldInstanceInput = {
  value: string;
  source: string;
  is_override: boolean;
  notes: string;
};

export const emptyFieldInstanceInput = (): FieldInstanceInput => ({
  value: "",
  source: "",
  is_override: false,
  notes: "",
});

export function normalizeFieldInstanceInput(input: FieldInstanceInput) {
  const trim = (value: string) => value.trim();

  return {
    value: trim(input.value) || null,
    source: trim(input.source) || null,
    is_override: input.is_override,
    notes: trim(input.notes) || null,
  };
}
