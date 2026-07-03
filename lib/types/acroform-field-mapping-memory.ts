import type { Field } from "@/lib/types/field";

export type AcroformFieldMappingMemory = {
  id: string;
  create_date: string;
  update_date: string;
  status: string;
  pdf_field_name: string;
  pdf_field_type: string | null;
  normalized_pdf_field_name: string | null;
  field_id: string;
  form_code: string | null;
  form_name: string | null;
  confidence: number | null;
  notes: string | null;
  fields?: Field | null;
};

export const ACROFORM_FIELD_MAPPING_MEMORY_SELECT =
  "*, fields:field_id(*)";
