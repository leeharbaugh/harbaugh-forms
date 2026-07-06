"use client";

import {
  listTableActionsCellClass,
  listTableActionsHeaderClass,
} from "@/components/list-row-actions";
import { createClient } from "@/lib/supabase/client";
import {
  loadTableColumnWidthsForUser,
  saveTableColumnWidthsForUser,
} from "@/lib/user-preferences";
import { mergeColumnWidthsWithDefaults } from "@/lib/types/user-preferences";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ResizableDataTableColumn = {
  id: string;
  label: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  align?: "left" | "right" | "center";
  isActions?: boolean;
};

const DEFAULT_MIN_COLUMN_WIDTH = 56;
const DEFAULT_MAX_COLUMN_WIDTH = 640;
const PREFERENCES_SAVE_DEBOUNCE_MS = 400;

function buildDefaultWidths(
  columns: ResizableDataTableColumn[],
): Record<string, number> {
  return Object.fromEntries(columns.map((column) => [column.id, column.defaultWidth]));
}

function loadLocalColumnWidths(
  storageKey: string,
  columns: ResizableDataTableColumn[],
): Record<string, number> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<Record<string, number>>;
    return mergeColumnWidthsWithDefaults(columns, parsed as Record<string, number>);
  } catch {
    return null;
  }
}

function useResizableColumnWidths(
  storageKey: string,
  tablePreferencesKey: string,
  columns: ResizableDataTableColumn[],
) {
  const [widths, setWidths] = useState(() => buildDefaultWidths(columns));
  const skipPersistRef = useRef(true);
  const saveTimeoutRef = useRef<number | null>(null);
  const widthsRef = useRef(widths);
  const resizeState = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
    minWidth: number;
    maxWidth: number;
    edge: "left" | "right";
  } | null>(null);

  widthsRef.current = widths;

  const persistWidths = useCallback(
    (nextWidths: Record<string, number>, options?: { immediate?: boolean }) => {
      if (skipPersistRef.current) {
        return;
      }

      localStorage.setItem(storageKey, JSON.stringify(nextWidths));

      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const saveToDatabase = () => {
        const supabase = createClient();
        void saveTableColumnWidthsForUser(
          supabase,
          tablePreferencesKey,
          nextWidths,
        ).catch((error) => {
          console.error(
            "[ResizableDataTable] Failed to save column preferences:",
            error,
          );
        });
      };

      if (options?.immediate) {
        saveToDatabase();
        return;
      }

      saveTimeoutRef.current = window.setTimeout(() => {
        saveTimeoutRef.current = null;
        saveToDatabase();
      }, PREFERENCES_SAVE_DEBOUNCE_MS);
    },
    [storageKey, tablePreferencesKey],
  );

  useEffect(() => {
    let cancelled = false;
    skipPersistRef.current = true;

    const defaults = buildDefaultWidths(columns);
    const fromLocal = loadLocalColumnWidths(storageKey, columns);
    setWidths(fromLocal ?? defaults);

    void (async () => {
      try {
        const supabase = createClient();
        const fromDatabase = await loadTableColumnWidthsForUser(
          supabase,
          tablePreferencesKey,
        );

        if (cancelled) {
          return;
        }

        if (fromDatabase) {
          const merged = mergeColumnWidthsWithDefaults(columns, fromDatabase);
          setWidths(merged);
          localStorage.setItem(storageKey, JSON.stringify(merged));
        }
      } catch (error) {
        console.error(
          "[ResizableDataTable] Failed to load column preferences:",
          error,
        );
      } finally {
        if (!cancelled) {
          skipPersistRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storageKey, tablePreferencesKey, columns]);

  useEffect(() => {
    persistWidths(widths);
  }, [widths, persistWidths]);

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    },
    [],
  );

  const startResize = useCallback(
    (
      column: ResizableDataTableColumn,
      clientX: number,
      edge: "left" | "right" = "right",
    ) => {
      resizeState.current = {
        columnId: column.id,
        startX: clientX,
        startWidth: widths[column.id] ?? column.defaultWidth,
        minWidth: column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH,
        maxWidth: column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH,
        edge,
      };
    },
    [widths],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeState.current) {
        return;
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const { columnId, startX, startWidth, minWidth, maxWidth, edge } =
        resizeState.current;
      const delta =
        edge === "left" ? startX - event.clientX : event.clientX - startX;
      const nextWidth = Math.min(
        maxWidth,
        Math.max(minWidth, startWidth + delta),
      );

      setWidths((current) => ({
        ...current,
        [columnId]: nextWidth,
      }));
    };

    const handleMouseUp = () => {
      if (!resizeState.current) {
        return;
      }

      resizeState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persistWidths(widthsRef.current, { immediate: true });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [persistWidths]);

  return { widths, startResize };
}

type ResizableDataTableProps = {
  storageKey: string;
  tablePreferencesKey: string;
  columns: ResizableDataTableColumn[];
  children: ReactNode;
};

export function ResizableDataTable({
  storageKey,
  tablePreferencesKey,
  columns,
  children,
}: ResizableDataTableProps) {
  const { widths, startResize } = useResizableColumnWidths(
    storageKey,
    tablePreferencesKey,
    columns,
  );

  const totalColumnWidth = columns.reduce(
    (sum, column) => sum + (widths[column.id] ?? column.defaultWidth),
    0,
  );

  return (
    <div className="overflow-x-auto rounded-md border">
      <table
        className="w-full table-fixed border-collapse"
        style={{ minWidth: totalColumnWidth }}
      >
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={{ width: widths[column.id] }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {columns.map((column) => {
              const width = widths[column.id] ?? column.defaultWidth;
              const resizable = column.resizable ?? !column.isActions;

              if (column.isActions) {
                const actionsResizable = column.resizable ?? true;

                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={{ width, minWidth: width, maxWidth: width }}
                    className={cn(
                      listTableActionsHeaderClass,
                      actionsResizable && "relative select-none",
                    )}
                  >
                    {column.label}
                    {actionsResizable && (
                      <>
                        <button
                          type="button"
                          aria-label={`Resize ${column.label} column`}
                          className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize border-l border-transparent hover:border-border"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            startResize(column, event.clientX, "left");
                          }}
                        />
                        <button
                          type="button"
                          aria-label={`Resize ${column.label} column`}
                          className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize border-r border-transparent hover:border-border"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            startResize(column, event.clientX, "right");
                          }}
                        />
                      </>
                    )}
                  </th>
                );
              }

              return (
                <th
                  key={column.id}
                  scope="col"
                  style={{ width, minWidth: width, maxWidth: width }}
                  className={cn(
                    "relative select-none px-4 py-3 align-bottom",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                  )}
                >
                  <span className="block pr-2">{column.label}</span>
                  {resizable && (
                    <button
                      type="button"
                      aria-label={`Resize ${column.label} column`}
                      className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize border-r border-transparent hover:border-border"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        startResize(column, event.clientX);
                      }}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function ResizableDataTableRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <tr className={cn("text-sm", className)}>{children}</tr>;
}

export function ResizableDataTableCell({
  children,
  truncate = false,
  title,
  className,
}: {
  children: ReactNode;
  truncate?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "min-w-0 max-w-0 px-4 py-3 align-middle",
        className,
      )}
    >
      {truncate ? (
        <span className="block truncate" title={title}>
          {children}
        </span>
      ) : (
        children
      )}
    </td>
  );
}

export function ResizableDataTableActionsCell({
  children,
}: {
  children: ReactNode;
}) {
  return <td className={listTableActionsCellClass}>{children}</td>;
}
