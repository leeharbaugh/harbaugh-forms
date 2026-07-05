import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getTableColumnWidthsFromPreferences,
  type TableColumnWidths,
  type UserPreferencesDocument,
  type UserPreferencesRow,
  withTableColumnWidths,
} from "@/lib/types/user-preferences";

export async function loadActiveUserPreferences(
  supabase: SupabaseClient,
): Promise<UserPreferencesRow | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_preferences")
    .select("user_id, create_date, update_date, status, preferences")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserPreferencesRow | null) ?? null;
}

export async function loadTableColumnWidthsForUser(
  supabase: SupabaseClient,
  tableKey: string,
): Promise<TableColumnWidths | null> {
  const row = await loadActiveUserPreferences(supabase);
  return getTableColumnWidthsFromPreferences(row?.preferences, tableKey);
}

export async function saveTableColumnWidthsForUser(
  supabase: SupabaseClient,
  tableKey: string,
  widths: TableColumnWidths,
): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return;
  }

  let existingPreferences: UserPreferencesDocument = {};

  const { data: existingRow, error: fetchError } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existingRow?.preferences && typeof existingRow.preferences === "object") {
    existingPreferences = existingRow.preferences as UserPreferencesDocument;
  }

  const nextPreferences = withTableColumnWidths(
    existingPreferences,
    tableKey,
    widths,
  );

  const { error: upsertError } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      preferences: nextPreferences,
      status: "ACTIVE",
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    throw new Error(upsertError.message);
  }
}
