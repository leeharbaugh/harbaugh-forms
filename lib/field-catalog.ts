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
  const normalizedKey = fieldKey.trim().toUpperCase();

  const { data: globalField, error: globalError } = await supabase
    .from("fields")
    .select("*")
    .eq("field_key", normalizedKey)
    .eq("status", "ACTIVE")
    .eq("scope", "GLOBAL")
    .maybeSingle();

  if (globalError) {
    throw globalError;
  }

  if (globalField) {
    return globalField as Field;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: privateField, error: privateError } = await supabase
    .from("fields")
    .select("*")
    .eq("field_key", normalizedKey)
    .eq("status", "ACTIVE")
    .eq("scope", "PRIVATE")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (privateError) {
    throw privateError;
  }

  return (privateField as Field | null) ?? null;
}

export async function createActiveField(
  supabase: SupabaseClient,
  input: FieldInput,
): Promise<Field> {
  const normalized = normalizeFieldInput(input);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("fields")
    .insert({
      ...(normalized as Record<string, unknown>),
      scope: "PRIVATE",
      owner_user_id: user?.id ?? null,
    })
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("fields")
    .insert({
      ...(normalized as Record<string, unknown>),
      scope: "PRIVATE",
      owner_user_id: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Field;
}
