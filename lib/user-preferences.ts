import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOnlyMyDataFromPreferences,
  getTableColumnWidthsFromPreferences,
  type TableColumnWidths,
  type UserPreferencesDocument,
  type UserPreferencesRow,
  withOnlyMyDataPreference,
  withTableColumnWidths,
} from "@/lib/types/user-preferences";

export type CurrentUserDataVisibility = {
  userId: string;
  onlyMyData: boolean;
};

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

export async function loadCurrentUserDataVisibility(
  supabase: SupabaseClient,
): Promise<CurrentUserDataVisibility | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    userId: user.id,
    onlyMyData: getOnlyMyDataFromPreferences(
      (data?.preferences as UserPreferencesDocument | null | undefined) ?? null,
    ),
  };
}

export async function saveCurrentUserOnlyMyDataPreference(
  supabase: SupabaseClient,
  onlyMyData: boolean,
): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in to save this preference.");
  }

  const { data: existingRow, error: fetchError } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const existingPreferences =
    existingRow?.preferences && typeof existingRow.preferences === "object"
      ? (existingRow.preferences as UserPreferencesDocument)
      : {};

  const { error: upsertError } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      preferences: withOnlyMyDataPreference(existingPreferences, onlyMyData),
      status: "ACTIVE",
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    throw new Error(upsertError.message);
  }
}
