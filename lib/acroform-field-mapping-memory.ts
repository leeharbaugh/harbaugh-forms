import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACROFORM_FIELD_MAPPING_MEMORY_SELECT,
  type AcroformFieldMappingMemory,
} from "@/lib/types/acroform-field-mapping-memory";

export function normalizeAcroformPdfFieldName(pdfFieldName: string): string {
  return pdfFieldName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function loadActiveAcroformFieldMappingMemory(
  supabase: SupabaseClient,
): Promise<AcroformFieldMappingMemory[]> {
  const { data, error } = await supabase
    .from("acroform_field_mapping_memory")
    .select(ACROFORM_FIELD_MAPPING_MEMORY_SELECT)
    .eq("status", "ACTIVE")
    .order("update_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data as AcroformFieldMappingMemory[]) ?? [];
}

export async function upsertAcroformFieldMappingMemory(
  supabase: SupabaseClient,
  input: {
    pdfFieldName: string;
    pdfFieldType?: string | null;
    fieldId: string;
    formCode?: string | null;
    formName?: string | null;
    confidence?: number | null;
    notes?: string | null;
  },
): Promise<void> {
  const pdfFieldName = input.pdfFieldName.trim();
  const formCode = input.formCode?.trim() || null;
  const normalized = normalizeAcroformPdfFieldName(pdfFieldName);

  let query = supabase
    .from("acroform_field_mapping_memory")
    .select("id")
    .eq("status", "ACTIVE")
    .ilike("pdf_field_name", pdfFieldName);

  if (formCode) {
    query = query.eq("form_code", formCode);
  } else {
    query = query.is("form_code", null);
  }

  const { data: existing, error: lookupError } = await query.maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  const payload = {
    pdf_field_name: pdfFieldName,
    pdf_field_type: input.pdfFieldType ?? null,
    normalized_pdf_field_name: normalized,
    field_id: input.fieldId,
    form_code: formCode,
    form_name: input.formName?.trim() || null,
    confidence: input.confidence ?? null,
    notes: input.notes ?? null,
    status: "ACTIVE" as const,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("acroform_field_mapping_memory")
      .update(payload)
      .eq("id", existing.id)
      .eq("status", "ACTIVE");

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase
    .from("acroform_field_mapping_memory")
    .insert(payload);

  if (error) {
    throw new Error(error.message);
  }
}
