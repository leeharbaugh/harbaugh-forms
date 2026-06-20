import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type Field,
  type FieldInput,
  normalizeFieldInput,
} from "@/lib/types/field";

export async function findActiveFieldByKey(
  supabase: SupabaseClient,
  fieldKey: string,
): Promise<Field | null> {
  const { data, error } = await supabase
    .from("fields")
    .select("*")
    .eq("field_key", fieldKey.trim().toUpperCase())
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as Field | null) ?? null;
}

export async function createActiveField(
  supabase: SupabaseClient,
  input: FieldInput,
): Promise<Field> {
  const normalized = normalizeFieldInput(input);

  const { data, error } = await supabase
    .from("fields")
    .insert(normalized as Record<string, unknown>)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Field;
}

export async function upsertActiveField(
  supabase: SupabaseClient,
  input: FieldInput,
): Promise<Field> {
  const normalized = normalizeFieldInput(input);
  const existing = await findActiveFieldByKey(supabase, normalized.field_key);

  if (existing) {
    const { data, error } = await supabase
      .from("fields")
      .update(normalized as Record<string, unknown>)
      .eq("id", existing.id)
      .eq("status", "ACTIVE")
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data as Field;
  }

  const { data, error } = await supabase
    .from("fields")
    .insert(normalized as Record<string, unknown>)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Field;
}
