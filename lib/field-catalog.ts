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
  const normalizedKey = fieldKey.trim();
  if (!normalizedKey) {
    return null;
  }

  const { data: globalExact, error: globalExactError } = await supabase
    .from("fields")
    .select("*")
    .eq("field_key", normalizedKey)
    .eq("status", "ACTIVE")
    .eq("scope", "GLOBAL")
    .maybeSingle();

  if (globalExactError) {
    throw globalExactError;
  }

  if (globalExact) {
    return globalExact as Field;
  }

  // Case-insensitive fallback for mixed historical key conventions.
  const { data: globalCi, error: globalCiError } = await supabase
    .from("fields")
    .select("*")
    .ilike("field_key", normalizedKey)
    .eq("status", "ACTIVE")
    .eq("scope", "GLOBAL")
    .limit(2);

  if (globalCiError) {
    throw globalCiError;
  }

  if ((globalCi ?? []).length === 1) {
    return globalCi![0] as Field;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: privateExact, error: privateExactError } = await supabase
    .from("fields")
    .select("*")
    .eq("field_key", normalizedKey)
    .eq("status", "ACTIVE")
    .eq("scope", "PRIVATE")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (privateExactError) {
    throw privateExactError;
  }

  if (privateExact) {
    return privateExact as Field;
  }

  const { data: privateCi, error: privateCiError } = await supabase
    .from("fields")
    .select("*")
    .ilike("field_key", normalizedKey)
    .eq("status", "ACTIVE")
    .eq("scope", "PRIVATE")
    .eq("owner_user_id", user.id)
    .limit(2);

  if (privateCiError) {
    throw privateCiError;
  }

  if ((privateCi ?? []).length === 1) {
    return privateCi![0] as Field;
  }

  return null;
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
