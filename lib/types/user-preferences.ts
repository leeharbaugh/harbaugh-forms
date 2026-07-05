export type UserPreferenceStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type TableColumnWidths = Record<string, number>;

export type UserPreferencesDocument = {
  table_column_widths?: Record<string, TableColumnWidths>;
};

export type UserPreferencesRow = {
  user_id: string;
  create_date: string;
  update_date: string;
  status: UserPreferenceStatus;
  preferences: UserPreferencesDocument;
};

export function getTableColumnWidthsFromPreferences(
  preferences: UserPreferencesDocument | null | undefined,
  tableKey: string,
): TableColumnWidths | null {
  const widths = preferences?.table_column_widths?.[tableKey];
  if (!widths || typeof widths !== "object") {
    return null;
  }

  const normalized: TableColumnWidths = {};
  for (const [columnId, width] of Object.entries(widths)) {
    if (typeof width === "number" && Number.isFinite(width)) {
      normalized[columnId] = width;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function mergeColumnWidthsWithDefaults(
  columns: Array<{ id: string; defaultWidth: number }>,
  savedWidths: TableColumnWidths | null | undefined,
): Record<string, number> {
  const defaults = Object.fromEntries(
    columns.map((column) => [column.id, column.defaultWidth]),
  );

  if (!savedWidths) {
    return defaults;
  }

  const validIds = new Set(columns.map((column) => column.id));
  const merged = { ...defaults };

  for (const [id, width] of Object.entries(savedWidths)) {
    if (validIds.has(id) && typeof width === "number" && Number.isFinite(width)) {
      merged[id] = width;
    }
  }

  return merged;
}

export function withTableColumnWidths(
  preferences: UserPreferencesDocument,
  tableKey: string,
  widths: TableColumnWidths,
): UserPreferencesDocument {
  return {
    ...preferences,
    table_column_widths: {
      ...(preferences.table_column_widths ?? {}),
      [tableKey]: widths,
    },
  };
}
