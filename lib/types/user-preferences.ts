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

/** Shared floor/ceiling when a column omits minWidth/maxWidth. */
export const DEFAULT_TABLE_COLUMN_MIN_WIDTH = 56;
export const DEFAULT_TABLE_COLUMN_MAX_WIDTH = 640;

export type ColumnWidthConstraint = {
  id: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
};

export function clampColumnWidth(
  width: number,
  column: ColumnWidthConstraint,
  defaultMinWidth = DEFAULT_TABLE_COLUMN_MIN_WIDTH,
  defaultMaxWidth = DEFAULT_TABLE_COLUMN_MAX_WIDTH,
): number {
  const minWidth = column.minWidth ?? defaultMinWidth;
  const maxWidth = column.maxWidth ?? defaultMaxWidth;
  return Math.min(maxWidth, Math.max(minWidth, width));
}

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

/**
 * Merge saved widths onto column defaults and clamp to each column's
 * min/max so stale preferences cannot collapse Forms or overflow Actions.
 */
export function mergeColumnWidthsWithDefaults(
  columns: ColumnWidthConstraint[],
  savedWidths: TableColumnWidths | null | undefined,
  options?: {
    defaultMinWidth?: number;
    defaultMaxWidth?: number;
  },
): Record<string, number> {
  const defaultMinWidth =
    options?.defaultMinWidth ?? DEFAULT_TABLE_COLUMN_MIN_WIDTH;
  const defaultMaxWidth =
    options?.defaultMaxWidth ?? DEFAULT_TABLE_COLUMN_MAX_WIDTH;

  const merged: Record<string, number> = {};

  for (const column of columns) {
    const saved = savedWidths?.[column.id];
    const candidate =
      typeof saved === "number" && Number.isFinite(saved)
        ? saved
        : column.defaultWidth;
    merged[column.id] = clampColumnWidth(
      candidate,
      column,
      defaultMinWidth,
      defaultMaxWidth,
    );
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
